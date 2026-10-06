// Admin account banata/update karta hai aur profiles.is_admin = true set karta hai.
// Env chahiye: NEW_SUPABASE_URL, NEW_SUPABASE_SERVICE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
// Usage: node backend/migrate/ensure-admin.mjs
const URL = process.env.NEW_SUPABASE_URL;
const KEY = process.env.NEW_SUPABASE_SERVICE_KEY;
const EMAIL = process.env.ADMIN_EMAIL || "arpixelgram@gmail.com";
const PASSWORD = process.env.ADMIN_PASSWORD;

if (!URL || !KEY || !PASSWORD) {
  console.error("Env missing: NEW_SUPABASE_URL, NEW_SUPABASE_SERVICE_KEY, ADMIN_PASSWORD");
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// 1) User dhundo ya banao
const list = await fetch(`${URL}/auth/v1/admin/users?page=1&per_page=1000`, { headers }).then((r) => r.json());
let user = (list.users || []).find((u) => u.email === EMAIL);

if (!user) {
  const res = await fetch(`${URL}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  });
  if (!res.ok) { console.error("Create failed:", await res.text()); process.exit(1); }
  user = await res.json();
  console.log("Admin user created:", user.id);
} else {
  await fetch(`${URL}/auth/v1/admin/users/${user.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ password: PASSWORD, email_confirm: true }),
  });
  console.log("Admin user updated:", user.id);
}

// 2) profiles.is_admin = true
const up = await fetch(`${URL}/rest/v1/profiles?id=eq.${user.id}`, {
  method: "PATCH",
  headers: { ...headers, Prefer: "return=minimal" },
  body: JSON.stringify({ is_admin: true }),
});
if (!up.ok) console.error("Profile update failed:", await up.text());
else console.log("profiles.is_admin = true set. Admin ready:", EMAIL);
