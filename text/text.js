/* Going ApeSh!t: text edition. Plain text, numbered menus (keys 1-9 or click). No canvas, no images.
   Duels, crafting, stats: ../play/rules.js. Turn-based gathering: gather.js. No random calls. */
'use strict';
(() => {
const R = window.ApeRules, TG = window.TextGather;
const APES = [
  {id:'vinny',  name:'Vinny',   role:'the climber',   trick:'Only Vinny can climb the canopy (+3 fruit).'},
  {id:'boulder',name:'Boulder', role:'the smasher',   trick:'Chops 2 wood per tree.'},
  {id:'zip',    name:'Zip',     role:'the quick one', trick:'Quick hands: 2 extra gathering turns.'},
  {id:'moe',    name:'Big Moe', role:'the tank',      trick:'Shakes trees: every tree also drops 1 fruit.'},
  {id:'tinker', name:'Tinker',  role:'the crafter',   trick:'Crafts the club with 2 less wood.'},
].map(a => Object.assign(a, R.STATS[a.id]));
const MOVES = {strike:'Strike', guard:'Guard', feint:'Feint', eat:'Eat fruit'};
const HINT = {strike:'beats Feint', guard:'blocks a Strike and hits back; not twice in a row', feint:'beats Guard and Eat; loses to Strike', eat:`heals ${R.EAT_HEAL}, costs 1 fruit, ${R.MAX_EATS} per duel`};
const SESSION = {rematches:0};
const out = document.getElementById('out'), menu = document.getElementById('menu'), note = document.getElementById('note');
const G = window.TXT = {mode:'bot', diff:'easy', picks:[], log:[]};
const RULE = '═'.repeat(64), THIN = '─'.repeat(64);

// ---- screen helpers ----
let choices = [], onEnter = null;
function screen(text, opts = [], enter = null){
  out.textContent = text; choices = opts; onEnter = enter; note.textContent = '';
  menu.innerHTML = '';
  opts.forEach((o, i) => {
    const li = document.createElement('li'); li.tabIndex = 0;
    li.textContent = `${i+1}) ${o.label}`; if (o.off) li.className = 'off';
    li.onclick = () => pickChoice(i); li.onkeydown = e => { if (e.key === 'Enter') pickChoice(i); };
    menu.appendChild(li);
  });
}
function pickChoice(i){ const o = choices[i]; if (!o) return; if (o.off){ note.textContent = o.why || 'Not possible now.'; return; } o.go(); }
addEventListener('keydown', e => {
  if (/^[1-9]$/.test(e.key)){ e.preventDefault(); pickChoice(+e.key - 1); }
  else if ((e.key === 'Enter' || e.key === ' ') && onEnter && document.activeElement.tagName !== 'LI'){ e.preventDefault(); onEnter(); }
});
const bar = (v, max, n = 20) => { const k = Math.max(0, Math.round(n * Math.max(0, v) / max)); return '[' + '#'.repeat(k) + '-'.repeat(n - k) + ']'; };
const head = (title) => `GOING APESH!T${' '.repeat(Math.max(1, 64 - 13 - title.length))}${title}\n${RULE}\n`;
const pname = p => G.mode === 'hot' ? `${p.ape.name} (Player ${p.i+1})` : p.bot ? `${p.ape.name} (bot)` : p.ape.name;

// ================= title =================
function title(){
  screen(head('PROTOTYPE, TEXT EDITION') +
`
   PICK YOUR APE, GRAB THE FRUIT, WIN THE DUEL.

   Gather fruit and wood for ${TG.TURNS} turns, craft a club,
   then fight a turn-based duel. Both sides pick a move in
   secret, the moves are revealed together. No dice.

${THIN}
Bot level: ${G.diff === 'easy' ? 'EASY' : 'HARD'}
`, [
    {label:'Play vs bot', go:() => { G.mode = 'bot'; select(); }},
    {label:'2 players, one keyboard', go:() => { G.mode = 'hot'; select(); }},
    {label:`Bot level: switch to ${G.diff === 'easy' ? 'Hard' : 'Easy'}`, go:() => { G.diff = G.diff === 'easy' ? 'hard' : 'easy'; title(); }},
  ]);
}

// ================= ape select =================
function select(){ G.picks = []; selectScreen(); }
function selectScreen(){
  const who = G.mode === 'hot' ? `PLAYER ${G.picks.length+1}, PICK YOUR APE` : 'PICK YOUR APE';
  let t = head(who) + '\n';
  APES.forEach((a, k) => {
    t += `${k+1}) ${a.name.toUpperCase()}, ${a.role}${G.picks.includes(k) ? '   (taken)' : ''}\n`;
    t += `   HP ${String(a.hp).padStart(3)}  Strike ${a.atk}  Armour ${a.dfn}\n   ${a.trick}\n\n`;
  });
  screen(t, APES.map((a, k) => ({label:`${a.name}`, off:G.picks.includes(k), why:'Player 1 already took that ape.', go:() => pick(k)}))
    .concat([{label:'Back', go:title}]));
}
function pick(k){
  G.picks.push(k);
  if (G.mode === 'hot' && G.picks.length < 2) return selectScreen();
  if (G.mode === 'bot') G.picks.push((k + 2) % APES.length);
  G.players = G.picks.map((k, i) => ({ape:APES[k], i, bot: G.mode === 'bot' && i === 1}));
  startGather();
}

// ================= gather (turn-based) =================
function startGather(){
  G.players.forEach(p => Object.assign(p, {fruit:0, wood:0, gold:false, club:false}));
  G.camps = G.players.map(() => TG.newCamp());
  G.turn = 1; G.log = []; G.botIdx = 0; G.cue = false;
  G.maxTurn = Math.max(...G.players.map(TG.turnsFor));
  gatherTurn(0);
}
function status(p){ return `${pname(p).padEnd(22)} fruit ${String(p.fruit).padStart(2)}   wood ${String(p.wood).padStart(2)}${p.gold ? '   * golden fruit' : ''}`; }
function gatherTurn(who){
  // who = index of the human player choosing now
  const p = G.players[who];
  if (G.turn > TG.turnsFor(p)) return afterPick(who, null);
  const camp = G.camps[who];
  let t = head(`GATHERING, TURN ${G.turn} OF ${TG.turnsFor(p)}`);
  t += `\n${status(G.players[0])}\n${status(G.players[1])}\n\n`;
  if (G.turn === TG.GOLD_TURN - 1) t += '!! Something golden is ripening in the centre...\n\n';
  if (G.turn === TG.GOLD_TURN) t += '!! GOLDEN FRUIT IN THE CENTRE! Race for it (uses this turn).\n   If both apes race, the ape with less fruit so far gets it.\n\n';
  t += (G.log.slice(-6).join('\n') || 'Your grove: 3 fruit bushes, 3 trees, 1 canopy. They grow back after a few turns.') + '\n\n';
  t += `${G.mode === 'hot' ? `PLAYER ${who+1} (${p.ape.name}), what now?` : 'What now?'}`;
  const opts = TG.actions(p, camp, G.turn).map(a => ({label:a.label, off:!a.ok, why: TG.why(p, camp, G.turn, a.id), go:() => afterPick(who, a.id)}));
  if (G.turn === TG.GOLD_TURN) opts.unshift({label:'Race for the golden fruit', go:() => afterPick(who, 'gold')});
  opts.push({label:'Finish gathering now', go:() => { G.turn = 999; endGather(); }});
  screen(t, opts);
}
function afterPick(who, action){
  G.pending = G.pending || [null, null];
  G.pending[who] = action || 'none';
  if (G.mode === 'hot' && who === 0) return gatherTurn(1);
  // bot
  const b = G.players[1];
  if (b.bot) G.pending[1] = G.turn > TG.turnsFor(b) ? 'none'
    : G.turn === TG.GOLD_TURN ? 'gold' : TG.botAction(b, G.camps[1], G.turn, R.clubWood(b), G.diff === 'easy', G.botIdx++);
  resolveTurn();
}
function resolveTurn(){
  const acts = G.pending; G.pending = null;
  const lines = [];
  if (G.turn === TG.GOLD_TURN){
    const w = TG.golden(G.players, acts.map(a => a === 'gold'), R.GOLD_FRUIT);
    const racers = G.players.filter((p, i) => acts[i] === 'gold');
    lines.push(w ? `* ${w.ape.name} grabs the GOLDEN FRUIT: +${R.GOLD_FRUIT} fruit and a 4th Eat in the duel.`
      : racers.length ? '* Both apes reach the golden fruit together and it rolls away. Nobody gets it.' : '* Nobody goes for the golden fruit.');
  }
  G.players.forEach((p, i) => { if (acts[i] && acts[i] !== 'gold' && acts[i] !== 'none'){ const l = TG.act(p, G.camps[i], G.turn, acts[i]); if (l) lines.push(l); } });
  G.log.push(`Turn ${G.turn}: ` + (lines.join(' ') || '...'));
  G.turn++;
  if (G.turn > G.maxTurn) return endGather();
  gatherTurn(0);
}
function endGather(){ G.players.forEach(p => { if (p.bot) R.doCraft(p); }); craft(0); }

// ================= craft =================
function craft(i){
  const p = G.players[i];
  if (!p) return duelStart();
  if (p.bot) return craft(i + 1);
  const ok = R.canCraft(p);
  let t = head(`WORKBENCH${G.mode === 'hot' ? `, PLAYER ${i+1}` : ''}`);
  t += `\n${status(p)}\n\nWOODEN CLUB: ${R.clubWood(p)} wood + ${R.CLUB.fruit} fruit.\nEvery Strike, counter and Feint hits +${R.CLUB.atk} harder.\nFruit you keep is food in the duel: each Eat heals ${R.EAT_HEAL} HP, up to ${R.MAX_EATS + (p.gold ? 1 : 0)} times.\n`;
  if (G.mode === 'bot') t += `\n${G.players[1].ape.name} (bot) ${G.players[1].club ? 'has crafted a club.' : 'could not craft a club.'}\n`;
  screen(t, [
    {label:'Craft the club', off:!ok, why:`Not enough: you need ${R.clubWood(p)} wood and ${R.CLUB.fruit} fruit.`, go:() => { R.doCraft(p); craft(i + 1); }},
    {label: ok ? 'Keep the fruit, go to the duel' : 'Go to the duel', go:() => craft(i + 1)},
  ]);
}

// ================= duel =================
function duelStart(){
  const f = p => ({p, max:p.ape.hp + (p.gold ? R.GOLD_HP : 0), hp:p.ape.hp + (p.gold ? R.GOLD_HP : 0), lastGuard:false});
  G.duel = {f:G.players.map(f), round:1, hist:[], picks:[null, null], log:[], over:false};
  if (G.mode === 'hot') return passScreen(0, 'THE DUEL BEGINS');
  duelScreen(0);
}
function fighterLines(f){
  return `${f.p.ape.name.toUpperCase().padEnd(10)} ${bar(f.hp, f.max)} ${String(Math.max(0, f.hp)).padStart(3)}/${f.max} HP\n` +
         `           fruit ${f.p.fruit}, Eats left ${R.MAX_EATS + (f.p.gold ? 1 : 0) - (f.eaten || 0)}, ${f.p.club ? `club +${R.CLUB.atk}` : 'no club'}${f.lastGuard ? ', guarded last round' : ''}`;
}
function whyNot(f, m){
  if (m === 'guard' && f.lastGuard) return "Can't Guard twice in a row. Pick another move.";
  if (m === 'eat'){
    if (f.p.fruit < 1) return 'No fruit left to eat. Pick another move.';
    if ((f.eaten || 0) >= R.MAX_EATS + (f.p.gold ? 1 : 0)) return 'No Eats left this duel. Pick another move.';
    if (f.hp >= f.max) return 'Already at full HP. Pick another move.';
  }
  return 'Not allowed right now. Pick another move.';
}
function duelScreen(who){
  const D = G.duel, me = D.f[who], L = R.legal(me);
  let t = head(`THE DUEL, ROUND ${D.round}`) + '\n' + fighterLines(D.f[0]) + '\n\n' + fighterLines(D.f[1]) + '\n\n';
  t += (D.log.slice(-5).join('\n') || 'Both apes pick in secret. The moves are revealed together.') + '\n\n';
  t += G.mode === 'hot' ? `PLAYER ${who+1} (${me.p.ape.name}), pick in secret:` : 'Your move:';
  screen(t, R.MOVE_KEYS.map(m => ({label:`${MOVES[m].padEnd(10)} ${L.includes(m) ? HINT[m] : '(blocked)'}`, off:!L.includes(m), why:whyNot(me, m), go:() => choose(who, m)})));
}
function narrate(a, b, ma, mb, hpA, hpB){
  const said = (me, op, m, mo, dmgToOp) => {
    const n = me.p.ape.name, o = op.p.ape.name;
    if (m === 'strike') return mo === 'guard' ? `${n} strikes, but ${o} blocks it.` : `${n} strikes!`;
    if (m === 'guard') return mo === 'strike' ? `${n} guards and hits back for ${dmgToOp}.` : `${n} guards.`;
    if (m === 'feint') return (mo === 'guard' || mo === 'eat') ? `${n} feints, and it lands for ${dmgToOp}!` : mo === 'strike' ? `${n} feints and gets caught.` : `${n} feints.`;
    return `${n} eats a fruit (+${me.healed || 0} HP).`;
  };
  const lostA = hpA - a.hp + (a.healed || 0), lostB = hpB - b.hp + (b.healed || 0);
  let s = `${said(a, b, ma, mb, lostB)} ${said(b, a, mb, ma, lostA)}`;
  const hits = [];
  if (lostB > 0 && !(ma === 'guard' || ma === 'feint')) hits.push(`${b.p.ape.name} takes ${lostB}.`);
  if (lostA > 0 && !(mb === 'guard' || mb === 'feint')) hits.push(`${a.p.ape.name} takes ${lostA}.`);
  if (ma === mb && ma === 'feint') return `${a.p.ape.name} and ${b.p.ape.name} both feint. Nothing happens.`;
  if (ma === mb && ma === 'guard') return 'Both apes guard. Nothing happens.';
  return (s + ' ' + hits.join(' ')).trim();
}
function choose(who, m){
  const D = G.duel; if (D.over) return;
  if (!R.legal(D.f[who]).includes(m)){ note.textContent = whyNot(D.f[who], m); return; }
  D.picks[who] = m;
  if (G.mode === 'bot') D.picks[1] = R.botPick(D.f[1], D.f[0], D.hist);
  if (D.picks[1] == null) return passScreen(1, 'PLAYER 1 HAS PICKED');
  const [ma, mb] = D.picks, [a, b] = D.f, hpA = a.hp, hpB = b.hp;
  D.hist.push(ma);
  R.resolve(a, b, ma, mb);
  D.log.push(`Round ${D.round}: ${a.p.ape.name} ${MOVES[ma].toUpperCase()} vs ${b.p.ape.name} ${MOVES[mb].toUpperCase()}. ` + narrate(a, b, ma, mb, hpA, hpB));
  D.picks = [null, null]; D.round++;
  if (a.hp <= 0 || b.hp <= 0 || D.round > R.MAX_ROUNDS){ D.over = true; return result(); }
  if (G.mode === 'hot') return passScreen(0, 'ROUND REVEALED', true);
  duelScreen(0);
}
function passScreen(to, why, reveal){
  const D = G.duel;
  let t = head(why) + '\n';
  if (reveal) t += D.log[D.log.length - 1] + '\n\n' + fighterLines(D.f[0]) + '\n\n' + fighterLines(D.f[1]) + '\n\n';
  t += `${THIN}\n\n      PASS THE KEYBOARD TO PLAYER ${to+1}.\n\n      Player ${to+1}, press ENTER when you're ready.\n\n${THIN}`;
  screen(t, [], () => duelScreen(to));
  G.passTo = to;
}

// ================= result =================
function result(){
  const [a, b] = G.duel.f;
  let w = null;
  if (a.hp <= 0 && b.hp <= 0) w = null; else if (b.hp <= 0) w = 0; else if (a.hp <= 0) w = 1;
  else w = a.hp / a.max > b.hp / b.max ? 0 : b.hp / b.max > a.hp / a.max ? 1 : null;
  const h = w == null ? 'A DRAW' : G.mode === 'bot' ? (w === 0 ? 'YOU WIN THE DUEL' : `${G.duel.f[w].p.ape.name.toUpperCase()} WINS THIS ONE`) : `${G.duel.f[w].p.ape.name.toUpperCase()} (PLAYER ${w+1}) WINS`;
  let t = head('RESULT') + `\n   ${h}\n\n` + fighterLines(a) + '\n\n' + fighterLines(b) + '\n\n';
  t += `Final round: ${G.duel.log[G.duel.log.length - 1]}\n${G.duel.round - 1} rounds.\n\nRematches this session: ${SESSION.rematches}\n`;
  screen(t, [
    {label:'Rematch', go:() => { SESSION.rematches++; startGather(); }},
    {label:'Change ape', go:select},
    {label:'Title', go:title},
  ]);
}
G.session = SESSION;
title();
})();
