// Classic landing check: copy rules, play links to text/, all images load, no outside requests, fits 360/390px, other pages still load.
// Usage: node text/landing-classic-smoke.mjs [baseURL] [shotsDir]
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { chromium } = require('/workspace/pw/node_modules/playwright');
const base = process.argv[2] || 'http://localhost:8766/', shots = process.argv[3];
const fail = m => { console.error('FAIL', m); process.exit(1); }, ok = m => console.log('ok  ', m);
const b = await chromium.launch(), p = await b.newPage({viewport:{width:1280, height:900}}), errs = [], outside = [], bad404 = [];
p.on('pageerror', e => errs.push(e.message)); p.on('request', r => { if (!r.url().startsWith(base)) outside.push(r.url()); });
p.on('response', r => { if (r.status() >= 400) bad404.push(r.status() + ' ' + r.url()); });
await p.goto(base, {waitUntil:'networkidle'}); const txt = await p.textContent('body');
if (await p.title() !== 'Going ApeSh!t') fail('title: ' + await p.title()); ok('<title> is exactly "Going ApeSh!t"');
if ((await p.textContent('.gametitle')).trim() !== 'Going ApeSh!t') fail('hero title'); ok('hero title kept');
for (const s of ['Plays in your browser, no download.', 'Every duel has a replay code. Same code, same game.', 'No dice in duels: secret picks decide it.', 'Two apes. One jungle. Secret picks.']) if (!txt.includes(s)) fail('missing: ' + s);
ok('required copy present');
const banned = txt.match(/\b(bet|bets|betting|wager|stakes?|gamble|gambling|odds|jackpot|payout|casino)\b|no random|Kommersant|Fight Club|Big Moe|Tinker|Vinny|Boulder|\bZip\b/i); if (banned) fail('banned copy: ' + banned[0]); ok('no banned words, no ape names in section text');
const hrefs = await p.$$eval('a[href]', l => l.map(a => a.getAttribute('href'))); if (hrefs.filter(h => h === './text/').length < 2 || hrefs.some(h => /play\/$/.test(h))) fail('play links ' + hrefs); ok('Play now links point to ./text/');
const imgs = await p.$$eval('img', l => l.map(i => [i.getAttribute('src'), i.alt])); if (imgs.some(([s,a]) => !s.startsWith('assets/img/text/') || a.length < 20)) fail('img ' + JSON.stringify(imgs)); ok(imgs.length + ' images, all new text-UI screenshots with alt text');
await p.$$eval('img', l => l.forEach(i => i.loading = 'eager')); await p.waitForLoadState('networkidle'); await p.waitForTimeout(500);
if (await p.$$eval('img', l => l.some(i => !i.complete || !i.naturalWidth))) fail('broken image'); ok('all images load');
if (shots){ await p.evaluate(() => scrollTo(0,0)); await p.screenshot({path:shots + '/landing-desktop.png', fullPage:true}); }
for (const W of [360, 390]){ await p.setViewportSize({width:W, height:844}); await p.goto(base, {waitUntil:'networkidle'});
  const sw = await p.evaluate(() => document.documentElement.scrollWidth); if (sw > W) fail(`sideways scroll at ${W}px (${sw})`);
  if (shots && W === 390){ await p.$$eval('img', l => l.forEach(i => i.loading = 'eager')); await p.waitForLoadState('networkidle'); await p.evaluate(() => scrollTo(0,0)); await p.waitForTimeout(300); await p.screenshot({path:shots + '/landing-phone390.png', fullPage:true}); } }
ok('360 and 390px: no sideways scroll');
for (const pg of ['text/', 'play/']){ const r = await p.goto(base + pg); if (!r.ok()) fail(pg + ' ' + r.status()); } ok('text/ and play/ still load');
if (outside.length) fail('outside requests: ' + outside); ok('no outside requests');
if (bad404.length) fail('failed responses: ' + bad404); ok('no failed responses');
if (errs.length) fail('errors: ' + errs); ok('no page errors'); await b.close(); console.log('LANDING CLASSIC PASS');
