// Landing v3 check: hero iframe loads the SAME /text/ files and is playable; copy rules; no images or outside requests; fits 360/390px.
// Usage: node text/landing-smoke.mjs [baseURL] [shotsDir]
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { chromium } = require('/workspace/pw/node_modules/playwright');
const base = process.argv[2] || 'http://localhost:8765/', shots = process.argv[3];
const fail = m => { console.error('FAIL', m); process.exit(1); }, ok = m => console.log('ok  ', m);
const b = await chromium.launch(), p = await b.newPage({viewport:{width:1280, height:900}}), errs = [], outside = [];
p.on('pageerror', e => errs.push(e.message)); p.on('request', r => { if (!r.url().startsWith(base)) outside.push(r.url()); });
await p.goto(base); const txt = await p.textContent('body');
if (!(await p.textContent('h1')).includes('Going ApeSh!t')) fail('title'); ok('title "Going ApeSh!t" kept exactly');
for (const s of ['Plays in your browser, no download.', 'Every duel has a replay code. Same code, same game.', 'No dice in duels: secret picks decide it.']) if (!txt.includes(s)) fail('missing: ' + s);
ok('required copy present');
const bad = txt.match(/\b(bet|bets|wager|stake|gamble|odds|jackpot|payout|casino)\b|any browser|loads instantly|Kommersant|Fight Club|Big Moe|Tinker/i); if (bad) fail('banned copy: ' + bad[0]); ok('no banned words, no pending ape names');
if (await p.$('img, canvas, svg, video, picture')) fail('picture on the page'); ok('no pictures');
if ([...await p.$$eval('a[href]', l => l.map(a => a.getAttribute('href')))].filter(h => /text\/$/.test(h)).length < 2) fail('play links'); ok('Play now links to text/');
const fr = p.frames().find(f => /\/text\/$/.test(f.url())); if (!fr) fail('hero iframe not on /text/'); await fr.waitForSelector('#menu button');
if (!/Play vs bot/.test(await fr.textContent('#menu'))) fail('menu in hero'); await fr.click('#menu button:has-text("Play vs bot")'); await fr.click('#menu button:has-text("Vinny")');
if (!/GATHERING, TURN 1/.test(await fr.textContent('#out'))) fail('hero not playable'); ok('hero iframe runs the same /text/ files and is playable');
if (shots){ await p.goto(base); await p.waitForTimeout(400); await p.screenshot({path:shots + '/landing-desktop.png', fullPage:true}); }
for (const W of [360, 390]){ await p.setViewportSize({width:W, height:844}); await p.goto(base); await p.waitForTimeout(300);
  const sw = await p.evaluate(() => document.documentElement.scrollWidth); if (sw > W) fail(`sideways scroll at ${W}px (${sw})`);
  if (shots && W === 390) await p.screenshot({path:shots + '/landing-phone390.png', fullPage:true}); }
ok('360 and 390px: no sideways scroll');
if (outside.length) fail('outside requests: ' + outside); ok('no outside requests');
if (errs.length) fail('errors: ' + errs); ok('no page errors'); await b.close(); console.log('LANDING PASS');
