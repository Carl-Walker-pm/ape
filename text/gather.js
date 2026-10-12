/* Going ApeSh!t (text edition): turn-based gathering rules. Deterministic, no random calls.
   Duels, crafting, stats and the golden fruit's duel effect come from ../play/rules.js;
   this file only replaces the 90-second real-time map with a turn budget.
   Timings are the map's, scaled at 7.5 s per turn (90 s = 12 turns). */
(function(root){
'use strict';
const TURNS = 12, GOLD_TURN = 8;            // golden fruit: turn 8 of 12 (= 60 s in, 0:30 left)
const NODES = {bush:{count:3, re:3}, tree:{count:3, re:4}, canopy:{count:1, re:6}};   // per player, mirrored arena
function newCamp(){ const c = {}; for (const k in NODES) c[k] = Array(NODES[k].count).fill(0); return c; }   // turn each node is ready again
function ready(camp, kind, turn){ return camp[kind].findIndex(r => r <= turn); }
function turnsFor(p){ return TURNS + (p.ape.id==='zip' ? 2 : 0); }    // Zip, the quick one: 2 extra turns
// actions available to player p on this turn
function actions(p, camp, turn){
  const A = [];
  A.push({id:'bush',  label:'Shake a fruit bush (+1 fruit)', ok: ready(camp,'bush',turn) >= 0});
  A.push({id:'tree',  label:`Chop a tree (+${p.ape.id==='boulder'?2:1} wood${p.ape.id==='moe'?', +1 fruit':''})`, ok: ready(camp,'tree',turn) >= 0});
  A.push({id:'canopy',label:'Climb the canopy (+3 fruit, Vinny only)', ok: p.ape.id==='vinny' && ready(camp,'canopy',turn) >= 0});
  A.push({id:'rest',  label:'Catch your breath (nothing)', ok:true});
  return A;
}
function why(p, camp, turn, id){
  if (id==='canopy' && p.ape.id!=='vinny') return 'Only Vinny can climb the canopy.';
  const k = id; if (camp[k]){ const t = Math.min(...camp[k]); return `Nothing ready there. Next one in ${t-turn} turn${t-turn===1?'':'s'}.`; }
  return 'Not possible now.';
}
// do one action; returns a line of text
function act(p, camp, turn, id){
  const i = camp[id] ? ready(camp, id, turn) : -1;
  if (id==='rest') return `${p.ape.name} catches their breath.`;
  if (i < 0 || (id==='canopy' && p.ape.id!=='vinny')) return null;
  camp[id][i] = turn + NODES[id].re;
  if (id==='bush'){ p.fruit += 1; return `${p.ape.name} shakes a bush: +1 fruit.`; }
  if (id==='canopy'){ p.fruit += 3; return `${p.ape.name} climbs the canopy: +3 fruit.`; }
  const w = p.ape.id==='boulder' ? 2 : 1; p.wood += w; if (p.ape.id==='moe') p.fruit += 1;
  return `${p.ape.name} chops a tree: +${w} wood${p.ape.id==='moe'?', +1 fruit':''}.`;
}
// golden fruit event on GOLD_TURN: each side chooses to race (spends the turn) or not.
// Both race: the ape with LESS fruit so far gets it (a catch-up prize); equal fruit: nobody does.
function golden(players, race, goldFruit){
  const r = players.filter((p,i) => race[i]);
  let w = null;
  if (r.length === 1) w = r[0];
  else if (r.length === 2 && r[0].fruit !== r[1].fruit) w = r[0].fruit < r[1].fruit ? r[0] : r[1];
  if (w){ w.gold = true; w.fruit += goldFruit; }
  return w;
}
// the bot's gathering plan (deterministic). Easy: skips every 3rd turn.
function botAction(p, camp, turn, clubWood, easy, idx){
  if (easy && idx % 3 === 2) return 'rest';
  const A = Object.fromEntries(actions(p, camp, turn).map(a => [a.id, a.ok]));
  if (!p.club && p.wood < clubWood && A.tree) return 'tree';
  if (A.canopy) return 'canopy';
  if (A.bush) return 'bush';
  if (A.tree) return 'tree';
  return 'rest';
}
const TG = {TURNS, GOLD_TURN, NODES, newCamp, actions, why, act, golden, botAction, turnsFor};
if (typeof module !== 'undefined' && module.exports) module.exports = TG; else root.TextGather = TG;
})(this);
