import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:8765/play/';
const dir = process.argv[3] || '.';
const b = await chromium.launch(); const pg = await b.newPage({viewport:{width:1000,height:720}});
const errs = []; pg.on('console', m => m.type()==='error' && errs.push(m.text())); pg.on('pageerror', e => errs.push(String(e)));
const ok = (c, m) => { if (!c) throw new Error('FAIL: '+m); console.log('ok -', m); };
await pg.goto(url);
ok(await pg.isVisible('text=Going'), 'title'); await pg.screenshot({path:dir+'/shot-1-title.png'});
await pg.click('#b-bot'); await pg.waitForSelector('.ape'); await pg.screenshot({path:dir+'/shot-2-select.png'});
ok(await pg.evaluate(()=>document.querySelector('.ape.sel')?.dataset.k)==='0', 'ape select defaults to the first card');
ok(await pg.evaluate(()=>APE.diff)==='easy', 'vs-bot defaults to Easy');
await pg.click('.ape[data-k="0"]');
ok(await pg.evaluate(()=>APE.screen)==='gather', 'gather started');
await pg.keyboard.down('KeyW'); await pg.waitForTimeout(700); await pg.keyboard.up('KeyW');
await pg.keyboard.down('KeyD'); await pg.waitForTimeout(500); await pg.keyboard.up('KeyD');
const k0 = await pg.evaluate(()=>APE.players[0].fruit+APE.players[0].wood);
// 30 seconds of mouse clicks only: click next to the nearest ready node (not on it) and let the path + auto-gather work
const t0 = Date.now();
while (Date.now()-t0 < 30000){
  const xy = await pg.evaluate(()=>{ const p=APE.players[0], r=document.getElementById('cv').getBoundingClientRect();
    if (p.path && p.path.length) return null;
    let best=null, bd=1e9; for (const n of APE.nodes){ if (APE.t < n.readyAt || (n.kind==='high' && p.ape.id!=='vinny')) continue; const d=Math.hypot(n.x+.5-p.x,n.y+.5-p.y); if (d<bd && d>0.3){bd=d;best=n;} }
    if (!best) return null; const tx = best.x+1 < 24 ? best.x+1 : best.x-1;      // the tile NEXT to the node
    return [r.left+(tx+.5)/24*r.width, r.top+(best.y+.5)/16*r.height]; });
  if (xy && !(await pg.evaluate(()=>APE.players[0].busy>0))) await pg.mouse.click(...xy);
  await pg.waitForTimeout(1500);
}
const p0 = await pg.evaluate(()=>APE.players[0]); const got = p0.fruit+p0.wood-k0;
ok(got >= 3, `30 s of click-to-move gathered ${got} resources (fruit ${p0.fruit}, wood ${p0.wood})`);
await pg.evaluate(()=>APE.skipTo(55.5)); await pg.waitForTimeout(400);
ok(await pg.evaluate(()=>APE.goldCue===true), 'golden fruit cue shows before it appears');
await pg.evaluate(()=>APE.skipTo(60)); await pg.waitForTimeout(3000);
ok(await pg.evaluate(()=>!!APE.gold), 'golden fruit spawned at 60 s');
await pg.screenshot({path:dir+'/shot-3-gather.png'});
await pg.evaluate(()=>{const p=APE.players[0]; p.wood=Math.max(p.wood,4); p.fruit=Math.max(p.fruit,4);}); // ensure craft is possible
await pg.evaluate(()=>APE.skipTo(89.9)); await pg.waitForSelector('#b-craft');
await pg.screenshot({path:dir+'/shot-4-craft.png'});
await pg.click('#b-craft'); ok(await pg.evaluate(()=>APE.players[0].club), 'club crafted');
await pg.waitForSelector('[data-m="strike"]');
await pg.click('[data-m="guard"]'); await pg.waitForSelector('[data-m="guard"].off');
await pg.click('[data-m="guard"]', {force:true});
ok((await pg.textContent('#toast')).includes("Can't Guard twice in a row. Pick another move.") && await pg.isVisible('#toast'), 'rejected Guard (click) shows toast');
await pg.keyboard.press('Digit2'); ok(await pg.isVisible('#toast'), 'rejected Guard (key) shows toast');
ok((await pg.textContent('[data-m="guard"]')).includes('twice in a row'), 'blocked Guard is greyed out with its reason');
let n=1; const seq=['strike','feint','strike','guard','strike','eat'];
while (await pg.evaluate(()=>APE.screen==='duel' && !APE.duel.over) && n<40){
  const m = seq[n%seq.length]; const sel = `[data-m="${m}"]:not(.off)`;
  if (await pg.$(sel)) await pg.click(sel); else await pg.click('[data-m="strike"]');
  n++; if (n===3) await pg.screenshot({path:dir+'/shot-5-duel.png'});
  await pg.waitForTimeout(120);
}
await pg.waitForSelector('#b-rematch',{timeout:5000}); ok(true, `duel ended after ${n} picks`);
await pg.screenshot({path:dir+'/shot-6-result.png'});
await pg.click('#b-rematch'); ok(await pg.evaluate(()=>APE.screen)==='gather', 'rematch restarts gather');
ok(await pg.evaluate(()=>APE.session.rematches)===1, 'session rematch count = 1 (in memory)');
await pg.evaluate(()=>APE.endGather()); await pg.click('#b-skip'); await pg.waitForSelector('[data-m="strike"]');
while (await pg.evaluate(()=>APE.screen)==='duel'){ await pg.evaluate(()=>{const b=document.querySelector('[data-m="strike"]'); b&&b.click();}); await pg.waitForTimeout(60); }
await pg.waitForSelector('#b-rematch'); ok(!(await pg.textContent('.panel')).includes('guarded last turn') && (await pg.textContent('.panel')).includes('Rematches this session: 1'), 'result screen shows session rematch count');
await pg.screenshot({path:dir+'/shot-7-rematch-count.png'});
// rules: no randomness in game code
const src = (await (await pg.request.get(url+'game.js')).text()) + (await (await pg.request.get(url+'rules.js')).text());
ok(!/Math\.random/.test(src), 'no Math.random in game.js + rules.js');
ok(!/localStorage|sessionStorage|document\.cookie/.test(src), 'no storage in game code');
ok((await pg.goto(url+'?stats'), !(await pg.content()).includes('Fun-test stats')), 'no ?stats page');
ok(!/\b(bet|wager|stake|gamble|odds|jackpot|payout|casino)\b/i.test(src + await (await pg.request.get(url)).text()), 'no banned words');
// hot-seat duel picks in secret
await pg.goto(url); await pg.click('#b-hot'); await pg.click('.ape[data-k="1"]'); await pg.click('.ape[data-k="3"]');
await pg.evaluate(()=>APE.endGather()); await pg.click('#b-skip'); await pg.click('#b-skip');
await pg.click('[data-m="strike"]');
ok(await pg.isVisible('text=Pass the keyboard to Player 2') && !(await pg.$('[data-m]')), 'hot-seat: blank pass screen after P1 pick');
await pg.screenshot({path:dir+'/shot-8-pass.png'});
await pg.mouse.click(480,320); ok(await pg.evaluate(()=>APE.screen)==='pass', 'pass screen ignores clicks (needs a key)');
await pg.keyboard.press('Space'); await pg.waitForSelector('[data-m="guard"]');
await pg.click('[data-m="guard"]');
ok((await pg.textContent('#pass')).includes('blocked') && (await pg.textContent('#pass')).includes('back to Player 1'), 'hot-seat: reveal + pass back to Player 1');
await pg.keyboard.press('Enter'); await pg.waitForSelector('[data-m="strike"]'); ok(true, 'P1 picks again after key press');
ok(errs.length===0, 'no console errors '+errs.join('|')); console.log('SMOKE PASS'); await b.close();
