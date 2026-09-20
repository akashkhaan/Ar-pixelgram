// Sends a notification to all of a user's registered devices.
//
//  - Web Push (browser / PWA) via VAPID, as before.
//  - Firebase Cloud Messaging (the Android APK) so notifications arrive on the
//    phone even when the app is closed: likes, comments, follows, reels,
//    direct messages, group messages / mentions, and incoming 1:1 or group
//    calls with Answer / Join / Decline buttons.
//
// Payload shape: { receiverId, title, body, tag?, data? }
// Env: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT
//      FIREBASE_SERVICE_ACCOUNT_JSON  (whole service-account JSON, for FCM)
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@example.com';
const FIREBASE_SA = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') ?? '';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE); }
  catch (e) { console.error('vapid init failed', e); }
}

/* ------------------------------------------------------------------ FCM ---- */

type ServiceAccount = { client_email: string; private_key: string; project_id: string };

let cachedToken: { token: string; expiresAt: number } | null = null;

function b64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : new Uint8Array(input);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const raw = atob(body);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.token;

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  const assertion = `${header}.${claims}.${b64url(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`google token failed [${res.status}]: ${await res.text()}`);
  const json = await res.json() as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, expiresAt: now + (json.expires_in ?? 3600) };
  return json.access_token;
}

/** Everything is sent as a data message so the app builds the rich notification. */
function buildFcmData(
  title: string,
  body: string,
  tag: string,
  data: Record<string, unknown>,
): Record<string, string> {
  const flat: Record<string, string> = { title, body, tag };
  for (const [k, v] of Object.entries(data ?? {})) {
    if (v === null || v === undefined) continue;
    flat[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  if (!flat.type) {
    flat.type = /incoming .*call/i.test(title)
      ? (flat.groupId ? 'group_call' : 'call')
      : 'alert';
  }
  return flat;
}

async function sendViaFcm(
  admin: ReturnType<typeof createClient>,
  receiverId: string,
  title: string,
  body: string,
  tag: string,
  data: Record<string, unknown>,
): Promise<{ sent: number; total: number }> {
  if (!FIREBASE_SA) return { sent: 0, total: 0 };

  let sa: ServiceAccount;
  try {
    sa = JSON.parse(FIREBASE_SA) as ServiceAccount;
  } catch {
    console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON');
    return { sent: 0, total: 0 };
  }

  const { data: rows, error } = await admin
    .from('device_tokens').select('id, token').eq('user_id', receiverId);
  if (error) {
    console.error('device_tokens read failed', error);
    return { sent: 0, total: 0 };
  }
  const tokens = (rows ?? []) as Array<{ id: string; token: string }>;
  if (tokens.length === 0) return { sent: 0, total: 0 };

  const accessToken = await getAccessToken(sa);
  const payload = buildFcmData(title, body, tag, data);
  const isCall = payload.type === 'call' || payload.type === 'group_call';

  const results = await Promise.allSettled(tokens.map(async (row) => {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: row.token,
            data: payload,
            android: {
              priority: 'HIGH',
              ttl: isCall ? '45s' : '3600s',
            },
          },
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      // Stale / uninstalled device: drop the token instead of retrying it.
      if (res.status === 404 || (res.status === 400 && text.includes('registration-token-not-registered'))
        || text.includes('UNREGISTERED')) {
        await admin.from('device_tokens').delete().eq('id', row.id);
      }
      throw new Error(`fcm send failed [${res.status}]: ${text}`);
    }
  }));

  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length) console.error('fcm failures', failed.map(f => String((f as PromiseRejectedResult).reason)));
  return { sent: results.length - failed.length, total: tokens.length };
}

/* ------------------------------------------------------------- handler ---- */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const caller = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: authData, error: authError } = await caller.auth.getUser();
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { receiverId, title, body, tag, data } = await req.json();
    if (!receiverId || !title) {
      return new Response(JSON.stringify({ error: 'receiverId and title required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const resolvedTag = tag ?? 'default';
    const resolvedBody = body ?? '';
    const resolvedData = (data ?? {}) as Record<string, unknown>;

    // Phone (APK) push — runs alongside Web Push, never blocks it.
    const fcm = await sendViaFcm(admin, receiverId, title, resolvedBody, resolvedTag, resolvedData)
      .catch((e) => { console.error('fcm error', e); return { sent: 0, total: 0 }; });

    const { data: subs, error } = await admin
      .from('push_subscriptions').select('*').eq('user_id', receiverId);
    if (error) throw error;
    const payload = JSON.stringify({
      title,
      body: resolvedBody,
      tag: resolvedTag,
      data: resolvedData,
    });
    const results = await Promise.allSettled((subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        }, payload, { TTL: 60, urgency: 'high' });
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').delete().eq('id', s.id);
        }
        throw err;
      }
    }));
    const sent = results.filter(r => r.status === 'fulfilled').length;
    return new Response(JSON.stringify({
      sent,
      total: subs?.length ?? 0,
      fcmSent: fcm.sent,
      fcmTotal: fcm.total,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
