// Smoke test for the TEXT edition. Node part: rules + gather run headless in node, deterministic.
// Browser part (headless chromium): plays vs bot and a hot-seat game with keys only, checks toasts, pass screen, rematch,
// no <canvas>/<img>, no console errors, no banned words, unapproved ape names (landing: fail; game: warn).
// Usage: node text/smoke.mjs [baseURL] [transcript.txt] [--names-strict]   (no URL: serves this checkout; LANDING_URL=... overrides the landing page)
// Before /text/ is published: run with --names-strict (or NAMES_APPROVED=0) unless Carl has approved the ape names.
import { createRequire } from 'module'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url);
const R = require(path.resolve(here, '../play/rules.js')), TG = require(path.resolve(here, 'gather.js'));
const fail = m => { console.error('FAIL', m); process.exitCode = 1; process.exit(1); }, ok = m => console.log('ok  ', m);
// ---- node ----
function nodeGame(){ const P = ['vinny','zip'].map((id, i) => ({ape:{id, name:id, ...R.STATS[id]}, i, fruit:0, wood:0, gold:false, club:false})), C = P.map(() => TG.newCamp());
  for (let t = 1; t <= 14; t++){ if (t === TG.GOLD_TURN){ TG.golden(P, [true, true], R.GOLD_FRUIT); continue; }
    P.forEach((p, i) => { if (t <= TG.turnsFor(p)) TG.act(p, C[i], t, TG.botAction(p, C[i], t, R.clubWood(p), false, t)); }); }
  return JSON.stringify(P); }
if (nodeGame() !== nodeGame()) fail('gather not deterministic'); ok('node: gather is deterministic');
if (TG.turnsFor({ape:{id:'zip'}}) !== TG.TURNS + 2) fail('zip turns'); ok(`node: ${TG.TURNS} turns, golden fruit on turn ${TG.GOLD_TURN}`);
const src = ['text.js','gather.js','index.html'].map(f => fs.readFileSync(path.join(here, f), 'utf8')).join('\n');
{ const m = src.match(/const VOICE = (\{[\s\S]*?\n\});/); if (!m) fail('voice table missing'); const V = eval('(' + m[1] + ')'), N = {vinny:'Vinny', boulder:'Boulder', zip:'Zip', moe:'Big Moe', tinker:'Tinker'};
  for (const k in V) for (const l of [].concat(...Object.values(V[k]))){ const t = `${N[k]}: "${l}"`; if (t.length > 40) fail('voice line over 40: ' + t); if (/\d|\b(dice|luck|roll|bet|odds)\b/i.test(l)) fail('voice line word: ' + l); }
  if (!/dead\[0\] && dead\[1\]\) return null/.test(src)) fail('double KO must be silent'); ok('node: voice lines <= 40 chars, no numbers/luck words, silent on double KO'); }
if (/Math\.random|localStorage|<canvas|<img|getContext/.test(src)) fail('random/storage/graphics in source'); ok('node: no Math.random, storage, canvas or images');
// ---- browser ----
// No URL given: serve this checkout locally on a free port (so the test never hits whatever runs on :8765).
const POS = process.argv.slice(2).filter(x => !x.startsWith('--'));
let base = POS[0], tfile = POS[1];
if (!base) { const http = await import('node:http'), root = path.resolve(here, '..'), MIME = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css'};
  const srv = http.createServer((q, r) => { const p = path.join(root, decodeURIComponent(new URL(q.url, 'http://x').pathname)), f = p.endsWith('/') ? p + 'index.html' : p;
    if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, {'content-type': MIME[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(r); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); srv.unref(); base = `http://127.0.0.1:${srv.address().port}/`; console.log('serving this checkout at ' + base); }
process.on('unhandledRejection', e => fail('error: ' + (e && e.message || e)));
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/workspace/pw/node_modules/playwright');
// Ape names not yet approved by Carl. Mode depends on the page PATH:
//  - landing pages (anything not under /text/): FAIL, incl. screenshot alt text, captions and titles.
//  - inside the game (/text/): WARN only, unless strict: --names-strict, NAMES_STRICT=1 or NAMES_APPROVED=0.
// /text/ MUST be tested strict before it is published, unless Carl has approved the names.
const UNAPPROVED = /\b(Moe|Vinny|Zip|Boulder|Tinker)\b/g;
const NAMES_STRICT = process.argv.includes('--names-strict') || process.env.NAMES_STRICT === '1' || process.env.NAMES_APPROVED === '0';
// Carl approved the ape names on 2026-10-11, so the game no longer warns. NAMES_APPROVED=0 brings back the strict check.
const NAMES_APPROVED = !NAMES_STRICT;
const nameWarned = new Set();
function checkNames(txt, url){
  const found = [...new Set(txt.match(UNAPPROVED) || [])]; if (!found.length) return;
  const game = new URL(url).pathname.includes('/text/'), where = game ? 'game (/text/)' : 'landing page';
  if (!game || NAMES_STRICT) fail(`unapproved name on ${where}: ${found.join(', ')}${game ? ' [strict]' : ''}`);
  const fresh = found.filter(n => !nameWarned.has(n)); fresh.forEach(n => nameWarned.add(n));
  if (fresh.length && !NAMES_APPROVED) console.log(`WARN unapproved name in ${where}: ${fresh.join(', ')} (warning only; use --names-strict before publishing /text/)`);
}
// Full DOM text (hidden elements too) + attributes that can carry names; used on landing and game.
// Text nodes joined with spaces: documentElement.textContent glues <span>Climber</span><h3>Vinny</h3> into "ClimberVinny", defeating \b.
const domText = () => page.evaluate(() => [(() => { const w = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT), o = []; while (w.nextNode()) o.push(w.currentNode.nodeValue); return o.join(' '); })(),
  ...[...document.querySelectorAll('[alt],[aria-label],[title],meta[name=description],meta[property^="og:"]')].map(e => [e.getAttribute('alt'), e.getAttribute('aria-label'), e.getAttribute('title'), e.getAttribute('content')].filter(Boolean).join(' '))].join('\n'));
async function scanLanding(url){
  await page.goto(url); checkNames(await domText(), page.url()); ok('landing page: no unapproved ape names (full DOM incl. hidden, alt, captions)');
  const lbad = [];
  for (const W of [360, 390, 1280]){ await page.setViewportSize({width:W, height:800}); await page.goto(url);
    const m = await page.evaluate(() => { const T = [...document.querySelectorAll('button,a[href],[role=button],input,select')].filter(b => b.offsetParent && !b.closest('p,li,figcaption'));
      return {sw: document.documentElement.scrollWidth, n: T.length, small: T.filter(b => b.getBoundingClientRect().height < 40).map(b => `"${b.textContent.trim().slice(0, 24)}" ${Math.round(b.getBoundingClientRect().height)}px`), minH: T.length ? Math.min(...T.map(b => b.getBoundingClientRect().height)) : null}; });
    const bad = [m.sw > W && `sideways scroll ${m.sw}px`, ...m.small.map(x => `tap target ${x}`)].filter(Boolean); if (bad.length) lbad.push(`${W}px: ${bad.join('; ')}`);
    console.log(`${bad.length ? 'BAD ' : 'ok  '} landing ${W}px wide: scrollWidth ${m.sw}, ${m.n} tap targets, smallest ${m.minH == null ? '-' : Math.round(m.minH) + 'px'}${bad.length ? ' -> ' + bad.join('; ') : ''}`); }
  if (lbad.length) fail('landing layout: ' + lbad.join(' | '));
  await page.setViewportSize({width:1280, height:900}); }
const BANNED = /\b(bet|wager|stake|gamble|odds|jackpot|payout|casino)\b/i;
const browser = await chromium.launch(); const page = await browser.newPage(); const errs = [];
await scanLanding(process.env.LANDING_URL || base);   // landing = site root (or LANDING_URL); fails on unapproved names
page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
const res = await page.goto(base + 'text/'); if (res.status() !== 200) fail('status ' + res.status());
const shot = async () => { const out = await page.textContent('#out'), menu = await page.$$eval('#menu button', l => l.map(x => x.querySelector('.k').textContent.replace(/^\[(\d)\]$/, '$1)') + ' ' + x.querySelector('.l').textContent)), note = await page.textContent('#note');
  checkNames(await domText(), page.url());
  return {out, menu, note, all: out + '\n' + menu.map(m => '   ' + m).join('\n') + (note ? '\n   >> ' + note : '')}; };
const idx = (s, re) => { const m = s.menu.find(x => re.test(x)); return m ? +m.match(/^(\d)\)/)[1] - 1 : -1; };   // returns the option's KEY - 1 (keys are fixed, not positions)
const key = k => page.keyboard.press(k);
let T = [], s, reads = 0, passHint = false;
async function playOne(label){
  let guardTried = false, n = 0, sawGold = false, sawCue = false, sawPass = false, toast = '';
  for (;;){
    if (++n > 400) fail('too many steps'); s = await shot(); T.push(s.all, '');
    if (BANNED.test(s.all)) fail('banned word: ' + s.all.match(BANNED)[0]);
    if (/ripening in the centre/.test(s.out)) sawCue = true;
    if (/^READ: /m.test(s.out) && !/ZONE/.test(s.out)){ // the read line must match the moves actually played
      const want = await page.evaluate(() => { const D = TXT.duel, op = D.f[TXT.mode === 'hot' ? 1 - (TXT.passTo ?? 0) : 1].mh.slice(-4), c = {}; op.forEach(m => c[m] = (c[m] || 0) + 1); return {n:op.length, c}; });
      const m = s.out.match(/has (Struck|Guarded|Feinted|Eaten) (\d) of the last (\d) rounds/); if (!m) fail('read line format: ' + s.out);
      const key = {Struck:'strike', Guarded:'guard', Feinted:'feint', Eaten:'eat'}[m[1]];
      if (+m[3] !== want.n || want.c[key] !== +m[2] || Object.values(want.c).some(v => v > +m[2])) fail('read line wrong: ' + m[0] + ' vs ' + JSON.stringify(want)); reads++; }
    if (/ZONE PREVIEW/.test(s.out) && /READ: /.test(s.out)) reads++;
    if (/RESULT/.test(s.out)) return {sawGold, sawCue, sawPass, toast};
    if (/PASS THE KEYBOARD/.test(s.out)){ sawPass = true;
      if (!/Press ENTER to continue/.test(s.out)) fail('pass screen wording');
      if (!passHint){ await key('3'); const s2 = await shot(); if (s2.note !== 'Press ENTER to continue.' || !/PASS THE KEYBOARD/.test(s2.out)) fail('pass screen number-key hint: ' + s2.note); passHint = true; }
      await key('Enter'); continue; }
    let i = idx(s, /Race for the golden/); if (i >= 0){ sawGold = true; await key(String(i+1)); continue; }
    if (/WORKBENCH/.test(s.out)){ await key('1'); const s2 = await shot(); if (s2.note){ T.push('   >> ' + s2.note, ''); await key('2'); } continue; }
    i = idx(s, /Hit the head/); if (i >= 0){ const r = await page.evaluate(() => TXT.duel.round); await key(String((r % 5) + 1)); continue; }
    i = idx(s, /Block head/); if (i >= 0){ const r = await page.evaluate(() => TXT.duel.round); await key(String((r % 4) + 1)); continue; }
    i = idx(s, /^\d\) Guard/);
    if (i >= 0){ // duel: guard twice to hit the blocked-move toast once, else strike
      if (!guardTried && (await page.evaluate(() => { const D = TXT.duel; return !!(D && D.f[TXT.mode === 'hot' ? (TXT.passTo ?? 0) : 0].lastGuard); }))){ await key(String(i+1)); s = await shot(); if (/Can't Guard twice/.test(s.note)){ toast = s.note; guardTried = true; T.push('   >> ' + s.note, ''); } continue; }
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
ok('duel to result vs Easy bot'); if (!(await page.evaluate(() => TXT.players[0].club))) fail('player club not crafted');  /* club shows on the card now, not in the duel text */ ok('club crafted at the workbench'); const transcript = T.join('\n');
// HP must be visible on the ape CARDS (text + bar); text bars on the result screen are optional (Architect may drop the duplicate).
for (const c of ['#me', '#op']){ const h = await page.evaluate(sel => { const e = document.querySelector(sel); return e && {txt: e.textContent, bar: !!e.querySelector('.hp i'), vis: !!e.offsetParent}; }, c);
  if (!h || !h.vis || !/\d+\s*\/\s*\d+\s*HP/.test(h.txt) || !h.bar) fail(`HP not visible on ${c} card at the result: ${JSON.stringify(h)}`); }
ok(`HP shown on both ape cards (text + bar)${/\[#+-*\]/.test(s.out) ? '; result screen also draws text HP bars' : '; result screen has no text HP bars (allowed)'}`);
s = await shot(); await key(String(idx(s, /Rematch/) + 1)); s = await shot(); if (!/GATHER/i.test(s.out)) fail('rematch'); ok('rematch starts a new gather');
// hot seat with Hard toggle check
await page.goto(base + 'text/'); s = await shot(); await key(String(idx(s, /switch to Hard/) + 1)); s = await shot(); if (!/Bot level: HARD/.test(s.out)) fail('hard toggle'); ok('Easy/Hard toggle');
await key(String(idx(s, /2 players/) + 1)); await key('2'); await key('4'); T = [];
r = await playOne('hot'); if (!r.sawPass) fail('no pass screen'); ok('hot-seat game with pass-the-keyboard screen');
s = await shot(); if (!/Rematches this session: 0/.test(s.out)) fail('session count'); ok('session rematch count shown');
if (await page.$('canvas, img, svg')) fail('graphics element found'); ok('no canvas/img/svg in DOM');
if (errs.length) fail('console errors: ' + errs.join(' | ')); ok('no console errors');

// ---- v2 fixes: fixed keys, inline reasons, capitalised zone prompts ----
{ const all = transcript;
  if (!/^   9\) Race for the golden fruit$/m.test(all)) fail('race not on key 9');
  for (const [k, re] of [[1, /Shake a fruit bush/], [2, /Chop a tree/], [4, /Catch your breath/], [5, /Finish gathering now/]]){
    const keys = new Set([...all.matchAll(new RegExp('^   (\\d)\\) ' + re.source, 'gm'))].map(m => +m[1])); if (keys.size !== 1 || !keys.has(k)) fail(`gather key for ${re} shifted: ${[...keys]}`); }
  ok('gather keys fixed: 1 bush, 2 tree, 4 rest, 5 finish, 9 golden race');
  if (!/^   \d\) Eat fruit \(full HP\)$/m.test(all)) fail('greyed Eat reason'); if (!/^   \d\) Guard \(not twice in a row\)$/m.test(all)) fail('greyed Guard reason');
  ok('greyed moves show reasons inline: "Eat fruit (full HP)", "Guard (not twice in a row)"');
  if (!passHint) fail('pass hint not tested'); ok('pass screen: "Press ENTER to continue", number key shows the hint'); }
// canopy hidden for non-Vinny, shown for Vinny
for (const [k, want] of [['1', true], ['2', false]]){ await page.goto(base + 'text/'); await key('1'); await key(k); s = await shot();
  if (/canopy/i.test(s.menu.join('\n')) !== want) fail('canopy visibility for ape key ' + k); }
ok('Climb the canopy shown only for Vinny');
// ---- new in v2 ----
async function checkResult(label){
  s = await shot(); const code = (s.out.match(/REPLAY CODE: (\S+)/) || [])[1]; if (!code) fail(label + ': no replay code');
  const m = s.out.match(/DECIDED BY: Round (\d+): (.+)/); if (!m) fail(label + ': no decisive line');
  const last = +s.out.match(/(\d+) rounds\./)[1], ko = /knocked .* out/.test(m[2]); if (ko && +m[1] !== last) fail('KO decisive round mismatch');
  if (!s.out.includes('Last round: Round ' + last + ':')) fail('last-round text wrong');
  ok(`${label}: decisive line "${m[0]}"`); return {code, out:s.out};
}
// rules screen, generated
await page.goto(base + 'text/'); await key('?'); s = await shot();
for (const [id, st] of Object.entries(R.STATS)) if (!new RegExp(`\\b${st.hp}\\b`).test(s.out)) fail('rules missing HP of ' + id);
{ const mk = () => ({p:{ape:R.STATS.vinny, fruit:5, club:false}, hp:50, max:110, lastGuard:false}); const A = mk(), B = mk(); R.resolve(A, B, 'strike', 'feint');
  const base = R.dmg({ape:R.STATS.vinny, club:false}, {ape:R.STATS.vinny}), sf = 50 - B.hp, line = `Strike vs Feint: base ${base} + feint-catch bonus ${sf - base} = ${sf}.`;
  if (!s.out.includes(line)) fail('rules: strike/feint bonus line missing: ' + line); ok('rules explain: ' + line); }
if (!/Guard twice in a row: not allowed/.test(s.out) || !s.out.includes(`heals ${R.EAT_HEAL} HP`)) fail('rules text'); ok('rules screen built from rules.js'); const rulesText = s.out;
await key('1'); s = await shot(); if (!/Play vs bot/.test(s.all)) fail('rules back');
// vs bot game: read line, decisive, replay
await key('1'); await key('3'); T = []; reads = 0; await playOne('bot2'); if (!reads) fail('no read line'); ok(`opponent read line checked against played moves (${reads} screens)`);
const r1 = await checkResult('4-move'); const readSample = (T.join('\n').match(/^READ: .*$/m) || [''])[0];
s = await shot(); await key(String(idx(s, /Replay code/) + 1)); s = await shot(); if (!/IDENTICAL to the original game/.test(s.out)) fail('replay not identical'); ok('replay code: identical result');
const hp = o => o.match(/\d+\/\d+ HP/g).join(' ');
if (hp(s.out) !== hp(r1.out)) fail('replay HP differ');
await page.goto(base + 'text/?replay=' + r1.code); s = await shot(); if (hp(s.out) !== hp(r1.out) || !/REPLAYED FROM CODE/.test(s.out)) fail('?replay URL'); ok('?replay= URL reproduces the game');
if (!/^T\d+-/.test(r1.code)) fail('code has no version prefix'); await page.goto(base + 'text/?replay=' + r1.code.replace(/^T\d+-/, ''));
s = await shot(); if (!/Made with an older version of the game/.test(s.out)) fail('old code message'); ok('version prefix ' + r1.code.split('-')[0] + '; an old code says "Made with an older version of the game"');
// zone preview vs Easy and Hard, plus hot seat
await page.goto(base + 'text/?duel=zones'); s = await shot(); if (!/Preview: zone duel \(not decided\)/.test(s.out)) fail('zone label'); ok('zone preview label');
await key('1'); await key('2'); T = []; reads = 0; await playOne('zones-easy'); const rz = await checkResult('zones Easy'); const zoneT = T.join('\n');
if (!/blocked \w+\+\w+ \d of \d/.test(zoneT)) fail('zone read line'); ok('zone read line');
if (!/^Where do you HIT\? \(step 1 of 2\)$/m.test(zoneT) || !/^(Hitting the \w+|Eating)\. Which two do you BLOCK\?/m.test(zoneT) || /^[a-z]/m.test(zoneT.split('\n').filter(l => /HIT\?|BLOCK\?/.test(l)).join('\n'))) fail('zone prompt capitals'); ok('zone prompts start with a capital');
const bot = (await page.evaluate(() => TXT.duel.f[1].hits)).map(h => h || 'eat').slice(0, 6); if (bot.slice(0,3).join() !== bot.slice(3,6).join()) fail('easy zone bot not a pattern: ' + bot); ok('Easy zone bot repeats: ' + bot.slice(0,3).join(', '));
s = await shot(); await key(String(idx(s, /Replay code/) + 1)); s = await shot(); if (!/IDENTICAL/.test(s.out)) fail('zone replay'); ok('zone replay identical');
await page.goto(base + 'text/?duel=zones'); s = await shot(); await key(String(idx(s, /switch to Hard/) + 1)); await key('1'); await key('4'); await playOne('zones-hard'); await checkResult('zones Hard');
await page.goto(base + 'text/?duel=zones'); await key('2'); await key('1'); await key('5'); await playOne('zones-hot'); await checkResult('zones hot-seat');
// Easy bot skips the golden race in some games (fruit-sum parity), Hard always races
{ const seen = new Set();
  for (const first of ['breath', 'bush']){ await page.goto(base + 'text/'); await key('1'); await key('5');   // 0 or 1 fruit by turn 8
    for (let i = 0; i < 7; i++){ s = await shot(); await key(String(idx(s, new RegExp(i ? 'breath' : first, 'i')) + 1)); }
    s = await shot(); await key(String(idx(s, /breath/i) + 1)); const l = (await page.evaluate(() => TXT.log)).find(x => /^Turn 8:/.test(x)); seen.add(/grabs/.test(l) ? 'races' : 'skips'); T.push(l); }
  if (seen.size !== 2) fail('Easy golden race: only ' + [...seen] + ' | ' + T.slice(-2).join(' / ')); ok('Easy bot: races in one game, skips in another'); }
// shared logic: the zone numbers on screen equal sim/zones-core.js
const ZC = require(path.resolve(here, '../sim/zones-core.js')); if (ZC.blocksFor(Object.keys(ZC.Z5), 2).length !== 4) fail('zones core'); ok('zone core shared with sim (4 adjacent blocks, no wrap)');
// ---- UI pass: real buttons, click + Confirm, cards, log, phone width ----
await page.goto(base + 'text/');
if (await page.$$eval('#menu > *', l => l.some(b => b.tagName !== 'BUTTON'))) fail('menu items are not buttons');
if (await page.isVisible('#confirmRow') || await page.isVisible('#reveal')) fail('Confirm/reveal visible on the menu'); ok('menu screen: no Confirm row or reveal panel');
if (!(await page.$$eval('#menu button .k', l => l.every(k => /^\[\d\]$/.test(k.textContent))))) fail('key not shown on buttons'); ok('every choice is a <button> showing its key, e.g. [1]');
await page.click('#menu button:has-text("Play vs bot")'); await page.click('#menu button:has-text("Vinny")');
if (!/Vinny/.test(await page.textContent('#me')) || !/110 \/ 110 HP/.test(await page.textContent('#me'))) fail('your ape card'); if (!/Zip/.test(await page.textContent("#op"))) fail('opponent card');
if (!/Turn 1 \/ 1[24]/.test(await page.textContent('#counter'))) fail('turn counter'); ok('ape cards + header turn counter');
await page.click('#menu button:has-text("Chop a tree")'); if (!/Turn 2 \/ 1[24]/.test(await page.textContent('#counter'))) fail('click gather'); 
if ((await page.textContent('#log li.new')).indexOf('Turn 1:') !== 0 || (await page.$eval('#log li', e => e.className)).indexOf('new') < 0) fail('newest log line not highlighted on top'); ok('click acts on gather; newest log line highlighted');
await page.click('#menu button:has-text("Climb the canopy")'); await page.click('#menu button:has-text("Climb the canopy")', {force:true});
s = await shot(); if (!/Next one in/.test(s.note) || (await page.getAttribute('#menu button:has-text("Climb the canopy")', 'aria-disabled')) !== 'true') fail('disabled button reason'); ok('disabled button greyed (aria-disabled) with its reason');
await key('5'); await key('2'); if (!(await page.isVisible('#confirmRow'))) fail('confirm row');
if ((await page.$$eval('#menu.moves button[aria-disabled=true]', l => l.length)) < 1) fail('greyed Eat at full HP');
await page.click('#menu.moves button:has-text("Strike")'); if ((await page.getAttribute('#menu button:has-text("Strike")', 'aria-pressed')) !== 'true' || await page.isDisabled('#confirm')) fail('select move');
const before = await page.evaluate(() => TXT.duel.round); await page.click('#confirm'); if (await page.evaluate(() => TXT.duel.round) !== before + 1) fail('confirm');
if (!(await page.isVisible('#reveal')) || !/Round 1:/.test(await page.textContent('#reveal'))) fail('reveal panel'); ok('duel: 4 move buttons, select + Confirm, round-reveal panel');
const w = await page.$eval('#me .hp i', e => e.style.width); if (!/%$/.test(w)) fail('styled HP bar'); ok('styled HP bar in the card (' + w + ')');
await page.goto(base + 'text/?duel=zones'); await key('1'); await key('1'); await key('5'); await key('2');
if ((await page.$$eval('#menu.hit button[data-z]', l => l.map(b => b.dataset.z).join())) !== 'head,chest,belly,waist,legs') fail('zone body chart');
await page.click('#menu button[data-z=chest]'); await page.click('#confirm'); if ((await page.$$eval('#menu.block button', l => l.length)) !== 5) fail('block pair buttons'); ok('zones: HIT body chart + BLOCK pair buttons with Confirm');
for (const W of [360, 390, 1280]){ await page.setViewportSize({width:W, height:800}); await page.goto(base + 'text/'); await key('1'); await key('1'); await key('5'); await key('2');
  const m = await page.evaluate(() => ({sw: document.documentElement.scrollWidth, minH: Math.min(...[...document.querySelectorAll('#menu button,#confirm')].filter(b => b.offsetParent).map(b => b.getBoundingClientRect().height))}));
  if (m.sw > W) fail(`horizontal overflow at ${W}px: ${m.sw}`); if (m.minH < 40) fail(`tap target too small at ${W}px: ${m.minH}`); ok(`${W}px wide: no sideways scroll, smallest tap target ${Math.round(m.minH)}px`); }
await page.setViewportSize({width:1280, height:900});
// style sheet rules: gold only from the turn 7 cue; pass screen hides the board; reduced motion; system fonts; no outside requests
const goldUsed = () => page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.offsetParent && ['color', 'borderTopColor', 'backgroundColor'].some(p => getComputedStyle(e)[p] === 'rgb(232, 184, 74)')).map(e => e.id || e.className || e.tagName));
await page.goto(base + 'text/'); let gU = await goldUsed(); if (gU.length) fail('gold on the menu: ' + gU);
await key('1'); await key('1'); for (let i = 0; i < 5; i++) await key('4'); gU = await goldUsed(); if (gU.length) fail('gold before the turn 7 cue: ' + gU);
await key('4'); gU = await goldUsed(); if (!gU.includes('cue')) fail('turn 7 cue not gold: ' + gU);
await key('4'); s = await shot(); if (!(await goldUsed()).includes('gold')) fail('turn 8 race button not gold'); ok('gold: none before turn 7, the cue on 7, the race button on 8');
const reqs = []; page.on('request', r => { if (!r.url().startsWith(base.replace(/\/$/, ''))) reqs.push(r.url()); });
const fonts = await page.evaluate(() => [...new Set([...document.querySelectorAll('body *')].map(e => getComputedStyle(e).fontFamily))]);
if (fonts.some(f => !/system-ui|ui-monospace|Courier|monospace/.test(f))) fail('non-system font: ' + fonts);
await page.goto(base + 'text/'); await key('2'); await key('1'); await key('2'); await key('5'); await key('2'); await key('2'); await key('Enter'); await key('1');
if (!(await page.evaluate(() => document.body.classList.contains('passing'))) || await page.isVisible('#me') || await page.isVisible('#log')) fail('pass screen shows the board'); ok('pass screen hides the board (cards, log)');
if (reqs.length) fail('outside requests: ' + reqs); ok('system fonts only, no outside requests');
await page.emulateMedia({reducedMotion:'reduce'}); const rm = await page.evaluate(() => { const i = document.querySelector('.hp i'), c = document.querySelector('.card'); return [getComputedStyle(i).transitionDuration, getComputedStyle(c).animationName]; });
if (rm[0] !== '0s' || rm[1] !== 'none') fail('reduced motion: ' + rm); await page.emulateMedia({reducedMotion:null}); ok('reduced motion turns transitions and animations off');
if (await page.$('canvas, img, svg')) fail('graphics element found (UI)');
if (errs.length) fail('console errors: ' + errs.join(' | ')); ok('no console errors (v2)');
if (tfile) fs.writeFileSync(tfile.replace('.txt', '-samples.txt'), ['RULES SCREEN', rulesText, '', 'READ LINE', readSample, '', 'RESULT (4 moves)', r1.out, '', 'ZONE GAME', zoneT.split('\n').filter(l => /^Round|^READ/.test(l)).filter((l, i, a) => a.indexOf(l) === i).join('\n'), '', 'ZONE RESULT', rz.out].join('\n'));
if (tfile) fs.writeFileSync(tfile, transcript); await browser.close(); console.log('SMOKE PASS');
