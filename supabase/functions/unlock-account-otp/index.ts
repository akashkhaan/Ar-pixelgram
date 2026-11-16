// Account unlock — phone/email OTP
// Body: { action: 'send' | 'verify', type: 'phone' | 'email', destination: string, code?: string, userId?: string }
//
// SECURITY (is file me jo theek kiya gaya):
//  1. Pehle koi bhi logged-in user kisi bhi userId ke liye OTP bhej sakta tha aur
//     verify karke wo account unlock kar sakta tha. Ab JWT se user nikalta hai aur
//     body ka userId sirf tab manna hai jab wo JWT ke user se match kare.
//  2. 'send' response me codeHash wapas aa raha tha — 6-digit code ka hash dekh kar
//     code seconds me nikal sakte the. Ab kabhi nahi bhejte.
//  3. Code Math.random() se banta tha (predictable). Ab crypto.getRandomValues.
//  4. Destination kuch bhi ho sakta tha. Ab sirf account ka apna registered
//     email/phone accept hota hai.
//  5. Attempt limit / resend cooldown nahi tha. Ab 5 galat try ke baad code dead,
//     60s cooldown, 15 min me max 3 sends.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CODE_LENGTH = 6;
const CODE_TTL_SECONDS = 5 * 60;        // code 5 minute valid
const MAX_ATTEMPTS = 5;                 // 5 galat try => code dead
const RESEND_COOLDOWN_SECONDS = 60;     // 60s me dobara send nahi
const MAX_SENDS_PER_WINDOW = 3;         // 15 min me max 3 sends
const SEND_WINDOW_MINUTES = 15;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function secureCode(): string {
  const max = 10 ** CODE_LENGTH;
  const buf = new Uint32Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= Math.floor(0xffffffff / max) * max);
  return String(value % max).padStart(CODE_LENGTH, '0');
}

function onlyDigits(v: string): string {
  return (v || '').replace(/\D/g, '');
}

async function sendSmsViaTwilio(to: string, code: string) {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_FROM_NUMBER');
  if (!sid || !token || !from) throw new Error('sms_provider_not_configured');

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: to,
      From: from,
      Body: `${code} aapka Pixelgram account unlock verification code hai. Ye code 5 minute me expire ho jayega.`,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Twilio SMS error:', errText);
    throw new Error(`sms_send_failed: ${errText.slice(0, 200)}`);
  }
}

async function sendEmailViaResend(to: string, code: string) {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM') ?? 'Pixelgram <onboarding@resend.dev>';
  if (!key) throw new Error('email_provider_not_configured');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `${code} — Pixelgram Account Unlock Code`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px;">
          <h2 style="color:#2563eb;margin-bottom:8px;">Pixelgram Security</h2>
          <p style="color:#444;font-size:15px;">Aapka account unlock karne ke liye verification code:</p>
          <div style="background:#f3f4f6;padding:16px;border-radius:8px;text-align:center;margin:20px 0;">
            <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#111;">${code}</span>
          </div>
          <p style="color:#e11d48;font-size:13px;font-weight:600;">⚠️ Ye code 5 minute ke liye valid hai.</p>
          <p style="color:#888;font-size:12px;margin-top:20px;">Agar aapne unlock request nahi ki, to is email ko ignore karein.</p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Resend email error:', errText);
    throw new Error(`email_send_failed: ${errText.slice(0, 200)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ---- 1. caller khud kaun hai? (body par bharosa nahi) ----
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'unauthorized' }, 401);

    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !authData?.user) return json({ error: 'unauthorized' }, 401);
    const authUser = authData.user;

    const body = await req.json().catch(() => ({}));
    const { action, userId, type, destination, code } = body ?? {};

    if (userId && userId !== authUser.id) {
      return json({ error: 'forbidden_user_mismatch' }, 403);
    }
    const targetUserId = authUser.id;

    if (action !== 'send' && action !== 'verify') return json({ error: 'unknown_action' }, 400);
    if (type !== 'phone' && type !== 'email') return json({ error: 'invalid_type' }, 400);
    if (!destination || typeof destination !== 'string') {
      return json({ error: 'missing_destination' }, 400);
    }

    // ---- 2. destination account ka apna hona chahiye ----
    const wanted = type === 'phone' ? onlyDigits(destination) : destination.trim().toLowerCase();
    if (!wanted) return json({ error: 'missing_destination' }, 400);

    const ownValues = new Set<string>();
    if (authUser.email) ownValues.add(authUser.email.toLowerCase());
    if (authUser.phone) ownValues.add(onlyDigits(authUser.phone));

    const { data: identifiers } = await admin
      .from('account_identifiers')
      .select('type, value')
      .eq('user_id', targetUserId);
    for (const row of identifiers ?? []) {
      if (!row?.value) continue;
      if (row.type === 'phone') ownValues.add(onlyDigits(row.value));
      if (row.type === 'email') ownValues.add(String(row.value).toLowerCase());
    }

    if (!ownValues.has(wanted)) {
      return json({ error: 'destination_not_on_account' }, 403);
    }

    // ---- SEND ----
    if (action === 'send') {
      const { data: recent } = await admin
        .from('account_identifier_otps')
        .select('id, created_at')
        .eq('user_id', targetUserId)
        .eq('value', destination)
        .order('created_at', { ascending: false })
        .limit(1);

      if (recent && recent.length) {
        const elapsed = (Date.now() - new Date(recent[0].created_at).getTime()) / 1000;
        if (elapsed < RESEND_COOLDOWN_SECONDS) {
          return json(
            { error: 'resend_cooldown', retry_after: Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed) },
            429,
          );
        }
      }

      const windowStart = new Date(Date.now() - SEND_WINDOW_MINUTES * 60 * 1000).toISOString();
      const { count } = await admin
        .from('account_identifier_otps')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', targetUserId)
        .gte('created_at', windowStart);
      if ((count ?? 0) >= MAX_SENDS_PER_WINDOW) {
        return json({ error: 'too_many_requests' }, 429);
      }

      const generatedCode = secureCode();
      const codeHash = await sha256(`${destination}:${generatedCode}`);
      const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString();

      // purane pending codes band karo — sirf latest valid
      await admin
        .from('account_identifier_otps')
        .update({ consumed_at: new Date().toISOString() })
        .eq('user_id', targetUserId)
        .is('consumed_at', null);

      const { error: insertError } = await admin.from('account_identifier_otps').insert({
        user_id: targetUserId,
        type,
        value: destination,
        code_hash: codeHash,
        attempts: 0,
        expires_at: expiresAt,
      });
      if (insertError) {
        console.error('otp insert error:', insertError);
        return json({ error: 'otp_store_failed' }, 500);
      }

      try {
        if (type === 'phone') await sendSmsViaTwilio(destination, generatedCode);
        else await sendEmailViaResend(destination, generatedCode);
      } catch (sendErr) {
        console.error('otp delivery failed:', sendErr);
        // jhooth mat bolo — caller ko pata chale ki bheja nahi gaya
        return json({ error: 'delivery_failed' }, 502);
      }

      // NOTE: codeHash kabhi response me nahi jaata
      return json({
        ok: true,
        expiresIn: CODE_TTL_SECONDS,
        resendAfter: RESEND_COOLDOWN_SECONDS,
        attempts: MAX_ATTEMPTS,
      });
    }

    // ---- VERIFY ----
    if (!code) return json({ error: 'missing_code' }, 400);
    const cleanCode = String(code).replace(/\D/g, '');
    if (cleanCode.length !== CODE_LENGTH) return json({ error: 'invalid_code_format' }, 400);

    const { data: record, error } = await admin
      .from('account_identifier_otps')
      .select('*')
      .eq('user_id', targetUserId)
      .eq('value', destination)
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !record) {
      return json({ error: 'no_active_code' }, 400);
    }

    if (new Date(record.expires_at).getTime() < Date.now()) {
      await admin
        .from('account_identifier_otps')
        .update({ consumed_at: new Date().toISOString() })
        .eq('id', record.id);
      return json({ error: 'otp_expired' }, 400);
    }

    const attempts = Number(record.attempts ?? 0);
    if (attempts >= MAX_ATTEMPTS) {
      return json({ error: 'too_many_attempts', attempts_left: 0 }, 429);
    }

    const inputHash = await sha256(`${destination}:${cleanCode}`);
    if (inputHash !== record.code_hash) {
      const next = attempts + 1;
      await admin
        .from('account_identifier_otps')
        .update({ attempts: next, consumed_at: next >= MAX_ATTEMPTS ? new Date().toISOString() : null })
        .eq('id', record.id);
      return json(
        {
          error: next >= MAX_ATTEMPTS ? 'too_many_attempts' : 'invalid_code',
          attempts_left: Math.max(0, MAX_ATTEMPTS - next),
        },
        400,
      );
    }

    // code sahi => single use + unlock (service role => DB guard ka trusted rasta)
    await admin
      .from('account_identifier_otps')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', record.id);

    await admin
      .from('profiles')
      .update({
        account_status: 'active',
        status_reason: null,
        is_suspended: false,
        status_updated_at: new Date().toISOString(),
      })
      .eq('user_id', targetUserId);

    return json({ ok: true, unlocked: true });
  } catch (e) {
    console.error('unlock-account-otp exception:', e);
    return json({ error: 'server_error' }, 500);
  }
});
