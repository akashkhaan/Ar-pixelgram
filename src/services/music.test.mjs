import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
function load(relative, mocks = {}) {
  const filename = new URL(relative, import.meta.url).pathname;
  const source = readFileSync(filename, 'utf8').replace('import.meta.env.VITE_MUSIC_API_URL', "'https://music.example'");
  const compiled = new Module(filename);
  compiled.require = name => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  compiled._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  return compiled.exports;
}
const availability = load('./musicAvailability.ts');
const music = load('./music.ts', {
  'crypto-js': {}, '@capacitor/core': { Capacitor: { isNativePlatform: () => false } },
  '@/db/supabase': {}, './musicAvailability': availability,
});
const full = { id: 'saavn_khaab', title: 'Khaab', artist: 'Akhil', previewUrl: 'https://audio.example/full.mp4', durationMs: 201_000, isFullSong: true };
test('an iTunes outage cannot discard a full 201-second song from shared search', async () => {
  globalThis.fetch = async url => {
    if (String(url).includes('itunes')) throw new Error('catalog offline');
    return { ok: true, json: async () => ({ results: [full] }) };
  };
  assert.deepEqual(await music.searchMusic('Khaab'), [full]);
});
test('fallback url-format results preserve actual full duration when primary service is 404', async () => {
  globalThis.fetch = async url => {
    if (String(url).includes('music.example')) return { ok: false };
    if (String(url).includes('saavn.sumit')) return { ok: true, json: async () => ({ data: { results: [{ id: 'khaab', name: 'Khaab', duration: 201, artists: { primary: [{ name: 'Akhil' }] }, downloadUrl: [{ quality: '160kbps', url: 'https://audio.example/full.mp4' }] }] } }) };
    throw new Error('offline');
  };
  const tracks = await music.searchMusic('Khaab');
  assert.equal(tracks[0].durationMs, 201_000);
  assert.equal(tracks[0].artist, 'Akhil');
  assert.equal(tracks[0].isFullSong, true);
});
test('trending outage returns no invented 30-second full songs', async () => {
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.deepEqual(await music.getTrendingMusic(undefined, { countryCode: 'IN', localTerms: ['Khaab'] }), []);
});
