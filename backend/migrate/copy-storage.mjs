// Purane Supabase storage ki saari files naye backend me copy karta hai (REST se).
// Env chahiye: OLD_SUPABASE_URL, OLD_SUPABASE_SERVICE_KEY, NEW_SUPABASE_URL, NEW_SUPABASE_SERVICE_KEY
// Usage: node backend/migrate/copy-storage.mjs
const OLD_URL = process.env.OLD_SUPABASE_URL;
const OLD_KEY = process.env.OLD_SUPABASE_SERVICE_KEY;
const NEW_URL = process.env.NEW_SUPABASE_URL;
const NEW_KEY = process.env.NEW_SUPABASE_SERVICE_KEY;

if (!OLD_URL || !OLD_KEY || !NEW_URL || !NEW_KEY) {
  console.error("Env missing: OLD_SUPABASE_URL, OLD_SUPABASE_SERVICE_KEY, NEW_SUPABASE_URL, NEW_SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const BUCKETS = ["avatars", "posts", "stories", "reels", "videos", "group-media"];

async function listAll(bucket, path = "") {
  const res = await fetch(`${OLD_URL}/storage/v1/object/list/${bucket}`, {
    method: "POST",
    headers: { apikey: OLD_KEY, Authorization: `Bearer ${OLD_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: path, limit: 1000 }),
  });
  if (!res.ok) return [];
  const items = await res.json();
  let files = [];
  for (const it of items) {
    const full = path ? `${path}/${it.name}` : it.name;
    if (it.id) files.push(full);
    else files.push(...(await listAll(bucket, full)));
  }
  return files;
}

let copied = 0, failed = 0;
for (const bucket of BUCKETS) {
  const files = await listAll(bucket);
  console.log(`${bucket}: ${files.length} files`);
  for (const f of files) {
    try {
      const r = await fetch(`${OLD_URL}/storage/v1/object/${bucket}/${f}`, {
        headers: { apikey: OLD_KEY, Authorization: `Bearer ${OLD_KEY}` },
      });
      if (!r.ok) { failed++; continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      const up = await fetch(`${NEW_URL}/storage/v1/object/${bucket}/${f}`, {
        method: "POST",
        headers: {
          apikey: NEW_KEY,
          Authorization: `Bearer ${NEW_KEY}`,
          "Content-Type": r.headers.get("content-type") || "application/octet-stream",
          "x-upsert": "true",
        },
        body: buf,
      });
      if (up.ok) copied++; else failed++;
      if (copied % 50 === 0) console.log(`  ...${copied} copied`);
    } catch { failed++; }
  }
}
console.log(`Done: ${copied} copied, ${failed} failed`);
