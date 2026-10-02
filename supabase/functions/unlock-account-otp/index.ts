import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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
      Body: `${code} aapka Pixelgram account unlock verification code hai. Ye code 1 minute me expire ho jayega.`,
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
          <p style="color:#e11d48;font-size:13px;font-weight:600;">⚠️ Ye code sirf 1 minute ke liye valid hai. 1 minute ke baad expire ho jayega.</p>
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

  try {
    const { action, userId, type, destination, code } = await req.json();
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (action === 'send') {
      if (!userId || !type || !destination) {
        return json({ error: 'Missing required parameters' }, 400);
      }

      // Generate 6-digit secure code
      const generatedCode = String(Math.floor(100000 + Math.random() * 900000));
      const codeHash = await sha256(`${destination}:${generatedCode}`);
      // Exactly 1 minute (60 seconds) TTL
      const expiresAt = new Date(Date.now() + 60 * 1000).toISOString();

      // Store in account_identifier_otps or password_reset_otps
      await admin.from('account_identifier_otps').insert({
        user_id: userId,
        type: type === 'phone' ? 'phone' : 'email',
        value: destination,
        code_hash: codeHash,
        expires_at: expiresAt,
      });

      if (type === 'phone') {
        await sendSmsViaTwilio(destination, generatedCode);
      } else {
        await sendEmailViaResend(destination, generatedCode);
      }

      return json({ ok: true, expiresAt, codeHash });
    }

    if (action === 'verify') {
      if (!userId || !destination || !code) {
        return json({ error: 'Missing code or destination' }, 400);
      }

      const inputHash = await sha256(`${destination}:${String(code).trim()}`);
      const { data: record, error } = await admin
        .from('account_identifier_otps')
        .select('*')
        .eq('user_id', userId)
        .eq('value', destination)
        .is('consumed_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !record) {
        return json({ error: 'Invalid or missing OTP. Please request a new one.' }, 400);
      }

      if (new Date(record.expires_at).getTime() < Date.now()) {
        return json({ error: 'OTP 1 minute me expire ho gaya hai. Dobara OTP bhejein.' }, 400);
      }

      if (record.code_hash !== inputHash) {
        return json({ error: 'Galat OTP code. Sahi code daalein.' }, 400);
      }

      // Mark OTP consumed
      await admin
        .from('account_identifier_otps')
        .update({ consumed_at: new Date().toISOString() })
        .eq('id', record.id);

      // Unlock user account in profiles
      await admin
        .from('profiles')
        .update({ account_status: 'active', status_reason: null })
        .eq('user_id', userId);

      return json({ ok: true, unlocked: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('unlock-account-otp exception:', e);
    const msg = String((e as Error)?.message ?? e);
    return json({ error: msg }, 500);
  }
});
