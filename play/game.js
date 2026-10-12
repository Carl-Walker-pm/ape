/* Going ApeSh!t: playable prototype v0. Plain JS + Canvas, no build step, no tracking.
   Rules follow sim/duel_sim.py where they overlap (stats, fixed damage, no random rolls).
   All stats and rules are proposals for the fun test. */
'use strict';
(() => {
const W = 24, H = 16, T = 40;               // arena 24x16 tiles (game-map.md)
const GATHER_SECS = 90, GOLD_AT = 60;        // golden fruit spawns 60 s in, centre
const EAT_HEAL = 14, GOLD_HP = 10, MAX_ROUNDS = 30;
const LS = 'goingApeshit.v0';

// ---- apes (proposals; same numbers as sim/duel_sim.py v2, slice mode balanced 45.9-54.1%) ----
const APES = [
  {id:'vinny', name:'Vinny', role:'the climber', img:'img/ape-climber.jpg', color:'#c9772f',
   hp:112, atk:11, dfn:4, spd:3.8, trick:'Climbs the canopies in the corners for 3 high fruit. Only Vinny can reach them.'},
  {id:'boulder', name:'Boulder', role:'the smasher', img:'img/ape-smasher.jpg', color:'#5b5f66',
   hp:86, atk:15, dfn:3, spd:3.0, trick:'Smashes trees for 2 wood instead of 1.'},
  {id:'zip', name:'Zip', role:'the quick one', img:'img/ape-quick.jpg', color:'#d9b04a',
   hp:104, atk:13, dfn:3, spd:5.2, trick:'Fastest feet in the grove, and gathers in half the time.'},
  {id:'moe', name:'Big Moe', role:'the tank', img:'img/ape-tank.jpg', color:'#3d3a45',
   hp:98, atk:12, dfn:4, spd:2.8, trick:'Every fruit eaten in a duel heals 50% more.'},
  {id:'tinker', name:'Tinker', role:'the crafter', img:'img/ape-thinker.jpg', color:'#8a5a3c',
   hp:93, atk:13, dfn:2, spd:3.6, trick:'Crafts the club with 2 less wood, and it hits 2 harder.'},
];
const CLUB = {wood:4, fruit:1, atk:4};
const MOVES = {
  strike:{label:'Strike', hint:'Hit hard. Beats Feint.'},
  guard: {label:'Guard',  hint:'Block a Strike and hit back. Not twice in a row.'},
  feint: {label:'Feint',  hint:'Fake out a Guard or an eater. Loses to Strike.'},
  eat:   {label:'Eat fruit', hint:'Heal. Costs 1 fruit.'},
};

// ---- storage (local only) ----
function store(){ try{ return JSON.parse(localStorage.getItem(LS)) || {}; }catch(e){ return {}; } }
function bump(k){ const s = store(); s[k] = (s[k]||0)+1; try{ localStorage.setItem(LS, JSON.stringify(s)); }catch(e){} return s[k]; }

// ---- arena layout (game-map.md, mirrored) ----
function makeNodes(){
  const n = [];
  [[4,3],[6,10],[8,4]].forEach(([x,y]) => { n.push({kind:'fruit',x,y,re:20}); n.push({kind:'fruit',x:W-1-x,y:H-1-y,re:20}); });
  [[3,12],[7,2],[5,6]].forEach(([x,y]) => { n.push({kind:'tree',x,y,re:30}); n.push({kind:'tree',x:W-1-x,y:H-1-y,re:30}); });
  n.push({kind:'high',x:1,y:1,re:45}); n.push({kind:'high',x:22,y:14,re:45});
  n.forEach(o => o.readyAt = 0);
  return n;
}
const GOLD = {x:11.5, y:7.5};

// ---- DOM ----
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const ui = document.getElementById('ui'), hud = document.getElementById('hud');
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function show(html, cls='screen'){ ui.innerHTML = `<div class="${cls}">${html}</div>`; return ui.firstChild; }

// ---- game state ----
const G = window.APE = {screen:'title', mode:'bot', picks:[], players:[], t:0, nodes:[], gold:null, duel:null, keys:{}};

function newPlayer(ape, i, isBot){
  return {ape, i, bot:isBot, x: i===0 ? 2.5 : 21.5, y: i===0 ? 7.5 : 8.5, tx:null, ty:null,
          fruit:0, wood:0, gold:false, club:false, busy:0, target:null, picked:0};
}

// ================= title =================
function title(){
  G.screen = 'title'; hud.classList.add('hidden'); clearCanvas();
  const s = store();
  show(`<span class="tag">Playable prototype · v0</span>
    <h1>Going <em>ApeSh!t</em></h1>
    <p class="sub">Pick your ape, grab the fruit, win the duel.</p>
    <div><button id="b-bot">Play vs bot</button><button class="ghost" id="b-hot">2 players, one keyboard</button></div>
    <p style="opacity:.75;font-size:14px;margin-top:22px">Gather for 90 seconds, craft a club, then duel. Turn-based, no luck involved.</p>`,
    'screen bg shade').style.backgroundImage = 'linear-gradient(180deg,rgba(10,24,16,.25),rgba(10,24,16,.85)),url(img/hero.jpg)';
  document.getElementById('b-bot').onclick = () => { G.mode='bot'; select(); };
  document.getElementById('b-hot').onclick = () => { G.mode='hot'; select(); };
}

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
      <div class="bars"><span>HP ${bar(a.hp,112)}</span><span>Hit ${bar(a.atk,15)}</span><span>Armour ${bar(a.dfn,4)}</span><span>Speed ${bar(a.spd,5.2)}</span></div>
      <div class="trick">${a.trick}</div></div>`).join('')}</div>
    <p style="font-size:14px;opacity:.8">${G.mode==='hot'?'P1 moves with WASD, P2 with the arrow keys.':'Move with WASD or click where to go.'}</p>
    <button class="ghost" id="b-back">Back</button>`, 'screen bg shade');
  el.style.backgroundImage = 'linear-gradient(180deg,rgba(10,24,16,.7),rgba(10,24,16,.92)),url(img/apes-lineup.jpg)';
  el.querySelectorAll('.ape').forEach(d => {
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
  G.nodes = makeNodes(); G.gold = null; G.t = 0; G.screen = 'gather'; G.last = performance.now();
  G.flash = [];
  hud.classList.remove('hidden');
  show(`<div style="position:absolute;bottom:10px;left:0;right:0;text-align:center;pointer-events:none;font-size:14px;opacity:.85">
    ${G.mode==='hot'?'P1: WASD · P2: arrow keys':'WASD or click to move'} · walk onto a bush or tree to gather · golden fruit appears in the centre at 1:00</div>
    <button class="ghost" id="b-done" style="position:absolute;right:8px;bottom:36px;font-size:13px;padding:6px 14px">Finish early</button>`,'');
  document.getElementById('b-done').onclick = endGather;
}
function nodeAt(p){
  const tx = Math.floor(p.x), ty = Math.floor(p.y);
  return G.nodes.find(n => n.x===tx && n.y===ty);
}
function canUse(p, n){ return n && G.t >= n.readyAt && (n.kind!=='high' || p.ape.id==='vinny'); }
function gatherTick(p, dt){
  if (p.busy>0){ p.busy -= dt; if (p.busy<=0) finishGather(p); return; }
  const n = nodeAt(p);
  if (canUse(p,n)){ p.busy = p.ape.id==='zip' ? 0.4 : 0.8; p.node = n; }
  if (G.gold && !G.gold.taken && Math.hypot(p.x-GOLD.x-0.5, p.y-GOLD.y-0.5) < 1.1){
    G.gold.taken = p; p.gold = true; p.fruit += 3; G.flash.push({x:p.x,y:p.y,txt:'GOLDEN FRUIT! +3 fruit, +10 HP',t:2.5});
  }
}
function finishGather(p){
  const n = p.node; p.node = null;
  if (!canUse(p,n) || nodeAt(p)!==n) return;
  let txt;
  if (n.kind==='tree'){ const w = p.ape.id==='boulder'?2:1; p.wood += w; txt = `+${w} wood`; }
  else if (n.kind==='high'){ p.fruit += 3; txt = '+3 high fruit'; }
  else { p.fruit += 1; txt = '+1 fruit'; }
  n.readyAt = G.t + n.re; p.picked++;
  G.flash.push({x:p.x,y:p.y-0.4,txt,t:1.2});
}
function clampMove(p, dx, dy, dt){
  const len = Math.hypot(dx,dy); if (!len) return;
  const s = p.ape.spd * dt / len;
  p.x = Math.min(W-0.5, Math.max(0.5, p.x + dx*s));
  p.y = Math.min(H-0.5, Math.max(1.5, p.y + dy*s));  // row 0 under the HUD
}
function humanMove(p, dt){
  const k = G.keys, alt = p.i===1;
  let dx = 0, dy = 0;
  if (alt){ dx = (k.ArrowRight?1:0)-(k.ArrowLeft?1:0); dy = (k.ArrowDown?1:0)-(k.ArrowUp?1:0); }
  else { dx = (k.KeyD?1:0)-(k.KeyA?1:0); dy = (k.KeyS?1:0)-(k.KeyW?1:0); }
  if (dx||dy){ p.tx = null; }
  else if (p.tx!=null){ dx = p.tx-p.x; dy = p.ty-p.y; if (Math.hypot(dx,dy) < 0.08){ p.tx=null; dx=dy=0; } }
  if (p.busy>0 && !(dx||dy)) return;
  if (dx||dy) p.busy = 0, p.node = null;
  if (p.tx!=null){ const d=Math.hypot(dx,dy), step=p.ape.spd*dt; if (step>=d){ p.x=p.tx; p.y=p.ty; p.tx=null; return; } }
  clampMove(p, dx, dy, dt);
}
function botMove(p, dt){
  if (p.busy>0) return;
  // simple bot: golden fruit if it is up, else wood until it can craft, else nearest ready fruit
  const need = clubWood(p);
  let goal = null;
  if (G.gold && !G.gold.taken) goal = {x:GOLD.x+0.5, y:GOLD.y+0.5};
  else {
    let best = 1e9;
    for (const n of G.nodes){
      if (!canUse(p,n)) continue;
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
function gatherUpdate(dt){
  G.t += dt;
  if (!G.gold && G.t >= GOLD_AT){ G.gold = {taken:null}; G.flash.push({x:GOLD.x,y:GOLD.y-1,txt:'Golden fruit in the centre!',t:3}); }
  for (const p of G.players){ p.bot ? botMove(p,dt) : humanMove(p,dt); gatherTick(p,dt); }
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
    ctx.fillText('golden fruit at 1:00', gx+T, gy+T+4);
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
function clubWood(p){ return CLUB.wood - (p.ape.id==='tinker'?2:0); }
function canCraft(p){ return !p.club && p.wood >= clubWood(p) && p.fruit >= CLUB.fruit; }
function doCraft(p){ if (!canCraft(p)) return false; p.wood -= clubWood(p); p.fruit -= CLUB.fruit; p.club = true; return true; }
function clubAtk(p){ return p.club ? CLUB.atk + (p.ape.id==='tinker'?2:0) : 0; }
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
      <p><b>${esc(p.ape.name)}</b> has 🍌 ${p.fruit} fruit and 🪵 ${p.wood} wood${p.gold?' and the ★ golden fruit (+10 HP)':''}.</p>
      <p style="font-size:44px;margin:6px 0">🪵×${clubWood(p)} + 🍌×${CLUB.fruit} → 🏏</p>
      <p><b>Wooden club</b>: every Strike, counter and Feint hits <b>+${CLUB.atk + (p.ape.id==='tinker'?2:0)}</b> harder.<br>
      <span style="opacity:.8;font-size:14px">Fruit you keep is food in the duel: each one eaten heals ${p.ape.id==='moe'?Math.round(EAT_HEAL*1.5):EAT_HEAL} HP.</span></p>
      <button id="b-craft" ${ok?'':'disabled'}>${ok?'Craft the club':'Not enough to craft'}</button>
      <button class="ghost" id="b-skip">${ok?'Keep the fruit, go fight':'Go fight'}</button>
      ${G.mode==='bot'?`<p style="font-size:14px;opacity:.8">${esc(G.players[1].ape.name)} (bot) ${G.players[1].club?'crafted a club.':'could not craft a club.'}</p>`:''}</div>`);
    document.getElementById('b-craft').onclick = () => { doCraft(p); idx++; step(); };
    document.getElementById('b-skip').onclick = () => { idx++; step(); };
  };
  step();
}

// ================= duel (turn-based, simultaneous secret picks, no random rolls) =================
function dmg(att, def){ return Math.max(1, att.ape.atk + clubAtk(att) - def.ape.dfn); }
function heal(p){ return p.ape.id==='moe' ? Math.round(EAT_HEAL*1.5) : EAT_HEAL; }
// resolve one round; a,b are fighter states {p,hp,max,lastGuard}; ma/mb moves. Pure and deterministic.
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
      me.healed = h; me.p.fruit -= 1; note = `${me.p.ape.name} eats a fruit (+${heal(me.p)} HP)`;
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
G.resolve = resolve;
function legal(f){ return Object.keys(MOVES).filter(m => !(m==='guard' && f.lastGuard) && !(m==='eat' && (f.p.fruit<1 || f.hp>=f.max))); }
// bot: reads your habits (counters your most frequent recent move), no random numbers
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
    <div class="moves">${Object.entries(MOVES).map(([k,m]) => `<button data-m="${k}" ${L.includes(k)?'':'disabled'}>${m.label}${k==='eat'?` (${me.p.fruit})`:''}<small>${m.hint}</small></button>`).join('')}</div>
    <div style="font-size:12px;opacity:.7;margin-top:6px">Keys 1–4 · Strike beats Feint · Guard beats Strike · Feint beats Guard and Eat · no dice, just reads</div></div>`, '');
  ui.querySelectorAll('[data-m]').forEach(b => b.onclick = () => choose(chooser, b.dataset.m));
}
function choose(i, m){
  const D = G.duel; if (G.screen!=='duel' || !legal(D.f[i]).includes(m)) return;
  D.picks[i] = m;
  if (G.mode==='bot') D.picks[1] = botPick(D.f[1], D.f[0], D.hist);
  if (D.picks[0]==null || D.picks[1]==null){ D.log = 'Player 1 has picked.'; return duelUI(); }
  const [ma, mb] = D.picks;
  D.hist.push(ma);
  D.log = `${D.f[0].p.ape.name}: ${MOVES[ma].label} vs ${D.f[1].p.ape.name}: ${MOVES[mb].label}. ` + resolve(D.f[0], D.f[1], ma, mb);
  D.last = [ma, mb]; D.anim = 0.6; D.picks = [null,null]; D.round++;
  const [fa,fb] = D.f;
  if (fa.hp<=0 || fb.hp<=0 || D.round > MAX_ROUNDS) return setTimeout(result, 700);
  duelUI();
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
    ctx.fillText(`🍌 ${f.p.fruit}  ${f.p.club?'🏏 club +'+clubAtk(f.p):'no club'}${f.p.gold?'  ★':''}${f.lastGuard?'  (guarded last turn)':''}`, i===0?bx:bx+w, 94);
    if (D.last){ ctx.font='bold 20px system-ui'; ctx.textAlign='center'; ctx.fillStyle='#ffe28a'; ctx.fillText(MOVES[D.last[i]].label, x, 322); }
  });
}

// ================= result =================
function result(){
  const D = G.duel, [fa,fb] = D.f;
  G.screen = 'result';
  bump('duels');
  let w = null;
  if (fa.hp<=0 && fb.hp<=0) w = null;
  else if (fb.hp<=0) w = 0; else if (fa.hp<=0) w = 1;
  else w = fa.hp/fa.max > fb.hp/fb.max ? 0 : fb.hp/fb.max > fa.hp/fa.max ? 1 : null;
  const name = w==null ? null : D.f[w].p.ape.name;
  const headline = w==null ? 'A draw!' : (G.mode==='bot' ? (w===0?'You win the duel!':`${name} wins this one.`) : `${name} (Player ${w+1}) wins!`);
  show(`<div class="panel"><h2>${esc(headline)}</h2>
    <p>${esc(D.log)}</p>
    <p style="opacity:.8;font-size:14px">${D.round-1} rounds · ${esc(fa.p.ape.name)} ${Math.max(0,fa.hp)} HP · ${esc(fb.p.ape.name)} ${Math.max(0,fb.hp)} HP</p>
    <button id="b-rematch" style="font-size:20px;padding:14px 34px">Rematch</button><br>
    <button class="ghost" id="b-change">Change ape</button><button class="ghost" id="b-title">Title</button></div>`);
  document.getElementById('b-rematch').onclick = () => { bump('rematch'); startGather(); };
  document.getElementById('b-change').onclick = select;
  document.getElementById('b-title').onclick = title;
}

// ================= hidden stats page (?stats) =================
function statsPage(){
  const s = store();
  const d = s.duels||0, r = s.rematch||0;
  show(`<div class="panel"><h2>Fun-test stats (this browser only)</h2>
    <table><tr><td>Duels finished</td><td id="st-duels">${d}</td></tr>
    <tr><td>Rematch presses</td><td id="st-rematch">${r}</td></tr>
    <tr><td>Rematch rate</td><td>${d?Math.round(r/d*100):0}%</td></tr></table>
    <p style="font-size:13px;opacity:.75">Stored in localStorage on this device only. Nothing is sent anywhere.</p>
    <button id="b-reset" class="ghost">Reset</button><button id="b-play">Play</button></div>`);
  document.getElementById('b-reset').onclick = () => { localStorage.removeItem(LS); statsPage(); };
  document.getElementById('b-play').onclick = () => { location.href = location.pathname; };
}

// ================= input + loop =================
addEventListener('keydown', e => {
  G.keys[e.code] = true;
  if (G.screen==='gather' && /^(Arrow|Key[WASD])/.test(e.code)) e.preventDefault();
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
  p.tx = Math.min(W-0.5, Math.max(0.5, (e.clientX-r.left)/r.width*W));
  p.ty = Math.min(H-0.5, Math.max(1.5, (e.clientY-r.top)/r.height*H));
});
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

if (/[?&]stats\b/.test(location.search)) { G.screen='stats'; statsPage(); }
else title();
requestAnimationFrame(frame);
})();
