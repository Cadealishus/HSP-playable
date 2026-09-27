import { FONT_STACK, FONT_DISPLAY, FONT_MONO, FONT_ARCADE } from './util.js';

/**
 * All HUD styling lives here as one injected stylesheet.
 *
 * Design system
 * -------------
 *  scale     every dimension is `calc(N * var(--k))` where --k is set from the
 *            viewport height (1080p == 1.0). The HUD therefore holds its
 *            proportions from 720p to 4K without re-authoring.
 *  spacing   4px grid: --u. Screen margins are 6u (24px @1080p), the same
 *            margin CoD uses (~2.2% of height).
 *  type      one condensed system stack, uppercase, tabular figures, three
 *            ink levels (94% / 58% / 30%) and one accent per semantic:
 *            amber = caution, red = threat, cyan = friendly/objective.
 *  contrast  every text run carries a two-stop shadow (tight dark + wide
 *            dark bloom) so it survives a blown-out sky *and* a black
 *            interior without a scrim behind it.
 */

const CSS = `
.ow-hud, .ow-hud * { margin:0; padding:0; box-sizing:border-box; }

.ow-hud {
  --k: 1;
  --u: calc(4px * var(--k));
  --pad: calc(var(--u) * 6.5);

  /* ---- Arcade Terminal palette (NERDCON_CONTRACT, exact hexes) ----
     Void #050505 · Panel #0D0D0D · NerdCon Blue #3568FF · Cyan Pulse #00E5FF
     XP Green #39FF14 (gains) · Boss Magenta #FF2D78 (threat) · Loot Gold #FFD700
     Terminal White #F0F0F0 · Fog Gray #888888. Threat is ALWAYS magenta-family,
     never red-orange; gains are always green/gold; friendly accents blue/cyan. */
  --void:   #050505;
  --panel:  #0D0D0D;
  --blue:   #3568FF;
  --cyan:   #00E5FF;
  --green:  #39FF14;
  --gold:   #FFD700;
  --magenta:#FF2D78;
  --white:  #F0F0F0;
  --gray:   #888888;

  /* three ink levels off Terminal White */
  --ink:   rgba(240,240,240,.95);
  --ink-2: rgba(240,240,240,.60);
  --ink-3: rgba(240,240,240,.34);
  --hair:  rgba(0,229,255,.20);
  --hair-2:rgba(240,240,240,.07);

  /* legacy semantic names, repointed to Arcade Terminal so widget CSS keeps
     working: amber=gold (low/caution + your gains), red=magenta (threat/empty),
     acc=cyan (interactive). */
  --amber: var(--gold);
  --red:   var(--magenta);
  --acc:   var(--cyan);
  --blood: #7a0f38;
  --cyan-lit: var(--cyan);
  --friend:#5B8CFF;
  /* Threat tint for HUD TEXT (killfeed callsigns, the wave threat line, the
     delta-to-best miss). Nudged one step brighter than the old #FF6BA6 now the
     street itself carries environmental magenta neon: at the old value an enemy
     callsign sitting over a lit magenta sign lost its edge. Same hue as Boss
     Magenta #FF2D78 (~336°) — it is a brightness step inside the family, not a
     new colour, and the pure #FF2D78 is untouched wherever it does structural
     work (minimap blips, the death title, banner rules). */
  --enemy: #FF7DB2;
  --ok:    var(--green);

  --sh: 0 1px 2px rgba(0,0,0,.92), 0 0 calc(10px * var(--k)) rgba(0,0,0,.45);
  --sh-hard: 0 1px 1px rgba(0,0,0,.95);

  /* Symmetric synthesized outlines. An offset drop-shadow is a web-overlay
     tell and it fights whatever direction the scene key light comes from; a
     ring of eight equal-radius hard shadows reads as a drawn outline and is
     direction-free. Each is paired with one tight soft shadow for the seat. */
  --oc: #050505;
  --o1:
    calc(1.5px * var(--k)) 0 0 var(--oc), calc(-1.5px * var(--k)) 0 0 var(--oc),
    0 calc(1.5px * var(--k)) 0 var(--oc), 0 calc(-1.5px * var(--k)) 0 var(--oc),
    calc(1.1px * var(--k)) calc(1.1px * var(--k)) 0 var(--oc),
    calc(-1.1px * var(--k)) calc(1.1px * var(--k)) 0 var(--oc),
    calc(1.1px * var(--k)) calc(-1.1px * var(--k)) 0 var(--oc),
    calc(-1.1px * var(--k)) calc(-1.1px * var(--k)) 0 var(--oc);
  --o2:
    calc(2px * var(--k)) 0 0 var(--oc), calc(-2px * var(--k)) 0 0 var(--oc),
    0 calc(2px * var(--k)) 0 var(--oc), 0 calc(-2px * var(--k)) 0 var(--oc),
    calc(1.45px * var(--k)) calc(1.45px * var(--k)) 0 var(--oc),
    calc(-1.45px * var(--k)) calc(1.45px * var(--k)) 0 var(--oc),
    calc(1.45px * var(--k)) calc(-1.45px * var(--k)) 0 var(--oc),
    calc(-1.45px * var(--k)) calc(-1.45px * var(--k)) 0 var(--oc);
  /* outline + tight soft seat, no directional offset */
  --sh-o1: var(--o1), 0 0 calc(4px * var(--k)) rgba(3,6,9,.8);
  --sh-o2: var(--o2), 0 0 calc(5px * var(--k)) rgba(3,6,9,.85);

  --ff: ${FONT_STACK};
  --fd: ${FONT_DISPLAY};
  --fm: ${FONT_MONO};
  --fa: ${FONT_ARCADE};

  position: fixed; inset: 0;
  pointer-events: none;
  z-index: 10;
  font-family: var(--ff);
  font-weight: 400;
  color: var(--ink);
  letter-spacing: .08em;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1, "lnum" 1;
  -webkit-font-smoothing: antialiased;
  text-transform: uppercase;
  overflow: hidden;
  contain: layout style;
  user-select: none;
}

.ow-hud .lbl {
  font-size: calc(10.5px * var(--k));
  letter-spacing: .2em;
  color: var(--ink-2);
  text-shadow: var(--sh);
}
.ow-layer { position:absolute; inset:0; }

/* ============================================================== crosshair */
.ow-cross { position:absolute; left:50%; top:50%; width:0; height:0; }
.ow-blade {
  position:absolute; left:0; top:0;
  width: calc(1.6px * var(--k));
  height: calc(8px * var(--k));
  margin-left: calc(-0.8px * var(--k));
  margin-top: calc(-4px * var(--k));
  /* Cyan Pulse #00E5FF — the hip-fire reticle shares the interactive/ADS accent. */
  background: linear-gradient(to top, rgba(0,229,255,.6), #6ef2ff 62%);
  box-shadow: 0 0 0 1px rgba(0,0,0,.55), 0 0 calc(3px * var(--k)) rgba(0,0,0,.75);
  transform-origin: 50% 50%;
  will-change: transform, opacity;
}
.ow-dot {
  position:absolute; left:0; top:0;
  width: calc(2.2px * var(--k)); height: calc(2.2px * var(--k));
  margin-left: calc(-1.1px * var(--k)); margin-top: calc(-1.1px * var(--k));
  background: var(--cyan); border-radius:50%;
  box-shadow: 0 0 0 1px rgba(0,0,0,.6), 0 0 calc(4px * var(--k)) rgba(0,0,0,.7);
  will-change: opacity, transform;
}
/* thin lower "shotgun" reference tick — reads as a real reticle, not a plus */
.ow-cross-ads { position:absolute; left:0; top:0; }

/* ============================================================ hitmarkers */
.ow-hit {
  position:absolute; left:50%; top:50%;
  width: calc(56px * var(--k)); height: calc(56px * var(--k));
  margin-left: calc(-28px * var(--k)); margin-top: calc(-28px * var(--k));
  will-change: transform, opacity;
}
.ow-hit svg { width:100%; height:100%; display:block; overflow:visible; }

/* =============================================== directional damage arcs */
.ow-dmg {
  position:absolute; left:50%; top:50%;
  width: calc(340px * var(--k)); height: calc(340px * var(--k));
  margin-left: calc(-170px * var(--k)); margin-top: calc(-170px * var(--k));
  will-change: transform, opacity;
}
.ow-dmg svg { width:100%; height:100%; display:block; overflow:visible; }

/* ============================================================ hurt state */
.ow-blood { position:absolute; inset:-7%; will-change: opacity, transform; }
.ow-blood-a {
  position:absolute; inset:0;
  background:
    radial-gradient(ellipse 78% 74% at 50% 50%, rgba(0,0,0,0) 62%, rgba(150,20,78,.30) 86%, rgba(92,10,46,.60) 100%);
  filter: url(#ow-warp);
}
.ow-blood-b {
  position:absolute; inset:0; opacity:.5; mix-blend-mode:multiply;
  background:
    radial-gradient(circle at 2% 22%,  rgba(150,18,80,.75) 0, rgba(150,18,80,0) 17%),
    radial-gradient(circle at 99% 58%, rgba(150,18,80,.7) 0, rgba(150,18,80,0) 15%),
    radial-gradient(circle at 26% 101%,rgba(140,16,74,.75) 0, rgba(140,16,74,0) 19%),
    radial-gradient(circle at 74% -2%, rgba(140,16,74,.7) 0, rgba(140,16,74,0) 18%);
  filter: url(#ow-warp);
}
.ow-desat { position:absolute; inset:0; backdrop-filter: saturate(.6) contrast(1.04) brightness(.97); }
.ow-hitflash { position:absolute; inset:0;
  background: radial-gradient(ellipse 90% 86% at 50% 50%, rgba(200,28,108,.22) 40%, rgba(210,30,120,.60) 100%);
  mix-blend-mode:screen; }
.ow-lowbeat {
  position:absolute; inset:0;
  background: radial-gradient(ellipse 76% 70% at 50% 50%, rgba(0,0,0,0) 64%, rgba(180,22,96,.34) 100%);
}

/* ====================================================== vitals (bottom left)
   The most important number on the screen, so it gets the mirror position to
   the ammo block: bottom-left of the safe area, labelled, with a numeric
   readout and a genuinely dark track so the empty part of the bar is legible
   over sunlit gravel. Armour is a visually distinct second row — thinner,
   cyan, plate-segmented — so it can never be mistaken for health. */
.ow-vitals {
  position:absolute; left:var(--pad); bottom:var(--pad);
  width: calc(196px * var(--k));
}
.ow-vt-head {
  display:flex; align-items:baseline; justify-content:space-between;
  margin-bottom: calc(var(--u) * 1.1);
}
.ow-vt-lbl {
  font-size: calc(9.5px * var(--k)); letter-spacing:.24em; color: var(--ink-2);
  text-shadow: var(--sh-o1);
}
.ow-vt-num {
  font-family: var(--fd); font-size: calc(26px * var(--k)); font-weight:800;
  letter-spacing:.02em; line-height:.85; color: var(--ink);
  text-shadow: var(--o2), 0 0 calc(12px * var(--k)) rgba(0,0,0,.5);
  will-change: color, transform;
}
.ow-vt-num i {
  font-style:normal; font-family: var(--ff); font-size: calc(11px * var(--k));
  color: var(--ink-3); letter-spacing:.1em; margin-left: calc(2px * var(--k));
}
/* health track: dark well + hairline, five 20 HP segments */
.ow-vt-track {
  position:relative; height: calc(9px * var(--k));
  background: rgba(5,9,12,.72);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.55), 0 0 0 1px rgba(216,232,240,.16),
              0 calc(1px * var(--k)) calc(4px * var(--k)) rgba(0,0,0,.5);
  overflow:hidden;
}
.ow-vt-track > i {
  position:absolute; left:0; top:0; bottom:0; width:100%;
  transform-origin:left center;
  background: linear-gradient(to bottom, #f4fdff 0%, #cfeef6 46%, #9fd4e0 100%);
  will-change: transform;
}
.ow-vt-track > u {
  position:absolute; left:0; right:0; top:0; bottom:0;
  background-image: repeating-linear-gradient(to right,
    rgba(0,0,0,0) 0, rgba(0,0,0,0) calc(20% - 1px),
    rgba(4,8,11,.85) calc(20% - 1px), rgba(4,8,11,.85) 20%);
}
.ow-vitals.low .ow-vt-track > i { background: linear-gradient(to bottom, #ffe98a, var(--gold)); }
.ow-vitals.low .ow-vt-num { color: var(--gold); }
.ow-vitals.crit .ow-vt-track > i { background: linear-gradient(to bottom, #ff7ab0, var(--magenta)); }
.ow-vitals.crit .ow-vt-num { color: var(--magenta); }

/* armour: thinner, cyan, plate-segmented, its own label */
.ow-armour {
  display:flex; align-items:center; gap: calc(var(--u) * 1.4);
  margin-top: calc(var(--u) * 1.5);
}
.ow-armour .ow-vt-lbl { color: rgba(0,229,255,.72); }
.ow-arm-plates { display:flex; gap: calc(var(--u) * .8); flex:1; }
.ow-plate {
  flex:1; height: calc(5px * var(--k));
  background: rgba(5,9,12,.7);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.5), 0 0 0 1px rgba(0,229,255,.20);
  position:relative; overflow:hidden;
}
.ow-plate i {
  position:absolute; left:0; top:0; bottom:0; width:100%;
  background: linear-gradient(to bottom, #9ff4ff, #00b8cf);
  transform-origin: left center;
}

/* ================================================================== ammo
   The whole block is ONE column of fixed width (--ammo-w) pinned to the right
   margin, so every row shares the same left edge and no row can ever grow
   sideways into another. Rows are explicit grids with an 8px gutter; the
   equipment counts get their own row above the weapon name rather than sharing
   the head row, which is what used to collide. */
.ow-ammo {
  position:absolute; right:var(--pad); bottom:var(--pad);
  --ammo-w: calc(168px * var(--k));
  --gut: calc(8px * var(--k));
  width: var(--ammo-w);
  text-align:right; line-height:1;
}
.ow-ammo-head {
  display:grid; grid-auto-flow:column; grid-auto-columns:max-content;
  justify-content:end; align-items:center;
  column-gap: var(--gut); margin-bottom:calc(var(--u) * 1.1);
}
.ow-ammo-name {
  font-size: calc(12.5px * var(--k)); letter-spacing:.22em;
  color: var(--ink); text-shadow: var(--sh-o1);
  white-space:nowrap; overflow:hidden; text-overflow:clip;
  max-width: calc(var(--ammo-w) - 52px * var(--k));
}
.ow-ammo-mode {
  font-size: calc(9.5px * var(--k)); letter-spacing:.2em; color: var(--ink-2);
  border:1px solid var(--hair); padding: calc(1.5px * var(--k)) calc(4px * var(--k));
  background: rgba(6,10,13,.34);
  text-shadow: var(--sh-hard); white-space:nowrap;
}
.ow-ammo-row {
  display:grid; grid-auto-flow:column; grid-auto-columns:max-content;
  justify-content:end; align-items:baseline;
  column-gap: calc(var(--gut) * .55);
}
.ow-ammo-cur {
  font-family: var(--fd);
  font-size: calc(54px * var(--k)); font-weight:800; letter-spacing:0;
  color: var(--ink); text-shadow: var(--o2), 0 0 calc(16px * var(--k)) rgba(0,0,0,.55);
  will-change: color, transform;
}
.ow-ammo-sep { font-size: calc(20px * var(--k)); color: var(--ink-3); font-weight:400;
  text-shadow: var(--sh-o1); }
.ow-ammo-res { font-family: var(--fd); font-size: calc(24px * var(--k)); color: var(--ink-2);
  text-shadow: var(--sh-o1); }
.ow-ammo-low .ow-ammo-cur { color: var(--amber); }
.ow-ammo-empty .ow-ammo-cur { color: var(--red); }

.ow-mag {
  display:flex; justify-content:flex-end; gap: calc(1.6px * var(--k));
  margin-top: calc(var(--u) * 1.1);
}
.ow-mag b {
  display:block; width: calc(2.6px * var(--k)); height: calc(10px * var(--k));
  background: var(--ink); box-shadow: 0 0 0 1px rgba(4,8,11,.75);
}
/* spent rounds read as an empty *socket*, not a pale ghost: a dark well is the
   only thing that survives gravel at this size */
.ow-mag b.off { background: rgba(6,10,13,.62); box-shadow: 0 0 0 1px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.07); }
.ow-mag b.warn { background: var(--amber); }

.ow-reload {
  margin-top: calc(var(--u) * 1.6);
  font-size: calc(10.5px * var(--k)); letter-spacing:.28em; color: var(--amber);
  text-shadow: var(--sh-o1);
}
.ow-reload-bar {
  margin-top: calc(var(--u) * .8); margin-left:auto; margin-right:0;
  width: calc(86px * var(--k)); height: calc(2.5px * var(--k));
  background: rgba(6,10,13,.7); box-shadow: 0 0 0 1px rgba(0,0,0,.4);
}
.ow-reload-bar i { display:block; height:100%; width:0; background: var(--amber); transform-origin:left; }

/* equipment: its own row, in flow, above the weapon name */
.ow-equip {
  display:grid; grid-auto-flow:column; grid-auto-columns:max-content;
  justify-content:end; align-items:center;
  column-gap: calc(var(--gut) * 2); margin-bottom: calc(var(--u) * 1.4);
}
.ow-slot {
  display:grid; grid-auto-flow:column; grid-auto-columns:max-content;
  align-items:center; column-gap: var(--gut); opacity:.9;
}
.ow-slot svg { width: calc(13px * var(--k)); height: calc(16.5px * var(--k)); display:block;
  filter: drop-shadow(0 0 calc(2px * var(--k)) rgba(0,0,0,.95)); }
.ow-slot span { font-size: calc(11px * var(--k)); color: var(--ink-2); text-shadow: var(--sh-o1);
  min-width: calc(7px * var(--k)); text-align:left; }
.ow-slot.empty { opacity:.34; }

/* ============================================================== killfeed */
.ow-killfeed {
  position:absolute; right:var(--pad); top:calc(var(--pad) + var(--u) * 2);
  display:flex; flex-direction:column; align-items:flex-end;
  gap: calc(var(--u) * 1.1);
}
/* Rows sit in the top right, which in daylight is sky: the scrim has to be
   dark and dense enough to matter (58%), feathered only at the far end so it
   dissolves instead of terminating in a rectangle. */
.ow-kf-row {
  position:relative;
  display:flex; align-items:center; gap: calc(var(--u) * 1.6);
  font-size: calc(13.5px * var(--k)); letter-spacing:.09em;
  padding: calc(var(--u) * .8) calc(var(--u) * 1.5);
  border-right: calc(2px * var(--k)) solid rgba(255,255,255,.18);
  text-shadow: var(--sh-o1);
  will-change: transform, opacity;
}
.ow-kf-row::before {
  content:''; position:absolute; inset:0; z-index:-1;
  background: rgba(5,9,12,.58);
  -webkit-mask-image: linear-gradient(to right, rgba(0,0,0,0) 0%, #000 22%, #000 100%);
          mask-image: linear-gradient(to right, rgba(0,0,0,0) 0%, #000 22%, #000 100%);
}
.ow-kf-row.mine::before { background: rgba(26,17,3,.66); }
.ow-kf-row.mine { border-right-color: var(--amber); }
.ow-kf-a { color: var(--friend); }
.ow-kf-v { color: var(--enemy); }
.ow-kf-row.mine .ow-kf-a { color: #fff; }
/* Faction rank prefix — AUDITOR ▸ before the callsign. Dimmer, tighter and a
   size down so the eye still lands on the name; the rank is context, not the
   headline. Same span class does duty on either side of the icons. */
.ow-kf-vv { color: rgba(240,240,240,.44); letter-spacing:.13em; font-size: calc(11.5px * var(--k)); }
.ow-kf-row.mine .ow-kf-vv { color: rgba(255,215,0,.60); }
/* Score-feed note row (BATCH PROCESSED ×2). Loot Gold: it is a gain, and it is
   deliberately NOT a banner — see the Killfeed class comment. */
.ow-kf-note { color: var(--gold); font-weight:700; letter-spacing:.2em; }
.ow-kf-row.note { border-right-color: var(--gold); }
.ow-kf-row.note::before { background: rgba(26,17,3,.72); }
.ow-kf-w { display:flex; align-items:center; gap:calc(var(--u) * .8); opacity:.9; }
.ow-kf-w svg { width: calc(31px * var(--k)); height: calc(12px * var(--k)); display:block;
  filter: drop-shadow(0 1px 1px rgba(0,0,0,.9)); }
.ow-kf-hs svg { width: calc(12px * var(--k)); height: calc(12px * var(--k)); display:block;
  filter: drop-shadow(0 1px 1px rgba(0,0,0,.9)); }

/* =============================================================== compass */
.ow-compass {
  position:absolute; left:50%; top:calc(var(--pad) * .7);
  width: calc(470px * var(--k)); height: calc(41px * var(--k));
  transform: translateX(-50%);
  -webkit-mask-image: linear-gradient(to right, transparent, #000 16%, #000 84%, transparent);
          mask-image: linear-gradient(to right, transparent, #000 16%, #000 84%, transparent);
  overflow:hidden;
}
/* Scrim: 45% dark behind the tape, feathered horizontally over the outer 20%
   at each end so it dissolves rather than terminating in a rectangle, and
   rolled off at the very top and bottom edge. The previous 23-29% version was
   too weak to do anything at all against blown cloud — grey cardinals on white
   sky, unreadable. The glyphs additionally carry a symmetric dark outline. */
.ow-compass::before {
  content:''; position:absolute; inset:0;
  background: linear-gradient(to bottom,
    rgba(3,6,9,0) 0%, rgba(3,6,9,.45) 20%, rgba(3,6,9,.45) 66%,
    rgba(3,6,9,.20) 88%, rgba(3,6,9,0) 100%);
  -webkit-mask-image: linear-gradient(to right, rgba(0,0,0,0) 0%, #000 20%, #000 80%, rgba(0,0,0,0) 100%);
          mask-image: linear-gradient(to right, rgba(0,0,0,0) 0%, #000 20%, #000 80%, rgba(0,0,0,0) 100%);
}
/* NO will-change:transform HERE — deliberate, do not "optimise" it back.
   It promoted the strip to its own composited layer, and a composited layer is
   rasterised ONCE at whatever sub-pixel raster translation its transform happened
   to have at the moment the compositor first rastered it; later transform changes
   only move the cached texture. That moment is wall-clock bound, so the anti-
   aliasing of all 144 ticks and the cardinal labels depended on how long boot took
   — the single remaining reason enabling shader pre-warm shifted pixels after the
   capture harness was made frame-deterministic (~0.06% of pixels, up to 70/255,
   confined to this strip). Unpromoted, the strip is repainted from its current
   transform every frame, which is a pure function of heading. The paint is a
   470x41 css-px band; the hint was not buying anything measurable. */
.ow-compass-strip { position:absolute; left:0; top:0; height:100%; }
.ow-tick {
  position:absolute; top: calc(19px * var(--k));
  width:1px; background: rgba(255,255,255,.7);
  height: calc(4px * var(--k));
  box-shadow: 0 0 0 1px rgba(4,8,11,.6), 0 0 calc(2px * var(--k)) rgba(0,0,0,.9);
}
.ow-tick.maj { height: calc(7.5px * var(--k)); width: calc(1.5px * var(--k)); background: rgba(255,255,255,.95); }
.ow-tick-l {
  position:absolute; top: calc(1px * var(--k)); transform: translateX(-50%);
  font-size: calc(13.5px * var(--k)); letter-spacing:.1em; font-weight:700;
  color: #fff; text-shadow: var(--sh-o1);
}
.ow-tick-l.sub { font-size: calc(10px * var(--k)); font-weight:700; color: rgba(233,243,249,.9);
  top: calc(3.5px * var(--k)); }
.ow-compass-base {
  position:absolute; left:0; right:0; top: calc(18px * var(--k)); height:1px;
  background: linear-gradient(to right, transparent, rgba(255,255,255,.4), transparent);
  box-shadow: 0 1px 0 rgba(4,8,11,.5);
}
.ow-compass-caret {
  position:absolute; left:50%; top:calc(12.5px * var(--k)); transform:translateX(-50%);
  width:0; height:0;
  border-left: calc(4.5px * var(--k)) solid transparent;
  border-right: calc(4.5px * var(--k)) solid transparent;
  border-top: calc(5.5px * var(--k)) solid var(--acc);
  filter: drop-shadow(0 0 calc(3px * var(--k)) rgba(0,229,255,.6)) drop-shadow(0 1px 2px rgba(0,0,0,.95));
}
.ow-compass-obj {
  position:absolute; top: calc(28px * var(--k)); transform:translateX(-50%);
  font-size: calc(9.5px * var(--k)); letter-spacing:.06em;
  width: calc(13px * var(--k)); height: calc(13px * var(--k));
  display:flex; align-items:center; justify-content:center;
  color:#08161c; background: var(--cyan);
  box-shadow: 0 1px 2px rgba(0,0,0,.8);
  will-change: transform;
}

/* =============================================================== run bar
   Replaces the decorative TDM match bar. Top-centre, under the compass: the
   persistent HOLD THE LEDGER readout — wave + threat line, the running score
   (Loot Gold, tabular, tweened in RunBar) and the streak multiplier chip. */
.ow-runbar {
  position:absolute; left:50%; top:calc(var(--pad) * .7 + 43px * var(--k));
  transform: translateX(-50%);
  display:flex; flex-direction:column; align-items:center;
  gap: calc(var(--u) * .7);
  text-shadow: var(--sh-o1); white-space:nowrap;
}
.ow-rb-wave {
  display:flex; align-items:center; gap: calc(var(--u) * 1.4);
  font-size: calc(10px * var(--k)); letter-spacing:.32em; color: var(--ink-2);
}
.ow-rb-wave b { color: var(--cyan); font-weight:700; letter-spacing:.26em;
  text-shadow: var(--o1), 0 0 calc(8px * var(--k)) rgba(0,229,255,.3); }
.ow-rb-wave .thr { color: var(--enemy); letter-spacing:.22em; }
.ow-rb-wave .dot { width:calc(3px * var(--k)); height:calc(3px * var(--k));
  border-radius:50%; background: var(--ink-3); }
.ow-rb-main { display:flex; align-items:center; gap: calc(var(--u) * 2); }
.ow-rb-score {
  font-family: var(--fd); font-weight:800; letter-spacing:.06em;
  font-size: calc(28px * var(--k)); line-height:.9; color: var(--gold);
  text-shadow: var(--o1), 0 0 calc(14px * var(--k)) rgba(255,215,0,.26);
}
.ow-rb-mult {
  font-family: var(--fd); font-weight:800; letter-spacing:.02em;
  font-size: calc(14px * var(--k)); color: var(--green); line-height:1;
  padding: calc(2px * var(--k)) calc(5px * var(--k));
  border: 1px solid rgba(57,255,20,.42); background: rgba(57,255,20,.08);
  text-shadow: 0 0 calc(8px * var(--k)) rgba(57,255,20,.4);
  will-change: transform;
}
.ow-rb-mult.hot { color: var(--gold); border-color: rgba(255,215,0,.5);
  background: rgba(255,215,0,.10); text-shadow: 0 0 calc(9px * var(--k)) rgba(255,215,0,.5); }
.ow-rb-mult.hidden { opacity:0; }

/* =============================================================== minimap */
.ow-minimap {
  position:absolute; left:var(--pad); top:var(--pad);
  width: calc(178px * var(--k)); height: calc(178px * var(--k));
}
/* scrim — a soft dark plate a few px larger than the widget so the map sits on
   the frame instead of floating on top of it. Behind the canvas, so it only
   reads in the margin, under the corner brackets and the N / zone labels. */
.ow-minimap::before {
  content:''; position:absolute;
  inset: calc(-7px * var(--k));
  border-radius: calc(10px * var(--k));
  background: rgba(4,8,11,.07);
  box-shadow: 0 0 calc(16px * var(--k)) calc(6px * var(--k)) rgba(4,8,11,.05);
  pointer-events:none;
}
/* The panel used to be the darkest thing in a frame whose sky tops out at 236,
   which pulled the eye straight into the corner. Its plate now sits in the
   mid-lows (see minimap.js) and the drop shadow is lighter to match. */
.ow-minimap canvas {
  position:absolute; inset:0; width:100%; height:100%; display:block;
  border-radius: calc(4px * var(--k));
  box-shadow: inset 0 0 0 1px rgba(196,220,238,.16), 0 calc(2px * var(--k)) calc(10px * var(--k)) rgba(0,0,0,.3);
}
.ow-mm-corner { position:absolute; width:calc(9px * var(--k)); height:calc(9px * var(--k)); }
.ow-mm-corner::before, .ow-mm-corner::after { content:''; position:absolute; background:rgba(255,255,255,.32); }
.ow-mm-corner::before { width:100%; height:1px; }
.ow-mm-corner::after { width:1px; height:100%; }
.ow-mm-corner.tl { left:calc(-1px * var(--k)); top:calc(-1px * var(--k)); }
.ow-mm-corner.tr { right:calc(-1px * var(--k)); top:calc(-1px * var(--k)); }
.ow-mm-corner.tr::before { right:0; } .ow-mm-corner.tr::after { right:0; }
.ow-mm-corner.bl { left:calc(-1px * var(--k)); bottom:calc(-1px * var(--k)); }
.ow-mm-corner.bl::before { bottom:0; }
.ow-mm-corner.br { right:calc(-1px * var(--k)); bottom:calc(-1px * var(--k)); }
.ow-mm-corner.br::before { bottom:0; right:0; } .ow-mm-corner.br::after { right:0; }
.ow-mm-n {
  position:absolute; left:50%; top:calc(-13px * var(--k)); transform:translateX(-50%);
  font-size: calc(9.5px * var(--k)); letter-spacing:.2em; color:var(--ink-2); text-shadow:var(--sh);
}
.ow-mm-tag {
  position:absolute; left:0; top:calc(100% + var(--u)); display:flex; gap:calc(var(--u)*1.5);
  font-size: calc(9.5px * var(--k)); letter-spacing:.2em; color:var(--ink-3); text-shadow:var(--sh);
}

/* ========================================================= world markers */
.ow-mk {
  position:absolute; left:0; top:0;
  display:flex; flex-direction:column; align-items:center;
  will-change: transform, opacity;
}
.ow-mk-glyph { position:relative; width:calc(16px * var(--k)); height:calc(16px * var(--k)); }
.ow-mk-glyph svg { position:absolute; inset:0; width:100%; height:100%; display:block; overflow:visible;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,.85)); }
.ow-mk-letter {
  position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  font-size: calc(9.5px * var(--k)); color:#08161c; font-weight:700;
}
.ow-mk-dist {
  margin-top: calc(var(--u) * .6);
  font-size: calc(10px * var(--k)); letter-spacing:.12em; color: var(--ink);
  text-shadow: var(--sh);
}
.ow-mk-name { font-size: calc(9px * var(--k)); letter-spacing:.18em; color: var(--ink-2); text-shadow:var(--sh); }
.ow-mk.threat .ow-mk-dist { color: var(--red); }

/* grenade danger */
.ow-nade { position:absolute; left:0; top:0; will-change: transform, opacity; }
.ow-nade-ring {
  position:absolute; left:50%; top:50%; width:calc(30px * var(--k)); height:calc(30px * var(--k));
  margin:calc(-15px * var(--k)) 0 0 calc(-15px * var(--k));
  border: calc(1.5px * var(--k)) solid var(--red); border-radius:50%;
  will-change: transform, opacity;
}
.ow-nade-core {
  position:absolute; left:50%; top:50%; width:calc(15px * var(--k)); height:calc(15px * var(--k));
  margin:calc(-7.5px * var(--k)) 0 0 calc(-7.5px * var(--k));
}
.ow-nade-core svg { width:100%; height:100%; display:block; filter:drop-shadow(0 1px 2px rgba(0,0,0,.9)); }
.ow-nade-label {
  position:absolute; left:50%; top:calc(13px * var(--k)); transform:translateX(-50%);
  font-size: calc(9px * var(--k)); letter-spacing:.24em; color:var(--red); white-space:nowrap;
  text-shadow: var(--sh);
}

/* ======================================================== damage numbers */
.ow-dn {
  position:absolute; left:0; top:0; font-family: var(--fd);
  font-size: calc(17px * var(--k)); font-weight:700; letter-spacing:.03em;
  color: var(--ink); text-shadow: 0 1px 2px rgba(0,0,0,.95), 0 0 calc(8px * var(--k)) rgba(0,0,0,.6);
  will-change: transform, opacity;
}
.ow-dn.hs   { color: var(--amber); font-size: calc(21px * var(--k)); }
.ow-dn.kill { color: var(--red);   font-size: calc(23px * var(--k)); }
.ow-dn.armour { color: var(--cyan); }

/* ================================================================ prompt */
.ow-prompt {
  position:absolute; left:50%; top:58%;
  transform: translate(-50%,-50%);
  display:flex; align-items:center; gap: calc(var(--u) * 2);
  will-change: opacity, transform;
}
.ow-key {
  min-width: calc(22px * var(--k)); height: calc(22px * var(--k));
  padding: 0 calc(var(--u) * 1.2);
  display:flex; align-items:center; justify-content:center;
  font-size: calc(11px * var(--k)); letter-spacing:.06em;
  border: 1px solid rgba(255,255,255,.55); border-radius: calc(2px * var(--k));
  background: rgba(8,11,14,.42);
  box-shadow: 0 1px 3px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.14);
  text-shadow: var(--sh-hard);
}
.ow-prompt-txt { font-size: calc(12px * var(--k)); letter-spacing:.2em; text-shadow: var(--sh); }
.ow-prompt-sub { font-size: calc(9.5px * var(--k)); letter-spacing:.2em; color:var(--ink-2); }
.ow-prompt-arc { position:absolute; left:calc(-6px * var(--k)); top:50%; }

/* ================================================================ banner */
.ow-banner {
  /* Sits at 40% (not 31%): the magenta HOLD-THE-LEDGER set-piece banner hangs in
     the upper-centre of the establishing framings, and a toast at 31% stacked
     straight over it. 40% drops the toast into the clear band between the run bar
     (~10%) and the reticle (50%) so it reads on its own scrim. */
  position:absolute; left:50%; top:40%;
  transform: translate(-50%,-50%);
  text-align:center;
  /* wide side padding on purpose: the scrim's outer 20% is a feather, so the
     band has to be substantially wider than the type for the type to sit on
     the solid part of it */
  padding: calc(var(--u) * 4) calc(var(--u) * 30);
  will-change: opacity, transform;
}
/* A soft radial haze over a blown sky does nothing except add milk: at 62% in
   the middle and 0 at the edge, its average density is far too low to seat white
   type on a 236-luma cloud. This is a flat 60% dark band, feathered across the
   outer 20% at each end (and rolled off top/bottom so it is a band, not a box). */
.ow-banner::before {
  content:''; position:absolute; inset:0; z-index:-1;
  background: linear-gradient(to bottom,
    rgba(4,7,10,0) 0%, rgba(4,7,10,.72) 20%, rgba(4,7,10,.72) 80%, rgba(4,7,10,0) 100%);
  -webkit-mask-image: linear-gradient(to right, rgba(0,0,0,0) 0%, #000 20%, #000 80%, rgba(0,0,0,0) 100%);
          mask-image: linear-gradient(to right, rgba(0,0,0,0) 0%, #000 20%, #000 80%, rgba(0,0,0,0) 100%);
}
.ow-banner-t {
  font-family: var(--fd);
  font-size: calc(28px * var(--k)); letter-spacing:.24em; font-weight:800;
  text-shadow: var(--sh-o2), 0 0 calc(20px * var(--k)) rgba(0,229,255,.14);
}
.ow-banner-s {
  margin-top: calc(var(--u) * 1.4);
  font-size: calc(12px * var(--k)); letter-spacing:.3em; color: var(--gold); font-weight:700;
  text-shadow: var(--sh-o1);
}
/* wave-clear settle banner: the +bonus reads as a gain (XP Green) */
.ow-banner.settle .ow-banner-s { color: var(--green); }
.ow-banner.threat .ow-banner-t { color: var(--white); }
.ow-banner.threat .ow-banner-s { color: var(--enemy); }
.ow-banner-rule {
  margin: calc(var(--u) * 1.4) auto 0; width: calc(120px * var(--k)); height:1px;
  background: linear-gradient(to right, transparent, rgba(255,255,255,.5), transparent);
}

/* ================================================================== menu */
.ow-menu {
  position:absolute; inset:0; pointer-events:auto;
  background: linear-gradient(105deg, rgba(4,6,8,.90) 0%, rgba(4,6,8,.72) 46%, rgba(4,6,8,.42) 100%);
  backdrop-filter: blur(calc(9px * var(--k))) saturate(.7) brightness(.8);
  opacity:0; will-change: opacity;
}
.ow-menu-inner {
  position:absolute; left: calc(var(--u) * 22); top:50%;
  transform: translateY(-50%);
  width: calc(430px * var(--k));
  padding-left: calc(var(--u) * 4.5);
  border-left: calc(2px * var(--k)) solid var(--acc);
}
.ow-menu h1 {
  font-family: var(--fd);
  font-size: calc(40px * var(--k)); font-weight:800; letter-spacing:.22em;
  text-shadow: 0 2px 6px rgba(0,0,0,.8), 0 0 calc(18px * var(--k)) rgba(0,229,255,.18);
}
.ow-menu .sub {
  margin-top: calc(var(--u) * 1.2); font-size: calc(10px * var(--k));
  letter-spacing:.28em; color: var(--cyan);
}
.ow-menu .rule {
  margin: calc(var(--u) * 5) 0 calc(var(--u) * 2); height:1px;
  background: linear-gradient(to right, rgba(255,255,255,.28), rgba(255,255,255,0));
}
.ow-row {
  display:flex; align-items:center; justify-content:space-between;
  gap: calc(var(--u) * 4); padding: calc(var(--u) * 3.2) 0;
  border-bottom: 1px solid var(--hair-2);
}
.ow-row > .name { font-size: calc(11.5px * var(--k)); letter-spacing:.2em; color: var(--ink); }
.ow-row > .val { font-family: var(--fm); font-size: calc(11px * var(--k)); color: var(--acc);
  letter-spacing:.04em; min-width: calc(46px * var(--k)); text-align:right; }
.ow-seg { display:flex; gap:0; }
.ow-seg button {
  appearance:none; border:1px solid var(--hair); border-right:0; background:rgba(255,255,255,.03);
  color: var(--ink-2); font-family:var(--ff); font-weight:600; text-transform:uppercase;
  font-size: calc(10px * var(--k)); letter-spacing:.16em;
  padding: calc(var(--u) * 1.3) calc(var(--u) * 2.2);
  cursor:pointer; position:relative; transition: color .12s, background .12s;
}
.ow-seg button:last-child { border-right:1px solid var(--hair); }
.ow-seg button:hover { color: var(--ink); background: rgba(0,229,255,.10); }
.ow-seg button.on { color:#03121a; background: var(--acc); border-color: var(--acc);
  text-shadow:none; box-shadow: 0 0 calc(10px * var(--k)) rgba(0,229,255,.35); }
.ow-slider { position:relative; width: calc(190px * var(--k)); height: calc(18px * var(--k)); }
.ow-slider .track {
  position:absolute; left:0; right:0; top:50%; height: calc(2px * var(--k));
  transform: translateY(-50%); background: rgba(255,255,255,.16);
}
.ow-slider .fill {
  position:absolute; left:0; top:50%; height: calc(2px * var(--k));
  transform: translateY(-50%); background: var(--acc);
}
.ow-slider .knob {
  position:absolute; top:50%; width: calc(9px * var(--k)); height: calc(9px * var(--k));
  background: var(--acc); transform: translate(-50%,-50%) rotate(45deg);
  box-shadow: 0 0 calc(6px * var(--k)) rgba(0,229,255,.55);
}
.ow-slider input {
  position:absolute; inset:0; width:100%; height:100%; margin:0;
  appearance:none; background:transparent; cursor:pointer; opacity:0;
}
.ow-btns { margin-top: calc(var(--u) * 5); display:flex; gap: calc(var(--u) * 2.5); }
.ow-btn {
  appearance:none; border:1px solid var(--hair); background: rgba(255,255,255,.04);
  color: var(--ink); font-family: var(--ff); font-weight:600; text-transform:uppercase;
  font-size: calc(11px * var(--k)); letter-spacing:.2em;
  padding: calc(var(--u) * 2.2) calc(var(--u) * 5);
  cursor:pointer; transition: background .12s, border-color .12s;
}
.ow-btn:hover { background: rgba(0,229,255,.12); border-color: rgba(0,229,255,.5); color:#fff; }
.ow-btn.primary { background: var(--acc); border-color: var(--acc); color:#03121a;
  box-shadow: 0 0 calc(16px * var(--k)) rgba(0,229,255,.32); }
.ow-btn.primary:hover { background:#5cf0ff; border-color:#5cf0ff; }
.ow-menu .hint {
  margin-top: calc(var(--u) * 4); font-size: calc(9.5px * var(--k));
  letter-spacing:.2em; color: var(--ink-3);
}

/* =============================================================== attract
   Full-screen title / job-select shown at boot (game:state 'attract'). The
   only screen allowed the Press Start 2P wordmark (+ the INSERT-COIN hint =
   two arcade elements, the contract cap). pointer-events:auto so the job
   cards catch the click that deploys the run. */
/* TRANSLUCENT SCRIM, not a wall. The render loop runs in attract (the engine
   never stops stepping; the game system is simply inert in that state), so behind this
   overlay is the live cyber-dusk plaza — neon signage, the Ledger, wet asphalt.
   An opaque gradient here threw all of that away and shipped a title card that
   could have been a static image.
   Three layers do the work: the two brand tints, then a soft dark ellipse that
   sits UNDER the centre column so the wordmark and the job cards keep contract
   type contrast, then a light overall wash so the street reads through at the
   edges without the whole frame going grey. */
.ow-attract {
  position:absolute; inset:0; pointer-events:auto; overflow:hidden;
  display:flex; align-items:center; justify-content:center;
  background:
    radial-gradient(ellipse 90% 60% at 50% 20%, rgba(53,104,255,.15), transparent 60%),
    radial-gradient(ellipse 80% 70% at 50% 104%, rgba(255,45,120,.12), transparent 62%),
    radial-gradient(ellipse 66% 62% at 50% 52%, rgba(3,3,5,.88), rgba(3,3,5,.60) 58%, rgba(3,3,5,.20) 100%),
    linear-gradient(180deg, rgba(7,7,9,.72) 0%, rgba(5,5,5,.42) 46%, rgba(9,6,11,.76) 100%);
  color: var(--white); text-transform:uppercase;
  opacity:0; will-change:opacity;
}
/* CRT scanlines — the arcade-cabinet substrate */
.ow-attract::before {
  content:''; position:absolute; inset:0; pointer-events:none; opacity:.5;
  background: repeating-linear-gradient(0deg,
    rgba(0,0,0,0) 0, rgba(0,0,0,0) 2px, rgba(0,0,0,.22) 3px);
  background-size: 100% 3px; mix-blend-mode:multiply;
}
/* Cabinet vignette. Softened from .72/44px now the scrim is translucent: at the
   old weight it crushed the street back to black at exactly the edges where the
   dusk grade is most legible. */
.ow-attract::after {
  content:''; position:absolute; inset:0; pointer-events:none;
  box-shadow: inset 0 0 calc(230px * var(--k)) calc(20px * var(--k)) rgba(0,0,0,.58);
}
.ow-att-inner {
  position:relative; z-index:1;
  width: min(calc(1060px * var(--k)), 92vw);
  display:flex; flex-direction:column; align-items:center; text-align:center;
}
.ow-att-mode {
  font-size: calc(11px * var(--k)); letter-spacing:.5em; color: var(--cyan);
  padding-left:.5em; text-shadow: 0 0 calc(12px * var(--k)) rgba(0,229,255,.4);
}
.ow-att-title {
  font-family: var(--fa);
  font-size: calc(50px * var(--k)); line-height:1.08; letter-spacing:.02em;
  margin: calc(var(--u) * 3.5) 0 calc(var(--u) * 2.75); color: var(--white);
  text-shadow:
    calc(3px * var(--k)) calc(3px * var(--k)) 0 var(--magenta),
    calc(-2px * var(--k)) calc(-1px * var(--k)) 0 var(--cyan),
    0 0 calc(32px * var(--k)) rgba(53,104,255,.5);
}
.ow-att-sub {
  font-size: calc(12px * var(--k)); letter-spacing:.42em; color: var(--ink-2); padding-left:.42em;
}
.ow-att-jobsel {
  margin: calc(var(--u) * 8) 0 calc(var(--u) * 3.5);
  display:flex; align-items:center; gap: calc(var(--u) * 2.5);
  font-size: calc(10.5px * var(--k)); letter-spacing:.42em; color: var(--gold); padding-left:.42em;
}
.ow-att-jobsel .ln { width: calc(52px * var(--k)); height:1px;
  background: linear-gradient(90deg, transparent, rgba(255,215,0,.6)); }
.ow-att-jobsel .ln.r { background: linear-gradient(90deg, rgba(255,215,0,.6), transparent); }
.ow-att-cards {
  display:grid; grid-template-columns: repeat(3, 1fr);
  gap: calc(var(--u) * 3.5); width:100%;
}
.ow-att-card {
  position:relative; cursor:pointer; text-align:left;
  padding: calc(var(--u) * 4) calc(var(--u) * 4) calc(var(--u) * 4.5);
  background: linear-gradient(180deg, rgba(13,13,13,.92), rgba(6,6,8,.94));
  border: 1px solid rgba(0,229,255,.22);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.02), 0 calc(10px * var(--k)) calc(30px * var(--k)) rgba(0,0,0,.5);
  transition: border-color .14s, transform .14s, box-shadow .14s;
  overflow:hidden;
}
.ow-att-card::before {
  content:''; position:absolute; left:0; top:0; right:0; height: calc(2px * var(--k));
  background: linear-gradient(90deg, var(--cyan), transparent); opacity:.6;
  transition: background .14s, opacity .14s;
}
.ow-att-card:hover {
  border-color: var(--magenta); transform: translateY(calc(-4px * var(--k)));
  box-shadow: 0 calc(16px * var(--k)) calc(40px * var(--k)) rgba(255,45,120,.20), inset 0 0 0 1px rgba(255,45,120,.25);
}
.ow-att-card:hover::before { background: linear-gradient(90deg, var(--magenta), transparent); opacity:1; }
.ow-card-idx { font-family: var(--fd); font-weight:800; font-size: calc(13px * var(--k));
  color: var(--ink-3); letter-spacing:.1em; }
.ow-card-name { font-family: var(--fd); font-weight:800; font-size: calc(19px * var(--k));
  letter-spacing:.07em; color: var(--white); margin: calc(var(--u) * 1.5) 0 calc(var(--u) * .8); }
.ow-card-role { font-size: calc(9px * var(--k)); letter-spacing:.28em; color: var(--cyan);
  margin-bottom: calc(var(--u) * 2.5); }
.ow-card-kit { font-size: calc(11px * var(--k)); letter-spacing:.01em; line-height:1.55;
  color: var(--ink-2); text-transform:none; min-height: calc(50px * var(--k)); }
.ow-card-weapon { margin-top: calc(var(--u) * 2.5); display:flex; align-items:center;
  gap: calc(var(--u) * 1.2); font-size: calc(10px * var(--k)); letter-spacing:.14em; color: var(--gold); }
.ow-card-weapon::before { content:''; width: calc(14px * var(--k)); height:1px; background: var(--gold); opacity:.7; }
.ow-card-cta { margin-top: calc(var(--u) * 3.5); font-size: calc(10px * var(--k)); letter-spacing:.3em;
  color: var(--ink-3); transition: color .14s; }
.ow-att-card:hover .ow-card-cta { color: var(--magenta); }
.ow-att-hint {
  margin-top: calc(var(--u) * 8); font-family: var(--fa);
  font-size: calc(11px * var(--k)); letter-spacing:.05em; color: var(--gold);
  animation: ow-blink 1.4s ease-in-out infinite;
  text-shadow: 0 0 calc(14px * var(--k)) rgba(255,215,0,.5);
}
@keyframes ow-blink { 0%,100%{opacity:1} 50%{opacity:.45} }
/* Title-screen route to the leaderboard. Cyan = interactive; deliberately a
   quiet link, not a button — deploying is still the primary action. */
.ow-att-meta { margin-top: calc(var(--u) * 3.5); }
.ow-att-link {
  appearance:none; background:transparent; border:0; cursor:pointer;
  font-family: var(--ff); text-transform:uppercase;
  font-size: calc(10.5px * var(--k)); letter-spacing:.3em; color: var(--cyan);
  padding: calc(var(--u) * 1.2) calc(var(--u) * 2);
  border-bottom: 1px solid rgba(0,229,255,.28);
  transition: color .14s, border-color .14s, text-shadow .14s;
}
.ow-att-link:hover {
  color: #7ef2ff; border-bottom-color: var(--cyan);
  text-shadow: 0 0 calc(12px * var(--k)) rgba(0,229,255,.5);
}
.ow-att-footer {
  margin-top: calc(var(--u) * 4); font-size: calc(9.5px * var(--k)); letter-spacing:.34em; color: var(--ink-3);
}

/* ======================================================= run-end overlays
   Shared centred card for the death (INSUFFICIENT FUNDS) and game-over
   (RUN SETTLED) screens. pointer-events:auto for the buttons. */
.ow-screen {
  position:absolute; inset:0; pointer-events:auto; overflow:hidden;
  display:flex; align-items:center; justify-content:center;
  background: radial-gradient(ellipse 120% 90% at 50% 44%, rgba(9,9,12,.82), rgba(5,5,5,.95));
  backdrop-filter: blur(calc(7px * var(--k))) brightness(.66) saturate(.82);
  opacity:0; will-change:opacity;
}
.ow-screen::before {
  content:''; position:absolute; inset:0; pointer-events:none; opacity:.4;
  background: repeating-linear-gradient(0deg,
    rgba(0,0,0,0) 0, rgba(0,0,0,0) 2px, rgba(0,0,0,.25) 3px);
  background-size: 100% 3px;
}
.ow-screen-card {
  position:relative; z-index:1; text-align:center;
  width: min(calc(560px * var(--k)), 90vw);
  padding: calc(var(--u) * 9) calc(var(--u) * 8);
  background: linear-gradient(180deg, rgba(13,13,13,.94), rgba(6,6,8,.95));
  border: 1px solid rgba(0,229,255,.18);
  box-shadow: 0 calc(24px * var(--k)) calc(70px * var(--k)) rgba(0,0,0,.62);
}
.ow-screen.death .ow-screen-card {
  border-color: rgba(255,45,120,.42);
  box-shadow: 0 calc(24px * var(--k)) calc(70px * var(--k)) rgba(0,0,0,.62), inset 0 0 calc(60px * var(--k)) rgba(255,45,120,.07);
}
.ow-sc-kicker { font-size: calc(10px * var(--k)); letter-spacing:.42em; color: var(--ink-3); }
.ow-sc-title {
  font-family: var(--fd); font-weight:800; letter-spacing:.12em;
  font-size: calc(36px * var(--k)); margin: calc(var(--u) * 2.5) 0; color: var(--white);
}
.ow-screen.death .ow-sc-title { color: var(--magenta); text-shadow: 0 0 calc(28px * var(--k)) rgba(255,45,120,.45); }
.ow-screen.best .ow-sc-title { color: var(--gold); text-shadow: 0 0 calc(28px * var(--k)) rgba(255,215,0,.42); }
.ow-sc-body {
  font-size: calc(11.5px * var(--k)); letter-spacing:.03em; line-height:1.6; text-transform:none;
  color: var(--ink-2); max-width: calc(420px * var(--k)); margin: 0 auto calc(var(--u) * 5);
}
.ow-sc-score {
  font-family: var(--fd); font-weight:800; font-size: calc(56px * var(--k)); letter-spacing:.04em;
  color: var(--gold); line-height:.95; margin: 0 0 calc(var(--u) * 1.5);
  text-shadow: 0 0 calc(30px * var(--k)) rgba(255,215,0,.3);
}
.ow-sc-delta { font-size: calc(10.5px * var(--k)); letter-spacing:.14em; color: var(--ink-2);
  margin-bottom: calc(var(--u) * 5.5); }
.ow-sc-delta b { color: var(--green); }
.ow-sc-delta.miss b { color: var(--enemy); }
.ow-sc-stats {
  display:grid; grid-template-columns: repeat(4,1fr); gap: calc(var(--u) * 2);
  margin: 0 auto calc(var(--u) * 5.5); max-width: calc(470px * var(--k));
}
.ow-sc-stat { border-top:1px solid var(--hair); padding-top: calc(var(--u) * 2); }
.ow-sc-stat .k { font-size: calc(8.5px * var(--k)); letter-spacing:.22em; color: var(--ink-3); }
.ow-sc-stat .v { font-family: var(--fd); font-weight:800; font-size: calc(20px * var(--k));
  color: var(--white); margin-top: calc(var(--u) * .8); letter-spacing:.02em; }
.ow-sc-tease {
  font-size: calc(9.5px * var(--k)); letter-spacing:.2em; color: var(--cyan);
  border:1px solid rgba(0,229,255,.24); padding: calc(var(--u) * 1.6) calc(var(--u) * 2.5);
  display:inline-block; margin-bottom: calc(var(--u) * 5.5); background: rgba(0,229,255,.05);
}
.ow-sc-actions { display:flex; gap: calc(var(--u) * 2.5); justify-content:center; flex-wrap:wrap; }
.ow-sc-ghost {
  appearance:none; background:transparent; border:1px solid var(--hair-2);
  color: var(--ink-3); font-family: var(--ff); font-weight:400; text-transform:uppercase;
  font-size: calc(10.5px * var(--k)); letter-spacing:.2em;
  padding: calc(var(--u) * 2.2) calc(var(--u) * 4.5); cursor:pointer;
  transition: color .14s, border-color .14s;
}
.ow-sc-ghost:hover { color: var(--ink); border-color: var(--hair); }

/* ====================================================== initials selector
   The 1983 interaction: three fixed slots, a wheeling letter, a blinking
   cursor. The blink is a CSS custom property (--cur) written from
   initials.js update(), not a keyframe, so the capture harness stays
   deterministic. Gold, because these three letters ARE the score. */
.ow-init { margin: 0 0 calc(var(--u) * 5); }
.ow-init-lbl {
  font-size: calc(9.5px * var(--k)); letter-spacing:.4em; color: var(--ink-2);
  margin-bottom: calc(var(--u) * 3);
}
.ow-init-rack { display:flex; justify-content:center; gap: calc(var(--u) * 3); }
.ow-init-slot {
  --cur: 0;
  position:relative; width: calc(64px * var(--k));
  display:flex; flex-direction:column; align-items:center; gap: calc(var(--u) * .5);
}
.ow-init-arrow {
  appearance:none; background:transparent; border:0; cursor:pointer;
  color: var(--ink-3); font-size: calc(11px * var(--k)); line-height:1;
  padding: calc(var(--u) * .8) calc(var(--u) * 2);
  transition: color .12s;
}
.ow-init-arrow:hover { color: var(--cyan); }
.ow-init-ch {
  width:100%; cursor:pointer;
  font-family: var(--fd); font-weight:800; font-size: calc(44px * var(--k));
  line-height: calc(58px * var(--k)); letter-spacing:0; color: var(--gold);
  background: rgba(255,215,0,.04);
  border: 1px solid rgba(255,215,0,.20);
  box-shadow: inset 0 0 calc(20px * var(--k)) rgba(255,215,0,.05);
  text-shadow: 0 0 calc(18px * var(--k)) rgba(255,215,0,.28);
}
/* The cursor: an underscore that blinks by opacity, arcade-correct. */
.ow-init-slot::after {
  content:''; position:absolute; left: calc(var(--u) * 2); right: calc(var(--u) * 2);
  bottom: calc(22px * var(--k)); height: calc(3px * var(--k));
  background: var(--cyan); opacity: var(--cur);
  box-shadow: 0 0 calc(10px * var(--k)) rgba(0,229,255,.6);
}
.ow-init-slot.on .ow-init-ch { border-color: var(--cyan); background: rgba(0,229,255,.06); }
.ow-init-hint {
  margin-top: calc(var(--u) * 3); font-size: calc(9px * var(--k));
  letter-spacing:.22em; color: var(--ink-3);
}
.ow-init-actions {
  margin-top: calc(var(--u) * 4);
  display:flex; gap: calc(var(--u) * 2.5); justify-content:center; flex-wrap:wrap;
}
.ow-init-status {
  margin-top: calc(var(--u) * 3); font-size: calc(11px * var(--k));
  letter-spacing:.2em; color: var(--ink-2);
}
.ow-init-status.ok  { color: var(--green); text-shadow: 0 0 calc(12px * var(--k)) rgba(57,255,20,.3); }
.ow-init-status.err { color: var(--enemy); }

/* share row on the settled card */
.ow-sc-share {
  display:flex; gap: calc(var(--u) * 2.5); justify-content:center; flex-wrap:wrap;
  margin: calc(var(--u) * 4) 0 calc(var(--u) * 5);
}

/* The card grew a submit block; on a 720p laptop that can outrun the viewport.
   Scroll inside the card rather than clipping the RUN IT BACK button. */
.ow-screen-card { max-height: 92vh; overflow-y: auto; overflow-x: hidden; }
.ow-screen-card::-webkit-scrollbar { width: calc(4px * var(--k)); }
.ow-screen-card::-webkit-scrollbar-thumb { background: rgba(0,229,255,.25); }

/* ================================================================= boards
   THE BOARD — global / today / per-job. Same Arcade Terminal card language as
   the run-end screens, widened for the table. Palette law: score is Loot Gold,
   tabs are Cyan Pulse, the player's own row is XP Green (a gain). No magenta
   anywhere on this screen — magenta is threat only. */
.ow-screen.boards .ow-board-card {
  position:relative; z-index:1; text-align:center;
  width: min(calc(760px * var(--k)), 94vw);
  max-height: 92vh; display:flex; flex-direction:column;
  padding: calc(var(--u) * 7) calc(var(--u) * 7) calc(var(--u) * 5);
  background: linear-gradient(180deg, rgba(13,13,13,.95), rgba(6,6,8,.96));
  border: 1px solid rgba(0,229,255,.22);
  box-shadow: 0 calc(24px * var(--k)) calc(70px * var(--k)) rgba(0,0,0,.66);
}
.ow-board-head { flex:0 0 auto; }
.ow-board-title {
  font-family: var(--fd); font-weight:800; letter-spacing:.22em;
  font-size: calc(30px * var(--k)); margin: calc(var(--u) * 2) 0 calc(var(--u) * 1.2);
  color: var(--gold); text-shadow: 0 0 calc(26px * var(--k)) rgba(255,215,0,.3);
}
.ow-board-sub { font-size: calc(9.5px * var(--k)); letter-spacing:.3em; color: var(--ink-3); }
.ow-board-tabs {
  flex:0 0 auto; display:flex; justify-content:center; flex-wrap:wrap; gap:0;
  margin: calc(var(--u) * 5) 0 calc(var(--u) * 4);
}
.ow-board-tab {
  appearance:none; border:1px solid var(--hair); border-right:0;
  background: rgba(255,255,255,.03); color: var(--ink-2);
  font-family: var(--ff); font-weight:600; text-transform:uppercase;
  font-size: calc(9.5px * var(--k)); letter-spacing:.16em;
  padding: calc(var(--u) * 1.6) calc(var(--u) * 2.6);
  cursor:pointer; transition: color .12s, background .12s;
}
.ow-board-tab:last-child { border-right:1px solid var(--hair); }
.ow-board-tab:hover { color: var(--ink); background: rgba(0,229,255,.10); }
.ow-board-tab.on {
  color:#03121a; background: var(--cyan); border-color: var(--cyan);
  box-shadow: 0 0 calc(10px * var(--k)) rgba(0,229,255,.35);
}
.ow-board-cols, .ow-board-row {
  display:grid;
  grid-template-columns: calc(46px * var(--k)) calc(120px * var(--k)) 1fr calc(70px * var(--k)) calc(130px * var(--k));
  align-items:center; text-align:left; gap: calc(var(--u) * 2);
}
.ow-board-cols {
  flex:0 0 auto;
  font-size: calc(8.5px * var(--k)); letter-spacing:.22em; color: var(--ink-3);
  padding: 0 calc(var(--u) * 2) calc(var(--u) * 1.6);
  border-bottom: 1px solid var(--hair);
}
.ow-board-cols .c-wave, .ow-board-cols .c-score,
.ow-board-row  .c-wave, .ow-board-row  .c-score { text-align:right; }
.ow-board-list { flex:1 1 auto; overflow-y:auto; min-height: calc(120px * var(--k)); }
.ow-board-list::-webkit-scrollbar { width: calc(4px * var(--k)); }
.ow-board-list::-webkit-scrollbar-thumb { background: rgba(0,229,255,.25); }
.ow-board-row {
  padding: calc(var(--u) * 1.9) calc(var(--u) * 2);
  border-bottom: 1px solid var(--hair-2);
  font-size: calc(12px * var(--k)); letter-spacing:.1em; color: var(--ink);
}
.ow-board-row .c-rank  { color: var(--ink-3); font-size: calc(10.5px * var(--k)); }
.ow-board-row .c-who   { font-family: var(--fd); font-weight:800; letter-spacing:.18em; }
.ow-board-row .c-job   { font-size: calc(9px * var(--k)); letter-spacing:.18em; color: var(--cyan); }
.ow-board-row .c-wave  { color: var(--ink-2); }
.ow-board-row .c-score { font-family: var(--fd); font-weight:800; color: var(--gold); letter-spacing:.04em; }
.ow-board-row.podium .c-rank { color: var(--gold); }
.ow-board-row.mine {
  background: rgba(57,255,20,.07);
  box-shadow: inset calc(2px * var(--k)) 0 0 var(--green);
}
.ow-board-row.mine .c-who { color: var(--green); }
.ow-board-note {
  flex:0 0 auto; padding: calc(var(--u) * 7) calc(var(--u) * 2);
  font-size: calc(10.5px * var(--k)); letter-spacing:.22em; color: var(--ink-3);
}
.ow-board-actions {
  flex:0 0 auto; margin-top: calc(var(--u) * 4);
  display:flex; align-items:center; justify-content:space-between; gap: calc(var(--u) * 3);
}
.ow-board-foot { font-size: calc(8.5px * var(--k)); letter-spacing:.28em; color: var(--ink-3); }

/* =========================================================== cabinet mode
   ?cabinet=1 — the one Press Start 2P element on the attract-loop board
   pages (the title card already spends its two on the wordmark + INSERT
   COIN hint, so this never appears there). */
.ow-cab-prompt {
  position:absolute; left:50%; bottom: calc(var(--u) * 9);
  transform: translateX(-50%); z-index: 40; pointer-events:none;
  font-family: var(--fa); font-size: calc(13px * var(--k)); letter-spacing:.06em;
  color: var(--gold); white-space:nowrap;
  text-shadow: 0 0 calc(18px * var(--k)) rgba(255,215,0,.55), 0 2px 4px rgba(0,0,0,.9);
}

/* ============================================================== fadeouts */
.ow-hidden { display:none !important; }
`;

const DEFS = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <!-- organic edge for the blood vignette: banded turbulence displacing the
         gradient so the hurt overlay never reads as a clean radial ramp -->
    <filter id="ow-warp" x="-12%" y="-12%" width="124%" height="124%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.006 0.011" numOctaves="4" seed="17" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="34" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </defs>
</svg>`;

let installed = false;

export function installStyles() {
  if (installed && document.getElementById('ow-ui-style')) return;
  const s = document.createElement('style');
  s.id = 'ow-ui-style';
  s.textContent = CSS;
  document.head.appendChild(s);
  const d = document.createElement('div');
  d.id = 'ow-ui-defs';
  d.innerHTML = DEFS;
  document.body.appendChild(d);
  installed = true;
}

export function removeStyles() {
  document.getElementById('ow-ui-style')?.remove();
  document.getElementById('ow-ui-defs')?.remove();
  installed = false;
}
