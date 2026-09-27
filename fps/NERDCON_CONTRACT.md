# NERD OF DUTY — Conversion Contract (v1)

This repo is a fork of mshumer/Claude-of-Duty (MIT): a first-person tactical shooter,
~63k lines, 11 subsystems, everything procedural. We are converting it into
**NERD OF DUTY** — the official Fintech NerdCon game — WITHOUT losing what makes it
read as a real FPS. This file + `ARCHITECTURE.md` are law for every agent.

## Prime directives

1. **Do not degrade the FPS.** The weapon feel, movement, AI combat, world density and
   render pipeline are the product. You are re-theming and adding a game loop, not
   simplifying. If a change would make the game look or feel cheaper, don't make it.
2. **Respect the engine contract** (`ARCHITECTURE.md`): you own YOUR directory only.
   Cross-subsystem communication is ONLY `ctx.get(id)` / `ctx.events`. Never import
   another subsystem's modules. No new npm dependencies. No files outside your ownership.
3. **`npm run build` must pass when you finish.** Run it. If you broke it, fix it.
4. **Verify visually.** A dev server runs at `http://127.0.0.1:5173`. Use the repo's own
   harness: `node tools/capture.mjs --shot=<name> --out=shots/<yourname>-<n>.png`
   (shots listed in `src/dev/shots.js`; `--list` shows them). Read your PNGs. Max ~4
   captures per agent — they're expensive. Do NOT run git commands. Do NOT npm install.
5. **Preserve determinism hooks**: `window.__READY__`, the `?capture=1&lockstep=1`
   flow, and existing shots must keep working.

## Brand: Arcade Terminal (exact values)

Palette (HUD, signage, accents — the WORLD keeps its realistic materials):
- Void Black `#050505` · Panel Dark `#0D0D0D` · NerdCon Blue `#3568FF`
- Cyan Pulse `#00E5FF` (interactive/positive-neutral) · XP Green `#39FF14` (gains ONLY)
- Boss Magenta `#FF2D78` (threat/damage ONLY) · Loot Gold `#FFD700` (score/Ledger/value)
- Terminal White `#F0F0F0` · Fog Gray `#888888`
Rules: threat is always magenta-family, never red-orange. Gains always green/gold.

Typography (HUD/DOM only): **JetBrains Mono** (add Google Fonts link in index.html,
weights 400/700/800, display=swap; fallback "SF Mono", ui-monospace). Uppercase,
letterspaced labels. **Press Start 2P** ONLY for the title-screen wordmark accent and
"INSERT COIN" moments — max 2 elements per screen. Tabular numerals on all counters.
Keep the existing HUD's condensed-military *layout* discipline — we re-skin colors,
fonts and copy, not the information architecture.

## Copy bible (use these EXACT strings)

- Game title: `NERD OF DUTY` · sub: `A FINTECH NERDCON GAME` · footer: `NOV 19–20 · SAN DIEGO · FINTECHNERDCON.COM`
- Mode name: `HOLD THE LEDGER`
- Enemy faction: `LEGACY CORE SECURITY` (private security of Legacy Core Banking, est. 1959)
  - vanguard variant → `ENFORCER` · irregular → `CONSULTANT` · breacher → `AUDITOR`
- Enemy callsigns (killfeed): `COBOL`, `BATCH`, `FAX`, `MAINFRAME`, `T+2`, `MT-103`,
  `MICR`, `IVR`, `PDF_STMT`, `LEDGERLOCK`
- Weapons: M4A1 → `RULES ENGINE MK4` · MPX-9 → `VELOCITY-9` · P-19 → `SIDECAR`
- Jobs (loadout select): `FRAUD ANALYST` (rifle) · `PAYMENTS ENGINEER` (SMG) · `COMPLIANCE OFFICER` (pistol + max armour)
- Score feed: kill `CARD DECLINED +100` · headshot `SAR FILED +150` · double kill
  `BATCH PROCESSED` · wave clear `WAVE {n} SETTLED +{bonus}` · multiplier `×{m}`
- Death screen: `INSUFFICIENT FUNDS` / button `FILE A DISPUTE — CONTINUE` (once per run) /
  ghost button `ACCEPT THE LOSS`
- Game over: `RUN SETTLED` (or `NEW BEST — YOU MOVED THE MARKET`) · restart `RUN IT BACK`
- Attract hint: `CREDIT 1 · CLICK TO DEPLOY`

## Game mode spec: HOLD THE LEDGER (wave holdout)

Elimination waves in the existing map. THE LEDGER (gold set piece, plaza) is the
narrative anchor — **v1 it is scenery + spawn anchor, NOT a damageable objective.**
Do not build Ledger HP. Scope discipline: waves + score + death/continue/over.

- Wave n: `enemies = min(3 + ceil(n*1.5), 14)` concurrent cap 8; difficulty scales via
  ai aggression/accuracy knobs (AI agent defines; game passes `intensity = min(1, n/10)`).
- Wave clear → 4s breather: banner + `bonus = 250*n` added to score (×mult).
- Score: kill +100, headshot +150, ×mult. Mult: +1 per (3+mult) kills, cap ×9;
  decays one step per 10s without a kill; **drops to ×1 only when the player dies.**
  (FPS chip damage must NOT reset the streak — that rule is for arcade games.)
- Player death: slow-mo beat → `INSUFFICIENT FUNDS` → one continue per run (respawn at
  plaza, current wave restarts, keep score, mult ×1) → else game over card
  (score/wave/kills/accuracy/best + delta-to-best line) → RUN IT BACK.
- Best score + best wave in localStorage (ALL localStorage access try/catch wrapped).

## Event interface (the glue — exact names)

New subsystem `src/game/` (id `game`) owns the loop. Events on `ctx.events`:
- `game:state {state}` — 'attract' | 'play' | 'down' | 'over'
- `game:wave {wave, count}` · `game:waveClear {wave, bonus}`
- `game:score {score, delta, mult}` · `game:mult {mult}`
- `game:over {score, wave, kills, accuracy, best, bestWave, newBest}`
- `game:continueOffer {}` (player died, continue available)
- UI → game: `ui:startRun {job}` · `ui:continue` · `ui:restart`
- game → ai (direct call): `ctx.get('ai').spawnWave({count, intensity, waveIndex})`
  — AI agent implements this; returns number actually spawned. AI keeps emitting its
  existing per-kill/death events; game counts kills from those (find the existing
  event names in the code and use them — do not invent parallel ones).
- Debug API (game agent): `window.NOD = { state (getter: {mode, wave, score, mult,
  kills, accuracy, best, aliveEnemies}), start(job), continueRun(), restart(),
  skipToWave(n), god(bool), killAll() }` — killAll() kills all live AI (verifiers
  use it to test wave flow without aiming skill).
- `ai:bark {kind, agent}` — ai → audio; kinds are the BARKS ids in `src/audio/vox.js`.
- `boot:progress {phase, pct, detail?, ms?}` (pct monotonic 0..1) and
  `boot:done {totalMs}` — engine → boot/loading UI.

## Ownership map (HARD boundaries)

| Agent | Owns | Mission |
|---|---|---|
| UI | `src/ui/**`, `index.html` | Arcade Terminal reskin + all screens + copy |
| GAME | `src/game/**` (new), + registration edit in `src/main.js` ONLY | The loop |
| AI | `src/ai/**` | spawnWave API, wave scaling, LEGACY faction retexture, callsigns |
| WORLD | `src/world/**` | Fintech signage/banners, NerdCon dressing, Ledger set piece |
| WEAPONS | `src/weapons/**` | Renames + subtle brand accents |
| LOOK (phase 2, solo) | `src/sky/**`, `src/render/**`, `src/materials/**` | Dusk-neon grade |
| AUDIO | `src/audio/**` | Wave stingers, PA announcer, faction bark treatment, conference-floor ambience |

Nobody touches `src/core/`, `src/physics/`, `src/player/`, `src/fx/`,
`tools/` (except reading), `package.json`, `vite.config.js`. The old `TDM 10:00`
match bar is replaced by wave/score HUD (UI agent) and its decorative state ignored
(GAME agent) — coordinate through the events above, not through each other's files.

## Loop quality bar (from arcade doctrine — testable)

- Time-to-first-action < 8s from page load (one click → deployed into wave 1).
- Numbers visibly flow: kill feed + score ticks + mult pulse. Static numbers = defect.
- Death must be articulable (what killed me) and restart ≤ 2 inputs.
- Wave banner + settle bonus = the breather beat. Escalation felt each wave.
- Game over always shows delta-to-best (near-miss framing) + `COMPLIANCE OFFICER —
  REACH WAVE 8 TO PREVIEW` style earned tease (UI agent: static tease line is fine v1).

## Attribution

Keep `LICENSE` (MIT, mshumer). README rewrite happens later — do not touch README.
