#!/usr/bin/env node
// Balance gate. Runs the EXISTING sims (sim/text_sim.mjs, sim/zones.mjs) as child processes —
// no rules are reimplemented here — and fails (exit 1) if any ape pair's win rate is outside 45-55%.
// Deterministic: the rules have no randomness; bot choices use the sims' seeded generator.
// Usage: node sim/balance_check.mjs [--seeds 42,7,1234] [--pairs 10000] [--only text|zones] [--lo 45 --hi 55] [--skill-min 65] [--gold] [--no-replay]
// Replay guard: also runs sim/replay_guard.mjs (saved replay codes must give the same HP/winner); --no-replay skips it.
// Skill gate: smart bot must beat random >= --skill-min (65%) in every gated mode.
// Text duel skill comes from sim/game_sim.mjs --only skill (same play/rules.js duel; text_sim has no smart bot).
// --gold also runs the zone golden-fruit cases (A gold / B gold / both). They are REPORTED, not gated: zone-mode gold is undecided.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const a = process.argv.slice(2), arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const SEEDS = arg('seeds', '42,7,1234').split(','), N = arg('pairs', '10000'), ONLY = arg('only', '');
const LO = +arg('lo', 45), HI = +arg('hi', 55), SKILL_MIN = +arg('skill-min', 65);
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
const results = [], skills = []; let fail = false;
function skill(mode, seed, v) { if (v == null || isNaN(v)) throw new Error(`no smart-vs-random number for ${mode} seed ${seed}`);
  const ok = v >= SKILL_MIN; if (!ok) fail = true; skills.push({ mode, seed, v, ok }); }
// zones.mjs: per "=== label:" section, line "smart vs random: 88.5%"
function zoneSkills(out) { const r = {}; let label = '';
  for (const l of out.split('\n')) { const m = l.match(/^=== (.+?):/); if (m) label = m[1]; const k = l.match(/smart vs random\s*:\s*([\d.]+)%/); if (k) r[label] = parseFloat(k[1]); }
  return r; }
function check(mode, seed, t, info) {
  let min = 100, max = 0; const bad = [];
  for (const r of t.ids) t.rows[r].forEach((v, k) => { if (v == null) return; min = Math.min(min, v); max = Math.max(max, v); if (v < LO || v > HI) bad.push(`${r} vs ${t.ids[k]} ${v}%`); });
  const ok = bad.length === 0; if (!ok && !info) fail = true;
  results.push({ mode: info ? mode + ' [info]' : mode, seed, min, max, ok, bad, t });
}
const t0 = Date.now();
for (const seed of SEEDS) {
  if (ONLY !== 'zones') { const ts = tables(run('text_sim.mjs', ['--seed', seed, '--pairs', N])); if (!ts.length) throw new Error('text_sim: no table'); check('text (golden catch-up)', seed, ts[0]);
    const g = run('game_sim.mjs', ['--only', 'skill', '--skill', N, '--seed', seed]).match(/smart vs random\s+([\d.]+)%/); skill('text duel (rules.js)', seed, g && parseFloat(g[1])); }
  if (ONLY !== 'text' && existsSync(path.join(here, 'zones.mjs'))) { const out = run('zones.mjs', ['--seed', seed, '--n', N]), zs = zoneSkills(out);
    for (const t of tables(out)) { check('zones: ' + t.label, seed, t); skill('zones: ' + t.label, seed, zs[t.label]); } }
  if (a.includes('--gold') && ONLY !== 'text') for (const t of tables(run('zones.mjs', ['--gold', '--seed', seed, '--n', N]))) check('zones: ' + t.label, seed, t, true);
}
for (const r of results) {
  console.log(`\n${r.mode} | seed ${r.seed} | ${N} per pair | row ape win %`);
  console.log('            ' + r.t.ids.map(h => h.padStart(8)).join(''));
  for (const id of r.t.ids) console.log(id.padEnd(12) + r.t.rows[id].map(v => (v == null ? '-' : v.toFixed(1) + '%').padStart(8)).join(''));
  console.log(`range ${r.min.toFixed(1)}-${r.max.toFixed(1)}% -> ${r.ok ? 'PASS' : 'FAIL: ' + r.bad.join(', ')}`);
}
console.log(`\nSUMMARY (target ${LO}-${HI}%)`);
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.mode.padEnd(34)} seed ${String(r.seed).padEnd(5)} ${r.min.toFixed(1)}-${r.max.toFixed(1)}%`);
let replayOut = '';
if (!a.includes('--no-replay')) { try { replayOut = run('replay_guard.mjs', []); } catch (e) { replayOut = String(e.stdout || e.message); fail = true; }
  console.log('\n' + replayOut.trim()); }
console.log(`\nSKILL (smart vs random, target >= ${SKILL_MIN}%)`);
for (const k of skills) console.log(`  ${k.ok ? 'PASS' : 'FAIL'}  ${k.mode.padEnd(34)} seed ${String(k.seed).padEnd(5)} ${k.v.toFixed(1)}%`);
console.log(`${fail ? 'BALANCE CHECK FAILED' : 'BALANCE CHECK PASSED'} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(fail ? 1 : 0);
