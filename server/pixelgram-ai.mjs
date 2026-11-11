// Pixelgram AI chat endpoint for the Render Node server (no npm packages needed).
// POST /api/ai-chat  { messages: [{role, content}], language: string|null }  -> streamed plain text.
//
// LIMIT RULE (owner's decision):
//   - Android app (APK, Capacitor origin https://localhost): NO question limit at all.
//   - Website visitors: 20 questions per minute per visitor (abuse protection).
import { buildSystemPrompt } from '../src/lib/pixelgram-ai/knowledge.js';

/** Origins used by the Pixelgram Android app (Capacitor WebView). */
export const APP_ORIGINS = new Set(['https://localhost', 'http://localhost', 'capacitor://localhost']);

export const WEBSITE_LIMIT_PER_MINUTE = 20;

export function isAppRequest(origin) {
  return typeof origin === 'string' && APP_ORIGINS.has(origin);
}

export function createRateLimiter(limit, windowMs) {
  const hits = new Map();
  return {
    check(key, now = Date.now()) {
      const entry = hits.get(key);
      if (!entry || now - entry.start >= windowMs) {
        hits.set(key, { count: 1, start: now });
        if (hits.size > 5000) {
          for (const [k, v] of hits) if (now - v.start >= windowMs) hits.delete(k);
        }
        return { ok: true, retryAfterSec: 0 };
      }
      if (entry.count >= limit) {
        return { ok: false, retryAfterSec: Math.ceil((entry.start + windowMs - now) / 1000) };
      }
      entry.count++;
      return { ok: true, retryAfterSec: 0 };
    },
  };
}

/** Returns { messages, language } or null when the body is invalid. */
export function validateChatBody(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.messages)) return null;
  const { messages } = body;
  if (messages.length < 1 || messages.length > 60) return null;
  const clean = [];
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return null;
    if (typeof m.content !== 'string' || !m.content.trim() || m.content.length > 4000) return null;
    clean.push({ role: m.role, content: m.content });
  }
  if (clean[clean.length - 1].role !== 'user') return null;
  const language = typeof body.language === 'string' && body.language.length <= 30 ? body.language : null;
  // Only the latest turns are sent to the AI (keeps answers fast); the user can keep chatting forever.
  return { messages: clean.slice(-20), language };
}

/** Picks the AI provider from environment variables. Any OpenAI-compatible API works. */
export function resolveAiConfig(env = process.env) {
  const apiKey = env.AI_API_KEY || env.GEMINI_API_KEY || env.OPENAI_API_KEY || '';
  if (!apiKey) return null;
  const isGemini = !env.AI_BASE_URL && (Boolean(env.GEMINI_API_KEY) || apiKey.startsWith('AIza'));
  const baseURL = (
    env.AI_BASE_URL ||
    (isGemini ? 'https://generativelanguage.googleapis.com/v1beta/openai' : 'https://api.openai.com/v1')
  ).replace(/\/+$/, '');
  const model = env.AI_MODEL || (isGemini ? 'gemini-2.5-flash' : 'gpt-4o-mini');
  return { apiKey, baseURL, model };
}

function sendJson(response, status, payload, headers = {}) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  for (const [k, v] of Object.entries(headers)) response.setHeader(k, v);
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request, maxBytes = 300_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function clientIp(request) {
  const fwd = request.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd || '').split(',')[0].trim();
  return first || request.socket?.remoteAddress || 'anon';
}

function upstreamMessage(status) {
  if (status === 401 || status === 403) return 'The AI key is not valid. The site owner needs to check AI_API_KEY on Render.';
  if (status === 402) return 'AI credits are used up. The site owner needs to add credits.';
  if (status === 429) return 'The AI is busy right now. Please try again in a moment.';
  return 'The assistant is temporarily unavailable. Please try again.';
}

export function createAiChatHandler({
  fetchImpl = globalThis.fetch,
  env = process.env,
  limiter = createRateLimiter(WEBSITE_LIMIT_PER_MINUTE, 60_000),
} = {}) {
  return async function handleAiChat(request, response) {
    const origin = request.headers.origin;

    // Website only: per-visitor limit. The Android app is never limited.
    if (!isAppRequest(origin)) {
      const rl = limiter.check(clientIp(request));
      if (!rl.ok) {
        sendJson(
          response,
          429,
          { error: 'Too many questions in a minute. Please wait a few seconds.', limit: 'website' },
          { 'Retry-After': String(rl.retryAfterSec) },
        );
        return;
      }
    }

    let parsed;
    try {
      parsed = validateChatBody(await readJsonBody(request));
    } catch {
      parsed = null;
    }
    if (!parsed) {
      sendJson(response, 400, { error: 'Invalid request.' });
      return;
    }

    const config = resolveAiConfig(env);
    if (!config) {
      sendJson(response, 503, { error: 'The assistant is not set up yet (AI_API_KEY is missing on the server).' });
      return;
    }

    const controller = new AbortController();
    response.on('close', () => controller.abort());

    let upstream;
    try {
      upstream = await fetchImpl(`${config.baseURL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          stream: true,
          temperature: 0.4,
          messages: [{ role: 'system', content: buildSystemPrompt(parsed.language) }, ...parsed.messages],
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('AI request failed', err);
      sendJson(response, 502, { error: upstreamMessage(500) });
      return;
    }

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '');
      console.error(`AI provider error [${upstream.status}]: ${detail.slice(0, 500)}`);
      // Provider "busy" (429) is reported as 503 so the app never confuses it with the website limit.
      const status = upstream.status === 429 ? 503 : upstream.status >= 500 ? 502 : upstream.status;
      sendJson(response, status, { error: upstreamMessage(upstream.status) });
      return;
    }

    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('X-Accel-Buffering', 'no');

    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for await (const chunk of upstream.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let nl;
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const text = JSON.parse(data)?.choices?.[0]?.delta?.content;
            if (typeof text === 'string' && text) response.write(text);
          } catch {
            /* partial line — ignore */
          }
        }
      }
    } catch {
      /* user closed the chat or the provider stopped mid-answer */
    }
    response.end();
  };
}
