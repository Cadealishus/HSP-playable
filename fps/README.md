# ASHFALL

A first-person shooter built with three.js, Rapier and a lot of stubbornness.

```bash
npm install
npm run dev          # http://127.0.0.1:5173 — click to play
npm run build        # static build in dist/
node tools/shoot.mjs --all --out shots/review   # headless screenshots of every registered shot
```

Controls: WASD move · Mouse look · LMB fire · RMB aim · Shift sprint · C/Ctrl crouch (slide while
sprinting) · Space jump · R reload · G grenade · V melee · 1/2 switch weapon · Esc pause.

- `docs/ART_DIRECTION.md`: the visual target
- `docs/CONTRACTS.md`: how the systems fit together (read this before editing anything)
- `docs/credits/`: third-party asset credits and licences
