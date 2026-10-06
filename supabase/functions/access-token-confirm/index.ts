// Step 2: OTP verify -> naya token (30 din), purane tokens revoke
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
    const { otpId, code, deviceId } = await req.json();
    const db = admin();
    const { data: otp } = await db.from("access_token_otps").select("*").eq("id", otpId).maybeSingle();
    if (!otp || otp.consumed_at || new Date(otp.expires_at) < new Date()) return json({ error: "otp_expired" }, 400);
    if (otp.device_id !== deviceId) return json({ error: "device_mismatch" }, 400);
    if (otp.attempts >= 5) return json({ error: "too_many_attempts" }, 429);
    if (otp.code_hash !== await sha256(String(code))) {
      await db.from("access_token_otps").update({ attempts: otp.attempts + 1 }).eq("id", otpId);
      return json({ error: "invalid_otp" }, 400);
    }
    const now = new Date().toISOString();
    await db.from("access_token_otps").update({ consumed_at: now }).eq("id", otpId);
    await db.from("user_access_tokens").update({ revoked_at: now }).eq("user_id", otp.user_id).is("revoked_at", null);
    const token = "ARPG_" + randHex(24);
    const expires = new Date(Date.now() + 30 * 864e5).toISOString();
    const { error } = await db.from("user_access_tokens").insert({ user_id: otp.user_id, token_hash: await sha256(token), token_prefix: token.slice(0, 10), device_id: otp.device_id, device_name: otp.device_name, country: otp.country, expires_at: expires });
    if (error) throw error;
    return json({ token, expiresAt: expires });
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }
});
