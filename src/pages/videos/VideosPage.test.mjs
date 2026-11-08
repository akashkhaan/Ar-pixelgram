// Run with node --test src/pages/videos/VideosPage.test.mjs (jsdom in test environment).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div><button id="outside">Outside</button>', { url: 'http://localhost' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLInputElement = dom.window.HTMLInputElement;
globalThis.Event = dom.window.Event;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = React.act ? React : require('react-dom/test-utils');
const searches = [];
let feeds = 0;
let voiceStarts = 0;
let recognition;
const row = { id: 'video-one', title: 'Na mohabbat na dosti ke liye', video_url: '', duration_sec: 23, visibility: 'public', views_count: 27, created_at: '2026-11-01', profile: { username: 'akash_57' } };
const passthrough = ({ children }) => React.createElement('div', null, children);
const mocks = {
  'react-router-dom': { useNavigate: () => () => {} },
  '@/components/layouts/MobileLayout': { __esModule: true, default: passthrough },
  '@/components/common/InstagramShareSheet': { __esModule: true, default: () => null },
  '@/components/ui/avatar': { Avatar: passthrough, AvatarFallback: passthrough, AvatarImage: () => null },
  '@/services/videos': {
    getVideosFeed: async () => { feeds++; return [row]; },
    searchVideos: async q => { searches.push(q); return [row]; },
    formatVideoViews: n => String(n), formatDuration: () => '0:23', timeAgoHi: () => '',
  },
  'sonner': { toast: { error: () => {} } },
  './GlassSearch.css': {},
};

function loadModule(relative) {
  const filename = fileURLToPath(new URL(relative, import.meta.url));
  const output = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiled = new Module(filename);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(fileURLToPath(new URL('.', import.meta.url)));
  compiled.require = name => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  compiled._compile(output, filename);
  return compiled.exports;
}
mocks['@/lib/utils'] = loadModule('../../lib/utils.ts');
mocks['@/components/ui/button'] = loadModule('../../components/ui/button.tsx');
mocks['@/hooks/useDebounce'] = loadModule('../../hooks/useDebounce.ts');
mocks['@/components/common/GlassSearch'] = loadModule('../../components/common/GlassSearch.tsx');
const VideosPage = loadModule('./VideosPage.tsx').default;
const button = label => document.querySelector(`button[aria-label="${label}"]`);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function type(text) {
  await act(async () => {
    const input = document.querySelector('input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await act(async () => wait(350));
}
async function mounted(run) {
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(React.createElement(VideosPage)));
    await run();
  } finally { await act(async () => root.unmount()); }
}
async function open() {
  await act(async () => button('Search').click());
  await act(async () => wait(160));
}

test('video voice action appears when search opens and disappears when the empty search closes', async () => {
  await mounted(async () => {
    assert.equal(button('Voice search'), null);
    await open();
    assert.ok(button('Voice search'));
    await act(async () => document.getElementById('outside').focus());
    assert.equal(button('Voice search'), null);
  });
});

test('focusing the microphone inside an empty search keeps it available for keyboard activation', async () => {
  window.SpeechRecognition = class {
    start() { voiceStarts++; }
    stop() { this.onend(); }
  };
  await mounted(async () => {
    await open();
    const mic = button('Voice search');
    await act(async () => mic.focus());
    assert.equal(document.activeElement, mic);
    await act(async () => mic.click());
    assert.equal(voiceStarts, 1);
    assert.equal(button('Voice search').getAttribute('aria-pressed'), 'true');
  });
});

test('typed video searches retain their query and clearing restores the feed before closing hides the mic', async () => {
  await mounted(async () => {
    await open();
    await type('Na mohabbat');
    assert.equal(searches.at(-1), 'Na mohabbat');
    const previousFeeds = feeds;
    await act(async () => button('Clear search').click());
    await act(async () => wait(350));
    assert.equal(document.querySelector('input').value, '');
    assert.equal(feeds, previousFeeds + 1);
    await act(async () => document.getElementById('outside').focus());
    assert.equal(button('Voice search'), null);
  });
});

test('the existing Hindi voice transcript still updates the input and video search', async () => {
  window.SpeechRecognition = class {
    constructor() { recognition = this; }
    start() {}
    stop() { this.onend(); }
  };
  await mounted(async () => {
    await open();
    await act(async () => button('Voice search').click());
    assert.equal(recognition.lang, 'hi-IN');
    await act(async () => {
      recognition.onresult({ results: { 0: { 0: { transcript: 'मोहब्बत' } } } });
      recognition.onend();
    });
    await act(async () => wait(350));
    assert.equal(document.querySelector('input').value, 'मोहब्बत');
    assert.equal(searches.at(-1), 'मोहब्बत');
  });
});