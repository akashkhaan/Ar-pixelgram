// HS256 JWT keys generate karta hai (anon + service_role) diye gaye JWT_SECRET se.
// Usage: node gen-keys.mjs <JWT_SECRET>
import crypto from "node:crypto";

const secret = process.argv[2];
if (!secret) {
  console.error("Usage: node gen-keys.mjs <JWT_SECRET>");
  process.exit(1);
}

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function sign(payload) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest();
  return `${header}.${body}.${b64url(sig)}`;
}

const now = Math.floor(Date.now() / 1000);
const exp = now + 10 * 365 * 24 * 3600; // 10 saal

const base = { iss: "supabase", iat: now, exp };
console.log("ANON_KEY=" + sign({ ...base, role: "anon" }));
console.log("SERVICE_ROLE_KEY=" + sign({ ...base, role: "service_role" }));
