// Smoke test for the TEXT edition. Node part: rules + gather run headless in node, deterministic.
// Browser part (headless chromium): plays vs bot and a hot-seat game with keys only, checks toasts, pass screen, rematch,
// no <canvas>/<img>, no console errors, no banned words. Usage: node text/smoke.mjs [baseURL] [transcript.txt]
import { createRequire } from 'module'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url);
const R = require(path.resolve(here, '../play/rules.js')), TG = require(path.resolve(here, 'gather.js'));
const fail = m => { console.error('FAIL', m); process.exit(1); }, ok = m => console.log('ok  ', m);
// ---- node ----
function nodeGame(){ const P = ['vinny','zip'].map((id, i) => ({ape:{id, name:id, ...R.STATS[id]}, i, fruit:0, wood:0, gold:false, club:false})), C = P.map(() => TG.newCamp());
  for (let t = 1; t <= 14; t++){ if (t === TG.GOLD_TURN){ TG.golden(P, [true, true], R.GOLD_FRUIT); continue; }
    P.forEach((p, i) => { if (t <= TG.turnsFor(p)) TG.act(p, C[i], t, TG.botAction(p, C[i], t, R.clubWood(p), false, t)); }); }
  return JSON.stringify(P); }
if (nodeGame() !== nodeGame()) fail('gather not deterministic'); ok('node: gather is deterministic');
if (TG.turnsFor({ape:{id:'zip'}}) !== TG.TURNS + 2) fail('zip turns'); ok(`node: ${TG.TURNS} turns, golden fruit on turn ${TG.GOLD_TURN}`);
const src = ['text.js','gather.js','index.html'].map(f => fs.readFileSync(path.join(here, f), 'utf8')).join('\n');
if (/Math\.random|localStorage|<canvas|<img|getContext/.test(src)) fail('random/storage/graphics in source'); ok('node: no Math.random, storage, canvas or images');
// ---- browser ----
const base = process.argv[2] || 'http://localhost:8765/', tfile = process.argv[3];
const { chromium } = require('/workspace/pw/node_modules/playwright');
const BANNED = /\b(bet|wager|stake|gamble|odds|jackpot|payout|casino)\b/i;
const browser = await chromium.launch(); const page = await browser.newPage(); const errs = [];
page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
const res = await page.goto(base + 'text/'); if (res.status() !== 200) fail('status ' + res.status());
const shot = async () => { const out = await page.textContent('#out'), menu = await page.$$eval('#menu li', l => l.map(x => x.textContent)), note = await page.textContent('#note');
  return {out, menu, note, all: out + '\n' + menu.map(m => '   ' + m).join('\n') + (note ? '\n   >> ' + note : '')}; };
const idx = (s, re) => s.menu.findIndex(m => re.test(m));
const key = k => page.keyboard.press(k);
let T = [], s;
async function playOne(label){
  let guardTried = false, n = 0, sawGold = false, sawCue = false, sawPass = false, toast = '';
  for (;;){
    if (++n > 400) fail('too many steps'); s = await shot(); T.push(s.all, '');
    if (BANNED.test(s.all)) fail('banned word: ' + s.all.match(BANNED)[0]);
    if (/ripening in the centre/.test(s.out)) sawCue = true;
    if (/RESULT/.test(s.out)) return {sawGold, sawCue, sawPass, toast};
    if (/PASS THE KEYBOARD/.test(s.out)){ sawPass = true; await key('Enter'); continue; }
    let i = idx(s, /Race for the golden/); if (i >= 0){ sawGold = true; await key(String(i+1)); continue; }
    if (/WORKBENCH/.test(s.out)){ await key('1'); const s2 = await shot(); if (s2.note){ T.push('   >> ' + s2.note, ''); await key('2'); } continue; }
    i = idx(s, /^\d\) Guard/);
    if (i >= 0){ // duel: guard twice to hit the blocked-move toast once, else strike
      if (!guardTried && /GUARD/.test(T.slice(-6).join('\n').split('Round').pop() || '')){ await key(String(i+1)); s = await shot(); if (/Can't Guard twice/.test(s.note)){ toast = s.note; guardTried = true; T.push('   >> ' + s.note, ''); } continue; }
      const g = (await page.evaluate(() => window.TXT.duel.round)) % 3 === 1 && !guardTried; await key(String((g ? i : idx(s, /^\d\) Strike/)) + 1)); continue; }
    i = idx(s, /tree|bush|canopy/i); if (i >= 0){ const t = await page.evaluate(() => window.TXT.turn);
      await key(String((t % 2 ? idx(s, /tree/i) : Math.max(idx(s, /canopy/i), idx(s, /bush/i))) + 1));
      const s2 = await shot(); if (s2.note){ T.push('   >> ' + s2.note, ''); await key(String(idx(s2, /breath/i) + 1)); } continue; }
    fail(`${label}: stuck on\n${s.all}`);
  }
}
// title -> vs bot (Easy)
s = await shot(); if (!/Play vs bot/.test(s.all)) fail('title'); ok('title');
await key(String(idx(s, /Play vs bot/) + 1)); s = await shot(); if (!/PICK YOUR APE/.test(s.out) || s.menu.length < 5) fail('select'); ok('ape select (5 apes)');
await key('1'); T = [];
let r = await playOne('bot'); if (!r.sawGold || !r.sawCue) fail('golden turn/cue'); ok('gather turns + golden cue + golden race');
if (!r.toast) fail('no blocked-move toast'); ok('toast: ' + r.toast);
ok('duel to result vs Easy bot'); if (!/club \+4/.test(T.join('\n').split('THE DUEL, ROUND 1')[1].split('ZIP')[0])) fail('player club not crafted'); ok('club crafted at the workbench'); const transcript = T.join('\n');
if (!/\[#+-*\]/.test(transcript)) fail('no HP bars'); ok('HP text bars');
s = await shot(); await key(String(idx(s, /Rematch/) + 1)); s = await shot(); if (!/GATHER/i.test(s.out)) fail('rematch'); ok('rematch starts a new gather');
// hot seat with Hard toggle check
await page.goto(base + 'text/'); s = await shot(); await key(String(idx(s, /switch to Hard/) + 1)); s = await shot(); if (!/Bot level: HARD/.test(s.out)) fail('hard toggle'); ok('Easy/Hard toggle');
await key(String(idx(s, /2 players/) + 1)); await key('2'); await key('4'); T = [];
r = await playOne('hot'); if (!r.sawPass) fail('no pass screen'); ok('hot-seat game with pass-the-keyboard screen');
s = await shot(); if (!/Rematches this session: 0/.test(s.out)) fail('session count'); ok('session rematch count shown');
if (await page.$('canvas, img, svg')) fail('graphics element found'); ok('no canvas/img/svg in DOM');
if (errs.length) fail('console errors: ' + errs.join(' | ')); ok('no console errors');
if (tfile) fs.writeFileSync(tfile, transcript); await browser.close(); console.log('SMOKE PASS');
