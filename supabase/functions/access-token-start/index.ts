// Step 1: email + password verify, country check, single-device check, OTP email
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const sha256 = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, "0")).join("");
const randHex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n))).map((b) => b.toString(16).padStart(2, "0")).join("");
const clientIp = (req: Request) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "";
async function geo(ip: string): Promise<{ country: string | null; city: string | null }> {
  if (!ip) return { country: null, city: null };
  try { const r = await fetch(`https://ipapi.co/${ip}/json/`); const j = await r.json(); return { country: j.country_code ?? null, city: j.city ?? null }; } catch { return { country: null, city: null }; }
}
async function userFromAuth(req: Request) {
  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!jwt) return null;
  const { data } = await admin().auth.getUser(jwt);
  return data.user ?? null;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { email, password, deviceId, deviceName } = await req.json();
    if (!email || !password || !deviceId) return json({ error: "missing_fields" }, 400);
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
    const { data: signIn, error } = await anon.auth.signInWithPassword({ email, password });
    if (error || !signIn.user) return json({ error: "invalid_credentials" }, 401);
    const user = signIn.user;
    const db = admin();
    const ip = clientIp(req);
    const { country, city } = await geo(ip);

    // Country check: account jis desh me bana, wahi location
    const { data: profile } = await db.from("profiles").select("country").eq("user_id", user.id).maybeSingle();
    if (profile && !profile.country && country) await db.from("profiles").update({ country }).eq("user_id", user.id);
    const accountCountry = profile?.country ?? country;
    if (accountCountry && country && accountCountry !== country) {
      return json({ error: "location_mismatch", accountCountry, currentCountry: country }, 403);
    }

    await db.from("user_devices").upsert({ user_id: user.id, device_id: deviceId, device_name: deviceName, user_agent: req.headers.get("user-agent"), ip, country, city, last_seen_at: new Date().toISOString(), logged_out_at: null }, { onConflict: "user_id,device_id" });

    // Sirf ek device se token
    const { data: active } = await db.from("user_access_tokens").select("device_id").eq("user_id", user.id).is("revoked_at", null).gt("expires_at", new Date().toISOString());
    if ((active ?? []).some((t) => t.device_id !== deviceId)) {
      const { data: devices } = await db.from("user_devices").select("device_id, device_name, country, city, last_seen_at").eq("user_id", user.id).is("logged_out_at", null);
      return json({ error: "multiple_devices", devices }, 409);
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const { data: otp, error: oErr } = await db.from("access_token_otps").insert({ user_id: user.id, email, device_id: deviceId, device_name: deviceName, country, code_hash: await sha256(code) }).select("id").single();
    if (oErr) throw oErr;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: Deno.env.get("RESEND_FROM") ?? "onboarding@resend.dev", to: email, subject: "Your Access Token OTP", html: `<p>Your access token verification code: <b>${code}</b></p><p>Valid for 10 minutes.</p>` }),
    });
    if (!r.ok) return json({ error: "email_failed" }, 502);
    return json({ otpId: otp.id });
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }
});
