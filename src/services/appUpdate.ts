import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/**
 * In-app update.
 *
 * Version ab GitHub ke run number se nahi aata (usme gaps aate the — 353 ke
 * baad seedha 356). Ab repo me `version.json` hai jisme `build` number likha
 * hota hai; APK workflow usi se build karta hai aur release ke baad +1 karta hai.
 * Isliye har update exactly ek number badhta hai: 354, 355, 356…
 *
 * versionCode = 100 + build (android/app/build.gradle bhi yahi karta hai).
 */
const REPO = 'akashkhaan/Ar-pixelgram';
const API = `https://api.github.com/repos/${REPO}`;
export const VERSION_CODE_OFFSET = 100;

export interface InstalledInfo { versionCode: number; versionName: string; commit: string }
export interface LatestBuild { versionCode: number; versionName: string; commit: string; date?: string; headline: string }

interface AppUpdatePluginApi {
  getInfo(): Promise<InstalledInfo>;
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  downloadAndInstall(data: { versionCode: number }): Promise<void>;
  addListener(event: 'progress', cb: (p: { percent: number; downloaded: number; total: number }) => void): Promise<PluginListenerHandle>;
}

export const AppUpdate = registerPlugin<AppUpdatePluginApi>('AppUpdate');

export function supportsInAppUpdate(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('AppUpdate');
}

export function versionForBuild(build: number) {
  return { versionCode: VERSION_CODE_OFFSET + build, versionName: `1.4.${build}` };
}

/** Purana naam — ab bhi kaam karta hai (build number hi pass hota hai). */
export function versionForRun(build: number) {
  return versionForBuild(build);
}

/** version.json (repo root) ka saaf shape */
export function parseVersionFile(data: any, commit = '', date = ''): LatestBuild | null {
  const build = Number(data?.build);
  if (!Number.isFinite(build) || build <= 0) return null;
  return {
    ...versionForBuild(Math.floor(build)),
    commit: String(commit || ''),
    date: date || undefined,
    headline: String(data?.headline || ''),
  };
}

/** GitHub "workflow runs" response se latest successful APK build. */
export function parseLatestRun(data: any): LatestBuild | null {
  const run = data?.workflow_runs?.[0];
  if (!run || typeof run.run_number !== 'number' || run.conclusion !== 'success') return null;
  return {
    ...versionForRun(run.run_number),
    commit: String(run.head_sha || ''),
    date: run.updated_at,
    headline: String(run.head_commit?.message || ''),
  };
}

export function isNewer(latest: LatestBuild | null, installedCode: number): boolean {
  return !!latest && latest.versionCode > installedCode;
}

export function cleanNote(message: string): string {
  return message
    .split('\n')[0]
    .replace(/^(feat|fix|chore|refactor|perf|style|docs|build|ci|test)(\([^)]*\))?!?:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/** Commit messages -> saaf "kya naya hai" list (naya pehle, duplicate/merge hata ke). */
export function notesFromMessages(messages: string[]): string[] {
  const out: string[] = [];
  for (const m of messages) {
    if (/^Merge (pull request|branch)/i.test(m)) continue;
    const n = cleanNote(m);
    if (!n || /^(changes|update|wip|bump)$/i.test(n) || out.includes(n)) continue;
    out.push(n);
  }
  return out.slice(0, 30);
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return res.json();
}

const VERSION_URL = `https://raw.githubusercontent.com/${REPO}/main/version.json`;

/** Latest available APK build — seedha repo ke version.json se (gaps nahi). */
export async function fetchLatestBuild(): Promise<LatestBuild | null> {
  // 1) version.json — single source of truth, cache-busting ke saath
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const parsed = parseVersionFile(await res.json());
      if (parsed) {
        // "Kya naya hai" ke liye latest successful build ka commit chahiye
        try {
          const run = parseLatestRun(
            await getJson(`${API}/actions/workflows/android-apk.yml/runs?branch=main&status=success&per_page=1`),
          );
          if (run) return { ...parsed, commit: run.commit, date: run.date, headline: run.headline || parsed.headline };
        } catch { /* API limit — version.json kaafi hai */ }
        return parsed;
      }
    }
  } catch { /* offline — neeche fallback */ }

  // 2) fallback: purana rasta (successful runs)
  return parseLatestRun(await getJson(`${API}/actions/workflows/android-apk.yml/runs?branch=main&status=success&per_page=1`));
}

export async function fetchWhatsNew(installedCommit: string, latest: LatestBuild): Promise<string[]> {
  try {
    if (installedCommit && installedCommit !== latest.commit) {
      const cmp = await getJson(`${API}/compare/${installedCommit}...${latest.commit}`);
      const msgs = (cmp?.commits ?? []).map((c: any) => String(c?.commit?.message || '')).reverse();
      const notes = notesFromMessages(msgs);
      if (notes.length) return notes;
    }
    const recent = await getJson(`${API}/commits?sha=${latest.commit}&per_page=10`);
    const notes = notesFromMessages((recent ?? []).map((c: any) => String(c?.commit?.message || '')));
    if (notes.length) return notes;
  } catch { /* neeche fallback */ }
  return notesFromMessages([latest.headline]);
}
