// Poore app ka text chuni hui bhasha me (Facebook jaisa).
// Sirf app ke apne UI text (uiStrings.json — build ke waqt source code se nikale
// gaye) badle jaate hain; logon ke naam, bio, posts, captions, messages wahi rehte hain.
// Translation ek baar aati hai aur phone me save ho jaati hai, agli baar turant.

type UiData = { strings: string[]; templates: string[] };
type Target = { kind: 'text'; node: Text } | { kind: 'attr'; el: Element; attr: string };

const ATTRS = ['placeholder', 'title', 'aria-label'];
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE', 'svg', 'SVG']);
const GOOGLE_CODE: Record<string, string> = { 'pt-BR': 'pt', zh: 'zh-CN', fil: 'tl', he: 'iw' };
const CACHE_PREFIX = 'pg_tr_v1_';
const MAX_CACHE = 6000;
const ENDPOINT = 'https://translate.googleapis.com/translate_a/t?client=gtx&sl=auto&dt=t&tl=';

export const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

/** "{0} views" jaisa template → regex + translate karne layak text */
export function compileTemplate(tpl: string): { re: RegExp; anchor: string } {
  const parts = tpl.split(/\{\d+\}/);
  const esc = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const anchor = parts.reduce((a, b) => (b.trim().length > a.length ? b.trim() : a), '');
  return { re: new RegExp(`^${esc.join('(.+?)')}$`, 's'), anchor };
}

/** Translated template me asli values wapas daalo; koi {n} gayab ho to null */
export function fillTemplate(translated: string, values: string[]): string | null {
  for (let i = 0; i < values.length; i++) if (!translated.includes(`{${i}}`)) return null;
  return translated.replace(/\{(\d+)\}/g, (_, n) => values[Number(n)] ?? '');
}

class AutoTranslator {
  private lang = '';
  private ui: Set<string> = new Set();
  private templates: { tpl: string; re: RegExp; anchor: string }[] = [];
  private cache = new Map<string, string>();
  private pending = new Map<string, Set<Target>>();
  private inflight = new Set<string>();
  private origText = new WeakMap<Text, string>();
  private lastText = new WeakMap<Text, string>();
  private origAttr = new WeakMap<Element, Record<string, string>>();
  private lastAttr = new WeakMap<Element, Record<string, string>>();
  private touchedText = new Set<Text>();
  private touchedAttr = new Map<Element, Set<string>>();
  private observer: MutationObserver | null = null;
  private flushTimer: number | null = null;
  private saveTimer: number | null = null;
  private failures = 0;

  async start(lang: string) {
    this.stop();
    this.lang = lang;
    document.documentElement.lang = lang;
    const data = (await import('./uiStrings.json')).default as UiData;
    if (this.lang !== lang) return;
    this.ui = new Set(data.strings);
    this.templates = data.templates.map((tpl) => ({ tpl, ...compileTemplate(tpl) }));
    this.loadCache();
    this.observer = new MutationObserver((muts) => this.onMutations(muts));
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS,
    });
    this.walk(document.body);
  }

  stop() {
    this.observer?.disconnect();
    this.observer = null;
    if (this.flushTimer) window.clearTimeout(this.flushTimer);
    this.flushTimer = null;
    // Asli text wapas
    this.touchedText.forEach((node) => {
      const o = this.origText.get(node);
      if (o != null && node.isConnected && node.data === this.lastText.get(node)) node.data = o;
    });
    this.touchedAttr.forEach((attrs, el) => {
      attrs.forEach((attr) => {
        const o = this.origAttr.get(el)?.[attr];
        if (o != null && el.isConnected && el.getAttribute(attr) === this.lastAttr.get(el)?.[attr]) el.setAttribute(attr, o);
      });
    });
    this.touchedText.clear();
    this.touchedAttr.clear();
    this.pending.clear();
    this.origText = new WeakMap();
    this.lastText = new WeakMap();
    this.origAttr = new WeakMap();
    this.lastAttr = new WeakMap();
    this.lang = '';
  }

  private skipped(el: Element | null): boolean {
    for (let e = el; e; e = e.parentElement) {
      if (SKIP_TAGS.has(e.tagName)) return true;
      if (e.getAttribute('translate') === 'no' || e.classList.contains('notranslate')) return true;
      if ((e as HTMLElement).isContentEditable) return true;
    }
    return false;
  }

  private walk(root: Node) {
    if (root.nodeType === Node.TEXT_NODE) {
      this.handleText(root as Text);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    const el = root as Element;
    if (this.skipped(el)) return;
    ATTRS.forEach((a) => el.hasAttribute(a) && this.handleAttr(el, a));
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (n.nodeType === Node.ELEMENT_NODE) {
          const e = n as Element;
          if (SKIP_TAGS.has(e.tagName) || e.getAttribute('translate') === 'no' || e.classList.contains('notranslate')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n = tw.nextNode();
    while (n) {
      if (n.nodeType === Node.TEXT_NODE) this.handleText(n as Text);
      else ATTRS.forEach((a) => (n as Element).hasAttribute(a) && this.handleAttr(n as Element, a));
      n = tw.nextNode();
    }
  }

  private onMutations(muts: MutationRecord[]) {
    for (const m of muts) {
      if (m.type === 'characterData') {
        const t = m.target as Text;
        if (!this.skipped(t.parentElement)) this.handleText(t);
      } else if (m.type === 'attributes') {
        const el = m.target as Element;
        if (m.attributeName && !this.skipped(el)) this.handleAttr(el, m.attributeName);
      } else {
        m.addedNodes.forEach((n) => {
          if (n.nodeType === Node.TEXT_NODE ? !this.skipped(n.parentElement) : true) this.walk(n);
        });
      }
    }
  }

  /** Is text ka translation kya hoga — cache se, warna queue me daalo */
  private resolve(text: string, target: Target): string | null {
    if (this.ui.has(text)) {
      const hit = this.cache.get(text);
      if (hit != null) return hit;
      this.enqueue(text, target);
      return null;
    }
    for (const t of this.templates) {
      if (t.anchor && !text.includes(t.anchor)) continue;
      const m = t.re.exec(text);
      if (!m) continue;
      const hit = this.cache.get(t.tpl);
      if (hit == null) {
        this.enqueue(t.tpl, target);
        return null;
      }
      return fillTemplate(hit, m.slice(1));
    }
    return null;
  }

  private handleText(node: Text) {
    const cur = node.data;
    if (cur === this.lastText.get(node)) return; // humne hi likha tha
    this.origText.set(node, cur);
    const core = normalize(cur);
    if (core.length < 2) return;
    const target: Target = { kind: 'text', node };
    const tr = this.resolve(core, target);
    if (tr != null && tr !== core) this.applyText(node, cur, core, tr);
  }

  private applyText(node: Text, original: string, core: string, tr: string) {
    const lead = original.match(/^\s*/)?.[0] ?? '';
    const trail = original.match(/\s*$/)?.[0] ?? '';
    const value = original.trim() === core ? lead + tr + trail : tr;
    this.lastText.set(node, value);
    this.touchedText.add(node);
    this.prune();
    node.data = value;
  }

  private handleAttr(el: Element, attr: string) {
    const cur = el.getAttribute(attr);
    if (cur == null) return;
    if (cur === this.lastAttr.get(el)?.[attr]) return;
    this.origAttr.set(el, { ...(this.origAttr.get(el) || {}), [attr]: cur });
    const core = normalize(cur);
    if (core.length < 2) return;
    const tr = this.resolve(core, { kind: 'attr', el, attr });
    if (tr != null && tr !== core) this.applyAttr(el, attr, tr);
  }

  private applyAttr(el: Element, attr: string, tr: string) {
    this.lastAttr.set(el, { ...(this.lastAttr.get(el) || {}), [attr]: tr });
    const set = this.touchedAttr.get(el) || new Set<string>();
    set.add(attr);
    this.touchedAttr.set(el, set);
    el.setAttribute(attr, tr);
  }

  /** Page se hat chuke nodes bhool jao (memory na bhare) */
  private prune() {
    if (this.touchedText.size < 4000) return;
    this.touchedText.forEach((n) => !n.isConnected && this.touchedText.delete(n));
    this.touchedAttr.forEach((_, el) => !el.isConnected && this.touchedAttr.delete(el));
  }

  private enqueue(key: string, target: Target) {
    let set = this.pending.get(key);
    if (!set) this.pending.set(key, (set = new Set()));
    set.add(target);
    if (!this.flushTimer) this.flushTimer = window.setTimeout(() => this.flush(), 120);
  }

  private async flush() {
    this.flushTimer = null;
    const lang = this.lang;
    const keys = [...this.pending.keys()].filter((k) => !this.inflight.has(k));
    if (!lang || keys.length === 0) return;
    // ~4000 akshar tak ek request
    const batches: string[][] = [];
    let cur: string[] = [];
    let size = 0;
    for (const k of keys) {
      if (cur.length && (size + k.length > 4000 || cur.length >= 100)) {
        batches.push(cur);
        cur = [];
        size = 0;
      }
      cur.push(k);
      size += k.length;
    }
    if (cur.length) batches.push(cur);
    for (const batch of batches) {
      batch.forEach((k) => this.inflight.add(k));
      try {
        const out = await this.request(lang, batch);
        if (this.lang !== lang) return;
        batch.forEach((k, i) => {
          const tr = out[i];
          if (typeof tr === 'string' && tr.trim()) this.cache.set(k, tr.trim());
        });
        this.failures = 0;
        this.scheduleSave();
        batch.forEach((k) => this.reapply(k));
      } catch {
        this.failures += 1;
      } finally {
        batch.forEach((k) => this.inflight.delete(k));
      }
    }
    // Net na ho to thodi der baad dobara
    if (this.pending.size && this.failures > 0 && this.failures < 5) {
      this.flushTimer = window.setTimeout(() => this.flush(), 3000 * this.failures);
    }
  }

  private reapply(key: string) {
    const targets = this.pending.get(key);
    this.pending.delete(key);
    targets?.forEach((t) => {
      if (t.kind === 'text') {
        if (t.node.isConnected) this.handleText(t.node);
      } else if (t.el.isConnected) {
        const o = this.origAttr.get(t.el)?.[t.attr];
        if (o != null && t.el.getAttribute(t.attr) === o) {
          this.handleAttr(t.el, t.attr);
        }
      }
    });
  }

  private async request(lang: string, texts: string[]): Promise<string[]> {
    const body = new URLSearchParams();
    texts.forEach((t) => body.append('q', t));
    const res = await fetch(ENDPOINT + encodeURIComponent(GOOGLE_CODE[lang] || lang), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`translate ${res.status}`);
    const json: unknown = await res.json();
    const arr = Array.isArray(json) ? json : [];
    return texts.map((_, i) => {
      const item = texts.length === 1 && typeof arr[0] === 'string' ? arr[0] : arr[i];
      return Array.isArray(item) ? String(item[0] ?? '') : String(item ?? '');
    });
  }

  private loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + this.lang);
      this.cache = new Map(raw ? (JSON.parse(raw) as [string, string][]) : []);
    } catch {
      this.cache = new Map();
    }
  }

  private scheduleSave() {
    if (this.saveTimer) return;
    const lang = this.lang;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      if (lang !== this.lang) return;
      try {
        const entries = [...this.cache.entries()].slice(-MAX_CACHE);
        localStorage.setItem(CACHE_PREFIX + lang, JSON.stringify(entries));
      } catch {
        /* storage full — next time phir se aa jayega */
      }
    }, 800);
  }
}

let instance: AutoTranslator | null = null;

/** Chuni hui bhasha me poora app; `null` = band (asli text) */
export function setAutoTranslateLanguage(lang: string | null) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!instance) instance = new AutoTranslator();
  if (!lang) {
    instance.stop();
    return;
  }
  instance.start(lang).catch((e) => console.warn('auto translate failed', e));
}
