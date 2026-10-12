import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:8765/play/';
const dir = process.argv[3] || '.';
const b = await chromium.launch(); const pg = await b.newPage({viewport:{width:1000,height:720}});
const errs = []; pg.on('console', m => m.type()==='error' && errs.push(m.text())); pg.on('pageerror', e => errs.push(String(e)));
const ok = (c, m) => { if (!c) throw new Error('FAIL: '+m); console.log('ok -', m); };
await pg.goto(url); await pg.evaluate(()=>localStorage.clear()); await pg.reload();
ok(await pg.isVisible('text=Going'), 'title'); await pg.screenshot({path:dir+'/shot-1-title.png'});
await pg.click('#b-bot'); await pg.waitForSelector('.ape'); await pg.screenshot({path:dir+'/shot-2-select.png'});
await pg.click('.ape[data-k="0"]');
ok(await pg.evaluate(()=>APE.screen)==='gather', 'gather started');
await pg.keyboard.down('KeyW'); await pg.waitForTimeout(700); await pg.keyboard.up('KeyW');
await pg.keyboard.down('KeyD'); await pg.waitForTimeout(500); await pg.keyboard.up('KeyD');
await pg.mouse.click(...await pg.evaluate(()=>{const r=document.getElementById('cv').getBoundingClientRect();return [r.left+4.5/24*r.width, r.top+3.5/16*r.height];}));
await pg.waitForTimeout(2500);
const p0 = await pg.evaluate(()=>APE.players[0]); ok(p0.fruit+p0.wood>0, `gathered by playing (fruit ${p0.fruit}, wood ${p0.wood})`);
await pg.evaluate(()=>APE.skipTo(60)); await pg.waitForTimeout(3000);
ok(await pg.evaluate(()=>!!APE.gold), 'golden fruit spawned at 60 s');
await pg.screenshot({path:dir+'/shot-3-gather.png'});
await pg.evaluate(()=>{const p=APE.players[0]; p.wood=Math.max(p.wood,4); p.fruit=Math.max(p.fruit,4);}); // ensure craft is possible
await pg.evaluate(()=>APE.skipTo(89.9)); await pg.waitForSelector('#b-craft');
await pg.screenshot({path:dir+'/shot-4-craft.png'});
await pg.click('#b-craft'); ok(await pg.evaluate(()=>APE.players[0].club), 'club crafted');
await pg.waitForSelector('[data-m="strike"]');
let n=0; const seq=['strike','feint','strike','guard','strike','eat'];
while (await pg.evaluate(()=>APE.screen)==='duel' && n<40){
  const m = seq[n%seq.length]; const sel = `[data-m="${m}"]:not([disabled])`;
  if (await pg.$(sel)) await pg.click(sel); else await pg.click('[data-m="strike"]:not([disabled]), [data-m="feint"]:not([disabled])');
  n++; if (n===3) await pg.screenshot({path:dir+'/shot-5-duel.png'});
  await pg.waitForTimeout(80);
}
await pg.waitForSelector('#b-rematch',{timeout:5000}); ok(true, `duel ended after ${n} picks`);
await pg.screenshot({path:dir+'/shot-6-result.png'});
await pg.click('#b-rematch'); ok(await pg.evaluate(()=>APE.screen)==='gather', 'rematch restarts gather');
await pg.goto(url+'?stats'); const r = await pg.textContent('#st-rematch');
ok(r==='1', 'stats page shows 1 rematch'); await pg.screenshot({path:dir+'/shot-7-stats.png'});
// rules: no randomness in game code
const src = await (await pg.request.get(url+'game.js')).text();
ok(!/Math\.random/.test(src), 'no Math.random in game code');
ok(!/\b(bet|wager|stake|gamble|odds|jackpot|payout|casino)\b/i.test(src + await (await pg.request.get(url)).text()), 'no banned words');
// hot-seat duel picks in secret
await pg.goto(url); await pg.click('#b-hot'); await pg.click('.ape[data-k="1"]'); await pg.click('.ape[data-k="3"]');
await pg.evaluate(()=>APE.endGather()); await pg.click('#b-skip'); await pg.click('#b-skip');
await pg.click('[data-m="strike"]'); ok((await pg.textContent('.log')).includes('Player 1 has picked'), 'hot-seat P1 pick hidden');
await pg.click('[data-m="guard"]'); ok((await pg.textContent('.log')).includes('blocked'), 'hot-seat round resolves');
ok(errs.length===0, 'no console errors '+errs.join('|')); console.log('SMOKE PASS'); await b.close();
