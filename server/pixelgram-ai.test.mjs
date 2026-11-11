import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMusicApiServer } from '../server.mjs';
import { createAiChatHandler, createRateLimiter, resolveAiConfig, validateChatBody } from './pixelgram-ai.mjs';
import { OWNER, buildSystemPrompt, isOwnerQuestion } from '../src/lib/pixelgram-ai/knowledge.js';

// Fake AI provider that streams "Namaste" in two pieces.
function fakeAi() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    const sse =
      'data: {"choices":[{"delta":{"content":"Nama"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"ste"}}]}\n\n' +
      'data: [DONE]\n\n';
    return new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  };
  return { fetchImpl, calls };
}

async function startServer(fetchImpl) {
  const aiChat = createAiChatHandler({ fetchImpl, env: { AI_API_KEY: 'AIza-test' } });
  const server = createMusicApiServer(fetchImpl, { aiChat });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  return { server, url: `http://127.0.0.1:${port}/api/ai-chat` };
}

const ask = (url, origin) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Reel kaise upload karu?' }], language: null }),
  });

test('Android app (APK) can ask unlimited questions — 100 in a row, none blocked', async () => {
  const { fetchImpl } = fakeAi();
  const { server, url } = await startServer(fetchImpl);
  try {
    for (let i = 0; i < 100; i++) {
      const res = await ask(url, 'https://localhost');
      assert.equal(res.status, 200, `question ${i + 1} was blocked`);
      assert.equal(await res.text(), 'Namaste');
    }
  } finally {
    server.close();
  }
});

test('website visitor gets 20 questions per minute, then a wait message', async () => {
  const { fetchImpl } = fakeAi();
  const { server, url } = await startServer(fetchImpl);
  try {
    for (let i = 0; i < 20; i++) {
      const res = await ask(url, 'https://ar-pixelgram.onrender.com');
      assert.equal(res.status, 200);
      await res.text();
    }
    const blocked = await ask(url, 'https://ar-pixelgram.onrender.com');
    assert.equal(blocked.status, 429);
    assert.equal((await blocked.json()).limit, 'website');
  } finally {
    server.close();
  }
});

test('website limit resets after one minute', () => {
  const rl = createRateLimiter(20, 60_000);
  for (let i = 0; i < 20; i++) assert.equal(rl.check('ip', 1000).ok, true);
  assert.equal(rl.check('ip', 1000).ok, false);
  assert.equal(rl.check('ip', 61_000).ok, true);
});

test('the Android app origin is allowed by CORS for the chat', async () => {
  const { fetchImpl } = fakeAi();
  const { server, url } = await startServer(fetchImpl);
  try {
    const res = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://localhost' } });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://localhost');
    assert.match(res.headers.get('access-control-allow-methods') || '', /POST/);
  } finally {
    server.close();
  }
});

test('sends the Pixelgram instructions to the AI and rejects bad requests', async () => {
  const { fetchImpl, calls } = fakeAi();
  const { server, url } = await startServer(fetchImpl);
  try {
    await (await ask(url, 'https://localhost')).text();
    assert.match(calls[0].url, /generativelanguage\.googleapis\.com\/v1beta\/openai\/chat\/completions$/);
    assert.equal(calls[0].body.messages[0].role, 'system');
    assert.match(calls[0].body.messages[0].content, /Pixelgram AI/);
    const bad = await fetch(url, { method: 'POST', headers: { Origin: 'https://localhost' }, body: '{"messages":[]}' });
    assert.equal(bad.status, 400);
  } finally {
    server.close();
  }
});

test('long chats keep working (only the latest 20 turns go to the AI)', () => {
  const messages = Array.from({ length: 59 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
  const parsed = validateChatBody({ messages, language: null });
  assert.equal(parsed.messages.length, 20);
  assert.equal(parsed.messages.at(-1).content, 'm58');
});

test('missing AI key gives a clear message instead of crashing', async () => {
  const handler = createAiChatHandler({ env: {} });
  const server = createMusicApiServer(globalThis.fetch, { aiChat: handler });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const res = await ask(`http://127.0.0.1:${server.address().port}/api/ai-chat`, 'https://localhost');
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /AI_API_KEY/);
  } finally {
    server.close();
  }
});

test('provider settings: Gemini key works without extra settings', () => {
  assert.deepEqual(resolveAiConfig({ AI_API_KEY: 'AIzaXYZ' }), {
    apiKey: 'AIzaXYZ',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
  });
  assert.equal(resolveAiConfig({ AI_API_KEY: 'sk-1' }).baseURL, 'https://api.openai.com/v1');
  assert.equal(resolveAiConfig({}), null);
});

test('owner answer and contacts are exact', () => {
  assert.equal(OWNER.answer, 'The owner and creator of Pixelgram is Aakash.');
  assert.equal(OWNER.links.email, 'arpixelgram@gmail.com');
  assert.deepEqual(Object.keys(OWNER.links).sort(), ['email', 'facebook', 'instagram', 'youtube']);
  assert.equal(isOwnerQuestion('Pixelgram ka malik kaun hai'), true);
  assert.equal(isOwnerQuestion('Reel kaise upload karu?'), false);
  assert.match(buildSystemPrompt(null), /no WhatsApp number/);
});
