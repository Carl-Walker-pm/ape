/* Zone duel core (PREVIEW, not decided). Shared by sim/zones.mjs and the text edition (/text/?duel=zones).
   Each round both apes secretly pick 1 hit zone + K ADJACENT block zones (body order, no wrap legs+head),
   or Eat: hit nothing, heal, still block. A hit lands if its zone isn't blocked.
   Damage = rules.js dmg(att, def) x fixed zone multiplier. No randomness in the rules.
   Bots take an rng() for tie-breaks / variety; the game passes a fixed one (() => 0), the sim a seeded one. */
(function(root){
'use strict';
const Z5 = {head:1.2, chest:1.0, belly:1.0, waist:1.0, legs:0.8};
const Z4 = {head:1.2, chest:1.0, belly:1.0, legs:0.8};
const blocksFor = (Z, k = 2) => Z.slice(0, Z.length - k + 1).map((_, i) => Z.slice(i, i + k));
const LOW = 0.4;
function canEat(R, f){ return f.p.fruit > 0 && (f.eaten || 0) < R.MAX_EATS + (f.p.gold ? 1 : 0) && f.hp < f.max; }
function hitFor(R, att, def, zone, M){ return Math.round(R.dmg(att.p, def.p) * M[zone]); }
// P = [{hit: zone|null(eat), block:[zones]}, ...]; mutates fighters; returns per-side info
function resolve(R, F, P, M){
  const info = P.map(() => ({landed:false, dmg:0, healed:0}));
  P.forEach((p, i) => { if (p.hit && !P[1-i].block.includes(p.hit)){ info[i].landed = true; info[i].dmg = hitFor(R, F[i], F[1-i], p.hit, M); } });
  P.forEach((p, i) => { const f = F[i]; if (!p.hit){ const h = Math.min(R.EAT_HEAL, f.max - f.hp); f.hp += h; info[i].healed = h; f.p.fruit--; f.eaten = (f.eaten || 0) + 1; } });
  F.forEach((f, i) => { f.hp -= info[1-i].dmg; (f.hits = f.hits || []).push(P[i].hit); (f.blocks = f.blocks || []).push(P[i].block); });
  return info;
}
const pick = (rng, L) => L[Math.floor(rng() * L.length)];
function argmax(rng, L, score){ let best = -Infinity, out = []; for (const x of L){ const v = score(x); if (v > best + 1e-9){ best = v; out = [x]; } else if (Math.abs(v - best) < 1e-9) out.push(x); } return pick(rng, out); }
const BOTS = {
  random(R, s, me, op, M, k){ const Z = Object.keys(M); const eat = canEat(R, me) && s.rng() < 1 / (Z.length + 1); return {hit: eat ? null : pick(s.rng, Z), block: pick(s.rng, blocksFor(Z, k))}; },
  habit(R, s, me, op, M, k){                 // favourite hit zone + block, used ~65% of the time
    const Z = Object.keys(M), B = blocksFor(Z, k);
    if (!s.fav){ s.fav = pick(s.rng, Z); s.favB = pick(s.rng, B); }
    const eat = canEat(R, me) && me.hp < LOW * me.max;
    return {hit: eat ? null : s.rng() < .65 ? s.fav : pick(s.rng, Z), block: s.rng() < .65 ? s.favB : pick(s.rng, B)};
  },
  pattern(R, s, me, op, M, k){               // the game's Easy bot: a fixed, readable loop
    const Z = Object.keys(M), B = blocksFor(Z, k), t = (me.hits || []).length;
    const eat = canEat(R, me) && me.hp < LOW * me.max;
    return {hit: eat ? null : [Z[0], Z[0], Z[1]][t % 3], block: B[B.length - 1]};
  },
  smart(R, s, me, op, M, k){                 // reads the opponent's last 6 picks, newer ones count more
    const Z = Object.keys(M), H = (op.hits || []).slice(-6), BL = (op.blocks || []).slice(-6), w = i => 1 + i;
    const hitP = z => H.reduce((t, h, i) => t + (h === z ? w(i) : 0), 0), blkP = z => BL.reduce((t, b, i) => t + (b.includes(z) ? w(i) : 0), 0);
    const tot = BL.reduce((t, _, i) => t + w(i), 0) || 1;
    const hit = argmax(s.rng, Z, z => M[z] * (1 - blkP(z) / tot));
    const block = argmax(s.rng, blocksFor(Z, k), bl => bl.reduce((t, z) => t + hitP(z) * M[z], 0));
    const eat = canEat(R, me) && me.hp < LOW * me.max && me.hp + R.EAT_HEAL <= me.max;
    return {hit: eat ? null : hit, block};
  },
};
const ZC = {Z5, Z4, blocksFor, canEat, hitFor, resolve, BOTS, LOW};
if (typeof module !== 'undefined' && module.exports) module.exports = ZC; else root.ZoneCore = ZC;
})(this);
