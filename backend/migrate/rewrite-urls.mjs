// DB ke saare text columns me purane Supabase URL ko naye URL se replace karta hai.
// (media URLs absolute store hote hain — migration ke baad zaroori)
// Env chahiye: NEW_DB_URL (postgres connection string), OLD_SUPABASE_URL, NEW_SUPABASE_URL
// Usage: node backend/migrate/rewrite-urls.mjs
import { execSync } from "node:child_process";

const OLD = process.env.OLD_SUPABASE_URL || "https://jfizzduvmzavtqwzqacy.supabase.co";
const NEW = process.env.NEW_SUPABASE_URL;
const DB = process.env.NEW_DB_URL; // postgresql://postgres:PASS@localhost:5432/postgres

if (!NEW || !DB) {
  console.error("Env missing: NEW_SUPABASE_URL, NEW_DB_URL");
  process.exit(1);
}

const sql = `
do $$
declare r record;
begin
  for r in
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' and data_type in ('text','character varying')
  loop
    execute format(
      'update public.%I set %I = replace(%I, %L, %L) where %I like %L',
      r.table_name, r.column_name, r.column_name, '${OLD}', '${NEW}', r.column_name, '%' || '${OLD}' || '%'
    );
  end loop;
end $$;
`;

console.log(`Rewriting ${OLD} -> ${NEW} in all public text columns...`);
execSync(`psql "${DB}" -v ON_ERROR_STOP=1`, { input: sql, stdio: ["pipe", "inherit", "inherit"] });
console.log("Done.");
