import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const compiled = new Module(import.meta.url);
compiled._compile(ts.transpileModule(readFileSync(new URL('./musicAvailability.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, 'musicAvailability.cjs');
const { hasFullAudio, mergeMusicTracks, playableDurationSeconds } = compiled.exports;
const preview = { id: '123', title: 'Khaab', artist: 'Akhil', previewUrl: 'https://audio.example/preview.m4a', durationMs: 30_000, isFullSong: false };
const full = { ...preview, id: 'saavn_123', previewUrl: 'https://audio.example/khaab.mp4', durationMs: 201_000, isFullSong: true };
test('full Khaab 3:21 replaces the 30-second sample even if the sample arrived first', () => {
  assert.deepEqual(mergeMusicTracks([preview, full]), [full]);
  assert.equal(playableDurationSeconds(full), 201);
});
test('iTunes samples remain 30 seconds and are never called full recordings', () => {
  assert.equal(hasFullAudio(preview), false);
  assert.equal(playableDurationSeconds(preview), 30);
  assert.equal(hasFullAudio({ ...preview, durationMs: 201_000 }), false);
});
test('saved legacy full recordings retain their complete duration and source type', () => {
  const { isFullSong, ...legacy } = full;
  assert.equal(hasFullAudio(legacy), true);
  assert.equal(playableDurationSeconds(legacy), 201);
  assert.equal(hasFullAudio({ ...legacy, previewUrl: 'https://audio.example/previews/khaab.mp4' }), false);
});
test('same titles from different artists and non-Latin titles are not lost', () => {
  assert.equal(mergeMusicTracks([full, { ...full, id: 'other', artist: 'Akhil Sachdeva' }]).length, 2);
  assert.equal(mergeMusicTracks([{ ...full, id: 'a', title: 'गीत' }, { ...full, id: 'b', title: 'गाना' }]).length, 2);
});
test('imported full files are not forced to 30 seconds', () => {
  assert.equal(playableDurationSeconds({ ...full, id: 'custom_1', durationMs: 240_000 }), 240);
});
