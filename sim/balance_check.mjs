#!/usr/bin/env node
// Balance gate. Runs the EXISTING sims (sim/text_sim.mjs, sim/zones.mjs) as child processes —
// no rules are reimplemented here — and fails (exit 1) if any ape pair's win rate is outside 45-55%.
// Deterministic: the rules have no randomness; bot choices use the sims' seeded generator.
// Usage: node sim/balance_check.mjs [--seeds 42,7,1234] [--pairs 10000] [--only text|zones] [--lo 45 --hi 55]
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const a = process.argv.slice(2), arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const SEEDS = arg('seeds', '42,7,1234').split(','), N = arg('pairs', '10000'), ONLY = arg('only', '');
const LO = +arg('lo', 45), HI = +arg('hi', 55);
const run = (f, args) => execFileSync(process.execPath, [path.join(here, f), ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
// Parse every win-% matrix in a sim's output: header row of ape ids, then "ape  -  52.0% ...".
function tables(out) {
  const L = out.split('\n'), res = []; let label = '';
  for (let i = 0; i < L.length; i++) {
    const m = L[i].match(/^=== (.+?):/); if (m) label = m[1];
    const hdr = L[i].trim().split(/\s+/);
    if (hdr.length >= 2 && /^[a-z]+$/.test(hdr[0]) && hdr.every(h => /^[a-z]+$/.test(h)) && L[i].startsWith(' ')) {
      const rows = {};
      for (let j = 1; j <= hdr.length; j++) { const c = L[i + j].trim().split(/\s+/); rows[c[0]] = c.slice(1).map(v => v === '-' ? null : parseFloat(v)); }
      res.push({ label, ids: hdr, rows }); i += hdr.length;
    }
  }
  return res;
}
const results = []; let fail = false;
function check(mode, seed, t) {
  let min = 100, max = 0; const bad = [];
  for (const r of t.ids) t.rows[r].forEach((v, k) => { if (v == null) return; min = Math.min(min, v); max = Math.max(max, v); if (v < LO || v > HI) bad.push(`${r} vs ${t.ids[k]} ${v}%`); });
  const ok = bad.length === 0; if (!ok) fail = true;
  results.push({ mode, seed, min, max, ok, bad, t });
}
const t0 = Date.now();
for (const seed of SEEDS) {
  if (ONLY !== 'zones') { const ts = tables(run('text_sim.mjs', ['--seed', seed, '--pairs', N])); if (!ts.length) throw new Error('text_sim: no table'); check('text (golden catch-up)', seed, ts[0]); }
  if (ONLY !== 'text' && existsSync(path.join(here, 'zones.mjs'))) for (const t of tables(run('zones.mjs', ['--seed', seed, '--n', N]))) check('zones: ' + t.label, seed, t);
}
for (const r of results) {
  console.log(`\n${r.mode} | seed ${r.seed} | ${N} per pair | row ape win %`);
  console.log('            ' + r.t.ids.map(h => h.padStart(8)).join(''));
  for (const id of r.t.ids) console.log(id.padEnd(12) + r.t.rows[id].map(v => (v == null ? '-' : v.toFixed(1) + '%').padStart(8)).join(''));
  console.log(`range ${r.min.toFixed(1)}-${r.max.toFixed(1)}% -> ${r.ok ? 'PASS' : 'FAIL: ' + r.bad.join(', ')}`);
}
console.log(`\nSUMMARY (target ${LO}-${HI}%)`);
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.mode.padEnd(26)} seed ${String(r.seed).padEnd(5)} ${r.min.toFixed(1)}-${r.max.toFixed(1)}%`);
console.log(`${fail ? 'BALANCE CHECK FAILED' : 'BALANCE CHECK PASSED'} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(fail ? 1 : 0);
