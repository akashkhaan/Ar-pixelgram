// Device list / register / logout (Facebook-style)
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
    const user = await userFromAuth(req);
    if (!user) return json({ error: "unauthorized" }, 401);
    const db = admin();
    const { action, deviceId, deviceName, deviceIds } = await req.json();
    if (action === "register") {
      const ip = clientIp(req); const { country, city } = await geo(ip);
      await db.from("user_devices").upsert({ user_id: user.id, device_id: deviceId, device_name: deviceName, user_agent: req.headers.get("user-agent"), ip, country, city, last_seen_at: new Date().toISOString(), logged_out_at: null }, { onConflict: "user_id,device_id" });
      return json({ ok: true });
    }
    if (action === "list") {
      const { data: devices } = await db.from("user_devices").select("device_id, device_name, user_agent, country, city, first_seen_at, last_seen_at").eq("user_id", user.id).is("logged_out_at", null).order("last_seen_at", { ascending: false });
      const { data: token } = await db.from("user_access_tokens").select("token_prefix, device_id, device_name, created_at, expires_at").eq("user_id", user.id).is("revoked_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
      return json({ devices: devices ?? [], activeToken: token ?? null });
    }
    if (action === "logout") {
      const ids: string[] = Array.isArray(deviceIds) ? deviceIds : [];
      if (!ids.length) return json({ error: "no_devices" }, 400);
      const now = new Date().toISOString();
      await db.from("user_devices").update({ logged_out_at: now }).eq("user_id", user.id).in("device_id", ids);
      await db.from("user_access_tokens").update({ revoked_at: now }).eq("user_id", user.id).in("device_id", ids).is("revoked_at", null);
      return json({ ok: true, loggedOut: ids.length });
    }
    return json({ error: "bad_action" }, 400);
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }
});
