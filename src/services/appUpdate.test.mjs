import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ts = require('typescript');
function compile(relative, mocks) {
  const file = fileURLToPath(new URL(relative, import.meta.url));
  const result = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
  const m = new Module(file); m.filename = file;
  m.require = (name) => (name in mocks ? mocks[name] : require(name)); m._compile(result.outputText, file); return m.exports;
}
const { parseLatestRun, isNewer, notesFromMessages, versionForRun } = compile('./appUpdate.ts', {
  '@capacitor/core': { Capacitor: { getPlatform: () => 'android', isPluginAvailable: () => true }, registerPlugin: () => ({}) },
});
const run = (n, conclusion = 'success') => ({ workflow_runs: [{ run_number: n, conclusion, head_sha: 'abc', head_commit: { message: 'x' } }] });

test('version of a GitHub build is 100 + run number (same as build.gradle)', () => {
  assert.deepEqual(versionForRun(284), { versionCode: 384, versionName: '1.4.284' });
});

test('update is offered only when the latest build is newer than the installed app', () => {
  assert.equal(isNewer(parseLatestRun(run(284)), 383), true);
  assert.equal(isNewer(parseLatestRun(run(284)), 384), false);
  assert.equal(isNewer(parseLatestRun(run(284)), 4), true);
});

test('failed or missing builds never trigger an update', () => {
  assert.equal(parseLatestRun(run(300, 'failure')), null);
  assert.equal(parseLatestRun({ workflow_runs: [] }), null);
});

test('what-is-new list is cleaned from commit messages', () => {
  assert.deepEqual(
    notesFromMessages(['feat(stories): auto-advance stories\n\nbody', 'Merge pull request #3', 'Changes', 'fix: call echo', 'fix: call echo']),
    ['Auto-advance stories', 'Call echo'],
  );
});
