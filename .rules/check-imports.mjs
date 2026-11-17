#!/usr/bin/env node
/**
 * Build guard: har local import ka target file exist karta hai AUR git me tracked hai
 * — dono check karta hai.
 *
 * Kyun: ek baar nayi file (src/lib/authEmail.ts) commit me chhoot gayi thi
 * (`git commit -a` sirf purani tracked files stage karta hai). Local machine par
 * build pass ho gaya kyunki file disk par maujood thi, par Render/APK build me
 * "Could not load src/lib/authEmail" error aaya.
 *
 * Chalane ka tarika:  node .rules/check-imports.mjs
 * (npm run lint ke andar bhi chalta hai)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const SRC = path.join(ROOT, 'src');
const EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.json', '/index.ts', '/index.tsx', '/index.js'];

const tracked = new Set(
  execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
);

const IMPORT_RE =
  /(?:from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\))/g;

const missing = [];
const untracked = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) scan(full);
  }
}

function scan(file) {
  const rel = path.relative(ROOT, file);
  const raw = fs.readFileSync(file, 'utf8');

  // comments hata do, warna comment me likha example import false positive deta hai
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  for (const m of code.matchAll(IMPORT_RE)) {
    const spec = m[1] || m[2] || m[3];
    if (!spec) continue;
    if (!spec.startsWith('@/') && !spec.startsWith('./') && !spec.startsWith('../')) continue;

    const base = spec.startsWith('@/')
      ? path.join(SRC, spec.slice(2))
      : path.resolve(path.dirname(file), spec);

    const found = EXTS.map((ext) => base + ext).find((p) => fs.existsSync(p) && fs.statSync(p).isFile());

    if (!found) {
      missing.push({ from: rel, spec });
      continue;
    }
    const foundRel = path.relative(ROOT, found);
    if (!tracked.has(foundRel)) {
      untracked.push({ from: rel, spec, file: foundRel });
    }
  }
}

walk(SRC);

if (missing.length === 0 && untracked.length === 0) {
  console.log('✓ check-imports: sab imports theek hain aur git me tracked hain');
  process.exit(0);
}

if (missing.length > 0) {
  console.error('\n✗ Ye imports ka file hi nahi mila (build fail hoga):');
  for (const m of missing) console.error(`   ${m.from}  ->  ${m.spec}`);
}

if (untracked.length > 0) {
  console.error('\n✗ Ye files git me tracked NAHI hain (push ke baad build fail hoga):');
  for (const u of untracked) console.error(`   ${u.from}  ->  ${u.spec}   [${u.file}]`);
  console.error('\n   Fix:  git add -A && git commit');
}

process.exit(1);
