/* Going ApeSh!t: playable prototype v0. Plain JS + Canvas, no build step, no tracking.
   Rules live in rules.js, which the sim (sim/game_sim.mjs) runs directly. No random rolls.
   All stats and rules are proposals for the fun test. */
'use strict';
(() => {
const R = window.ApeRules;                   // shared rules (rules.js), also run by the sim
const {W, H, GATHER_SECS, GOLD_AT, EAT_HEAL, GOLD_HP, MAX_ROUNDS, CLUB, GOLD} = R;
const T = 40;

// ---- apes (proposals; stats in rules.js) ----
const APES = [
  {id:'vinny', name:'Vinny', role:'the climber', img:'img/ape-climber.jpg', color:'#c9772f',
   trick:'Climbs the canopies in the corners for 3 high fruit. Only Vinny can reach them.'},
  {id:'boulder', name:'Boulder', role:'the smasher', img:'img/ape-smasher.jpg', color:'#5b5f66',
   trick:'Smashes trees for 2 wood instead of 1.'},
  {id:'zip', name:'Zip', role:'the quick one', img:'img/ape-quick.jpg', color:'#d9b04a',
   trick:'Fastest feet in the grove, and gathers in half the time.'},
  {id:'moe', name:'Big Moe', role:'the tank', img:'img/ape-tank.jpg', color:'#3d3a45',
   trick:'Shakes trees: every tree also drops 1 fruit.'},
  {id:'tinker', name:'Tinker', role:'the crafter', img:'img/ape-thinker.jpg', color:'#8a5a3c',
   trick:'Crafts the club with 2 less wood.'},
].map(a => Object.assign(a, R.STATS[a.id]));
const MOVES = {
  strike:{label:'Strike', hint:'Hit hard. Beats Feint.'},
  guard: {label:'Guard',  hint:'Block a Strike and hit back. Not twice in a row.'},
  feint: {label:'Feint',  hint:'Fake out a Guard or an eater. Loses to Strike.'},
  eat:   {label:'Eat fruit', hint:'Heal 20. Costs 1 fruit. 3 per duel.'},
};

// this session only (in memory; nothing stored or sent)
const SESSION = {rematches:0, duels:0};

// ---- arena layout (game-map.md, mirrored) ----

// ---- DOM ----
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const ui = document.getElementById('ui'), hud = document.getElementById('hud');
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function show(html, cls='screen'){ ui.innerHTML = `<div class="${cls}">${html}</div>`; return ui.firstChild; }

// ---- game state ----
const G = window.APE = {screen:'title', mode:'bot', diff:'easy', picks:[], players:[], t:0, nodes:[], gold:null, duel:null, keys:{}};

function newPlayer(ape, i, isBot){
  return {ape, i, bot:isBot, x: i===0 ? 2.5 : 21.5, y: i===0 ? 7.5 : 8.5, tx:null, ty:null,
          fruit:0, wood:0, gold:false, club:false, busy:0, target:null, picked:0};
}

// ================= title =================
function title(){
  G.screen = 'title'; hud.classList.add('hidden'); clearCanvas();
  show(`<span class="tag">Playable prototype · v0</span>
    <h1>Going <em>ApeSh!t</em></h1>
    <p class="sub">Pick your ape, grab the fruit, win the duel.</p>
    <div><button id="b-bot">Play vs bot</button><button class="ghost" id="b-hot">2 players, one keyboard</button></div>
    <div style="margin-top:10px;font-size:14px">Bot: <label><input type="radio" name="diff" value="easy" ${G.diff!=='hard'?'checked':''}> Easy</label>
      <label style="margin-left:10px"><input type="radio" name="diff" value="hard" ${G.diff==='hard'?'checked':''}> Hard</label></div>
    <p style="opacity:.75;font-size:14px;margin-top:22px">Gather for 90 seconds, craft a club, then duel. Turn-based, no luck involved.</p>`,
    'screen bg shade').style.backgroundImage = 'linear-gradient(180deg,rgba(10,24,16,.25),rgba(10,24,16,.85)),url(img/hero.jpg)';
  document.querySelectorAll('[name=diff]').forEach(r => r.onchange = () => { G.diff = r.value; });
  document.getElementById('b-bot').onclick = () => { G.mode='bot'; select(); };
  document.getElementById('b-hot').onclick = () => { G.mode='hot'; select(); };
}

// world-bound wrappers around the shared rules
const nodeAt = p => R.nodeAt(G,p), canUse = (p,n) => R.canUse(G,p,n), gatherTick = (p,dt) => R.gatherTick(G,p,dt);
const clampMove = R.clampMove;
// Easy bot (default for testers): walks and gathers at 55% speed. Hard = the full-speed bot the sim uses.
const botSlow = () => G.diff==='hard' ? 1 : 0.55;
const botMove = (p,dt) => R.botMove(G,p,dt*botSlow());
const {clubWood, canCraft, doCraft, clubAtk, dmg, heal, resolve, legal, botPick} = R;
G.resolve = resolve;

// ================= ape select =================
function select(){
  G.screen = 'select'; G.picks = [];
  renderSelect();
}
function bar(v, max){ return `<i style="width:${Math.round(v/max*80)}px"></i>`; }
function renderSelect(){
  const who = G.mode==='hot' ? `Player ${G.picks.length+1}, pick your ape` : 'Pick your ape';
  const el = show(`<h2>${who}</h2>
    <div class="apes">${APES.map((a,k)=>`<div class="ape ${G.picks.includes(k)?'taken':''}" data-k="${k}" tabindex="0" role="button" aria-label="${a.name}">
      <img src="${a.img}" alt=""><b>${a.name}</b><span style="opacity:.8">${a.role}</span>
      <div class="bars"><span>HP ${bar(a.hp,112)}</span><span>Hit ${bar(a.atk,15)}</span><span>Speed ${bar(a.spd,5.2)}</span></div>
      <div class="trick">${a.trick}</div></div>`).join('')}</div>
    <p style="font-size:14px;opacity:.8">${G.mode==='hot'?'P1 moves with WASD, P2 with the arrow keys.':'Move with WASD or click where to go.'}</p>
    <button class="ghost" id="b-back">Back</button>`, 'screen bg shade');
  el.style.backgroundImage = 'linear-gradient(180deg,rgba(10,24,16,.7),rgba(10,24,16,.92)),url(img/apes-lineup.jpg)';
  const first = el.querySelector('.ape:not(.taken)');
  if (first){ first.classList.add('sel'); setTimeout(() => first.focus(), 0); }
  el.querySelectorAll('.ape').forEach(d => {
    d.onfocus = () => { el.querySelectorAll('.ape').forEach(o => o.classList.remove('sel')); d.classList.add('sel'); };
    const go = () => pick(+d.dataset.k);
    d.onclick = go; d.onkeydown = e => { if(e.key==='Enter'||e.key===' ') go(); };
  });
  document.getElementById('b-back').onclick = title;
}
function pick(k){
  if (G.picks.includes(k)) return;
  G.picks.push(k);
  if (G.mode==='hot' && G.picks.length<2) return renderSelect();
  if (G.mode==='bot') G.picks.push((k+2) % APES.length);  // bot takes a different ape
  startMatch();
}

// ================= gather =================
function startMatch(){
  G.players = [newPlayer(APES[G.picks[0]],0,false), newPlayer(APES[G.picks[1]],1,G.mode==='bot')];
  startGather();
}
function startGather(){
  G.players.forEach((p,i) => Object.assign(p, newPlayer(p.ape,i,p.bot)));
  G.nodes = R.makeNodes(); G.gold = null; G.goldCue = false; G.t = 0; G.screen = 'gather'; G.last = performance.now();
  G.flash = [];
  hud.classList.remove('hidden');
  show(`<div style="position:absolute;bottom:10px;left:0;right:0;text-align:center;pointer-events:none;font-size:14px;opacity:.85">
    ${G.mode==='hot'?'P1: WASD · P2: arrow keys':'WASD or click to move'} · walk onto a bush or tree to gather · golden fruit appears in the centre at 0:30 left</div>
    <button class="ghost" id="b-done" style="position:absolute;left:50%;transform:translateX(-50%);top:40px;font-size:12px;padding:4px 12px">Finish early</button>`,'');
  document.getElementById('b-done').onclick = endGather;
}
function humanMove(p, dt){
  const k = G.keys, alt = p.i===1;
  let dx = 0, dy = 0;
  if (alt){ dx = (k.ArrowRight?1:0)-(k.ArrowLeft?1:0); dy = (k.ArrowDown?1:0)-(k.ArrowUp?1:0); }
  else { dx = (k.KeyD?1:0)-(k.KeyA?1:0); dy = (k.KeyS?1:0)-(k.KeyW?1:0); }
  if (dx||dy){ p.tx = null; p.path = null; }
  else if (p.tx==null && p.path && p.path.length){ const s = p.path.shift(); p.tx = s.x; p.ty = s.y; }
  if (dx||dy){}
  else if (p.tx!=null){ dx = p.tx-p.x; dy = p.ty-p.y; if (Math.hypot(dx,dy) < 0.08){ p.tx=null; dx=dy=0; } }
  if (p.busy>0 && !(dx||dy)) return;
  if (dx||dy) p.busy = 0, p.node = null;
  if (p.tx!=null){ const d=Math.hypot(dx,dy), step=p.ape.spd*dt; if (step>=d){ p.x=p.tx; p.y=p.ty; p.tx=null; if (p.path && !p.path.length) p.path = null; return; } }
  clampMove(p, dx, dy, dt);
}
function gatherUpdate(dt){
  G.t += dt;
  if (!G.goldCue && G.t >= GOLD_AT-5){ G.goldCue = true; G.flash.push({x:GOLD.x,y:GOLD.y-1.2,txt:'Something golden is ripening in the centre...',t:5}); }
  if (!G.gold && G.t >= GOLD_AT){ G.gold = {taken:null}; G.flash.push({x:GOLD.x,y:GOLD.y-1,txt:'Golden fruit in the centre!',t:3}); }
  for (const p of G.players){ p.bot ? botMove(p,dt) : humanMove(p,dt); gatherTick(p, p.bot ? dt*botSlow() : dt); }
  G.flash.forEach(f => f.t -= dt); G.flash = G.flash.filter(f => f.t > 0);
  const left = Math.max(0, GATHER_SECS - G.t);
  const [a,b] = G.players;
  hud.innerHTML = `<span>${esc(a.ape.name)}${G.mode==='hot'?' (P1)':' (you)'}: 🍌 ${a.fruit} · 🪵 ${a.wood}${a.gold?' · ★':''}</span>
    <span>⏱ ${Math.floor(Math.ceil(left)/60)}:${String(Math.ceil(left)%60).padStart(2,'0')}</span>
    <span>${esc(b.ape.name)}${G.mode==='hot'?' (P2)':' (bot)'}: 🍌 ${b.fruit} · 🪵 ${b.wood}${b.gold?' · ★':''}</span>`;
  if (left <= 0) endGather();
}
function endGather(){ if (G.screen!=='gather') return; G.screen='craft'; craft(); }

// ---- drawing ----
function clearCanvas(){ ctx.fillStyle = '#1b3a28'; ctx.fillRect(0,0,cv.width,cv.height); }
function drawArena(){
  for (let y=0;y<H;y++) for (let x=0;x<W;x++){
    ctx.fillStyle = (x+y)%2 ? '#4f8a4a' : '#57934f'; ctx.fillRect(x*T,y*T,T,T);
  }
  // soft path to centre
  ctx.fillStyle = 'rgba(214,190,130,.35)';
  ctx.fillRect(2*T, 7*T, 20*T, 2*T);
  // home groves
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(1*T,6*T,3*T,4*T); ctx.fillRect(20*T,6*T,3*T,4*T);
  for (const n of G.nodes){
    const ready = G.t >= n.readyAt, cx = n.x*T+T/2, cy = n.y*T+T/2;
    ctx.globalAlpha = ready ? 1 : 0.35;
    if (n.kind==='tree'){
      ctx.fillStyle='#6b4423'; ctx.fillRect(cx-4,cy,8,16);
      ctx.fillStyle='#2e6b33'; circle(cx,cy-4,15); ctx.fillStyle='#3d8a3f'; circle(cx-5,cy-8,8);
    } else if (n.kind==='fruit'){
      ctx.fillStyle='#2f6e34'; circle(cx,cy,15);
      if (ready){ ctx.fillStyle='#f2c53d'; circle(cx-6,cy-3,5); circle(cx+5,cy+2,5); circle(cx,cy+7,4); }
    } else {
      ctx.fillStyle='#1f5129'; circle(cx,cy,18); ctx.fillStyle='#295f30'; circle(cx+4,cy-4,12);
      if (ready){ ctx.fillStyle='#ffd54a'; circle(cx-6,cy-6,5); circle(cx+6,cy,5); circle(cx-2,cy+7,5); }
      ctx.globalAlpha=1; ctx.fillStyle='#fff'; ctx.font='10px system-ui'; ctx.textAlign='center'; ctx.fillText('climber', cx, cy+30);
    }
    ctx.globalAlpha = 1;
    if (!ready){ ctx.fillStyle='#fff'; ctx.font='11px system-ui'; ctx.textAlign='center'; ctx.fillText(Math.ceil(n.readyAt-G.t)+'s',cx,cy+4); }
  }
  // golden fruit 2x2 at (11-12, 7-8)
  const gx = 11*T, gy = 7*T;
  ctx.fillStyle='rgba(255,215,90,.18)'; ctx.fillRect(gx,gy,2*T,2*T);
  if (G.gold && !G.gold.taken){
    const pulse = 1+0.08*Math.sin(G.t*6);
    ctx.fillStyle='rgba(255,220,90,.45)'; circle(gx+T, gy+T, 30*pulse);
    ctx.fillStyle='#ffcc2e'; circle(gx+T, gy+T, 16); ctx.fillStyle='#fff6c4'; circle(gx+T-5, gy+T-5, 5);
  } else if (!G.gold){
    ctx.fillStyle='rgba(255,255,255,.55)'; ctx.font='12px system-ui'; ctx.textAlign='center';
    ctx.fillText(G.goldCue ? 'golden fruit soon!' : 'golden fruit at 0:30', gx+T, gy+T+4);
  }
  for (const p of G.players) drawApe(p.x*T, p.y*T, p, 1);
  for (const f of G.flash){
    ctx.globalAlpha = Math.min(1,f.t); ctx.fillStyle='#fff'; ctx.font='bold 14px system-ui'; ctx.textAlign='center';
    ctx.strokeStyle='rgba(0,0,0,.6)'; ctx.lineWidth=3; ctx.strokeText(f.txt,f.x*T,f.y*T-26); ctx.fillText(f.txt,f.x*T,f.y*T-26); ctx.globalAlpha=1;
  }
}
function circle(x,y,r){ ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); }
function drawApe(x,y,p,sc){
  const r = 14*sc;
  ctx.fillStyle='rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x,y+r*0.9,r,r*0.35,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=p.ape.color; circle(x,y,r);                     // body
  ctx.fillStyle='#e8c9a0'; circle(x,y+2*sc,r*0.55);              // face
  ctx.fillStyle='#222'; circle(x-4*sc,y,2*sc); circle(x+4*sc,y,2*sc);
  ctx.fillStyle=p.i===0?'#ffc94a':'#7fd3ff'; ctx.fillRect(x-r, y-r-8*sc, 2*r, 4*sc); // team band
  if (p.club){ ctx.fillStyle='#7a4a22'; ctx.save(); ctx.translate(x+r,y); ctx.rotate(-0.6); ctx.fillRect(-3*sc,-14*sc,6*sc,18*sc); ctx.restore(); }
  if (p.busy>0){ ctx.strokeStyle='#fff'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(x,y,r+5,-Math.PI/2,-Math.PI/2+Math.PI*2*(1-p.busy/(p.ape.id==='zip'?0.4:0.8))); ctx.stroke(); }
  ctx.fillStyle='#fff'; ctx.font=`bold ${12*sc}px system-ui`; ctx.textAlign='center';
  ctx.fillText(p.ape.name + (p.bot?' (bot)':''), x, y-r-12*sc);
}

// ================= craft =================
function craft(){
  hud.classList.add('hidden');
  for (const p of G.players) if (p.bot) doCraft(p);
  const humans = G.players.filter(p => !p.bot);
  let idx = 0;
  const step = () => {
    const p = humans[idx];
    if (!p) return duelStart();
    const ok = canCraft(p);
    show(`<div class="panel"><h2>Workbench${G.mode==='hot'?` · Player ${p.i+1}`:''}</h2>
      <p><b>${esc(p.ape.name)}</b> has 🍌 ${p.fruit} fruit and 🪵 ${p.wood} wood${p.gold?' and the ★ golden fruit (a 4th Eat)':''}.</p>
      <p style="font-size:44px;margin:6px 0">🪵×${clubWood(p)} + 🍌×${CLUB.fruit} → 🏏</p>
      <p><b>Wooden club</b>: every Strike, counter and Feint hits <b>+${CLUB.atk}</b> harder.<br>
      <span style="opacity:.8;font-size:14px">Fruit you keep is food in the duel: each Eat heals ${EAT_HEAL} HP, up to ${R.MAX_EATS + (p.gold?1:0)} times.</span></p>
      <button id="b-craft" ${ok?'':'disabled'}>${ok?'Craft the club':'Not enough to craft'}</button>
      <button class="ghost" id="b-skip">${ok?'Keep the fruit, go fight':'Go fight'}</button>
      ${G.mode==='bot'?`<p style="font-size:14px;opacity:.8">${esc(G.players[1].ape.name)} (bot) ${G.players[1].club?'crafted a club.':'could not craft a club.'}</p>`:''}</div>`);
    document.getElementById('b-craft').onclick = () => { doCraft(p); idx++; step(); };
    document.getElementById('b-skip').onclick = () => { idx++; step(); };
  };
  step();
}

// ================= duel (turn-based, simultaneous secret picks, no random rolls) =================
// resolve one round; a,b are fighter states {p,hp,max,lastGuard}; ma/mb moves. Pure and deterministic.
G.resolve = resolve;
// bot: reads your habits (counters your most frequent recent move), no random numbers
function duelStart(){
  const [a,b] = G.players;
  const f = p => ({p, max:p.ape.hp + (p.gold?GOLD_HP:0), hp:p.ape.hp + (p.gold?GOLD_HP:0), lastGuard:false});
  G.duel = {f:[f(a),f(b)], round:1, log:'Pick your move. Both moves are revealed together.', hist:[], picks:[null,null], anim:0, last:null};
  G.screen = 'duel';
  duelUI();
}
function duelUI(){
  const D = G.duel, [fa,fb] = D.f;
  const chooser = G.mode==='hot' ? (D.picks[0]==null ? 0 : 1) : 0;
  const me = D.f[chooser];
  const L = legal(me);
  const who = G.mode==='hot' ? `<b>Player ${chooser+1} (${esc(me.p.ape.name)})</b>, pick in secret${chooser===0?'. Player 2, look away!':'. Player 1, look away!'}` : 'Your move';
  show(`<div class="duelbox">
    <div style="font-size:14px;opacity:.8">Round ${D.round}</div>
    <div class="log" id="log">${esc(D.log)}</div>
    <div style="margin-bottom:6px">${who}</div>
    <div class="moves">${Object.entries(MOVES).map(([k,m]) => `<button data-m="${k}" class="${L.includes(k)?'':'off'}" aria-disabled="${!L.includes(k)}" title="${L.includes(k)?'':esc(whyNot(me,k))}">${m.label}${k==='eat'?` (${me.p.fruit} · ${R.MAX_EATS+(me.p.gold?1:0)-(me.eaten||0)} left)`:''}<small>${L.includes(k)?m.hint:'⛔ '+esc(whyNot(me,k))}</small></button>`).join('')}</div>
    <div style="font-size:12px;opacity:.7;margin-top:6px">Keys 1–4 · Strike beats Feint · Guard beats Strike · Feint beats Guard and Eat · no dice, just reads</div></div>`, '');
  ui.querySelectorAll('[data-m]').forEach(b => b.onclick = () => choose(chooser, b.dataset.m));
}
function toast(msg){
  let t = document.getElementById('toast');
  if (!t){ t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role','alert'); document.getElementById('app').appendChild(t); }
  t.textContent = msg; t.className = 'show'; clearTimeout(toast.h); toast.h = setTimeout(() => t.className = '', 2600);
}
// why a move can't be picked right now (mirrors rules.js legal(); text only)
function whyNot(f, m){
  if (m==='guard' && f.lastGuard) return 'Can\'t Guard twice in a row';
  if (m==='eat'){
    if (f.p.fruit < 1) return 'No fruit left to eat';
    if ((f.eaten||0) >= R.MAX_EATS + (f.p.gold?1:0)) return 'No Eats left this duel';
    if (f.hp >= f.max) return 'Already at full HP';
  }
  return 'Not allowed right now';
}
function choose(i, m){
  const D = G.duel; if (G.screen!=='duel' || D.over) return;
  if (!legal(D.f[i]).includes(m)){
    toast(`${whyNot(D.f[i], m)}. Pick another move.`);
    return;
  }
  D.picks[i] = m;
  if (G.mode==='bot') D.picks[1] = botPick(D.f[1], D.f[0], D.hist);
  if (D.picks[0]==null || D.picks[1]==null){ D.log = 'Player 1 has picked.'; return passScreen(2, ''); }
  const [ma, mb] = D.picks;
  D.hist.push(ma);
  D.log = `${D.f[0].p.ape.name}: ${MOVES[ma].label} vs ${D.f[1].p.ape.name}: ${MOVES[mb].label}. ` + resolve(D.f[0], D.f[1], ma, mb);
  D.final = D.log;
  D.last = [ma, mb]; D.anim = 0.6; D.picks = [null,null]; D.round++;
  const [fa,fb] = D.f;
  if (fa.hp<=0 || fb.hp<=0 || D.round > MAX_ROUNDS){ D.over = true; ui.querySelectorAll('[data-m]').forEach(b => b.disabled = true); return setTimeout(result, 700); }
  if (G.mode==='hot') return passScreen(1, D.log);
  duelUI();
}
// hot-seat hand-off: a blank screen that needs a key press, so nobody sees the other pick
function passScreen(to, reveal){
  G.screen = 'pass'; G.passTo = to;
  ui.innerHTML = `<div class="screen" id="pass" style="background:#0e1e15">
    ${reveal?`<p style="max-width:640px">${esc(reveal)}</p>`:''}
    <h2>${to===2?'Pass the keyboard to Player 2':'Pass the keyboard back to Player 1'}</h2>
    <p style="opacity:.8">Player ${to}, press <b>Space</b> or <b>Enter</b> when you're ready.</p></div>`;
}
function drawDuel(dt){
  const D = G.duel; D.anim = Math.max(0, D.anim - dt);
  const g = ctx.createLinearGradient(0,0,0,640); g.addColorStop(0,'#2d5a3a'); g.addColorStop(1,'#16301f');
  ctx.fillStyle = g; ctx.fillRect(0,0,960,640);
  ctx.fillStyle='#8a7a5a'; ctx.beginPath(); ctx.ellipse(480,250,330,100,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#a8966c'; ctx.beginPath(); ctx.ellipse(480,245,300,86,0,0,Math.PI*2); ctx.fill();
  for (let k=0;k<18;k++){ const a=k/18*Math.PI*2; ctx.fillStyle='#777'; circle(480+Math.cos(a)*320, 250+Math.sin(a)*96, 12); }
  D.f.forEach((f,i) => {
    const x = i===0 ? 330 : 630, shake = D.anim>0 && D.last ? Math.sin(D.anim*60)*4 : 0;
    drawApe(x + (i===0? (D.anim*40):(-D.anim*40)) + shake, 235, f.p, 2.6);
    // hp bar
    const bx = i===0 ? 40 : 540, w = 380;
    ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(bx,30,w,22);
    ctx.fillStyle = f.hp/f.max > .35 ? '#7bd36b' : '#e8734a'; ctx.fillRect(bx,30,w*Math.max(0,f.hp)/f.max,22);
    ctx.fillStyle='#fff'; ctx.font='bold 15px system-ui'; ctx.textAlign = i===0?'left':'right';
    ctx.fillText(`${f.p.ape.name}  ${Math.max(0,f.hp)}/${f.max} HP`, i===0?bx:bx+w, 74);
    ctx.font='13px system-ui';
    ctx.fillText(`🍌 ${f.p.fruit}  ${f.p.club?'🏏 club +'+clubAtk(f.p):'no club'}${f.p.gold?'  ★':''}${f.lastGuard && G.screen!=='result'?'  (guarded last turn)':''}`, i===0?bx:bx+w, 94);
    if (D.last){ ctx.font='bold 20px system-ui'; ctx.textAlign='center'; ctx.fillStyle='#ffe28a'; ctx.fillText(MOVES[D.last[i]].label, x, 322); }
  });
}

// ================= result =================
function result(){
  const D = G.duel, [fa,fb] = D.f;
  G.screen = 'result';
  SESSION.duels++;
  let w = null;
  if (fa.hp<=0 && fb.hp<=0) w = null;
  else if (fb.hp<=0) w = 0; else if (fa.hp<=0) w = 1;
  else w = fa.hp/fa.max > fb.hp/fb.max ? 0 : fb.hp/fb.max > fa.hp/fa.max ? 1 : null;
  const name = w==null ? null : D.f[w].p.ape.name;
  const headline = w==null ? 'A draw!' : (G.mode==='bot' ? (w===0?'You win the duel!':`${name} wins this one.`) : `${name} (Player ${w+1}) wins!`);
  show(`<div class="panel"><h2>${esc(headline)}</h2>
    <p><span style="opacity:.7">Final round:</span> ${esc(D.final || D.log)}</p>
    <p style="opacity:.8;font-size:14px">${D.round-1} rounds · ${esc(fa.p.ape.name)} ${Math.max(0,fa.hp)} HP · ${esc(fb.p.ape.name)} ${Math.max(0,fb.hp)} HP</p>
    <button id="b-rematch" style="font-size:20px;padding:14px 34px">Rematch</button><br>
    <p style="font-size:13px;opacity:.7">Rematches this session: ${SESSION.rematches}</p>
    <button class="ghost" id="b-change">Change ape</button><button class="ghost" id="b-title">Title</button></div>`);
  document.getElementById('b-rematch').onclick = () => { SESSION.rematches++; startGather(); };
  document.getElementById('b-change').onclick = select;
  document.getElementById('b-title').onclick = title;
}

// ================= input + loop =================
addEventListener('keydown', e => {
  G.keys[e.code] = true;
  if (G.screen==='gather' && /^(Arrow|Key[WASD])/.test(e.code)) e.preventDefault();
  if (G.screen==='pass' && (e.code==='Space' || e.code==='Enter')){ e.preventDefault(); G.screen='duel'; return duelUI(); }
  if (G.screen==='duel' && /^Digit[1-4]$/.test(e.code)){
    const m = Object.keys(MOVES)[+e.code.slice(5)-1];
    const i = G.mode==='hot' ? (G.duel.picks[0]==null?0:1) : 0;
    choose(i, m);
  }
});
addEventListener('keyup', e => { G.keys[e.code] = false; });
addEventListener('blur', () => { G.keys = {}; });
cv.addEventListener('mousedown', e => {
  if (G.screen!=='gather') return;
  const r = cv.getBoundingClientRect();
  const p = G.players[0];
  let tx = Math.floor((e.clientX-r.left)/r.width*W), ty = Math.floor((e.clientY-r.top)/r.height*H);
  tx = Math.min(W-1, Math.max(0, tx)); ty = Math.min(H-1, Math.max(1, ty));
  // clicked on or next to a node: walk onto the node itself, so gathering starts on arrival
  let best = null, bd = 9;
  for (const n of G.nodes){ const d = Math.max(Math.abs(n.x-tx), Math.abs(n.y-ty)); if (d <= 1 && (n.kind!=='high' || p.ape.id==='vinny') && d < bd){ bd = d; best = n; } }
  if (best){ tx = best.x; ty = best.y; }
  p.path = gridPath(Math.floor(p.x), Math.floor(p.y), tx, ty); p.tx = null;
  G.clickTarget = {x:tx, y:ty, t:0.6};
});
// step-by-step path on the grid (8 directions; the grove has no walls)
function gridPath(x0, y0, x1, y1){
  const path = []; let x = x0, y = y0;
  while (x !== x1 || y !== y1){ x += Math.sign(x1-x); y += Math.sign(y1-y); path.push({x:x+0.5, y:y+0.5}); }
  return path;
}
function frame(now){
  const dt = Math.min(0.05, (now - (G.last||now))/1000); G.last = now;
  if (G.screen==='gather'){ gatherUpdate(dt); if (G.screen==='gather') drawArena(); }
  else if (G.screen==='duel' || (G.screen==='result' && G.duel)) drawDuel(dt);
  else if (G.screen==='craft') drawArena();
  requestAnimationFrame(frame);
}
// test hook: jump the gather clock (used by the smoke test only)
G.skipTo = s => { if (G.screen==='gather') G.t = s; };
G.endGather = endGather;
G.session = SESSION;

title();
requestAnimationFrame(frame);
})();
