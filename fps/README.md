# FLOP OPS

**A legitimate modern military shooter trapped inside an increasingly stupid universe.**

A browser FPS about Doug, an absurdly capable special-operations soldier, and the Extra Special Forces (ESF), who are sent on dangerous missions with ridiculous plans and maximum confidence. The presentation is completely serious. The plans are not.

Desktop, mouse and keyboard. One click to deploy. Runs fully offline.

## Mission 01: OPERATION TOTAL CONFIDENCE

ESF has been ordered to hold the town square of a war-torn border town "for as long as it takes". Command has estimated this at "about a wave". Waves of hostiles escalate until Doug goes down.

- Kills score `HOSTILE NEUTRALISED +100`, headshots `HEADSHOT. NOTED. +150`, all through a streak multiplier that climbs to ×9 and only fully resets when Doug goes down.
- Clear a wave, take the wave bonus, and listen to Command revise its estimate during a four-second breather.
- When `DOUG IS DOWN`, you may `REQUEST ONE (1) MORE CHANCE` once per run. After that, Command files an after-action report.
- Command talks to you over the radio throughout. Doug replies in four words or fewer.
- Your best score and best wave are kept locally in the browser.

## Loadouts

| Loadout | Kit | Command's notes |
|---|---|---|
| **ALPHA · STANDARD ISSUE** | Assault rifle | Accurate at range. Command's first choice, and also its second. |
| **BRAVO · ROOM SERVICE** | Submachine gun | High rate of fire. Recommended for rooms, corridors and disagreements. |
| **CHARLIE · CONTINGENCY** | Sidearm, double plating | One pistol, twice the armour. Command calls it a contingency. Doug calls it a pistol. |

## Controls

| Input | Action |
|---|---|
| `W A S D` / arrows | Move |
| Mouse | Look · LMB fire · RMB aim |
| `Z` / `X` | Turn (trackpad-friendly) |
| `Shift` | Sprint |
| `Space` | Jump |
| `Ctrl` / `C` | Crouch |
| `B` | Prone |
| `Q` / `E` | Lean |
| `R` | Reload |
| `F` | Use |
| `G` | Grenade |
| `1` `2` `Tab` | Swap weapon |
| `Esc` | Pause / release cursor |

On the title screen, `1`–`3` deploys with a loadout directly.

## Under the hood

A three.js FPS in which every asset is procedural: geometry, textures, audio and animation are all generated at load time, and the only runtime dependency is `three`. The only binary assets are the two UI typefaces (Barlow Condensed and Inter, SIL Open Font License, self-hosted in `src/ui/fonts/`).

- `src/game/`: the wave loop, scoring, the continue flow and local best-score persistence. No network code.
- `src/ui/`: the HUD, the title and loadout screens, the death and report screens, and Command's radio subtitles (`src/ui/radio.js`).
- `docs/FLOP_OPS.md`: the creative bible. `ARCHITECTURE.md`: the engine contract every subsystem works under.

## Development

```bash
npm install
npm run dev      # vite dev server on :5173
npm run build    # production build → dist/
npm run shot     # deterministic captures (tools/capture.mjs --list for shots)
```

Debug API in the console: `window.FLOP` (`state`, `start('alpha'|'bravo'|'charlie')`, `skipToWave(n)`, `god(true)`, `killAll()`, `continueRun()`, `restart()`).

## Credits

Flop Ops is built on **Nerd of Duty**, which is itself a fork of **[Claude of Duty](https://github.com/mshumer/Claude-of-Duty)** by mshumer. Both are released under the MIT License, which this project keeps; see `LICENSE`.

## License

MIT. See `LICENSE`. The bundled typefaces are under the SIL Open Font License 1.1; see `src/ui/fonts/`.
