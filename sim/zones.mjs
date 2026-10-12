// ZONE duel mode, SIM ONLY (not in the game; play/rules.js untouched, only read for ape values).
// Each round both apes secretly pick 1 hit zone + 2 ADJACENT block zones (no wrap legs+head; shield variant: 3 adjacent) (or Eat: hit nothing, heal, still block).
// A hit lands if its zone isn't blocked. Damage = rules.js dmg(att, def) (atk + club - armour) x fixed zone multiplier.
// No randomness in the rules: no crits, no dodges. Only bot choices use a seeded generator.
// Usage: node sim/zones.mjs [--seed 42] [--n 10000]
import { createRequire } from 'module'; import path from 'path'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url);
const R = require(path.resolve(here, '../play/rules.js'));
const a = process.argv.slice(2), arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i+1] : d; };
const SEED = arg('seed', '42'), N = +arg('n', 10000), IDS = Object.keys(R.STATS);
// Blocks are ADJACENT zones in body order, no wrap-around (legs+head is not a block: they are not neighbours on the body).
const ZC = require(path.resolve(here, 'zones-core.js'));   // shared with the text edition's zone preview
const VARIANTS = {
  '5 zones':          {M:ZC.Z5, k:2},
  '4 zones':          {M:ZC.Z4, k:2},   // waist dropped
  '5 zones + shield': {M:ZC.Z5, k:3},   // fixed shield: both apes block 3 adjacent
};
const LOADOUT = {fruit:3, club:true};   // same for every ape: fair start, isolates the duel
function rngFrom(str){ let h = 1779033703 ^ str.length; for (const c of str){ h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = h << 13 | h >>> 19; }
  let s = h >>> 0; return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pick = (rng, L) => L[Math.floor(rng() * L.length)];
const BOTS = {random:1, habit:1, smart:1};
let K = 2; const pairsOf = Z => ZC.blocksFor(Z, K);
function fighter(id, gold){ const p = {ape:{id, name:id, ...R.STATS[id]}, fruit:LOADOUT.fruit + (gold ? R.GOLD_FRUIT : 0), wood:0, club:LOADOUT.club, gold:!!gold}; /* golden fruit: +fruit and a 4th Eat (zones-core canEat) */ return {p, hp:p.ape.hp, max:p.ape.hp, eaten:0, hits:[], blocks:[]}; }
function duel(idA, idB, botA, botB, Z, M, rng, gA, gB){
  const F = [fighter(idA, gA), fighter(idB, gB)], S = [{rng}, {rng}], bots = [botA, botB];
  for (let r = 0; r < R.MAX_ROUNDS; r++){
    const P = F.map((f, i) => ZC.BOTS[bots[i]](R, S[i], f, F[1-i], M, K));
    ZC.resolve(R, F, P, M);
    if (F[0].hp <= 0 || F[1].hp <= 0) return F[0].hp <= 0 && F[1].hp <= 0 ? .5 : F[1].hp <= 0 ? 1 : 0;
  }
  const ra = F[0].hp / F[0].max, rb = F[1].hp / F[1].max; return ra > rb ? 1 : rb > ra ? 0 : .5;
}
const pct = v => (v * 100).toFixed(1) + '%';
console.log(`ZONE duel sim (sim only). Seed ${SEED}, ${N} duels per pair. Loadout for every ape: club + ${LOADOUT.fruit} fruit, Eat heals ${R.EAT_HEAL}, max ${R.MAX_EATS} Eats, ${R.MAX_ROUNDS} rounds then HP% decides.`);
console.log('Ape stats from play/rules.js: ' + IDS.map(k => `${k} ${R.STATS[k].hp}hp/${R.STATS[k].atk}atk/${R.STATS[k].dfn}arm`).join(', '));
const summary = [];
if (a.includes('--gold')) goldRuns(); else
for (const [vn, {M, k}] of Object.entries(VARIANTS)){
  const Z = Object.keys(M); K = k;
  console.log(`\n=== ${vn}: ${Z.map(z => `${z} x${M[z]}`).join(', ')}; pick 1 hit + ${k} adjacent blocks (${pairsOf(Z).map(b => b.join('+')).join(', ')}; no wrap) ===`);
  // balance: each side gets a bot drawn from random/habit/smart, sides alternate
  console.log(`\nBalance (row ape win %, bots mixed random/habit/smart):`);
  const rate = {};
  for (let i = 0; i < IDS.length; i++) for (let j = i+1; j < IDS.length; j++){
    const rng = rngFrom(`${SEED}:${vn}:${IDS[i]}:${IDS[j]}`); let w = 0;
    for (let k = 0; k < N; k++){ const ba = pick(rng, Object.keys(BOTS)), bb = pick(rng, Object.keys(BOTS));
      w += k % 2 ? 1 - duel(IDS[j], IDS[i], bb, ba, Z, M, rng) : duel(IDS[i], IDS[j], ba, bb, Z, M, rng); }
    rate[IDS[i]+'>'+IDS[j]] = w / N; rate[IDS[j]+'>'+IDS[i]] = 1 - w / N;
  }
  console.log(''.padEnd(9) + IDS.map(k => k.padStart(9)).join(''));
  let ok = true;
  for (const r of IDS) console.log(r.padEnd(9) + IDS.map(c => { if (r === c) return '-'.padStart(9); const v = rate[r+'>'+c], bad = v < .45 || v > .55; if (bad) ok = false; return (pct(v) + (bad ? '!' : '')).padStart(9); }).join(''));
  const v = Object.values(rate), lo = Math.min(...v), hi = Math.max(...v);
  console.log(`Range ${pct(lo)}-${pct(hi)} -> ${ok ? 'PASS' : 'FAIL'} (45-55%)`);
  // skill: smart vs habit / random, same ape mirror, averaged over all 5 apes, N per ape
  console.log(`\nSkill test (mirror matches, ${N} per ape, sides alternate):`);
  const sk = {};
  for (const opp of ['habit', 'random']){
    const per = IDS.map(id => { const rng = rngFrom(`${SEED}:${vn}:skill:${opp}:${id}`); let w = 0;
      for (let k = 0; k < N; k++) w += k % 2 ? 1 - duel(id, id, opp, 'smart', Z, M, rng) : duel(id, id, 'smart', opp, Z, M, rng); return w / N; });
    sk[opp] = per.reduce((s, x) => s + x, 0) / per.length;
    console.log(`  smart vs ${opp.padEnd(6)}: ${pct(sk[opp])}  (${IDS.map((id, i) => `${id} ${pct(per[i])}`).join(', ')})`);
  }
  { const per = IDS.map(id => { const rng = rngFrom(`${SEED}:${vn}:skill:hr:${id}`); let w = 0;
      for (let k = 0; k < N; k++) w += k % 2 ? 1 - duel(id, id, 'random', 'habit', Z, M, rng) : duel(id, id, 'habit', 'random', Z, M, rng); return w / N; });
    console.log(`  habit vs random: ${pct(per.reduce((s, x) => s + x, 0) / per.length)}`); }
  summary.push(`${vn}: balance ${pct(lo)}-${pct(hi)} ${ok ? 'PASS' : 'FAIL'}; smart vs habit ${pct(sk.habit)}, smart vs random ${pct(sk.random)}`);
}
if (summary.length) console.log('\nSUMMARY\n' + summary.join('\n'));

// ---- golden fruit runs (--gold): the 4th Eat that zones-core allows with the golden fruit ----
// "A gold": the row ape has the golden fruit (+1 fruit, 4th Eat), the column ape doesn't. "B gold": the column ape has it. "both": both do.
function goldRuns(){
  const out = [];
  for (const vn of ['5 zones', '4 zones']){
    const {M, k} = VARIANTS[vn], Z = Object.keys(M); K = k;
    const play = (x, y, gx, gy, tag) => { const rng = rngFrom(`${SEED}:${vn}:gold-${tag}:${x}:${y}`); let w = 0;
      for (let n = 0; n < N; n++){ const ba = pick(rng, Object.keys(BOTS)), bb = pick(rng, Object.keys(BOTS));
        w += n % 2 ? 1 - duel(y, x, bb, ba, Z, M, rng, gy, gx) : duel(x, y, ba, bb, Z, M, rng, gx, gy); }
      return w / N; };
    const cases = {
      'A gold': (r, c) => play(r, c, true, false, 'A'),
      'B gold': (r, c) => play(r, c, false, true, 'B'),
      'both gold': (r, c) => play(r, c, true, true, 'both'),
    };
    for (const [cn, f] of Object.entries(cases)){
      console.log(`\n=== ${vn}, ${cn}: row ape win % (${cn === 'A gold' ? 'row ape has the golden fruit' : cn === 'B gold' ? 'column ape has the golden fruit' : 'both have it'}) ===`);
      const rate = {};
      for (const r of IDS) for (const c of IDS) if (r !== c){
        if (cn === 'both gold' && rate[c+'>'+r] != null){ rate[r+'>'+c] = 1 - rate[c+'>'+r]; continue; }
        rate[r+'>'+c] = f(r, c);
      }
      console.log(''.padEnd(9) + IDS.map(x => x.padStart(9)).join(''));
      let ok = true;
      for (const r of IDS) console.log(r.padEnd(9) + IDS.map(c => { if (r === c) return '-'.padStart(9); const v = rate[r+'>'+c], bad = v < .45 || v > .55; if (bad) ok = false; return (pct(v) + (bad ? '!' : '')).padStart(9); }).join(''));
      const v = Object.values(rate), lo = Math.min(...v), hi = Math.max(...v);
      console.log(`Range ${pct(lo)}-${pct(hi)} -> ${ok ? 'PASS' : 'FAIL'} (45-55%)`);
      out.push(`${vn}, ${cn}: ${pct(lo)}-${pct(hi)} ${ok ? 'PASS' : 'FAIL'}`);
    }
  }
  console.log('\nSUMMARY (golden fruit)\n' + out.join('\n'));
}
