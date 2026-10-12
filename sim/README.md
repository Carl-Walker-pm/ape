# Going ApeSh!t: balance and skill simulation

`game_sim.mjs` runs the **game's own rules file**, `../play/rules.js` (the same file the browser loads), so the sim and the prototype cannot drift apart. Only the bots' decisions live in the sim. The rules have no random rolls; the only randomness is in the bots' choices, from a seeded generator, so every run reproduces exactly.

## Run it
Needs Node 18+ and nothing else (no install step).

```sh
node sim/game_sim.mjs --seed 42                    # balance (1,000/pair) + skill test (10,000/opponent) + fruit check
node sim/game_sim.mjs --only balance --pairs 10000 --seed 7
node sim/game_sim.mjs --only skill --skill 10000
node sim/game_sim.mjs --only fruit
```

Options: `--seed`, `--pairs` (matches per ape pair), `--skill` (matches per skill-test opponent), `--only balance|skill|fruit`, `--rules path/to/rules.js`, `--hp vinny=110,...` and `--stat moe.spd=3.2` (what-if tuning without editing the game).

## What it checks
- **Ape balance:** every ape vs every other ape, with the full 90-second gathering phase on the real arena (node respawns, Vinny-only canopies, golden fruit at 0:30 left (60 s in)), crafting and the duel, seats alternated, bots drawn from aggressive / defensive / gatherer / mixed. Target 45-55% for every pair.
- **Skill test:** a "smart" bot (plans the club, models the opponent's move frequencies) vs random, aggressive, defensive, gatherer, mixed and the in-game bot. Target 65% or more.
- **Does fruit matter:** the smart bot with 0 / 3 / 6 fruit (and the golden fruit) against the same opponents.

## Results
- `run-game.txt`: seed 42, the full default run.
- `run-balance-10k.txt`: 10,000 matches per pair for seeds 42, 7 and 1234, plus a diagnostic run. (Its header names `../mvp/rules.js`: it was run from the working copy, which is byte-identical to `play/rules.js`.)

All stats, bots and targets are team proposals for the Nov 18 fun test, not final design.

## Bot difficulty in the game
The prototype's vs-bot mode has **Easy** (default for testers: the bot walks and gathers at 55% speed) and **Hard** (full speed). The difficulty lives only in `play/game.js`; the sim always uses the full-speed rules from `play/rules.js`, so the bot-vs-bot results here are unaffected by it.

## Balance gate (`balance_check.mjs`)
Runs the existing `text_sim.mjs` (text edition, golden catch-up rule) and `zones.mjs` (5 zones, 4 zones, 5 zones + shield) unchanged, 10,000 duels per pair on seeds 42, 7 and 1234, prints each win-% table and exits 1 if any pair is outside 45-55%. Takes about 1 minute.

```sh
node sim/balance_check.mjs                       # full gate
node sim/balance_check.mjs --only text --seeds 42 --pairs 1000   # quick look
sh scripts/install-hooks.sh                      # pre-commit hook: runs the gate when rules files are staged
```
CI: `.github/workflows/balance.yml` runs it on any push/PR touching `play/rules.js`, `text/gather.js` or the sim files.
