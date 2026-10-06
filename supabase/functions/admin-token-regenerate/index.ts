// Admin: naya token generate -> purane sab user tokens expire
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
    const { data: p } = await db.from("profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
    if (!p?.is_admin) return json({ error: "forbidden" }, 403);
    const { action } = await req.json().catch(() => ({ action: "status" }));
    const nowIso = new Date().toISOString();
    if (action === "regenerate") {
      const token = "ARPG_ADMIN_" + randHex(24);
      await db.from("app_token_config").upsert({ id: 1, current_token: token, generated_by: user.id, generated_at: nowIso });
      await db.from("user_access_tokens").update({ revoked_at: nowIso }).is("revoked_at", null);
    }
    const { data: cfg } = await db.from("app_token_config").select("current_token, generated_at").eq("id", 1).maybeSingle();
    const { count } = await db.from("user_access_tokens").select("id", { count: "exact", head: true }).is("revoked_at", null).gt("expires_at", nowIso);
    return json({ currentToken: cfg?.current_token ?? null, generatedAt: cfg?.generated_at ?? null, activeUserTokens: count ?? 0 });
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }
});
