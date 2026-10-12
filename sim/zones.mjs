// ZONE duel mode, SIM ONLY (not in the game; play/rules.js untouched, only read for ape values).
// Each round both apes secretly pick 1 hit zone + 2 block zones (or Eat: hit nothing, heal, still block 2).
// A hit lands if its zone isn't blocked. Damage = rules.js dmg(att, def) (atk + club - armour) x fixed zone multiplier.
// No randomness in the rules: no crits, no dodges. Only bot choices use a seeded generator.
// Usage: node sim/zones.mjs [--seed 42] [--n 10000]
import { createRequire } from 'module'; import path from 'path'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url);
const R = require(path.resolve(here, '../play/rules.js'));
const a = process.argv.slice(2), arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i+1] : d; };
const SEED = arg('seed', '42'), N = +arg('n', 10000), IDS = Object.keys(R.STATS);
const VARIANTS = {
  '5 zones': {head:1.2, chest:1.0, belly:1.0, groin:1.1, legs:0.8},
  '4 zones': {head:1.2, chest:1.0, belly:1.0, legs:0.8},
};
const LOADOUT = {fruit:3, club:true};      // same for every ape: fair start, isolates the duel
const LOW = 0.4;                            // bots eat below 40% HP when they can
function rngFrom(str){ let h = 1779033703 ^ str.length; for (const c of str){ h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = h << 13 | h >>> 19; }
  let s = h >>> 0; return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pairsOf = Z => Z.flatMap((x, i) => Z.slice(i+1).map(y => [x, y]));
const canEat = f => f.p.fruit > 0 && (f.eaten || 0) < R.MAX_EATS && f.hp < f.max;
const pick = (rng, L) => L[Math.floor(rng() * L.length)];
const argmax = (rng, L, score) => { let best = -Infinity, out = []; for (const x of L){ const v = score(x); if (v > best + 1e-9){ best = v; out = [x]; } else if (Math.abs(v - best) < 1e-9) out.push(x); } return pick(rng, out); };
// ---- bots ----
const BOTS = {
  random(s, me, op, Z){ const eat = canEat(me) && s.rng() < 1 / (Z.length + 1); return {hit: eat ? null : pick(s.rng, Z), block: pick(s.rng, pairsOf(Z))}; },
  habit(s, me, op, Z){                        // a favourite hit zone and block pair, used ~65% of the time
    if (!s.fav){ s.fav = pick(s.rng, Z); s.favB = pick(s.rng, pairsOf(Z)); }
    const eat = canEat(me) && me.hp < LOW * me.max;
    return {hit: eat ? null : s.rng() < .65 ? s.fav : pick(s.rng, Z), block: s.rng() < .65 ? s.favB : pick(s.rng, pairsOf(Z))};
  },
  smart(s, me, op, Z, M){                     // reads the opponent's last 6 picks
    const H = op.hits.slice(-6), B = op.blocks.slice(-6), w = i => 1 + i;   // newer picks count more
    const hitP = z => H.reduce((t, h, i) => t + (h === z ? w(i) : 0), 0), blkP = z => B.reduce((t, b, i) => t + (b.includes(z) ? w(i) : 0), 0);
    const tot = B.reduce((t, _, i) => t + w(i), 0) || 1;
    const hit = argmax(s.rng, Z, z => M[z] * (1 - blkP(z) / tot) + 0.01 * s.rng());
    const block = argmax(s.rng, pairsOf(Z), ([x, y]) => hitP(x) * M[x] + hitP(y) * M[y] + 0.01 * s.rng());
    const eat = canEat(me) && me.hp < LOW * me.max && me.hp + R.EAT_HEAL <= me.max;
    return {hit: eat ? null : hit, block};
  },
};
function fighter(id){ const p = {ape:{id, name:id, ...R.STATS[id]}, fruit:LOADOUT.fruit, wood:0, club:LOADOUT.club}; return {p, hp:p.ape.hp, max:p.ape.hp, eaten:0, hits:[], blocks:[]}; }
function duel(idA, idB, botA, botB, Z, M, rng){
  const F = [fighter(idA), fighter(idB)], S = [{bot:botA, rng}, {bot:botB, rng}];
  for (let r = 0; r < R.MAX_ROUNDS; r++){
    const P = F.map((f, i) => BOTS[S[i].bot](S[i], f, F[1-i], Z, M));
    const dmgTo = [0, 0];
    P.forEach((p, i) => { if (p.hit && !P[1-i].block.includes(p.hit)) dmgTo[1-i] = Math.round(R.dmg(F[i].p, F[1-i].p) * M[p.hit]); });
    P.forEach((p, i) => { const f = F[i]; if (!p.hit){ f.hp = Math.min(f.max, f.hp + R.EAT_HEAL); f.p.fruit--; f.eaten++; } });
    F.forEach((f, i) => { f.hp -= dmgTo[i]; f.hits.push(P[i].hit); f.blocks.push(P[i].block); });
    if (F[0].hp <= 0 || F[1].hp <= 0) return F[0].hp <= 0 && F[1].hp <= 0 ? .5 : F[1].hp <= 0 ? 1 : 0;
  }
  const ra = F[0].hp / F[0].max, rb = F[1].hp / F[1].max; return ra > rb ? 1 : rb > ra ? 0 : .5;
}
const pct = v => (v * 100).toFixed(1) + '%';
console.log(`ZONE duel sim (sim only). Seed ${SEED}, ${N} duels per pair. Loadout for every ape: club + ${LOADOUT.fruit} fruit, Eat heals ${R.EAT_HEAL}, max ${R.MAX_EATS} Eats, ${R.MAX_ROUNDS} rounds then HP% decides.`);
console.log('Ape stats from play/rules.js: ' + IDS.map(k => `${k} ${R.STATS[k].hp}hp/${R.STATS[k].atk}atk/${R.STATS[k].dfn}arm`).join(', '));
const summary = [];
for (const [vn, M] of Object.entries(VARIANTS)){
  const Z = Object.keys(M);
  console.log(`\n=== ${vn}: ${Z.map(z => `${z} x${M[z]}`).join(', ')}; pick 1 hit + 2 blocks ===`);
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
console.log('\nSUMMARY\n' + summary.join('\n'));
