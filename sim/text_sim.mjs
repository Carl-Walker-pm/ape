// Sim adapter for the TEXT edition: turn-based gathering (text/gather.js) + the shared duel (play/rules.js).
// Deterministic rules; only the duel bots' choices use a seeded generator. Usage: node sim/text_sim.mjs [--seed 42] [--pairs 1000]
import { createRequire } from 'module'; import path from 'path'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url);
const R = require(path.resolve(here, '../play/rules.js')), TG = require(path.resolve(here, '../text/gather.js'));
const a = process.argv.slice(2); const arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i+1] : d; };
const SEED = arg('seed', '42'), PAIRS = +arg('pairs', 1000), IDS = Object.keys(R.STATS);
function rngFrom(str){ let h = 1779033703 ^ str.length; for (const c of str){ h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = h << 13 | h >>> 19; }
  let s = h >>> 0; return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pickOf = (rng, L) => L[Math.floor(rng() * L.length)];
function gather(P){                       // both sides use the bot plan (Hard), race on the golden turn
  const camps = P.map(() => TG.newCamp()), max = Math.max(...P.map(TG.turnsFor));
  for (let t = 1; t <= max; t++){
    if (t === TG.GOLD_TURN){ TG.golden(P, P.map(() => true), R.GOLD_FRUIT); continue; }
    P.forEach((p, i) => { if (t <= TG.turnsFor(p)) TG.act(p, camps[i], t, TG.botAction(p, camps[i], t, R.clubWood(p), false, t)); });
  }
  P.forEach(p => R.doCraft(p));
}
function choose(s, pref, L){ return (L.includes(pref) && s.rng() < s.focus) ? pref : pickOf(s.rng, L); }
function pickMove(s, me, op){
  const L = R.legal(me), t = me.hist.length, low = me.hp < 0.4 * me.max;
  switch (s.bot){
    case 'aggressive': return choose(s, t % 3 ? 'strike' : 'feint', L);
    case 'defensive': return choose(s, low && L.includes('eat') ? 'eat' : L.includes('guard') ? 'guard' : 'strike', L);
    case 'gatherer': return choose(s, me.hp < 0.7 * me.max && L.includes('eat') ? 'eat' : 'strike', L);
    default: return choose(s, low && L.includes('eat') ? 'eat' : ['strike','guard','feint'][t % 3], L);
  }
}
function match(x, y, rng){
  const S = [x, y].map((id, i) => ({p:{ape:{id, name:id, ...R.STATS[id]}, i, fruit:0, wood:0, gold:false, club:false}, bot:pickOf(rng, ['aggressive','defensive','gatherer','mixed']), rng, focus:0.6 + 0.35 * rng()}));
  gather(S.map(s => s.p));
  const F = S.map(s => ({p:s.p, max:s.p.ape.hp + (s.p.gold ? R.GOLD_HP : 0), hp:s.p.ape.hp + (s.p.gold ? R.GOLD_HP : 0), lastGuard:false, hist:[]}));
  for (let r = 0; r < R.MAX_ROUNDS; r++){
    const ma = pickMove(S[0], F[0], F[1]), mb = pickMove(S[1], F[1], F[0]);
    R.resolve(F[0], F[1], ma, mb); F[0].hist.push(ma); F[1].hist.push(mb);
    if (F[0].hp <= 0 || F[1].hp <= 0) return F[0].hp <= 0 && F[1].hp <= 0 ? .5 : F[1].hp <= 0 ? 1 : 0;
  }
  const ra = F[0].hp / F[0].max, rb = F[1].hp / F[1].max; return ra > rb ? 1 : rb > ra ? 0 : .5;
}
const rate = {}; let ok = true;
for (let i = 0; i < IDS.length; i++) for (let j = i+1; j < IDS.length; j++){
  const rng = rngFrom(`${SEED}:text:${IDS[i]}:${IDS[j]}`); let w = 0;
  for (let k = 0; k < PAIRS; k++) w += k % 2 ? 1 - match(IDS[j], IDS[i], rng) : match(IDS[i], IDS[j], rng);
  rate[IDS[i]+'>'+IDS[j]] = w / PAIRS; rate[IDS[j]+'>'+IDS[i]] = 1 - w / PAIRS;
}
console.log(`Text edition sim (text/gather.js turn budget ${TG.TURNS}, golden fruit on turn ${TG.GOLD_TURN}; duel play/rules.js), seed ${SEED}, ${PAIRS} matches per pair`);
console.log(''.padEnd(9) + IDS.map(k => k.padStart(9)).join(''));
for (const r of IDS) console.log(r.padEnd(9) + IDS.map(c => { if (r === c) return '-'.padStart(9); const v = rate[r+'>'+c], bad = v < .45 || v > .55; ok &&= !bad; return ((v*100).toFixed(1) + '%' + (bad ? '!' : '')).padStart(9); }).join(''));
const v = Object.values(rate); console.log(`Range ${(Math.min(...v)*100).toFixed(1)}-${(Math.max(...v)*100).toFixed(1)}% -> ${ok ? 'PASS' : 'FAIL'} (45-55%)`);
// what each ape brings to the duel with the bot plan (deterministic)
for (const id of IDS){ const p = {ape:{id, name:id, ...R.STATS[id]}, fruit:0, wood:0, gold:false, club:false}; const q = {ape:{id:'boulder', ...R.STATS.boulder}, fruit:0, wood:0, club:false};
  gather([p, q]); console.log(`  ${id.padEnd(8)} after gathering (vs Boulder): fruit ${p.fruit}, wood ${p.wood}, club ${p.club}, golden ${p.gold}`); }
process.exitCode = ok ? 0 : 1;
