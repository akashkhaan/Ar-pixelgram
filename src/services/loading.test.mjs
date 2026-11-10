import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
function loadApi(supabase, withTimeout = async p => p) {
  const module = new Module('loading-api.cjs');
  module.require = name => {
    if (name === '@/db/supabase') return { supabase };
    if (name === '@/lib/withTimeout') return { withTimeout };
    if (name.includes('hiddenContent')) return { filterDeletedReels: rows => rows };
    if (name.includes('legacyCleanup')) return { dropLegacyReels: rows => rows };
    if (name.includes('storyText')) return { decodeStoryText: () => [] };
    throw new Error(`Unexpected import: ${name}`);
  };
  module._compile(ts.transpileModule(readFileSync(new URL('./api.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, 'loading-api.cjs');
  return module.exports;
}
function builder(data, error = null) {
  const calls = [];
  const query = { then: (ok, fail) => Promise.resolve({ data, error }).then(ok, fail) };
  for (const method of ['select','eq','in','or','order','range','limit']) {
    query[method] = (...args) => { calls.push([method, ...args]); return query; };
  }
  return { query, calls };
}
test('inbox fetches newest single message; conversation history remains 100 messages', async () => {
  const b = builder([{ id: 'latest', created_at: '2026-11-01T06:00:00Z' }]);
  const api = loadApi({ from: () => b.query });
  const rows = await api.getMessages('self', 'friend', 1);
  assert.equal(rows[0].id, 'latest');
  assert.deepEqual(b.calls.find(c => c[0] === 'order'), ['order','created_at',{ ascending: false }]);
  assert.deepEqual(b.calls.find(c => c[0] === 'limit'), ['limit',1]);
  b.calls.length = 0;
  await api.getMessages('self', 'friend');
  assert.deepEqual(b.calls.find(c => c[0] === 'order'), ['order','created_at',{ ascending: true }]);
  assert.deepEqual(b.calls.find(c => c[0] === 'limit'), ['limit',100]);
});
test('session failure cannot discard successfully fetched reels', async () => {
  const b = builder([{ id: 'reel-1', caption: 'A real reel' }]);
  const api = loadApi({ from: () => b.query, auth: { getSession: async () => { throw new Error('session unavailable'); } } });
  assert.equal((await api.getReelsFeed())[0].id, 'reel-1');
});
test('like lookup failure preserves reels without inventing a like state', async () => {
  const reels = builder([{ id: 'reel-1', caption: '' }]);
  const likes = builder(null, new Error('likes unavailable'));
  const api = loadApi({ from: name => name === 'reels' ? reels.query : likes.query,
    auth: { getSession: async () => ({ data: { session: { user: { id: 'self' } } } }) } });
  const rows = await api.getReelsFeed();
  assert.equal(rows[0].id, 'reel-1');
  assert.equal(rows[0].is_liked, undefined);
});
test('optional session deadline returns fetched reels instead of failing entire feed', async () => {
  const reels = builder([{ id: 'reel-1', caption: '' }]);
  const api = loadApi({ from: () => reels.query, auth: { getSession: () => new Promise(() => {}) } },
    async (promise, ms) => { if (ms === 1500) throw new Error('timeout'); return promise; });
  assert.equal((await api.getReelsFeed())[0].id, 'reel-1');
});
test('inbox rows become available before hanging presence and group-call requests', async () => {
  const source = readFileSync(new URL('../pages/chat/ChatListPage.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('  const load = useCallback(async () => {') + '  const load = useCallback(async () => {'.length;
  const end = source.indexOf('  }, [user, loadNotes]);', start);
  const body = ts.transpileModule(`async function run() {${source.slice(start,end)}}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
  const states = [];
  const pending = new Promise(() => {});
  const contact = { id: 'profile-friend', user_id: 'friend' };
  const values = {
    user: { id: 'self' }, getMutualFollows: async () => [], getMessagedProfiles: async () => [contact],
    getMyGroups: async () => [], withTimeout: p => p, setGroups: () => {},
    getActiveGroupCallsForUser: () => pending, setActiveGroupCalls: () => {}, loadNotes: () => {},
    setAllContacts: () => {}, getMessages: async (a,b,limit) => { assert.equal(limit,1); return [{ id: 'latest', created_at: '2026-11-01T06:00:00Z' }]; },
    getUnreadCount: async () => 2, setConversations: rows => states.push(rows), setLoading: v => states.push(v),
    supabase: { from: () => ({ select: () => ({ in: () => pending }) }) }, setOnlineStatuses: () => {}
  };
  void new AsyncFunction(...Object.keys(values), `${body}; return run();`)(...Object.values(values));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(states[0][0].lastMessage.id, 'latest');
  assert.equal(states[0][0].unreadCount, 2);
  assert.equal(states[1], false);
});
