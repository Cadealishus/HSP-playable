# ASHFALL — Art Direction

The bar: a frame from this game should hold up next to a frame from a modern Call of Duty
(MWII 2022 / MWIII 2023 / Black Ops 6). Grounded, photographic realism. No stylisation, no
"indie low-poly", no primary colours, no flat untextured surfaces, no perfectly clean edges.

## Setting

**Al-Rashid, a fictional Caucasus border town — late afternoon.** A dense Eastern-European /
Caucasus town (red brick and pastel-painted plaster blocks, pitched metal and tile roofs mixed
with flat roofs) partially destroyed by fighting, built around a central paved square that the
player has to hold. Think MWII's "Farm 18" / "Taraq" and MW2019 "Hovec Sawmill" / Verdansk streets.

- **Time of day:** late afternoon. Sun at ~28–32° elevation, warm but not orange key (~5200 K),
  clear blue sky with a few clouds. Shadows long enough to rake across the square. Cool blue sky
  fill in shadows (never black). (Changed from golden hour after reviewing the user's reference.)
- **Atmosphere:** dusty haze with real aerial perspective — distant buildings desaturate and lift
  towards the sky colour. Sun-facing haze glows. Floating dust motes in sunbeams. 2–3 distant
  black smoke columns on the skyline. Subtle heat shimmer optional.
- **Palette:** red and brown brick, pastel plaster (sage green, dusty pink, cream, pale yellow),
  concrete pavers, pale concrete greys, sun-faded paint (teal shutters, green doors, blue metal
  gates), rust, black soot scorching around damage, olive-drab military kit.
  Saturation restrained; the warm/cool split between sun and shadow carries the colour.

## Surfaces

Every surface tells a story: dust accumulation on top faces, grime streaks under window sills,
chipped plaster revealing brick, water staining, rust bleeding from metal fixtures, tyre marks
and cracks on asphalt, soot above burnt windows, posters and graffiti. Edges are worn. Nothing
is a single flat colour. Roughness varies across a surface (that is where realism comes from).

## Geometry

Buildings have depth: recessed windows with frames and sills, balconies, AC units, cables
between buildings, awnings, satellite dishes, rebar sticking out of broken concrete, rubble
piles at the base of damaged walls. Silhouettes against the sky are irregular (water tanks,
antennae, broken parapets). Props are modelled with bevels, not raw boxes.

## Game mode

**Hold the Square**, a wave-survival mission. The player deploys into the central square; waves of
hostiles push in from the map edges toward it. The run ends when the player dies, and the run
summary shows time survived, waves, kills, score and the best run.

## Menus and HUD

Main menu over a slow aerial flyover of the live town: left-aligned title block (operation eyebrow,
huge condensed title, location subtitle), stacked DEPLOY / SETTINGS / CONTROLS with a highlight bar,
and a mission card on the right (mode, mission name, two-line briefing, minimap preview, difficulty /
time / best). HUD: square minimap top-left with building footprints and an objective panel under it
(objective name, WAVE nn, hostiles remaining in red), compass tape top-centre, score and streak
bottom-left, weapon name and fire mode with a big magazine / reserve count and ammo pips bottom-right.

## Weapon + hands

The viewmodel is the most-looked-at object in the game. It must be modelled in detail (rails,
receiver cuts, charging handle, sights, magazine, trigger guard, bolts, screws), with PBR
materials that read as anodised aluminium, parkerised steel, polymer, and worn edges. Gloved
hands/arms with sleeves. Motion is weighty and springy: sway, bob, recoil kick with settle, ADS
alignment through real sights, sprint pose, reload with magazine swap. The primary rifle wears an
EOTech-style holographic sight (boxy hood, rectangular window, circle-dot red reticle). While aiming,
the weapon itself goes soft with depth of field (as in CoD) while the world and the reticle stay sharp.

## Scale and units

1 unit = 1 metre. Player eye height 1.62 m (standing). Doors 2.1 × 0.9 m. Storey height ~3.2 m.
Streets 6–10 m wide, alleys 2–3 m. Playable area ~150 × 150 m plus a non-playable skyline ring.

## Performance

Target 60 fps at 1080p on a mid-range desktop GPU with "high" quality. Use instancing and
merged geometry, texture atlases where sensible, LOD for distant skyline. The harness renders
with SwiftShader (CPU), so keep single-shot render time reasonable (< ~30 s).
