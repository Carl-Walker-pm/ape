/* Going ApeSh!t: text edition. Plain text, numbered menus (keys 1-9 or click). No canvas, no images.
   Duels, crafting, stats: ../play/rules.js. Turn-based gathering: gather.js. No random calls. */
'use strict';
(() => {
const R = window.ApeRules, TG = window.TextGather, ZC = window.ZoneCore;
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
const G = window.TXT = {mode:'bot', diff:'easy', picks:[], log:[], rec:null};
const QS = new URLSearchParams(location.search);
G.zones = QS.get('duel') === 'zones';                  // preview mode; the default stays the 4 moves
const ZM = ZC.Z5, ZK = 2, ZN = Object.keys(ZM), ZB = ZC.blocksFor(ZN, ZK);
const THIN = '─'.repeat(30);

// ---- screen helpers ----
let choices = [], onEnter = null;
let sel = null; const cap = z => z[0].toUpperCase() + z.slice(1);
const confirmRow = document.getElementById('confirmRow'), confirmBtn = document.getElementById('confirm'), picked = document.getElementById('picked');
// kind: 'list' (click acts at once) | 'moves' | 'hit' | 'block' (click selects, Confirm acts; number keys still act at once)
function screen(text, opts = [], enter = null, kind = 'list'){
  out.textContent = ''; text.split('\n').forEach((l, i, A) => { const sp = document.createElement('span'); sp.textContent = l + (i < A.length - 1 ? '\n' : '');
    if (l.startsWith('!! Something golden')) sp.className = 'cue'; out.append(sp); });
  choices = opts; onEnter = enter; note.textContent = ''; sel = null;
  document.body.classList.toggle('passing', !opts.length && !!enter);   // pass screen: the board is hidden
  menu.innerHTML = ''; menu.className = kind;
  const selecting = kind !== 'list';
  opts.forEach((o, i) => {
    const k = o.key || i + 1, btn = document.createElement('button'); btn.type = 'button';
    btn.innerHTML = ''; const kk = document.createElement('span'); kk.className = 'k'; kk.textContent = `[${k}]`;
    const lb = document.createElement('span'); lb.className = 'l'; lb.textContent = o.label;
    btn.append(kk, ' ', lb);
    if (o.hint){ const h = document.createElement('span'); h.className = 'h'; h.textContent = o.hint; btn.append(h); }
    if (o.zone) btn.dataset.z = o.zone;
    if (o.cls) btn.classList.add(o.cls);
    if (o.off){ btn.setAttribute('aria-disabled', 'true'); btn.title = o.why || ''; }
    const direct = !selecting || o.nr || o.now;
    if (direct && selecting) btn.classList.add('util');
    btn.onclick = () => {
      if (direct || o.off) return pickChoice(k - 1);
      sel = k - 1; [...menu.children].forEach(c => c.setAttribute('aria-pressed', c === btn ? 'true' : 'false'));
      confirmBtn.disabled = false; picked.textContent = 'Selected: ' + o.label.trim();
    };
    menu.appendChild(btn);
  });
  if (kind === 'hit' || kind === 'block'){        // body chart: the other half of the pick shown beside the buttons (text only, no pick of the opponent)
    const g = document.createElement('div'); g.className = 'ghost'; g.setAttribute('aria-hidden', 'true');
    const t = document.createElement('div'); t.className = 'gt'; t.textContent = kind === 'hit' ? 'Then BLOCK two' : 'Your HIT'; g.append(t);
    (kind === 'hit' ? ZB.map(b => b.map(cap).join(' + ')) : ZN.map(z => (G.zstep && G.zstep.hit === z ? '▶ ' : '') + cap(z))).forEach(x => { const d = document.createElement('div'); d.className = 'gz' + (x.startsWith('▶') ? ' on' : ''); d.textContent = x; g.append(d); });
    if (kind === 'block' && G.zstep && !G.zstep.hit){ const d = document.createElement('div'); d.className = 'gz on'; d.textContent = '▶ Eat'; g.append(d); }
    menu.appendChild(g);
  }
  confirmRow.hidden = !selecting; confirmBtn.disabled = true; picked.textContent = selecting ? 'Pick a button, then Confirm (or press its number key).' : '';
  frame();
}
confirmBtn.onclick = () => { if (sel != null) pickChoice(sel); };
// ---- the frame: header counter, ape cards, log, round reveal (all words, CSS only) ----
const $ = id => document.getElementById(id);
function card(el, p, f, who){
  el.innerHTML = '';
  if (!p){ el.className = 'card empty'; const h = document.createElement('h2'); h.textContent = who; const s2 = document.createElement('div'); s2.className = 'sub'; s2.textContent = 'No ape picked yet.'; el.append(h, s2); return; }
  const hp = f ? Math.max(0, f.hp) : p.ape.hp, max = f ? f.max : p.ape.hp, base = R.MAX_EATS, eats = f ? eatsLeft(f) : base + (p.gold ? 1 : 0);
  el.className = 'card';
  const h = document.createElement('h2'); h.textContent = p.ape.name;
  const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = G.mode === 'hot' ? `Player ${p.i + 1}` : p.bot ? 'Bot' : 'You'; h.append(' ', tag);
  const sub = document.createElement('div'); sub.className = 'sub'; sub.textContent = p.ape.role;
  const bubble = document.createElement('div'); bubble.className = 'bubble'; const say = voiceFor(p); bubble.hidden = !say; if (say) bubble.textContent = bubbleText(say);   // voice line: only after a reveal
  const bar_ = document.createElement('div'); bar_.className = 'hp' + (hp / max < .35 ? ' low' : ''); bar_.setAttribute('role', 'meter');
  bar_.setAttribute('aria-valuenow', hp); bar_.setAttribute('aria-valuemin', 0); bar_.setAttribute('aria-valuemax', max); bar_.setAttribute('aria-label', 'HP');
  const fill = document.createElement('i'); fill.style.width = (100 * hp / max) + '%'; bar_.append(fill);
  const n = document.createElement('div'); n.className = 'hpn'; n.textContent = `${hp} / ${max} HP`;
  const dl = document.createElement('dl');
  const row = (k, v) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; if (v instanceof Node) dd.append(v); else dd.textContent = v; dl.append(dt, dd); return dd; };
  row('Fruit', p.fruit ?? 0); row('Wood', p.wood ?? 0); row('Club', p.club ? `+${R.CLUB.atk}` : 'none');
  const ed = row('Eats left', String(eats));
  if (f && p.gold && (f.eaten || 0) < base + 1){ const b = document.createElement('span'); b.className = 'gold'; b.textContent = '4th Eat'; ed.append(' ', b); }  // gold: only the golden fruit's 4th-Eat badge in the duel
  el.append(h, sub, bubble, bar_, n, dl);
}
// ---- voice lines (text-writing-guide.md): flavour only, shown after the reveal, picked by round number (odd = A, even = B), never random ----
const VOICE = {
  vinny:  {strike:['Look up. Too late.', 'Straight from the canopy!'], block:'Nice try. I see it all.', won:'Finders keepers, groundling.', lost:"Fine. I'll climb for more.", ko:"View's better from up here."},
  boulder:{strike:['SMASH.', 'Hold still.'], block:'No.', won:'Mine.', lost:'Hmph.', ko:'Down. Stay down.'},
  zip:    {strike:['Too slow!', 'Blink and you missed it!'], block:'Saw that a mile off!', won:"Zoom! Gold's mine!", lost:'Wait, what? Again!', ko:'Done already? Rematch!'},
  moe:    {strike:['Here comes the big one.', 'Easy now... BOOM.'], block:'Like hitting a tree, pal.', won:'Shiny one? Thank you kindly.', lost:'Plenty more fruit out there.', ko:'Have a nap, little one.'},
  tinker: {strike:['Calculated.', 'Leverage. Look it up.'], block:'Saw your pattern. Blocked.', won:'Gold acquired. As planned.', lost:'Noted. Adjusting the plan.', ko:"And that's how it's done."},
};
// the bubble shows only the line (the card header already names the ape); the 40-char limit still counts 'Name: "..."'
const bubbleText = t => { const m = /^[^:]+: "(.*)"$/.exec(t); return m ? m[1] : t; };
const sayLine = (p, l) => l ? `${p.ape.name}: "${l}"` : '';
// beat for side i of a revealed round (classic duel only; zone rounds stay voiceless per the guide)
function voiceBeat(rec, i, F){
  const V = VOICE[F[i].p.ape.id]; if (!V) return null;
  const dead = F.map(f => f.hp <= 0);
  if (dead[0] && dead[1]) return null;                       // double KO: no voice lines at all
  if (dead[1 - i]) return V.ko;
  if (dead[i] || G.zones) return null;
  const m = rec.m[i], mo = rec.m[1 - i];
  if (m === 'strike' && mo !== 'guard') return V.strike[rec.r % 2 ? 0 : 1];
  if (m === 'guard' && mo === 'strike') return V.block;
  return null;
}
function voiceFor(p){
  const D = G.duel;
  if (D && D.f && D.f[0].p === G.players[0]){ const rec = D.recs[D.recs.length - 1]; if (!rec) return ''; const i = D.f.findIndex(f => f.p === p); return i < 0 ? '' : sayLine(p, voiceBeat(rec, i, D.f)); }
  if (G.goldSay && G.turn === TG.GOLD_TURN + 1){ const i = G.players.indexOf(p); return i < 0 ? '' : G.goldSay[i] || ''; }   // shown once, right after the turn-8 reveal
  return '';
}
// motion: only during the reveal, after both picks are in (hit jolt, block flash, KO dim/scale). Off with reduced motion (CSS).
function fx(rec){
  if (!rec) return; const els = [$('me'), $('op')];
  const blocked = i => G.zones ? rec.m[1-i].hit && rec.m[i].block.includes(rec.m[1-i].hit) : rec.m[i] === 'guard' && rec.m[1-i] === 'strike';
  els.forEach((el, i) => { el.classList.remove('jolt', 'flash'); void el.offsetWidth;
    if (rec.took[i] > 0) el.classList.add('jolt'); else if (blocked(i)) el.classList.add('flash'); });
  const D = G.duel; if (D && D.over){ D.f.forEach((f, i) => { if (f.hp <= 0){ els[i].classList.add('ko'); const h2 = els[i].querySelector('h2'); if (h2 && !h2.querySelector('.kolabel')){ const k = document.createElement('span'); k.className = 'kolabel'; k.textContent = 'KO'; h2.append(' ', k); } } else if (D.f[1-i].hp <= 0) els[i].classList.add('win'); }); }
}
function frame(){
  const D = G.duel && G.duel.f && G.players && G.duel.f[0].p === G.players[0] ? G.duel : null, inGather = G.turn && G.turn <= G.maxTurn && !D && G.rec;
  card($('me'), G.players && G.picks.length >= 1 && G.players[0], D && D.f[0], G.mode === 'hot' ? 'Player 1' : 'You');
  card($('op'), G.players && G.picks.length >= 2 && G.players[1], D && D.f[1], G.mode === 'hot' ? 'Player 2' : 'Opponent');
  $('where').textContent = D ? (G.zones ? 'Zone duel (preview)' : 'The duel') : inGather ? 'Gathering in the grove' : G.rec ? 'Workbench' : G.zones ? 'Preview: zone duel (not decided)' : 'Text edition';
  $('counter').textContent = D ? `Round ${Math.min(D.round, R.MAX_ROUNDS)} / ${R.MAX_ROUNDS}` : inGather ? `Turn ${G.turn} / ${G.maxTurn}` : '';
  const lines = D ? D.log : (G.log || []);
  const log = $('log'); log.innerHTML = '';
  lines.slice().reverse().forEach((l, i) => { const li = document.createElement('li'); li.textContent = l; li.className = (i === 0 ? 'new' : '') + (/grabs the GOLDEN FRUIT/.test(l) ? ' goldline' : ''); log.append(li); });
  if (!lines.length){ const li = document.createElement('li'); li.textContent = 'Nothing yet.'; log.append(li); }
  log.scrollTop = 0;
  const rv = $('reveal'), last = D && D.log[D.log.length - 1];
  rv.hidden = !last; if (last){ rv.innerHTML = '<small>Round revealed</small>'; rv.append(last); }
  if (G.fxPending && !document.body.classList.contains('passing')){ const r = G.fxPending; G.fxPending = null; fx(r); }
}
function pickChoice(i){ const o = choices.find((c, j) => (c.key || j + 1) === i + 1); if (!o) return; if (o.off){ note.textContent = o.why || 'Not possible now.'; return; }
  if (G.rec && !o.nr) G.rec.push(String(i + 1)); o.go(); }
function enter(){ if (!onEnter) return; if (G.rec) G.rec.push('.'); onEnter(); }
addEventListener('keydown', e => {
  if (/^[1-9]$/.test(e.key)){ e.preventDefault(); if (!choices.length && onEnter){ note.textContent = 'Press ENTER to continue.'; return; } pickChoice(+e.key - 1); }
  else if ((e.key === 'Enter' || e.key === ' ') && onEnter && document.activeElement.tagName !== 'LI'){ e.preventDefault(); enter(); }
  else if (e.key === '?' && !G.inRules){ e.preventDefault(); rules(); }
});
const bar = (v, max, n = 20) => { const k = Math.max(0, Math.round(n * Math.max(0, v) / max)); return '[' + '#'.repeat(k) + '-'.repeat(n - k) + ']'; };
const head = (title) => `${title}\n${'═'.repeat(Math.min(30, title.length))}\n`;
const pname = p => G.mode === 'hot' ? `${p.ape.name} (Player ${p.i+1})` : p.bot ? `${p.ape.name} (bot)` : p.ape.name;

// ================= title =================
function title(){
  G.picks = []; G.duel = null; G.log = []; G.rec = null; G.turn = 0;
  screen(head(G.zones ? 'Preview: zone duel (not decided)' : 'PROTOTYPE, TEXT EDITION') +
`
   PICK YOUR APE, GRAB THE FRUIT, WIN THE DUEL.

   Gather fruit and wood for ${TG.TURNS} turns, craft a club,
   then fight a turn-based duel. Both sides pick a move in
   secret, the moves are revealed together. No dice.

${G.zones ? `
   PREVIEW: ZONE DUEL (NOT DECIDED). Each round: pick 1 zone to hit
   and 2 neighbouring zones to block. No shield.
` : ''}${THIN}
Bot level: ${G.diff === 'easy' ? 'EASY' : 'HARD'}
`, [
    {label:'Play vs bot', go:() => { G.mode = 'bot'; select(); }},
    {label:'2 players, one keyboard', go:() => { G.mode = 'hot'; select(); }},
    {label:`Bot level: switch to ${G.diff === 'easy' ? 'Hard' : 'Easy'}`, go:() => { G.diff = G.diff === 'easy' ? 'hard' : 'easy'; title(); }},
    {label:'? Rules (numbers come straight from rules.js)', nr:true, go:rules},
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
  G.rec = []; G.recHead = `${G.mode === 'hot' ? 'H' : 'B'}${G.diff === 'easy' ? 'E' : 'H'}${G.zones ? 'Z' : 'M'}${G.picks[0] + 1}${G.picks[1] + 1}`;
  G.players.forEach(p => Object.assign(p, {fruit:0, wood:0, gold:false, club:false}));
  G.camps = G.players.map(() => TG.newCamp());
  G.turn = 1; G.log = []; G.botIdx = 0; G.cue = false; G.duel = null; G.goldSay = null;
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
  if (G.turn === TG.GOLD_TURN) t += '!! GOLDEN FRUIT IN THE CENTRE! Race for it (uses this turn).\n   If both apes race, the ape with less fruit so far gets it, and nobody does on a tie.\n\n';
  t += (G.log.slice(-6).join('\n') || 'Your grove: 3 fruit bushes, 3 trees, 1 canopy. They grow back after a few turns.') + '\n\n';
  t += `${G.mode === 'hot' ? `PLAYER ${who+1} (${p.ape.name}), what now?` : 'What now?'}`;
  // fixed keys, never shift: 1 bush, 2 tree, 3 canopy (Vinny only, hidden for others), 4 rest, 5 finish, 9 golden race
  const KEY = {bush:1, tree:2, canopy:3, rest:4};
  const opts = TG.actions(p, camp, G.turn).filter(a => a.id !== 'canopy' || p.ape.id === 'vinny')
    .map(a => ({key:KEY[a.id], label:a.label.replace(', Vinny only', ''), off:!a.ok, why: TG.why(p, camp, G.turn, a.id), go:() => afterPick(who, a.id)}));
  opts.push({key:5, label:'Finish gathering now', go:() => { G.turn = 999; endGather(); }});
  if (G.turn === TG.GOLD_TURN) opts.push({key:9, cls:'gold', label:'Race for the golden fruit', go:() => afterPick(who, 'gold')});
  screen(t, opts);
}
function afterPick(who, action){
  G.pending = G.pending || [null, null];
  G.pending[who] = action || 'none';
  if (G.mode === 'hot' && who === 0) return gatherTurn(1);
  // bot
  const b = G.players[1];
  if (b.bot) G.pending[1] = G.turn > TG.turnsFor(b) ? 'none'
    : G.turn === TG.GOLD_TURN ? (G.diff === 'easy' && (b.fruit + G.players[0].fruit) % 2 === 1 ? 'rest' : 'gold') :   // Easy skips the race when both apes' fruit adds up odd: no randomness, replays match, testers see both outcomes
    TG.botAction(b, G.camps[1], G.turn, R.clubWood(b), G.diff === 'easy', G.botIdx++);
  resolveTurn();
}
function resolveTurn(){
  const acts = G.pending; G.pending = null;
  const lines = [];
  if (G.turn === TG.GOLD_TURN){
    const w = TG.golden(G.players, acts.map(a => a === 'gold'), R.GOLD_FRUIT);
    const racers = G.players.filter((p, i) => acts[i] === 'gold');
    G.goldSay = G.players.map((p, i) => acts[i] === 'gold' && VOICE[p.ape.id] ? sayLine(p, p === w ? VOICE[p.ape.id].won : VOICE[p.ape.id].lost) : '');
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

// ================= rules screen (generated from rules.js by running its own functions) =================
function probe(apeA, apeB, ma, mb, club){
  const mk = (ape, i) => ({p:{ape, i, fruit:5, club, gold:false}, hp:ape.hp - 40, max:ape.hp, lastGuard:false});
  const a = mk(apeA, 0), b = mk(apeB, 1), ha = a.hp, hb = b.hp; R.resolve(a, b, ma, mb);
  return {toA: ha - a.hp + (a.healed || 0), toB: hb - b.hp + (b.healed || 0), healA: a.healed || 0};
}
function rulesText(){
  const A = APES, ref = A[0];
  let t = head('RULES (FROM RULES.JS)') + '\n';
  t += 'APES        HP   Strike  Armour  Strike dmg vs armour ' + ref.dfn + ' (no club / club)\n';
  A.forEach(a => { const p = {ape:a}, q = {ape:ref}; t += `${a.name.padEnd(10)} ${String(a.hp).padStart(3)}   ${String(a.atk).padStart(5)}   ${String(a.dfn).padStart(5)}   ${R.dmg({...p, club:false}, q)} / ${R.dmg({...p, club:true}, q)}\n`; });
  t += `\nDamage = Strike + club (${R.CLUB.atk}) - the other ape's armour, at least 1.\n`;
  const d = R.dmg({ape:ref, club:false}, {ape:ref}), P = (x, y) => probe(ref, ref, x, y, false);
  t += `\nWHO BEATS WHAT (worked example: ${ref.name} vs ${ref.name}, no clubs, base hit ${d}):\n`;
  for (const [x, y] of [['strike','feint'],['strike','strike'],['guard','strike'],['feint','guard'],['feint','eat'],['strike','eat'],['feint','strike'],['guard','feint'],['guard','guard'],['feint','feint']]){
    const r = P(x, y);
    t += `  ${MOVES[x].padEnd(9)} vs ${MOVES[y].padEnd(9)}: deals ${String(r.toB).padStart(2)}, takes ${String(r.toA).padStart(2)}\n`;
  }
  const sf = P('strike', 'feint').toB, fg = P('feint', 'guard').toB, gs = P('guard', 'strike').toB;
  t += `\nWHERE THE NUMBERS COME FROM (base hit ${d}):\n`;
  t += `  Strike vs Feint: base ${d} + feint-catch bonus ${sf - d} = ${sf}.\n`;
  const big = {id:'probe', name:'Probe', hp:1000, atk:100 + ref.dfn, dfn:ref.dfn}, mult = probe(big, ref, 'feint', 'guard', false).toB / R.dmg({ape:big, club:false}, {ape:ref});
  t += `  Feint vs Guard or Eat: base ${d} x ${mult} (rounded) = ${fg}.\n`;
  t += `  Guard vs Strike: the guard blocks it and hits back for half the base, rounded up = ${gs}.\n`;
  const g = {p:{fruit:5, gold:false}, hp:50, max:100, lastGuard:true}, e = {p:{fruit:5, gold:false}, hp:50, max:100, eaten:R.MAX_EATS};
  t += `\nGuard twice in a row: ${R.legal(g).includes('guard') ? 'allowed' : 'not allowed'}.\n`;
  t += `Eat: heals ${R.EAT_HEAL} HP (not above max), costs 1 fruit, ${R.MAX_EATS} per duel${R.legal({...e, p:{fruit:5, gold:true}}).includes('eat') ? ', the golden fruit gives a 4th' : ''}; without the golden fruit a ${R.MAX_EATS + 1}th Eat is ${R.legal(e).includes('eat') ? 'allowed' : 'not allowed'}.\n`;
  t += `Club: ${R.CLUB.wood} wood + ${R.CLUB.fruit} fruit (Tinker: ${R.clubWood({ape:{id:'tinker'}})} wood), +${R.CLUB.atk} to every hit.\n`;
  t += `Duel ends at 0 HP or after ${R.MAX_ROUNDS} rounds (then the higher HP share wins).\n`;
  if (G.zones){
    t += `\nZONE DUEL PREVIEW (sim/zones-core.js): hit 1 of ${ZN.map(z => `${z} x${ZM[z]}`).join(', ')};\nblock 2 neighbours: ${ZB.map(b => b.join('+')).join(', ')} (legs and head are not neighbours).\nA hit lands if its zone isn't blocked: base hit x zone. Eat = no hit, heal, still block.\n`;
  }
  return t;
}
function rules(){
  const back = { screen: out.textContent, choices, onEnter };
  G.inRules = true;
  screen(rulesText(), [{label:'Back', nr:true, go:() => { G.inRules = false; out.textContent = back.screen; const c = back.choices, e = back.onEnter; screen(back.screen, c, e); }}]);
}

// ================= duel =================
const PAST = {strike:'Struck', guard:'Guarded', feint:'Feinted', eat:'Eaten'};
function duelStart(){
  const f = p => ({p, max:p.ape.hp + (p.gold ? R.GOLD_HP : 0), hp:p.ape.hp + (p.gold ? R.GOLD_HP : 0), lastGuard:false, mh:[], hits:[], blocks:[], eaten:0});
  G.duel = {f:G.players.map(f), round:1, hist:[], picks:[null, null], log:[], recs:[], over:false, bot:{rng:() => 0}};
  if (G.mode === 'hot') return passScreen(0, 'THE DUEL BEGINS');
  duelScreen(0);
}
const eatsLeft = f => R.MAX_EATS + (f.p.gold ? 1 : 0) - (f.eaten || 0);
function fighterLines(f){
  return `${f.p.ape.name.toUpperCase().padEnd(10)} ${bar(f.hp, f.max)} ${String(Math.max(0, f.hp)).padStart(3)}/${f.max} HP\n` +
         `           fruit ${f.p.fruit}, Eats left ${eatsLeft(f)}, ${f.p.club ? `club +${R.CLUB.atk}` : 'no club'}${!G.zones && f.lastGuard ? ', guarded last round' : ''}`;
}
function short(f, m){
  if (m === 'guard' && f.lastGuard) return 'not twice in a row';
  if (m === 'eat'){ if (f.p.fruit < 1) return 'no fruit left'; if ((f.eaten || 0) >= R.MAX_EATS + (f.p.gold ? 1 : 0)) return 'no Eats left'; if (f.hp >= f.max) return 'full HP'; }
  return 'not now';
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
// opponent read: ONLY what was actually played (from round 3)
function readLine(op){
  const D = G.duel; if (D.round < 3) return '';
  const n = op.p.ape.name;
  if (!G.zones){
    const last = op.mh.slice(-4), c = {}; last.forEach(m => c[m] = (c[m] || 0) + 1);
    const [m, k] = Object.entries(c).sort((x, y) => y[1] - x[1] || R.MOVE_KEYS.indexOf(x[0]) - R.MOVE_KEYS.indexOf(y[0]))[0];
    const what = m === 'eat' ? 'Eaten' : PAST[m];
    return `READ: ${n} has ${what} ${k} of the last ${last.length} rounds.${m === 'eat' ? '' : ''}  (Played moves only, no guessing.)\n`;
  }
  const H = op.hits.slice(-4), B = op.blocks.slice(-4).map(b => b.join('+'));
  const top = L => { const c = {}; L.forEach(x => c[x] = (c[x] || 0) + 1); return Object.entries(c).sort((x, y) => y[1] - x[1])[0]; };
  const hz = H.filter(Boolean), [h, hk] = hz.length ? top(hz) : [null, 0], [b, bk] = top(B);
  return `READ: ${n} ${h ? `hit the ${h} ${hk} of the last ${H.length} rounds` : `ate in all of the last ${H.length} rounds`}, blocked ${b} ${bk} of ${B.length}.  (Played moves only.)\n`;
}
function duelScreen(who, step){
  const D = G.duel, me = D.f[who], op = D.f[1 - who];
  // face-off: only the last reveal, the opponent read and the moves (HP, stats and the full history live on the cards and in the log)
  let t = head(`THE DUEL, ROUND ${D.round}${G.zones ? '  (ZONE PREVIEW)' : ''}`) + '\n';
  if (!D.log.length) t += 'Both apes pick in secret. The moves are revealed together.\n\n';   // the last reveal sits in the Round revealed panel above
  t += readLine(op) + (D.round >= 3 ? '\n' : '');
  const who_ = G.mode === 'hot' ? `PLAYER ${who+1} (${me.p.ape.name}), ` : '';
  const help = {label:'? Rules', nr:true, go:rules};
  if (!G.zones){
    const L = R.legal(me);
    t += G.mode === 'hot' ? `${who_}pick in secret:` : 'Your move:';
    return screen(t, R.MOVE_KEYS.map(m => ({label: L.includes(m) ? MOVES[m] : `${MOVES[m]} (${short(me, m)})`, hint: L.includes(m) ? HINT[m] : '', off:!L.includes(m), why:whyNot(me, m), go:() => choose(who, m)})).concat([help]), null, 'moves');
  }
  if (!step){
    t += `${G.mode === 'hot' ? `PLAYER ${who+1} (${me.p.ape.name}), in secret.\n` : ''}Where do you HIT? (step 1 of 2)`;
    const ok = ZC.canEat(R, me);
    return screen(t, ZN.map(z => ({zone:z, label:`Hit the ${z}`, hint:`x${ZM[z]} · ${ZC.hitFor(R, me, op, z, ZM)} if it lands`, go:() => duelScreen(who, {hit:z})}))
      .concat([{label: ok ? `Eat fruit instead (+${R.EAT_HEAL} HP, no hit)` : `Eat fruit (${short(me, 'eat')})`, off:!ok, why:whyNot(me, 'eat'), go:() => duelScreen(who, {hit:null})}, help]), null, 'hit');
  }
  G.zstep = step;
  t += `${G.mode === 'hot' ? `PLAYER ${who+1} (${me.p.ape.name}), in secret.\n` : ''}${step.hit ? `Hitting the ${step.hit}` : 'Eating'}. Which two do you BLOCK? (step 2 of 2)`;
  screen(t, ZB.map(b => ({label:`Block ${b.join(' + ')}`, go:() => choose(who, {hit:step.hit, block:b})})).concat([{label:'Back to step 1', now:true, go:() => duelScreen(who)}]), null, 'block');
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
  if (ma === mb && ma === 'feint') return `${a.p.ape.name} and ${b.p.ape.name} both feint. Nothing happens.`;
  if (ma === mb && ma === 'guard') return 'Both apes guard. Nothing happens.';
  const hits = [];
  if (lostB > 0 && !(ma === 'guard' || ma === 'feint')) hits.push(`${b.p.ape.name} takes ${lostB}.`);
  if (lostA > 0 && !(mb === 'guard' || mb === 'feint')) hits.push(`${a.p.ape.name} takes ${lostA}.`);
  return (`${said(a, b, ma, mb, lostB)} ${said(b, a, mb, ma, lostA)} ` + hits.join(' ')).trim();
}
function zoneSay(f, op, p, info, oinfo){
  const n = f.p.ape.name;
  const hit = p.hit ? `${n} hits the ${p.hit}${info.landed ? ` for ${info.dmg}` : `, ${op.p.ape.name} blocks it`}.` : `${n} eats a fruit (+${info.healed} HP).`;
  return `${hit}`;
}
function choose(who, m){
  const D = G.duel; if (D.over) return;
  if (!G.zones && !R.legal(D.f[who]).includes(m)){ note.textContent = whyNot(D.f[who], m); return; }
  D.picks[who] = m;
  if (G.mode === 'bot') D.picks[1] = G.zones ? ZC.BOTS[G.diff === 'easy' ? 'pattern' : 'smart'](R, D.bot, D.f[1], D.f[0], ZM, ZK) : R.botPick(D.f[1], D.f[0], D.hist);
  if (D.picks[1] == null) return passScreen(1, 'PLAYER 1 HAS PICKED');
  const [ma, mb] = D.picks, [a, b] = D.f, hpA = a.hp, hpB = b.hp, R0 = D.round;
  let line, rec;
  if (!G.zones){
    D.hist.push(ma); a.healed = b.healed = 0;
    R.resolve(a, b, ma, mb); a.mh.push(ma); b.mh.push(mb);
    line = `Round ${R0}: ${a.p.ape.name} ${MOVES[ma].toUpperCase()} vs ${b.p.ape.name} ${MOVES[mb].toUpperCase()}. ` + narrate(a, b, ma, mb, hpA, hpB);
    rec = {r:R0, m:[ma, mb], took:[hpA - a.hp + (a.healed || 0), hpB - b.hp + (b.healed || 0)], heal:[a.healed || 0, b.healed || 0]};
  } else {
    const info = ZC.resolve(R, D.f, [ma, mb], ZM);
    const desc = p => p.hit ? `HIT ${p.hit.toUpperCase()}` : 'EAT', bl = p => p.block.join('+');
    line = `Round ${R0}: ${a.p.ape.name} ${desc(ma)}/block ${bl(ma)} vs ${b.p.ape.name} ${desc(mb)}/block ${bl(mb)}. ${zoneSay(a, b, ma, info[0])} ${zoneSay(b, a, mb, info[1])}`;
    rec = {r:R0, m:[ma, mb], took:[info[1].dmg, info[0].dmg], heal:[info[0].healed, info[1].healed], info};
  }
  D.log.push(line); D.recs.push(rec);
  D.picks = [null, null]; D.round++;
  G.fxPending = rec;
  if (a.hp <= 0 || b.hp <= 0 || D.round > R.MAX_ROUNDS){ D.over = true; return result(); }
  if (G.mode === 'hot') return passScreen(0, 'ROUND REVEALED', true);
  duelScreen(0);
}
function passScreen(to, why, reveal){
  const D = G.duel;
  let t = head(why) + '\n';
  if (reveal) t += D.log[D.log.length - 1] + '\n\n' + fighterLines(D.f[0]) + '\n\n' + fighterLines(D.f[1]) + '\n\n';
  t += `${THIN}\n\n      PASS THE KEYBOARD TO PLAYER ${to+1}.\n\n      Player ${to+1}: Press ENTER to continue.\n\n${THIN}`;
  screen(t, [], () => duelScreen(to));
  G.passTo = to;
}

// ================= decisive turn =================
const you = i => G.mode === 'bot' && i === 0 ? 'you' : G.duel.f[i].p.ape.name;
function clause(rec, w){            // what happened in this round, told from the side of ape w
  const l = 1 - w, F = G.duel.f, dealt = rec.took[l], got = rec.took[w], ln = F[l].p.ape.name;
  if (G.zones){
    const [pw, pl] = [rec.m[w], rec.m[l]];
    const act = p => p.hit ? `hit the ${p.hit}` : 'ate';
    let s = `${you(w)} ${pw.hit ? `went for the ${pw.hit}` : 'ate a fruit'}, ${ln} ${pl.hit ? `went for the ${pl.hit}` : 'ate'} and blocked ${pl.block.join('+')}`;
    s += pw.hit ? (dealt ? `, so the hit got through for ${dealt}` : `, so the hit was blocked`) : `, healing ${rec.heal[w]}`;
    if (got) s += ` (${you(w)} took ${got})`;
    return s; void act;
  }
  const [mw, ml] = [rec.m[w], rec.m[l]];
  const v = m => m === 'eat' ? 'ate a fruit' : PAST[m];
  let s = `${you(w)} ${v(mw)}, ${ln} ${v(ml)}, `;
  if (mw === 'feint' && (ml === 'guard' || ml === 'eat')) s += `the feint got through for ${dealt}`;
  else if (mw === 'strike' && ml === 'feint') s += `the strike caught the feint for ${dealt}`;
  else if (mw === 'guard' && ml === 'strike') s += `the guard blocked it and hit back for ${dealt}`;
  else if (mw === 'strike' && ml === 'eat') s += `the strike landed for ${dealt} through the snack`;
  else if (mw === 'strike' && ml === 'strike') s += `both landed: ${dealt} dealt, ${got} taken`;
  else if (mw === 'eat') s += `the fruit healed ${rec.heal[w]}${got ? ` and cost ${got} in damage` : ''}`;
  else s += dealt ? `it landed for ${dealt}` : `nothing got through`;
  return s;
}
function decisive(w){
  const D = G.duel, recs = D.recs, last = recs[recs.length - 1], F = D.f;
  if (w == null) return `Round ${last.r}: ${clause(last, 0)}. ${F[0].hp <= 0 && F[1].hp <= 0 ? 'Both apes went down in the same round: a draw.' : 'Nobody came out ahead.'}`;
  const l = 1 - w, cap = s => s[0].toUpperCase() + s.slice(1);
  if (F[l].hp <= 0) return `Round ${last.r}: ${clause(last, w)}, and that knocked ${F[l].p.ape.name} out.`;
  // no knockout: the round with the biggest swing in the winner's favour
  const swing = r => (r.took[l] - r.heal[l]) - (r.took[w] - r.heal[w]);
  const best = recs.reduce((x, y) => swing(y) > swing(x) ? y : x);
  return `Round ${best.r}: ${clause(best, w)}. That was the biggest swing before time ran out (${R.MAX_ROUNDS} rounds).`.replace(/^Round (\d+): (\w)/, (m, n, c) => `Round ${n}: ${c}`) .replace(/: you/, ': you').replace(/^(.)/, c => cap(c));
}

// ================= result + replay =================
const sig = () => G.duel.f.map(f => f.hp).join('/') + '@' + (G.duel.round - 1);
const CODE_VERSION = 'T3';   // bump when choice keys or rules change; older codes are refused with a clear message
function codeStr(){ return CODE_VERSION + '-' + G.recHead + '-' + G.rec.join(''); }
function result(){
  const [a, b] = G.duel.f;
  let w = null;
  if (a.hp <= 0 && b.hp <= 0) w = null; else if (b.hp <= 0) w = 0; else if (a.hp <= 0) w = 1;
  else w = a.hp / a.max > b.hp / b.max ? 0 : b.hp / b.max > a.hp / a.max ? 1 : null;
  const code = codeStr(); G.code = code; G.rec = null;
  const h = w == null ? 'A DRAW' : G.mode === 'bot' ? (w === 0 ? 'YOU WIN THE DUEL' : `${G.duel.f[w].p.ape.name.toUpperCase()} WINS THIS ONE`) : `${G.duel.f[w].p.ape.name.toUpperCase()} (PLAYER ${w+1}) WINS`;
  let t = head(G.replaying ? 'RESULT (REPLAYED FROM CODE)' : 'RESULT') + `\n   ${h}${G.zones ? '   [zone duel preview]' : ''}\n\n` + fighterLines(a) + '\n\n' + fighterLines(b) + '\n\n';
  t += `Last round: ${G.duel.log[G.duel.log.length - 1]}\n${G.duel.round - 1} rounds.\n\n`;
  t += `DECIDED BY: ${decisive(w)}\n\n`;
  if (G.replaying){
    const same = G.replaying.expect == null ? null : G.replaying.expect === sig();
    t += `Replayed every choice from the code. ${same == null ? 'Same code, same game: run it again and you get this exact result.' : same ? 'IDENTICAL to the original game, HP for HP and round for round:\nthe bot and the rules have no hidden randomness.' : 'MISMATCH with the original game. Please report this code.'}\n\n`;
  }
  t += `REPLAY CODE: ${code}\n  (your choices in order; ?replay=${code} in the address bar plays it back)\n\nRematches this session: ${SESSION.rematches}\n`;
  G.lastSig = sig(); G.replaying = null;
  screen(t, [
    {label:'Rematch', go:() => { SESSION.rematches++; startGather(); }},
    {label:'Change ape', go:select},
    {label:'Title', go:title},
    {label:'Replay code: replay this game exactly', go:() => replay(code, G.lastSig)},
  ]);
}
function replay(code, expect){
  const raw = String(code).trim(), vm = /^(T\d+)-/.exec(raw);
  if (!vm || vm[1] !== CODE_VERSION) return screen(head('REPLAY') + `\nMade with an older version of the game.\nThis code (${vm ? vm[1] : 'no version'}) can't be replayed by this version (${CODE_VERSION}).\n\n${raw}\n`, [{label:'Title', go:title}]);
  const m = /^T\d+-([BH])([EH])([MZ])([1-5])([1-5])-([1-9.]*)$/.exec(raw);
  if (!m) return screen(head('REPLAY') + `\nThat replay code doesn't look right:\n${code}\n`, [{label:'Title', go:title}]);
  G.mode = m[1] === 'H' ? 'hot' : 'bot'; G.diff = m[2] === 'E' ? 'easy' : 'hard'; G.zones = m[3] === 'Z';
  G.picks = [+m[4] - 1, +m[5] - 1];
  G.players = G.picks.map((k, i) => ({ape:APES[k], i, bot: G.mode === 'bot' && i === 1}));
  startGather();
  G.replaying = {expect: expect == null ? null : expect};
  for (const c of m[6]){ if (!G.rec) break; if (c === '.') enter(); else pickChoice(+c - 1); }
  if (G.rec){ G.rec = null; G.replaying = null; screen(head('REPLAY') + '\nThe code ended before the duel was over.\n', [{label:'Title', go:title}]); }
}
G.session = SESSION; G.replay = replay;
if (QS.get('replay')) replay(QS.get('replay')); else title();
})();
