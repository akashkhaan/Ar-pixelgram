import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ts = require('typescript');
function compile(relative) {
  const file = fileURLToPath(new URL(relative, import.meta.url));
  const result = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const m = new Module(file); m.filename = file; m.require = require; m._compile(result.outputText, file); return m.exports;
}
const { helloTunePlaybackWindow, encodeWavClip } = compile('./helloTuneClip.ts');

test('pre-cut clip (set at 1:41) plays from 0 for 30 seconds on the caller phone', () => {
  const w = helloTunePlaybackWindow({ path: 'u/1-abc-clip.wav', startSeconds: 101, durationSeconds: 30 }, 30);
  assert.deepEqual(w, { start: 0, end: 30 });
});

test('old full-song tune still plays from the chosen start for 30 seconds', () => {
  const w = helloTunePlaybackWindow({ path: 'u/1-abc.mp3', startSeconds: 101, durationSeconds: 30 }, 244);
  assert.deepEqual(w, { start: 101, end: 131 });
});

test('clip file contains exactly the chosen 30 seconds starting at 1:41', () => {
  const rate = 1000; const seconds = 244;
  const data = new Float32Array(rate * seconds);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(i / rate) / 1000; // value = second index
  const buf = { sampleRate: rate, length: data.length, numberOfChannels: 1, getChannelData: () => data };
  const wav = encodeWavClip(buf, 101, 30);
  const view = new DataView(wav.buffer);
  const samples = view.getUint32(40, true) / 2;
  assert.equal(samples / view.getUint32(24, true), 30);
  const mid = view.getInt16(44 + Math.floor(samples / 2) * 2, true) / 0x7fff;
  assert.ok(Math.abs(mid - 0.116) < 0.002, `middle sample should be from second 116, got ${mid}`);
});
