# FLOP OPS: expansion contract (modes, missions, maps, arsenal, equipment, AI)

Read `ARCHITECTURE.md` (the engine contract) and `docs/FLOP_OPS.md` (the tone) first. This file
defines the NEW shared interfaces so several agents can build in parallel. Every agent codes
against these names. If you must change one, keep the old name working and say so in your report.

Golden rules for this expansion (the user's own words): extend the existing game, never rebuild
it; no placeholders pretending to work: if a button, weapon, mode or objective exists, it must
actually work; playable, working systems over screenshots; keep performance (pooling, no
per-frame allocation, staggered AI).

## 1. Sessions: what the player launched

`src/game/session.js` (owned by MODES) exports `SESSION_KEY = 'flopops.session'` and
`resolveSession(params) → { kind, mode, map, mission, loadout, difficulty }`:

- `kind`: `'mp'` (bot match) | `'survival'` | `'mission'`
- `mode`: `'tdm' | 'dom' | 'hp' | 'sd' | 'ffa' | 'kc' | 'gun' | 'survival'` (null for missions)
- `map`: a map id from `src/world/maps/index.js`
- `mission`: `'underground' | 'flight717' | 'hostage'` (only for kind `'mission'`)
- `loadout`: `{ primary, secondary, lethal: 'frag', tactical: 'flash' }` (weapon ids)
- `difficulty`: `'recruit' | 'regular' | 'hardened' | 'veteran'`

Resolution order: URL params (`?mode=&map=&mission=`), then **localStorage `flopops.session`**,
then defaults (survival on `town`). Menus launch by writing localStorage and calling
`location.reload()` **without** query strings. (The artifact viewer strips query strings, so this
is what makes launching work on the shared link.) A mission forces its own map.
`main.js` resolves the session before the engine boots and puts it on `ctx.config.session`;
`ctx.config.map` stays the map id so existing code keeps working.

## 2. Teams and actors

- Team ids: `'esf'` (Doug's team), `'hostile'`, `'civ'` (non-combatants).
- The player is on `'esf'`. `ai.spawn(variant, position, yaw, opts)` accepts
  `opts.team` (default `'hostile'`), `opts.role`, `opts.weapon`, `opts.skill`.
- Every Agent has `.team`, `.role`, `.alive`, `.position`. ESF bots must look distinct from
  hostiles (different kit colour) and carry an IFF cue (a small blue chevron/name over allies).
- `ai.actors` is every live combatant (agents plus the player proxy) for targeting;
  AI never targets its own team; **friendly fire is off** for bots and the player.
- Kill accounting for modes: `actor:death` carries `{ actor, team, killer, killerTeam, headshot? }`.

## 3. Modes direct bots through orders (the AI executes tactically)

`ai.setOrderProvider(fn)` where `fn(agent) → order | null`, called at the agent's think rate.
An order is `{ kind, pos?, radius?, targetId? }` with kinds:
`'hunt'` (seek and fight the enemy team) · `'capture'` (stand inside a zone until owned) ·
`'defend'` (hold around a zone and use cover near it) · `'attack'` (push toward a position) ·
`'plant'` / `'defuse'` (reach a bomb site, then call `mode.interact(agent)` while alive and
unhurt) · `'escort'` (follow targetId) · `'hold'` (a scripted position, for missions) ·
`'patrol'` (a route of points, `pos` = array).
The AI decides HOW (routes, cover, flanking, suppression). The mode decides WHAT. With no provider,
bots fall back to their own behaviour (survival/hunt).

## 4. Mode framework

`src/game/modes/` (owned by MODES). Each mode is a class with
`static id, static label, static teams, static respawn`, and:
`init(ctx, session)`, `start()`, `update(dt)` (fixed or frame), `orderFor(agent)`,
`hudState() → { scoreEsf, scoreHostile, limit, timeLeft, objectives:[{id,label,owner,progress,contested,active}], round?, message? }`,
`onDeath(e)`, `interact(actor)` (plant/defuse/capture ticks), `isOver() → { winner } | null`.
The existing wave loop becomes the `survival` mode (keep its scoring/continue behaviour).
Modes emit `mode:announce { text, kind }` for Command/announcer lines and `game:over` with
`{ winner, mode, ... }`. Respawns: `mode.respawn(actor)` picks a spawn from
`world.spawns[team]` far from enemies.

## 5. Maps: data every map must provide

Registry entries (`src/world/maps/index.js`) gain `modes: [...]` (which modes the map supports)
and optional `missionOnly: true`. The built map (and so `ctx.get('world')`) exposes:
- `spawns: { esf: [{pos, yaw}], hostile: [{pos, yaw}] }` (at least 6 each for MP maps)
- `objectives: { dom: {A,B,C}, hp: [zone...], sd: {A, B, attackers:'esf'|'hostile'}, survival: zone }`,
  zone = `{ pos: Vector3, radius }` (only the modes it supports)
- `anchors: { name: Vector3 | {pos, yaw} | Box3 }`: named points and trigger volumes for missions
- `lighting: 'day' | 'dusk' | 'night' | 'underground'` (the sky/render set up that preset)
- `bounds`, a nav grid built by AI from physics (as today), `audioAnchors` optional
The existing `town` map is **URBAN PLAZA** (display name) and must support all MP modes plus
survival. The existing `airport` supports MP modes and hosts Flight 717.

## 6. Weapons, loadouts and equipment

`src/weapons/defs.js` is the single registry of weapon definitions (data-driven: class, slot,
damage/falloff, rpm, fire modes, pellets, magazine, reserve, reload/tactical-reload times, ADS
time/zoom/position, recoil pattern, spread, move-speed mult, penetration, projectile{…},
scope{zoom, overlay}, sounds profile, model id). Adding a gun must be adding a def plus a model.
- `weapons.setLoadout({ primary, secondary, lethal, tactical })` and `weapons.loadout`.
- `weapons.getHudState()` returns REAL `lethalCount` / `tacticalCount` (no hard-coded HUD numbers).
- Equipment lives in `src/weapons/equipment.js`: frag (lethal) and flashbang (tactical), thrown with a
  real arc (physics rigid body), cooked by holding, and limited counts refilled by modes/resupply.
- Events: `grenade:throw { kind, owner, position, velocity }`, the existing `explosion { position,
  radius, damage, owner, kind }`, and `flash:detonate { position, radius, owner }`.
- The flash effect on the player is `player.flash(intensity, duration)` (weapons implements it via the
  UI/render hooks it needs); on bots `agent.stun(intensity, duration)` (AI implements it: aim wrecked,
  blind-fire or cover, recover gradually).
- Keys: **G frag, Q flashbang** (lean moves to **Alt + Q / Alt + E**), 1/2/3/Tab weapons, and
  mouse wheel to cycle. Update `src/core/input.js` and the controls screen together.
- AI weapons use the same defs by id through `ai.spawn(..., { weapon })` (stats come from defs;
  the AI carries its own third-person model per class).

## 7. Civilians, hostages, VIPs (missions)

`ai.spawnCivilian(position, yaw, opts)` gives an actor on team `'civ'` with `opts.behavior`:
`'cower'` (crouched, hands up, flinches at shots), `'flee'` (runs to `opts.to`),
`'hostage'` (held by `opts.captor`; stands where placed), `'follow'` (follows `opts.target`, used
for escort, with pathing). Shooting a civ emits `civilian:hit { civ, killer }`; missions decide
the penalty. `ai.spawn(..., { holding: civ })` lets a hostage-taker shield a hostage.

## 8. Missions

`src/game/missions/<id>.js` (owned by MISSIONS), driven by the mode framework as mode
`'mission'`: an ordered objective list with trigger volumes from `world.anchors`, scripted
encounters (squads activated by triggers or alerts, **never spawned in the player's view**),
radio lines through the existing UI radio, fail conditions, and a debrief. Missions ids:
`underground` (map `underground`), `flight717` (map `airport`), `hostage` (map `estate`).

## 9. Online co-op (src/net, owned by NETCODE)

`ctx.get('net')` is inert until the player joins a party (CO-OP ONLINE in the main menu). Inside a
party every run is the shared survival run: one page hosts (runs the mode and all AI exactly as
single player), the others mirror it. What other systems may rely on:
- `net.sessionRole()` → `null` (single player) | `'host'` | `'client'`. GameSystem passes it to the
  mode as `session.netRole`; survival with `netRole === 'client'` spawns nothing (`mode.remote`).
- `net.huntTargets()` → living players' feet positions (the survival intel spreads over them).
- `net.handlePlayerDeath()` → true when the death became a co-op down (GameSystem then stops).
- Remote teammates are AI Agents on team `'esf'` with `agent.isNetPlayer` / `agent.netPeer`; the
  host's bots carry `agent.netId`. Puppets override `update` / `applyDamage` per instance only.
- Transport, topics and the presence budget: `src/net/transport.js`, `src/net/codec.js`. Publish with
  `capabilities: { room: { topics: { <each of TOPICS>: 'interact' } }, user: { scopes: ['profile'] } }`.

## 10. The comment pass: kit, armour, movement, modes, killcam, online PvP

The user's feature request (from a YouTube comment): multiplayer, TDM, FFA, sidearms, knives
(throwing knives included), sliding, more modes, attachments, more grenades, killcam, helmets and
ballistic vests, ammo types. **Exclusions: NO new guns, NO wall running.** Extend what exists; one
system per feature; keep single player identical when a feature is unused.

### 10.1 Loadout shape (session.js, `flopops.loadout`; old shapes must still load)
```
{ primary, secondary,                      // weapon ids from defs.js (unchanged)
  primaryKit:   { optic, muzzle, barrel, underbarrel, magazine, laser, ammo },   // ids or null
  secondaryKit: { optic, muzzle, barrel, underbarrel, magazine, laser, ammo },
  lethal,   // 'frag' | 'semtex' | 'molotov' | 'throwing_knife'
  tactical, // 'flash' | 'smoke' | 'concussion'
  helmet,   // 'none' | 'light' | 'heavy'
  vest }    // 'none' | 'light' | 'heavy'
```
`normaliseLoadout` (src/game) fills missing fields with defaults (kits all null, ammo 'fmj', helmet
and vest 'light'). `weapons.setLoadout(L)` accepts the kits; `player.setArmor({helmet, vest})`.

### 10.2 Attachments + ammo (GUNSMITH: src/weapons/attachments.js, src/weapons/ammo.js)
- `ATTACHMENTS[id] = { id, slot, label, desc, mods: { adsTime, adsFov, spreadHip, spreadAds,
  recoil, magSize, reloadTime, range, noise, moveMult, flash, laser }, model }`; a def lists
  `allows: { slot: [ids] }`. Stats are multipliers or adds applied when a kit is equipped. The
  suppressor sets `noise` (the weapon:fire hearing radius) and hides the muzzle flash.
- `AMMO[id] = { id, label, desc, dmgMult, fleshMult, armorPen (0..1), armorDmgMult,
  penetrationMult, rangeMult, burn: {dps, dur} | null, tracer }`; ids `fmj` (default), `hp`
  (hollow point: more flesh damage, poor against armour), `ap` (armour-piercing), `incendiary`
  (burns), `subsonic` (quieter, shorter range).
- **Every damage payload a player weapon creates carries `ammo` (the AMMO def object or id)
  and `zone` ('head' | 'torso' | 'limb').** That covers `damage:dealt`, bullet hits on bots,
  and hits on players (net). AI weapons use `fmj` unless a role gives other ammo.

### 10.3 Armour (ARMOUR: src/combat/armor.js)
- `ARMOR.helmet / ARMOR.vest = { none | light | heavy: { label, protect (0..1), hp, moveMult } }`.
- `resolveDamage({ amount, zone, ammo, armor }) -> { health, armorDamage, absorbed, broke }`.
  This is the ONE function both the player's health and the AI's `applyDamage` call. A helmet only
  affects 'head', a vest only 'torso'. Explosions and fire count as 'torso' with low protection.
  Burn DOT from incendiary ammo and molotovs applies through it too (`ammo.burn`).
- `armor = { helmet: {tier, hp}, vest: {tier, hp} }` lives on the player and on every Agent;
  visible tiered helmet and vest meshes on bots (and on net puppets).
- HUD: armour pips beside health.

### 10.4 Equipment + melee (CLOSE-QUARTERS: src/weapons/equipment.js, src/weapons/melee.js)
- Lethals `frag, semtex (sticks to surfaces and bodies), molotov (fire area, DOT, blocks paths
  briefly), throwing_knife (fast projectile, sticks, one hit kills to the head or torso, can be
  picked up again)`; tacticals `flash, smoke (a volume that blocks sight), concussion (slow and
  stun, no blind)`. Same G / Q keys, counts per kind.
- **Smoke must block AI sight:** export `smokeBlocks(ctx, from, to) -> bool` from
  src/weapons/equipment.js, and AI perception calls it in its line-of-sight check (CLOSE-QUARTERS
  adds that one call in src/ai/perception.js).
- Knife: V = quick melee (viewmodel knife slash/lunge; 1 hit from behind, 2 from the front, short
  lunge to the target within 2 m). Bots die and ragdoll from it like a shot. Events
  `melee:hit { target, attacker, amount, backstab }`.

### 10.5 Movement (ARMOUR also owns this, src/player)
- Slide: crouch (C / Ctrl) while sprinting starts a slide: ~0.75 s, speed carried and decaying,
  low camera, can fire while sliding, ends in a crouch, cooldown; jumping cancels it into a hop.
  NO wall running.

### 10.6 Modes + killcam (MODES-KC: src/game/modes, src/game/killcam.js)
- New modes: `ffa` (free for all: everyone hostile to everyone; AI teams need an `ffa` rule so
  bots fight each other: MODES-KC adds it in src/ai/teams.js), `kc` (Kill Confirmed: dog tags
  drop on death and are scored on pickup), `gun` (Gun Game: kills advance you through the EXISTING
  weapon list, knife kills set the victim back; no new guns). Add them to `MP_MODE_IDS` and to the
  map registry `modes` lists.
- Killcam: a recorder keeps the last ~6 s of every actor's transform, aim, weapon id and fire events
  (pooled ring buffers). On the player's death in an MP mode (and in survival), replay from the
  killer's eye with the killer's weapon and tracers and a FLOP OPS lower-third (killer name, weapon,
  distance, headshot). Space skips it. Plus a final killcam at match end.
  `actor:death` gains `weapon` (an id) where the killer is known.

### 10.7 Online PvP (NETCODE: src/net)
- Online TDM and FFA with real players (bots fill optional), host-authoritative scoring through
  the same mode classes, player-vs-player hits claimed by the shooter and validated by the host,
  with armour and ammo applied through `resolveDamage`, plus a killcam for online deaths.
