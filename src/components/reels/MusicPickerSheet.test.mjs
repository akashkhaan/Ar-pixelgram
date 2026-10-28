// DOM regression harness: requires jsdom in the test environment (not the app bundle).
// Run with node --test src/components/reels/MusicPickerSheet.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = require('react-dom/client');
const { act } = React.act ? React : require('react-dom/test-utils');
let stops = 0;
const audioPlayerService = { stop: () => { stops += 1; } };
const locale = { countryCode: 'IN', countryName: 'India', localTerms: [] };
const noOp = () => {};
const mocks = {
  '@/services/audioPlayerService': { audioPlayerService },
  '@/hooks/useAudioPlayer': { useAudioPlayer: () => ({ currentTrack: null, isPlaying: false, currentTime: 0, duration: 0, playTrack: noOp, pause: noOp, resume: noOp, playNext: noOp, stop: audioPlayerService.stop }) },
  '@/services/music': { getDefaultMusicLocale: () => locale, detectMusicLocale: async () => locale, getTrendingMusic: async () => [], getRealReelsCounts: async () => ({}), searchMusic: async () => [], ORIGINAL_AUDIOS: [], INDIAN_REGION_TERMS: {}, COUNTRY_TERMS: {}, getCountryTerms: () => [], getCountryName: () => 'India', formatMusicDuration: () => '0:30', saveMusicLocale: noOp },
  '@/services/savedSongs': { getSavedSongs: async () => [], saveSong: async () => {}, unsaveSong: async () => {} },
  'sonner': { toast: { success: noOp, error: noOp } },
};
function loadComponent(relative) {
  const filename = fileURLToPath(new URL(relative, import.meta.url));
  const output = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const compiled = new Module(filename);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(fileURLToPath(new URL('.', import.meta.url)));
  compiled.require = name => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  compiled._compile(output, filename);
  return compiled.exports.default;
}
const Picker = loadComponent('./MusicPickerSheet.tsx');
mocks['@/components/reels/MusicPickerSheet'] = { __esModule: true, default: Picker };
mocks['@/components/reels/MusicTrimmer'] = { __esModule: true, default: () => null };
mocks['@/services/notes'] = { postUserNote: async () => null, deleteUserNote: async () => {} };
const Note = loadComponent('../chat/CreateNoteModal.tsx');

test('closed picker mounts, opens, closes and unmounts without crashing; audio stops', async () => {
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(Picker, { open: false, onClose: noOp, onSelect: noOp })));
    assert.equal(stops, 1);
    await act(async () => root.render(React.createElement(Picker, { open: true, onClose: noOp, onSelect: noOp })));
    assert.ok(document.querySelector('input[placeholder="Search..."]'));
    await act(async () => root.render(React.createElement(Picker, { open: false, onClose: noOp, onSelect: noOp })));
    assert.equal(stops, 2);
    await act(async () => root.unmount());
    assert.equal(stops, 3);
  } catch (error) {
    if (error instanceof AggregateError) console.error(error.errors);
    throw error;
  } finally { await act(async () => root.unmount()); }
});

test('opening an empty Message note and its music picker does not crash', async () => {
  const root = createRoot(document.getElementById('root'));
  const props = { onClose: noOp, currentUserId: 'test-user', myProfile: null, existingNote: null, onNoteCreated: noOp };
  try {
    await act(async () => root.render(React.createElement(Note, { ...props, open: false })));
    await act(async () => root.render(React.createElement(Note, { ...props, open: true })));
    const textarea = document.querySelector('textarea');
    assert.ok(textarea);
    await act(async () => {
      [...document.querySelectorAll('button')].find(el => el.textContent.includes('Add music to note')).click();
    });
    assert.ok(document.querySelector('input[placeholder="Search..."]'));
  } catch (error) {
    if (error instanceof AggregateError) console.error(error.errors);
    throw error;
  } finally { await act(async () => root.unmount()); }
});
