# ASHFALL — System contracts

The game is a set of systems wired together in `src/main.js`. Each system is a plain object
`{ name, init(game), postInit(game), update(dt, game), lateUpdate(dt, game), resize(w, h, game) }`
registered with `game.add()`, which also exposes it as `game[name]` (`game.render`,
`game.world`, `game.player`, …). Init and update run in registration order:

`render → materials → audio → world → player → weapons → combat → fx → ai → ui`

Frame: `input.poll → update (all) → physics.step → lateUpdate (all) → render.renderFrame → input.endFrame`.

Systems talk through **events** (`game.events.on/emit`, catalogue below) and a few **service
methods** (listed per system). Prefer events: they let each system be built independently.

## Ownership

Each area is owned by one agent. Only edit files you own. If you truly need a change in core
(`src/core`, `src/main.js`, `tools/`, `index.html`) keep it minimal and additive and call it out in
your report. Put assets in `public/assets/<area>/` and credits in `docs/credits/<area>.md`.

| Area | Files | Shot prefix |
|---|---|---|
| core (orchestrator) | `src/core/`, `src/main.js`, `tools/`, `index.html`, `docs/*.md` | — |
| render | `src/render/` | `render-` |
| materials | `src/materials/` | `mat-` |
| world | `src/world/` | `world-` |
| player | `src/player/` | `player-` |
| weapons | `src/weapons/` | `weapon-` |
| combat + fx | `src/combat/`, `src/fx/` | `fx-` |
| ai | `src/ai/` | `ai-` |
| ui + audio | `src/ui/`, `src/audio/` | `ui-` |

## Core

- `game.scene`, `game.camera` (world camera, `rotation.order = 'YXZ'`), `game.settings`
  (`fov` CoD-style horizontal-at-4:3, `sensitivity`, `adsSensitivity`, `quality`, `masterVolume`),
  `game.verticalFov(fov)`.
- `game.viewmodel = { scene, camera, root, fov }` — separate scene for first-person weapon/arms.
  Children of `root` are in **camera-local space** (x right, y up, −z forward, metres). The render
  system keeps `root` and `camera` rotated like the world camera so world-space lights match.
- `game.physics` — Rapier wrapper (`src/core/Physics.js`): `world`, `RAPIER`, `raycast(origin, dir,
  maxDist, { exclude, filterGroups, predicate }) → { point, normal, distance, collider, data } | null`,
  `addStaticMesh(object, data)`, `addStaticBox(center, half, quat, data)`, `setData/getData(collider)`,
  `onStep(fn)`, `removeCollider`, `removeBody`. Layers: `LAYER.WORLD | PROP | PLAYER | ENEMY | HITBOX |
  DEBRIS | TRIGGER`, `groups(member, filter)`. Collider data convention:
  `{ type: 'world'|'prop'|'player'|'enemy', surface, entity?, part? }`.
- `game.input` — `down/pressed/released(action)`, `lookDelta {x,y}` (pixels), `wheel`, `locked`,
  `requestLock()`, `setVirtual(actions, look)`. Actions: see `BINDINGS` in `src/core/Input.js`.
- `game.viewmodel.sharpLayer` (= 2): viewmodel meshes on this layer (optic reticles) are drawn after the
  ADS weapon blur, so they stay sharp. The viewmodel camera has the layer enabled.
- `game.cameraOverride`: when set to `fn(camera, dt, game)`, the player system stops driving the camera
  and calls it instead (menu flyover, cinematics). `null` hands control back.
- `game.run = { active, time, kills, headshots, score, streak, bestStreak, wave, difficulty }`: wave-survival
  run state. UI starts/ends runs and tallies score; the AI director writes `wave`; core advances `time`.
- `game.random()` — seeded RNG. In harness mode `Math.random` is seeded too.
- `game.time = { now, dt, frame, scale }`, `game.paused` (systems with `alwaysUpdate: true` still update).
- `game.registerShot(name, { description, setup(game), settle = 0.5, renderFrames = 8 })` — named
  screenshot setups. See **Harness**.

**Surfaces** (used for impacts, decals, footsteps, audio): `concrete, plaster, brick, asphalt, dirt,
gravel, sand, wood, metal, tile, glass, fabric, rubber, plastic, flesh, water`.

## render (`src/render/`)

Owns renderer, post-processing, sky, sun, ambient/IBL, fog/atmosphere, shadows, and compositing the
viewmodel (world → AO → viewmodel on top → bloom / tonemap / grade / AA).
- `renderer`, `sunDirection` (unit Vector3 pointing **towards** the sun), `sun` (primary light),
  `envMap` (PMREM texture, also `scene.environment`).
- `prepare(object3D)` — call after adding runtime objects whose materials need render-specific setup
  (e.g. cascaded shadow maps). Cheap to call; idempotent.
- `renderFrame(dt, game)`, `resize(w, h)`, `setQuality(q)`.
- `postInit` may traverse the scene to set up all materials created by other systems.

## materials (`src/materials/`)

- `get(name, opts?) → THREE.Material` (cached; `material.userData.surface` set). Names that must exist:
  `concrete, concrete_dirty, plaster, plaster_painted, brick, asphalt, dirt, gravel, sand, wood,
  wood_painted, metal_painted, metal_rusty, metal_corrugated, metal_steel, tiles, roof_tiles,
  fabric_sandbag, fabric_tarp, glass, rubber, car_paint, plastic`. More may be added.
- `surfaceOf(material) → surface string`.
- **UV convention: world geometry has UVs in metres** (1 UV unit = 1 m). The library sets texture
  repeat so each material tiles at a physically sensible size.

## world (`src/world/`)

Builds the level: terrain, buildings, props, set dressing, skyline, colliders.
- `spawns.player: [{ pos: Vector3 (feet), yaw: degrees }]`, `spawns.enemies: [{ pos, yaw }]`
- `coverPoints: [{ pos: Vector3, normal: Vector3 (points away from the cover object), height: 'low'|'high' }]`
- `bounds: Box3` (playable area). Optional `navGraph: { nodes: [{ pos }], edges: [[i, j]] }`.
- `objective = { name, center: Vector3, radius }`: the central square the player holds.
- `footprints: [{ x, z, w, d, rot, height }]`: building footprints for the minimap and menu map preview.
- Static colliders via `physics.addStaticMesh/addStaticBox` with `{ type: 'world', surface }`.
  Dynamic props are rigid bodies on `LAYER.PROP` with `{ type: 'prop', surface }`.

## player (`src/player/`)

Rapier kinematic character controller + camera. **Owns `game.camera` transform and FOV.**
- `position` (feet), `eye` (getter), `velocity`, `yaw`, `pitch` (radians), `health`, `maxHealth`,
  `alive`, `body`, `collider`.
- `state = { grounded, sprinting, tacticalSprint, crouching, sliding, moving }`
- `motion = { bobPhase, bobAmount (0..1), speed01, landImpulse }` — read by weapons to sync viewmodel bob.
- `setPose({ pos: [x,y,z] | Vector3, yaw: deg, pitch: deg })`
- `applyRecoil(pitchDeg, yawDeg)` — weapon camera kick; `addShake(intensity, duration)`.
- `takeDamage(amount, { direction, source })` — emits `player:damaged` / `player:died`.
- Reads `game.weapons.adsAmount` and `game.weapons.current.adsZoom` for FOV and ADS move speed.
- Honours `game.cameraOverride`. On `run:start`: full health, respawn at `spawns.player[0]`. While
  `game.run.active`, death does not auto-respawn (the UI shows the run summary); outside a run
  (dev/harness) auto-respawn after ~3 s is fine.

## weapons (`src/weapons/`)

Weapon logic (fire modes, ammo, reload, spread, recoil patterns) + first-person viewmodel (model,
arms, animation, muzzle flash on the viewmodel).
- `adsAmount` (0..1), `current` (`{ id, name, magSize, mag, reserve, rpm, damage, headMult, range,
  adsZoom, fireMode }`), `reloading`, `inventory`.
- Reads `game.player.state` / `game.player.motion` for sprint/bob poses.

## combat (`src/combat/`) and fx (`src/fx/`)

Combat listens to `weapon:fire` / `enemy:fire`, does ballistics (raycasts, falloff, penetration),
emits `hit`, and calls `entity.takeDamage(amount, info)` on anything that has it. Handles
`explosion` damage. FX listens to `hit`, `weapon:fire`, `weapon:eject`, `enemy:fire`, `explosion`
and draws impacts, decals, tracers, world-space muzzle light, shell casings, smoke, blood.
- `game.fx.impact({ point, normal, surface })`, `explosion(position, radius)`, `tracer(from, to)`,
  `decal(point, normal, type, object?)`.

## ai (`src/ai/`)

- `director = { wave, state: 'idle'|'active'|'intermission', hostilesAlive, hostilesRemaining, nextWaveIn }`:
  the wave director. Starts wave 1 on `run:start`, stops and clears enemies on `run:end`.
- `enemies: Enemy[]` — each `{ object, position, alive, health, takeDamage(amount, info) }`.
- Hitboxes: colliders on `LAYER.HITBOX` with data `{ type: 'enemy', entity, part: 'head'|'torso'|'arm'|'leg', surface: 'flesh' }`
  that follow the skeleton. Movement capsules on `LAYER.ENEMY`.
- Model: `public/assets/models/Soldier.glb` (Mixamo rig, clips `Idle, Walk, Run, TPose`).

## audio (`src/audio/`) and ui (`src/ui/`)

Audio listens to events and synthesises/plays sound. `unlock()` (called on the first user gesture),
`play(name, { position, volume, pitch })`. UI is HTML/CSS in `#ui-root`: main menu, pause, settings,
HUD (ammo, health vignette, hitmarkers, damage direction, kill feed, compass, crosshair).

## Events

Vectors are `THREE.Vector3`; clone them if you keep them.

| Event | Payload |
|---|---|
| `game:ready` | `{}` |
| `game:pause` | `{ paused }` |
| `weapon:fire` | `{ weapon, origin, direction, muzzleWorld, ads, source: 'player' }` |
| `weapon:eject` | `{ weapon, position, velocity, type: 'rifle'\|'pistol' }` (world space) |
| `weapon:dryfire` | `{ weapon }` |
| `weapon:reload` | `{ weapon, phase: 'start'\|'mag_out'\|'mag_in'\|'bolt'\|'end', empty }` |
| `weapon:switch` | `{ from, to }` |
| `weapon:ads` | `{ on }` |
| `weapon:ammo` | `{ weapon, mag, reserve, magSize }` |
| `weapon:melee` | `{ origin, direction }` |
| `grenade:throw` | `{ position, velocity }` |
| `explosion` | `{ position, radius, damage, source }` |
| `hit` | `{ point, normal, direction, distance, surface, collider, target, part, damage, source, weapon }` |
| `enemy:fire` | `{ enemy, origin, direction, muzzleWorld, weapon }` |
| `enemy:damaged` | `{ enemy, amount, part, point, direction, source }` |
| `enemy:killed` | `{ enemy, headshot, weapon, source, point, direction }` |
| `player:damaged` | `{ amount, health, direction (from player towards attacker), source }` |
| `player:died` / `player:respawn` | `{}` |
| `player:footstep` | `{ surface, position, speed01, sprint, crouch, foot: 'L'\|'R' }` |
| `player:jump` / `player:land` | `{}` / `{ impactSpeed, surface }` |
| `player:slide` | `{ phase: 'start'\|'end' }` |
| `bullet:nearmiss` | `{ position, direction }` — enemy round passing within ~2 m of the player's head |
| `score` | `{ amount, reason }` |
| `run:start` | `{ difficulty }` (UI, on DEPLOY / REDEPLOY) |
| `run:end` | `{ reason: 'died'\|'quit', time, wave, kills, score }` (UI) |
| `wave:start` | `{ wave, count }` (AI director) |
| `wave:cleared` | `{ wave, nextIn }` (AI director) |

## Harness

Open the game with `?harness` (optionally `&shot=name&quality=ultra&seed=1`) and it boots without
pointer lock or a RAF loop, with seeded randomness, and exposes `window.__fps`:
`shot(name)`, `pose({ pos, yaw, pitch })`, `hold(actions, seconds, look)`, `advance(seconds, renderFrames)`,
`render()`, `stats()`, `listShots()`, `errors`, `game`.

`node tools/shoot.mjs [shots…] [--all] [--list] [--out dir] [--size 1920x1080] [--params k=v&…] [--eval js] [--fresh]`

Shots must be **self-contained**: `setup` sets every piece of state it depends on (pose, weapon state,
enemies, time), because shots run one after another on the same page.
