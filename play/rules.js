/* Going ApeSh!t: game rules shared by the browser game (play/game.js) and the
   simulation (sim/game_sim.mjs). One source of truth: the sim runs THIS file.
   No random calls anywhere in here. */
(function(root){
'use strict';
const W = 24, H = 16;                        // arena 24x16 tiles (game-map.md)
const GATHER_SECS = 90, GOLD_AT = 60;        // golden fruit spawns 60 s in, centre
const EAT_HEAL = 20, GOLD_HP = 0, GOLD_FRUIT = 1, MAX_ROUNDS = 30, MAX_EATS = 3;   // 3 Eats per duel; the golden fruit allows a 4th
// (GOLD_HP stays 0: +10 HP made the 60 s race decide too many ape pairs, see sim/run-game.txt)
const GOLD = {x:11.5, y:7.5};
const CLUB = {wood:4, fruit:1, atk:4};
const STATS = {   // hp / Strike / armour / speed (tiles per s)
  vinny:  {hp:110, atk:12, dfn:3, spd:3.8},
  boulder:{hp:82,   atk:15, dfn:3, spd:3.0},
  zip:    {hp:97, atk:13, dfn:3, spd:5.2},
  moe:    {hp:112,  atk:12, dfn:3, spd:2.8},
  tinker: {hp:101,  atk:13, dfn:3, spd:3.6},
};
const MOVE_KEYS = ['strike','guard','feint','eat'];
function makeNodes(){
  const n = [];
  [[4,3],[6,10],[8,4]].forEach(([x,y]) => { n.push({kind:'fruit',x,y,re:20}); n.push({kind:'fruit',x:W-1-x,y:H-1-y,re:20}); });
  [[3,12],[7,2],[5,6]].forEach(([x,y]) => { n.push({kind:'tree',x,y,re:30}); n.push({kind:'tree',x:W-1-x,y:H-1-y,re:30}); });
  n.push({kind:'high',x:1,y:1,re:45}); n.push({kind:'high',x:22,y:14,re:45});
  n.forEach(o => o.readyAt = 0);
  return n;
}

function nodeAt(w, p){
  const tx = Math.floor(p.x), ty = Math.floor(p.y);
  return w.nodes.find(n => n.x===tx && n.y===ty);
}

function canUse(w, p, n){ return n && w.t >= n.readyAt && (n.kind!=='high' || p.ape.id==='vinny'); }

function gatherTick(w, p, dt){
  if (p.busy>0){ p.busy -= dt; if (p.busy<=0) finishGather(w,p); return; }
  const n = nodeAt(w,p);
  if (canUse(w,p,n)){ p.busy = p.ape.id==='zip' ? 0.4 : 0.8; p.node = n; }
  if (w.gold && !w.gold.taken && Math.hypot(p.x-GOLD.x-0.5, p.y-GOLD.y-0.5) < 1.1){
    w.gold.taken = p; p.gold = true; p.fruit += GOLD_FRUIT; w.flash.push({x:p.x,y:p.y,txt:'GOLDEN FRUIT! +1 fruit and a 4th Eat in the duel',t:2.5});
  }
}

function finishGather(w, p){
  const n = p.node; p.node = null;
  if (!canUse(w,p,n) || nodeAt(w,p)!==n) return;
  let txt;
  if (n.kind==='tree'){ const wd = p.ape.id==='boulder'?2:1; p.wood += wd; txt = `+${wd} wood`; if (p.ape.id==='moe'){ p.fruit += 1; txt += ', +1 fruit'; } }
  else if (n.kind==='high'){ p.fruit += 3; txt = '+3 high fruit'; }
  else { p.fruit += 1; txt = '+1 fruit'; }
  n.readyAt = w.t + n.re; p.picked++;
  w.flash.push({x:p.x,y:p.y-0.4,txt,t:1.2});
}

function clampMove(p, dx, dy, dt){
  const len = Math.hypot(dx,dy); if (!len) return;
  const s = p.ape.spd * dt / len;
  p.x = Math.min(W-0.5, Math.max(0.5, p.x + dx*s));
  p.y = Math.min(H-0.5, Math.max(1.5, p.y + dy*s));  // row 0 under the HUD
}

function botMove(w, p, dt){
  if (p.busy>0) return;
  // simple bot: golden fruit if it is up, else wood until it can craft, else nearest ready fruit
  const need = clubWood(p);
  let goal = null;
  if (w.gold && !w.gold.taken) goal = {x:GOLD.x+0.5, y:GOLD.y+0.5};
  else {
    let best = 1e9;
    for (const n of w.nodes){
      if (!canUse(w,p,n)) continue;
      let d = Math.hypot(n.x+0.5-p.x, n.y+0.5-p.y);
      if (n.kind==='tree' && p.wood < need) d *= 0.5;
      if (n.kind==='tree' && p.wood >= need+2) d *= 3;
      if (d < best){ best = d; goal = {x:n.x+0.5, y:n.y+0.5}; }
    }
  }
  if (!goal) return;
  const dx = goal.x-p.x, dy = goal.y-p.y, d = Math.hypot(dx,dy), step = p.ape.spd*dt*0.85;
  if (d <= step){ p.x = goal.x; p.y = goal.y; } else clampMove(p, dx, dy, dt*0.85);
}

function clubWood(p){ return CLUB.wood - (p.ape.id==='tinker'?2:0); }

function canCraft(p){ return !p.club && p.wood >= clubWood(p) && p.fruit >= CLUB.fruit; }

function doCraft(p){ if (!canCraft(p)) return false; p.wood -= clubWood(p); p.fruit -= CLUB.fruit; p.club = true; return true; }

function clubAtk(p){ return p.club ? CLUB.atk : 0; }

function dmg(att, def){ return Math.max(1, att.ape.atk + clubAtk(att) - def.ape.dfn); }

function heal(p){ return EAT_HEAL; }

function resolve(a, b, ma, mb){
  const out = [];
  const one = (me, op, m, mo) => {    // effect of me's move on op, given op's move
    let toOp = 0, note = '';
    if (m==='strike'){
      if (mo==='guard'){ note = `${me.p.ape.name}'s strike is blocked`; }
      else if (mo==='feint'){ toOp = dmg(me.p,op.p) + 3; note = `${me.p.ape.name} catches the feint`; }
      else toOp = dmg(me.p,op.p);
    } else if (m==='guard'){
      if (mo==='strike'){ toOp = Math.ceil(dmg(me.p,op.p)/2); note = `${me.p.ape.name} blocks and hits back`; }
    } else if (m==='feint'){
      if (mo==='guard' || mo==='eat'){ toOp = Math.round(dmg(me.p,op.p)*1.5); note = `${me.p.ape.name}'s feint lands`; }
      else if (mo==='feint') note = 'Both feint. Nothing happens';
    } else if (m==='eat'){
      const h = Math.min(heal(me.p), me.max - me.hp + 0);
      me.healed = h; me.p.fruit -= 1; me.eaten = (me.eaten||0)+1; note = `${me.p.ape.name} eats a fruit (+${heal(me.p)} HP)`;
    }
    return {toOp, note};
  };
  a.healed = b.healed = 0;
  const ea = one(a,b,ma,mb), eb = one(b,a,mb,ma);
  a.hp = Math.min(a.max, a.hp + a.healed) - eb.toOp;
  b.hp = Math.min(b.max, b.hp + b.healed) - ea.toOp;
  a.lastGuard = ma==='guard'; b.lastGuard = mb==='guard';
  [ea,eb].forEach(e => e.note && out.push(e.note));
  if (ea.toOp) out.push(`${b.p.ape.name} takes ${ea.toOp}`);
  if (eb.toOp) out.push(`${a.p.ape.name} takes ${eb.toOp}`);
  return out.join(' · ') || 'Both hold back';
}

function legal(f){ return MOVE_KEYS.filter(m => !(m==='guard' && f.lastGuard) && !(m==='eat' && (f.p.fruit<1 || f.hp>=f.max || (f.eaten||0)>=MAX_EATS+(f.p.gold?1:0)))); }

function botPick(me, op, hist){
  const L = legal(me);
  if (L.includes('eat') && me.hp <= me.max*0.4) return 'eat';
  const recent = hist.slice(-4); const c = {};
  recent.forEach(m => c[m] = (c[m]||0)+1);
  let fav = null, n = 0; for (const m in c) if (c[m] > n){ n = c[m]; fav = m; }
  const counter = {strike:'guard', guard:'feint', feint:'strike', eat:'feint'};
  let want = fav ? counter[fav] : 'strike';
  if (hist.length % 5 === 4) want = 'strike';                 // a readable rhythm you can learn
  if (!L.includes(want)) want = L.includes('strike') ? 'strike' : L[0];
  return want;
}

const R = {W,H,GATHER_SECS,GOLD_AT,EAT_HEAL,MAX_EATS,GOLD_HP,GOLD_FRUIT,MAX_ROUNDS,GOLD,CLUB,STATS,MOVE_KEYS,
  makeNodes,nodeAt,canUse,gatherTick,finishGather,clampMove,botMove,clubWood,canCraft,doCraft,clubAtk,dmg,heal,resolve,legal,botPick};
if (typeof module !== 'undefined' && module.exports) module.exports = R; else root.ApeRules = R;
})(this);
