import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/**
 * In-app update. Har GitHub Actions APK build ka run number hi app ka version hai
 * (versionCode = 100 + run number, android/app/build.gradle me). Latest successful
 * build GitHub se dekhte hain; naya ho to uske commits "kya naya hai" ban jaate hain.
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

export function versionForRun(runNumber: number) {
  return { versionCode: VERSION_CODE_OFFSET + runNumber, versionName: `1.4.${runNumber}` };
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

export async function fetchLatestBuild(): Promise<LatestBuild | null> {
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
