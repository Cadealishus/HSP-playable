# FLOP OPS — "Mission ideas???" Short

Procedural hand-inked animation for a vertical (1080×1920, 24 fps) YouTube Short.
Everything is drawn in code on a canvas: tapered brush strokes, hatching, rim-lit
silhouettes, paper grain, and line "boil" re-drawn on twos (12 drawings/sec).

| Clip | Length |
|---|---|
| `renders/scenes/01_plane_raid.mp4` | 2.6s |
| `renders/scenes/02_underground_survival.mp4` | 2.6s |
| `renders/scenes/03_hostage_rescue.mp4` | 2.6s |
| `renders/scenes/04_something_completely_stupid.mp4` | 2.8s |
| `renders/scenes/05_aftermath_worst_idea.mp4` | 1.9s (outro card) |
| `renders/flop_ops_missions_textless.mp4` | 12.5s assembled, no text |
| `renders/flop_ops_missions_with_text.mp4` | 12.5s assembled, reference captions |

Text-safe zones: top ~0–450px and bottom ~1450–1750px are kept darker/calmer.

- Preview live: open `index.html` (buttons switch scenes / toggle captions).
- Re-render: `node render.mjs` (needs Playwright + ffmpeg).
- Stills for iteration: `node stills.mjs <scene> <t1> <t2> ...`.

Scenes live in `scene-*.js`; shared ink engine in `engine.js`; cut order + captions in `cut.js`.
Fonts: Anton (OFL), Permanent Marker (Apache 2.0).
