// App ke saare UI text (JSX text, string literals, template strings) nikal kar
// src/lib/i18n/uiStrings.json me likhta hai. Auto-translate sirf inhi texts ko
// badalta hai — logon ke naam, posts, captions, messages kabhi translate nahi hote.
// Run: node scripts/extract-ui-strings.mjs   (npm run build se pehle apne aap chalta hai)
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(SRC, 'lib', 'i18n', 'uiStrings.json');

const SKIP_ATTRS = new Set(['className', 'class', 'style', 'key', 'id', 'type', 'href', 'to', 'src', 'name', 'role', 'accept', 'autoComplete', 'inputMode', 'variant', 'size', 'target', 'rel', 'dir', 'lang', 'method']);
const HAS_LETTER = /\p{L}/u;

function files(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...files(p));
    else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.(d|test|spec)\.[tj]sx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

export function normalize(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

export function isUiText(text) {
  if (!text || text.length < 2 || text.length > 400) return false;
  if (!HAS_LETTER.test(text)) return false;
  if (/^(https?:|www\.|\/|@\/|\.\/|\.\.\/|#|data:|mailto:|tel:)/i.test(text)) return false;
  const tokens = text.split(' ');
  // Tailwind classes / css / ids jaise strings (flex items-center, w-4, hsl(...))
  const classLike = tokens.every((tk) => /^[a-z0-9:\-[\]/.%#()!_&>,=*+'"]+$/.test(tk)) && tokens.some((tk) => /[-:[\]_/.()=]/.test(tk));
  if (classLike) return false;
  if (/^[a-z]+(_[a-z0-9]+)+$/.test(text)) return false; // snake_case keys
  if (/^[a-z]+([A-Z][a-z0-9]*)+$/.test(text)) return false; // camelCase keys
  return true;
}

function attrName(node) {
  let p = node.parent;
  if (p && ts.isJsxExpression(p)) p = p.parent;
  if (p && ts.isJsxAttribute(p)) return p.name.getText();
  return null;
}

function inImport(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true;
    if (ts.isCallExpression(p) && p.expression.kind === ts.SyntaxKind.ImportKeyword) return true;
    if (ts.isJsxAttribute(p) || ts.isStatement(p)) break;
  }
  return false;
}

export function extract(sourceText, fileName = 'x.tsx') {
  const strings = new Set();
  const templates = new Set();
  const sf = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const add = (raw) => {
    const t = normalize(raw);
    if (isUiText(t)) strings.add(t);
  };
  const visit = (node) => {
    if (ts.isJsxText(node)) add(node.text);
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const a = attrName(node);
      if (!(a && SKIP_ATTRS.has(a)) && !inImport(node) && !ts.isLiteralTypeNode(node.parent)) add(node.text);
    } else if (ts.isTemplateExpression(node)) {
      const a = attrName(node);
      if (!(a && SKIP_ATTRS.has(a))) {
        let tpl = node.head.text;
        node.templateSpans.forEach((span, i) => {
          tpl += `{${i}}` + span.literal.text;
        });
        const t = normalize(tpl);
        const statics = t.replace(/\{\d+\}/g, ' ');
        if (isUiText(t) && /\p{L}{3,}/u.test(statics)) templates.add(t);
        // static hisse bhi alag text node ban sakte hain
        [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].forEach(add);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { strings, templates };
}

function main() {
  const strings = new Set();
  const templates = new Set();
  for (const f of files(SRC)) {
    if (f === OUT) continue;
    const r = extract(fs.readFileSync(f, 'utf8'), f);
    r.strings.forEach((s) => strings.add(s));
    r.templates.forEach((s) => templates.add(s));
  }
  const data = { strings: [...strings].sort(), templates: [...templates].sort() };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data) + '\n');
  console.log(`ui strings: ${data.strings.length}, templates: ${data.templates.length}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main();
