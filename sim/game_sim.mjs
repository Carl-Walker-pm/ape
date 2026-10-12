// Going ApeSh!t: simulation that runs the GAME'S OWN RULES (mvp/rules.js, the file
// the browser loads). Nothing about gathering, crafting, golden fruit or the duel is
// re-implemented here; only the players' decisions (bots) live in this file.
// Randomness exists only in bot choices, from a seeded PRNG (default seed 42).
// Usage: node game_sim.mjs [--seed 42] [--pairs 1000] [--skill 10000] [--rules ../mvp/rules.js] [--hp vinny=112,...]
import { createRequire } from 'module';
import path from 'path'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map(s => s.trim().split(/\s+/)));
const require = createRequire(import.meta.url);
const R = require(path.resolve(here, args.rules || '../play/rules.js'));
const SEED = String(args.seed || '42'), PAIRS = +(args.pairs || 1000), SKILL = +(args.skill || 10000);
if (args.stat) args.stat.split(',').forEach(kv => { const [k,v] = kv.split('='); const [a,f] = k.split('.'); R.STATS[a][f] = +v; });
if (args.hp) args.hp.split(',').forEach(kv => { const [k,v] = kv.split('='); R.STATS[k].hp = +v; });
const IDS = Object.keys(R.STATS);

// ---- seeded PRNG (bots only) ----
function rngFrom(str){ let h = 1779033703 ^ str.length; for (const c of str){ h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = h << 13 | h >>> 19; }
  let a = h >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pickOf = (rng, L) => L[Math.floor(rng() * L.length)];

// ---- gathering: the game's 90 s arena, node respawns, canopies, golden fruit at 60 s ----
function newPlayer(id, i){ return {ape:{id, name:id, ...R.STATS[id]}, i, x: i===0?2.5:21.5, y: i===0?7.5:8.5, fruit:0, wood:0, gold:false, club:false, busy:0, node:null, picked:0}; }
function randomMove(w, p, dt, rng){         // wanders between random ready nodes, ignores the plan
  if (p.busy > 0) return;
  if (!p.goal || Math.hypot(p.goal.x-p.x, p.goal.y-p.y) < 0.05){
    const ready = w.nodes.filter(n => R.canUse(w,p,n)); const n = ready.length ? pickOf(rng, ready) : null;
    p.goal = (w.gold && !w.gold.taken && rng() < 0.5) ? {x:R.GOLD.x+0.5, y:R.GOLD.y+0.5} : n ? {x:n.x+0.5, y:n.y+0.5} : null;
    if (!p.goal) return;
  }
  const dx = p.goal.x-p.x, dy = p.goal.y-p.y, d = Math.hypot(dx,dy), step = p.ape.spd*dt;
  if (d <= step){ p.x = p.goal.x; p.y = p.goal.y; } else R.clampMove(p, dx, dy, dt);
}
function gather(a, b, rng){
  const w = {t:0, nodes:R.makeNodes(), gold:null, flash:[]}, dt = 0.1, P = [a, b];
  while (w.t < R.GATHER_SECS){
    w.t += dt;
    if (!w.gold && w.t >= R.GOLD_AT) w.gold = {taken:null};
    for (const s of P){ if (!COND[s.cond||'fed'].gather) continue; s.gp === 'random' ? randomMove(w, s.p, dt, rng) : R.botMove(w, s.p, dt); R.gatherTick(w, s.p, dt); }
    w.flash.length = 0;
  }
  for (const s of P) if (s.gp !== 'random' || rng() < 0.5) R.doCraft(s.p);   // craft phase
}

// ---- ape condition (camp-design.md §5 proposal; SIM ONLY, the game is unchanged) ----
const SOFT = args.variant === 'soft';   // Creativity Boost's proposal: fewer Eats, no attack/HP penalty
const COND = SOFT
  ? {fed:{atk:0, hp:0, halfEat:false, gather:true, lessEats:0}, hungry:{atk:0, hp:0, halfEat:false, gather:true, lessEats:1}, starving:{atk:0, hp:0, halfEat:false, gather:false, lessEats:2}}
  : {fed:{atk:0, hp:0, halfEat:false, gather:true, lessEats:0}, hungry:{atk:2, hp:10, halfEat:true, gather:true, lessEats:0}, starving:{atk:4, hp:20, halfEat:true, gather:false, lessEats:0}};

// ---- duel bots (decisions only; the duel itself is R.resolve) ----
const COUNTER = {strike:'guard', guard:'feint', feint:'strike', eat:'feint'};
function choose(s, pref, L){ return (L.includes(pref) && s.rng() < s.focus) ? pref : pickOf(s.rng, L); }
function smartPick(me, op){
  const L = R.legal(me), OL = R.legal(op);
  const w = {}; OL.forEach(m => w[m] = 1);
  op.hist.forEach((m, i) => { if (m in w) w[m] += 0.85 ** (op.hist.length-1-i) * 3; });
  const tot = Object.values(w).reduce((x,y) => x+y, 0);
  let best = null, bv = -1e9;
  for (const m of L){
    let v = 0;
    for (const [mo, pw] of Object.entries(w)){
      const A = {...me, p:{...me.p}}, B = {...op, p:{...op.p}};   // what-if on copies, using the game's resolve
      R.resolve(A, B, m, mo);
      const give = op.hp - B.hp, take = me.hp - A.hp;
      v += pw/tot * (give + (B.hp <= 0 ? 40 : 0) - (me.hp < 0.5*me.max ? 1.4 : 1) * take);
    }
    if (m === 'eat') v -= 4;
    if (v > bv){ bv = v; best = m; }
  }
  return best;
}
function duelPick(s, me, op){
  const L = R.legal(me), t = me.hist.length, low = me.hp < 0.4*me.max;
  switch (s.bot){
    case 'smart': return smartPick(me, op);
    case 'random': return pickOf(s.rng, L);
    case 'habit': return R.botPick(me, op, op.hist);          // the in-game bot
    case 'aggressive': return choose(s, t % 3 ? 'strike' : 'feint', L);
    case 'defensive': return choose(s, low && L.includes('eat') ? 'eat' : L.includes('guard') ? 'guard' : 'strike', L);
    case 'gatherer': return choose(s, me.hp < 0.7*me.max && L.includes('eat') ? 'eat' : 'strike', L);
    default: return choose(s, low && L.includes('eat') ? 'eat' : ['strike','guard','feint'][t % 3], L);
  }
}
function duel(A, B){
  const f = s => { const c = COND[s.cond||'fed']; if (c.atk) s.p.ape = {...s.p.ape, atk: s.p.ape.atk - c.atk};
    const mx = s.p.ape.hp - c.hp + (s.p.gold?R.GOLD_HP:0); return {p:s.p, max:mx, hp:mx, lastGuard:false, hist:[], halfEat:c.halfEat, eaten:c.lessEats}; };   // eaten starts at the lost Eats, so rules.js legal() caps it
  const fa = f(A), fb = f(B);
  for (let r = 0; r < R.MAX_ROUNDS; r++){
    const ma = duelPick(A, fa, fb), mb = duelPick(B, fb, fa);   // hidden: both from the same pre-round state
    R.resolve(fa, fb, ma, mb); fa.hist.push(ma); fb.hist.push(mb);
    for (const x of [fa, fb]) if (x.halfEat && x.healed > 0) x.hp -= Math.ceil(x.healed / 2);   // Hungry/Starving: Eat heals half
    if (fa.hp <= 0 || fb.hp <= 0) return fa.hp <= 0 && fb.hp <= 0 ? 0.5 : fb.hp <= 0 ? 1 : 0;
  }
  const ra = fa.hp/fa.max, rb = fb.hp/fb.max; return ra > rb ? 1 : rb > ra ? 0 : 0.5;
}
function match(idA, botA, idB, botB, rng, stats, condA='fed', condB='fed'){
  const side = (id, bot, i, cond) => ({p:newPlayer(id, i), bot, gp: bot === 'random' ? 'random' : 'plan', rng, focus: 0.6 + 0.35*rng(), cond});
  const A = side(idA, botA, 0, condA), B = side(idB, botB, 1, condB);
  gather(A, B, rng);
  if (stats){ for (const s of [A,B]){ stats.fruit += s.p.fruit; stats.club += s.p.club; stats.gold += s.p.gold; stats.n++; } }
  return duel(A, B);
}
// run a match with seats alternated: returns result for the 'first' side
const play = (i, a, ba, b, bb, rng, st, ca, cb) => i % 2 ? 1 - match(b, bb, a, ba, rng, st, cb, ca) : match(a, ba, b, bb, rng, st, ca, cb);

const ONLY = args.only || null;
let ok = true; const rate = {}; const gst = {fruit:0, club:0, gold:0, n:0};
// ---- 1. ape balance ----
if (!ONLY || ONLY==='balance'){
const MIX = ['aggressive','defensive','gatherer','mixed'];
for (let x = 0; x < IDS.length; x++) for (let y = x+1; y < IDS.length; y++){
  const rng = rngFrom(`${SEED}:pair:${IDS[x]}:${IDS[y]}`); let w = 0;
  for (let i = 0; i < PAIRS; i++) w += play(i, IDS[x], pickOf(rng, MIX), IDS[y], pickOf(rng, MIX), rng, gst);
  rate[`${IDS[x]}>${IDS[y]}`] = w / PAIRS; rate[`${IDS[y]}>${IDS[x]}`] = 1 - w / PAIRS;
}
console.log(`Going ApeSh!t sim on the game's own rules (${path.relative(process.cwd(), require.resolve(path.resolve(here, args.rules || '../play/rules.js')))}), seed ${SEED}`);
console.log(`Ape HP: ${IDS.map(k => `${k} ${R.STATS[k].hp}`).join(', ')}`);
console.log(`\n=== Ape balance, slice with gathering + golden fruit (ROW win rate vs COLUMN), ${PAIRS} matches per pair, bots ${MIX.join('/')}`);
console.log(''.padEnd(9) + IDS.map(k => k.padStart(9)).join(''));
for (const r of IDS) console.log(r.padEnd(9) + IDS.map(c => { if (r === c) return '-'.padStart(9); const v = rate[`${r}>${c}`]; const bad = v < .45 || v > .55; ok = ok && !bad; return ((v*100).toFixed(1) + '%' + (bad?'!':'')).padStart(9); }).join(''));
const vals = Object.values(rate);
console.log(`Range ${(Math.min(...vals)*100).toFixed(1)}-${(Math.max(...vals)*100).toFixed(1)}% -> ${ok ? 'PASS' : 'FAIL'} (45-55%)`);
}
if (!ONLY || ONLY==='balance') console.log(`Gathering (plan bots): avg fruit at duel ${(gst.fruit/gst.n).toFixed(2)}, club crafted ${(gst.club/gst.n*100).toFixed(0)}%, golden fruit taken in ${(gst.gold/gst.n*200).toFixed(0)}% of matches`);

// ---- 2. skill test ----
const sk = {}; const OPP = ['random','aggressive','defensive','gatherer','mixed','habit'];
if (!ONLY || ONLY==='skill') console.log(`\n=== Skill test: smart bot vs each opponent, ${SKILL} matches each, seed ${SEED} (random ape pairs, seats alternate)`);
if (!ONLY || ONLY==='skill') for (const o of OPP){
  const rng = rngFrom(`${SEED}:skill:${o}`); let w = 0;
  for (let i = 0; i < SKILL; i++) w += play(i, pickOf(rng, IDS), 'smart', pickOf(rng, IDS), o, rng);
  sk[o] = w / SKILL;
  console.log(`  smart vs ${o.padEnd(10)} ${(sk[o]*100).toFixed(1)}%  ${sk[o] >= .65 ? 'PASS' : 'below'} (target >= 65%)${o==='habit'?'  [the in-game bot]':''}${o==='mixed'?'  [extra]':''}`);
}
// ---- 3. does fruit matter? ----
if (!ONLY || ONLY==='fruit') {
  // Same matchups, only the resources change: smart bot (club) vs a mix of the heuristic bots (club, 6 fruit), random apes.
  const n = 10000, MIXO = ['aggressive','defensive','gatherer','mixed'];
  const run = (fruit, gold, botA='smart') => { const rng = rngFrom(`${SEED}:fruit`); let w = 0;
    for (let i = 0; i < n; i++){
      const a = pickOf(rng, IDS), b = pickOf(rng, IDS), ob = pickOf(rng, MIXO);
      const A = {p:Object.assign(newPlayer(a,0), {fruit, gold, club:true}), bot:botA, rng, focus:0.6+0.35*rng()};
      const B = {p:Object.assign(newPlayer(b,1), {fruit:6, gold:false, club:true}), bot:ob, rng, focus:0.6+0.35*rng()};
      w += duel(A, B);
    } return w / n; };
  console.log(`\n=== Does fruit matter? Smart bot vs the heuristic-bot mix (both with a club; opponent has 6 fruit), ${n} duels each, same seed`);
  const f0 = run(0,false), f3 = run(3,false), f6 = run(6,false), g6 = run(6,true);
  console.log(`  smart with 0 fruit: ${(f0*100).toFixed(1)}%   3 fruit: ${(f3*100).toFixed(1)}%   6 fruit: ${(f6*100).toFixed(1)}%   6 fruit + golden fruit: ${(g6*100).toFixed(1)}%`);
  const m0 = run(0,false,'mixed'), m6 = run(6,false,'mixed');
  console.log(`  same test with a 'mixed' heuristic bot instead of smart: 0 fruit ${(m0*100).toFixed(1)}%, 6 fruit ${(m6*100).toFixed(1)}%`);
}
// ---- 4. ape condition (only with --only condition) ----
if (ONLY === 'condition'){
  const MIXC = ['aggressive','defensive','gatherer','mixed'], N = PAIRS;
  console.log(SOFT ? `\n=== Ape condition, SOFT variant (Creativity Boost): Hungry = max 2 Eats, Starving = max 1 Eat and cannot gather, no attack/HP penalty. SIM ONLY. ${N} matches per ordered pair, seed ${SEED}` : `\n=== Ape condition (camp-design.md §5: Hungry -2 atk, -10 max HP, Eat heals half; Starving -4/-20, cannot gather). SIM ONLY. ${N} matches per ordered pair, seed ${SEED}`);
  for (const [ca, cb] of [['fed','fed'],['fed','hungry'],['hungry','hungry'],['fed','starving'],['hungry','starving']]){
    const m = {}; let lo = 1, hi = 0, tot = 0, cnt = 0;
    for (const x of IDS) for (const y of IDS){
      if (ca === cb && x === y) continue;
      const rng = rngFrom(`${SEED}:cond:${ca}:${cb}:${x}:${y}`); let w = 0;
      for (let i = 0; i < N; i++) w += play(i, x, pickOf(rng, MIXC), y, pickOf(rng, MIXC), rng, null, ca, cb);
      m[x+'>'+y] = w / N; lo = Math.min(lo, w/N); hi = Math.max(hi, w/N); tot += w/N; cnt++;
    }
    console.log(`\n${ca.toUpperCase()} (row) vs ${cb.toUpperCase()} (column): avg ${(tot/cnt*100).toFixed(1)}% for the row side, range ${(lo*100).toFixed(1)}-${(hi*100).toFixed(1)}%` + (ca===cb ? ` -> ${lo>=.45&&hi<=.55?'PASS':'FAIL'} (45-55%)` : ''));
    console.log(''.padEnd(9) + IDS.map(k => k.padStart(9)).join(''));
    for (const r of IDS) console.log(r.padEnd(9) + IDS.map(c => (ca===cb && r===c) ? '-'.padStart(9) : ((m[r+'>'+c]*100).toFixed(1)+'%').padStart(9)).join(''));
  }
}
process.exitCode = ONLY ? 0 : ok && ['random','aggressive','defensive','gatherer'].every(o => sk[o] >= .65) ? 0 : 1;
