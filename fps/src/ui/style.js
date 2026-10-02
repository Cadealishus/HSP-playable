import { FONT_STACK, FONT_DISPLAY, FONT_MONO, FONT_SANS } from './util.js';
import barlow500 from './fonts/barlow-condensed-500.woff2?url';
import barlow600 from './fonts/barlow-condensed-600.woff2?url';
import barlow700 from './fonts/barlow-condensed-700.woff2?url';
import interVar from './fonts/inter-var.woff2?url';

/**
 * All HUD and front-end styling lives here as one injected stylesheet.
 *
 * Design system (FLOP OPS)
 * ------------------------
 *  scale     every dimension is `calc(N * var(--k))` where --k is set from the
 *            viewport height (1080p == 1.0). The HUD holds its proportions
 *            from 720p to 4K without re-authoring.
 *  spacing   4px grid: --u. Screen margins are 6.5u (26px @1080p).
 *  type      Barlow Condensed for every label and numeral (uppercase, tracked,
 *            tabular figures); Inter for running copy (subtitles, briefings,
 *            the report). See util.js.
 *  colour    restrained modern-shooter HUD. Warm off-white ink in three
 *            levels, ONE warm accent (amber: your score, your objective, your
 *            focus), red for threat and damage only. No neon, no glow.
 *  contrast  every text run carries a tight symmetric outline plus a soft seat,
 *            and the big blocks sit on subtle feathered dark plates, so the HUD
 *            survives a blown-out sky and a black interior alike.
 */

const FONTS = `
@font-face { font-family:"Barlow Condensed"; font-style:normal; font-weight:500; font-display:swap;
  src:url(${barlow500}) format("woff2"); }
@font-face { font-family:"Barlow Condensed"; font-style:normal; font-weight:600; font-display:swap;
  src:url(${barlow600}) format("woff2"); }
@font-face { font-family:"Barlow Condensed"; font-style:normal; font-weight:700; font-display:swap;
  src:url(${barlow700}) format("woff2"); }
@font-face { font-family:"Inter"; font-style:normal; font-weight:100 900; font-display:swap;
  src:url(${interVar}) format("woff2"); }
`;

const CSS = `
.ow-hud, .ow-hud * { margin:0; padding:0; box-sizing:border-box; }

.ow-hud {
  --k: 1;
  --u: calc(4px * var(--k));
  --pad: calc(var(--u) * 6.5);

  /* ---- palette ---- */
  --ink:   rgba(243,241,235,.96);
  --ink-2: #c4c1ba;
  --ink-3: #9f9c96;               /* floor for micro-labels: never dimmer */
  --hair:  rgba(255,255,255,.16);
  --hair-2:rgba(255,255,255,.07);

  --acc:    #E9B64A;              /* the one warm accent (gold) */
  --acc-2:  rgba(237,181,76,.55);
  --acc-3:  rgba(237,181,76,.14);
  --red:    #E4412E;              /* threat, damage, empty */
  --enemy:  #F2654F;              /* threat as TEXT: one step brighter */
  --blood:  #7d100b;
  --friend: #A9C6DC;              /* friendlies: a cool, quiet steel */
  --hostile:#C4675A;              /* hostile callsigns on the radio: muted red */
  --amber:  var(--acc);           /* caution reads in the accent */
  --plate:  rgba(9,10,11,.50);    /* backing plate for HUD blocks */

  --sh: 0 1px 2px rgba(0,0,0,.92), 0 0 calc(10px * var(--k)) rgba(0,0,0,.45);
  --sh-hard: 0 1px 1px rgba(0,0,0,.95);

  /* Symmetric synthesized outlines: a ring of eight equal-radius hard shadows
     reads as a drawn outline and is direction-free. Each is paired with one
     tight soft shadow for the seat. */
  --oc: #070707;
  --o1:
    calc(1.2px * var(--k)) 0 0 var(--oc), calc(-1.2px * var(--k)) 0 0 var(--oc),
    0 calc(1.2px * var(--k)) 0 var(--oc), 0 calc(-1.2px * var(--k)) 0 var(--oc),
    calc(.9px * var(--k)) calc(.9px * var(--k)) 0 var(--oc),
    calc(-.9px * var(--k)) calc(.9px * var(--k)) 0 var(--oc),
    calc(.9px * var(--k)) calc(-.9px * var(--k)) 0 var(--oc),
    calc(-.9px * var(--k)) calc(-.9px * var(--k)) 0 var(--oc);
  --o2:
    calc(1.6px * var(--k)) 0 0 var(--oc), calc(-1.6px * var(--k)) 0 0 var(--oc),
    0 calc(1.6px * var(--k)) 0 var(--oc), 0 calc(-1.6px * var(--k)) 0 var(--oc),
    calc(1.15px * var(--k)) calc(1.15px * var(--k)) 0 var(--oc),
    calc(-1.15px * var(--k)) calc(1.15px * var(--k)) 0 var(--oc),
    calc(1.15px * var(--k)) calc(-1.15px * var(--k)) 0 var(--oc),
    calc(-1.15px * var(--k)) calc(-1.15px * var(--k)) 0 var(--oc);
  --sh-o1: var(--o1), 0 0 calc(4px * var(--k)) rgba(0,0,0,.7);
  --sh-o2: var(--o2), 0 0 calc(6px * var(--k)) rgba(0,0,0,.75);

  --ff: ${FONT_STACK};
  --fd: ${FONT_DISPLAY};
  --fs: ${FONT_SANS};
  --fm: ${FONT_MONO};

  position: fixed; inset: 0;
  pointer-events: none;
  z-index: 10;
  font-family: var(--ff);
  font-weight: 500;
  color: var(--ink);
  letter-spacing: .06em;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1, "lnum" 1;
  -webkit-font-smoothing: antialiased;
  text-transform: uppercase;
  overflow: hidden;
  contain: layout style;
  user-select: none;
}

.ow-hud .lbl {
  font-size: max(10px, calc(11.5px * var(--k)));
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
  background: linear-gradient(to top, rgba(255,255,255,.62), #fff 62%);
  box-shadow: 0 0 0 1px rgba(0,0,0,.55), 0 0 calc(3px * var(--k)) rgba(0,0,0,.75);
  transform-origin: 50% 50%;
  will-change: transform, opacity;
}
.ow-dot {
  position:absolute; left:0; top:0;
  width: calc(2.2px * var(--k)); height: calc(2.2px * var(--k));
  margin-left: calc(-1.1px * var(--k)); margin-top: calc(-1.1px * var(--k));
  background:#fff; border-radius:50%;
  box-shadow: 0 0 0 1px rgba(0,0,0,.6), 0 0 calc(4px * var(--k)) rgba(0,0,0,.7);
  will-change: opacity, transform;
}
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
    radial-gradient(ellipse 78% 74% at 50% 50%, rgba(0,0,0,0) 62%, rgba(122,14,10,.30) 86%, rgba(74,8,5,.60) 100%);
  filter: url(#ow-warp);
}
.ow-blood-b {
  position:absolute; inset:0; opacity:.5; mix-blend-mode:multiply;
  background:
    radial-gradient(circle at 2% 22%,  rgba(96,10,8,.75) 0, rgba(96,10,8,0) 17%),
    radial-gradient(circle at 99% 58%, rgba(96,10,8,.7) 0, rgba(96,10,8,0) 15%),
    radial-gradient(circle at 26% 101%,rgba(88,10,8,.75) 0, rgba(88,10,8,0) 19%),
    radial-gradient(circle at 74% -2%, rgba(88,10,8,.7) 0, rgba(88,10,8,0) 18%);
  filter: url(#ow-warp);
}
.ow-desat { position:absolute; inset:0; backdrop-filter: saturate(.6) contrast(1.04) brightness(.97); }
.ow-hitflash { position:absolute; inset:0;
  background: radial-gradient(ellipse 90% 86% at 50% 50%, rgba(150,16,10,.22) 40%, rgba(160,18,12,.62) 100%);
  mix-blend-mode:screen; }
.ow-lowbeat {
  position:absolute; inset:0;
  background: radial-gradient(ellipse 76% 70% at 50% 50%, rgba(0,0,0,0) 64%, rgba(150,14,10,.34) 100%);
}

/* ====================================================== vitals (bottom left)
   Mirror of the ammo block. Sits on a feathered plate so the track reads over
   sunlit gravel; armour is a thinner, plate-segmented steel row underneath so
   it can never be mistaken for health. */
.ow-vitals {
  position:absolute; left:var(--pad); bottom:var(--pad);
  width: calc(220px * var(--k));
  isolation:isolate;
}
.ow-vitals::before {
  content:''; position:absolute; z-index:-1;
  left: calc(-14px * var(--k)); right: calc(-40px * var(--k));
  top: calc(-12px * var(--k)); bottom: calc(-12px * var(--k));
  background: linear-gradient(90deg, var(--plate) 0%, var(--plate) 55%, rgba(9,10,11,0) 100%);
}
.ow-vt-head {
  display:flex; align-items:baseline; justify-content:space-between;
  margin-bottom: calc(var(--u) * 1.2);
}
.ow-vt-lbl {
  font-size: max(10px, calc(12.5px * var(--k))); letter-spacing:.22em; color: var(--ink-2); font-weight:600;
  text-shadow: var(--sh-o1);
}
.ow-vt-num {
  font-family: var(--fd); font-size: calc(30px * var(--k)); font-weight:600;
  letter-spacing:.01em; line-height:.85; color: var(--ink);
  text-shadow: var(--o2), 0 0 calc(12px * var(--k)) rgba(0,0,0,.5);
  will-change: color, transform;
}
.ow-vt-num i {
  font-style:normal; font-family: var(--ff); font-size: max(10px, calc(13px * var(--k))); font-weight:500;
  color: var(--ink-3); letter-spacing:.08em; margin-left: calc(2px * var(--k));
}
.ow-vt-track {
  position:relative; height: calc(7px * var(--k));
  background: rgba(8,9,10,.62);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.10);
  overflow:hidden;
}
.ow-vt-track > i {
  position:absolute; left:0; top:0; bottom:0; width:100%;
  transform-origin:left center;
  background: linear-gradient(to bottom, #fbf9f4 0%, #e9e5dc 55%, #cfcac0 100%);
  will-change: transform;
}
.ow-vt-track > u {
  position:absolute; left:0; right:0; top:0; bottom:0;
  background-image: repeating-linear-gradient(to right,
    rgba(0,0,0,0) 0, rgba(0,0,0,0) calc(20% - 1px),
    rgba(8,9,10,.85) calc(20% - 1px), rgba(8,9,10,.85) 20%);
}
.ow-vitals.low .ow-vt-track > i { background: linear-gradient(to bottom, #f7cf7c, var(--acc)); }
.ow-vitals.low .ow-vt-num { color: var(--acc); }
.ow-vitals.crit .ow-vt-track > i { background: linear-gradient(to bottom, #f36d58, var(--red)); }
.ow-vitals.crit .ow-vt-num { color: var(--red); }

.ow-armour {
  display:flex; align-items:center; gap: calc(var(--u) * 1.6);
  margin-top: calc(var(--u) * 1.6);
}
.ow-armour .ow-vt-lbl { color: var(--ink-2); font-size: max(10px, calc(11.5px * var(--k))); }
.ow-arm-plates { display:flex; gap: calc(var(--u) * .8); flex:1; }
.ow-plate {
  flex:1; height: calc(4px * var(--k));
  background: rgba(8,9,10,.62);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.09);
  position:relative; overflow:hidden;
}
.ow-plate i {
  position:absolute; left:0; top:0; bottom:0; width:100%;
  background: linear-gradient(to bottom, #d9e2e8, #97a9b6);
  transform-origin: left center;
}

/* ================================================================== ammo */
.ow-ammo {
  position:absolute; right:var(--pad); bottom:var(--pad);
  --ammo-w: calc(188px * var(--k));
  --gut: calc(8px * var(--k));
  width: var(--ammo-w);
  text-align:right; line-height:1;
  isolation:isolate;
}
.ow-ammo::before {
  content:''; position:absolute; z-index:-1;
  right: calc(-14px * var(--k)); left: calc(-54px * var(--k));
  top: calc(-12px * var(--k)); bottom: calc(-12px * var(--k));
  background: linear-gradient(270deg, var(--plate) 0%, var(--plate) 55%, rgba(9,10,11,0) 100%);
}
.ow-ammo-head {
  display:grid; grid-auto-flow:column; grid-auto-columns:max-content;
  justify-content:end; align-items:center;
  column-gap: var(--gut); margin-bottom:calc(var(--u) * 1.2);
}
.ow-ammo-name {
  font-size: max(10px, calc(14px * var(--k))); letter-spacing:.16em; font-weight:600;
  color: var(--ink); text-shadow: var(--sh-o1);
  white-space:nowrap; overflow:hidden; text-overflow:clip;
  max-width: calc(var(--ammo-w) - 52px * var(--k));
}
.ow-ammo-mode {
  font-size: max(10px, calc(10.5px * var(--k))); letter-spacing:.18em; color: var(--ink-2); font-weight:600;
  border:1px solid var(--hair); padding: calc(1.5px * var(--k)) calc(4px * var(--k));
  background: rgba(8,9,10,.34);
  text-shadow: var(--sh-hard); white-space:nowrap;
}
.ow-ammo-row {
  display:grid; grid-auto-flow:column; grid-auto-columns:max-content;
  justify-content:end; align-items:baseline;
  column-gap: calc(var(--gut) * .55);
}
.ow-ammo-cur {
  font-family: var(--fd);
  font-size: calc(62px * var(--k)); font-weight:600; letter-spacing:0;
  color: var(--ink); text-shadow: var(--o2), 0 0 calc(16px * var(--k)) rgba(0,0,0,.5);
  will-change: color, transform;
}
.ow-ammo-sep { font-size: calc(22px * var(--k)); color: var(--ink-3); font-weight:500;
  text-shadow: var(--sh-o1); }
.ow-ammo-res { font-family: var(--fd); font-size: calc(27px * var(--k)); font-weight:500; color: var(--ink-2);
  text-shadow: var(--sh-o1); }
.ow-ammo-low .ow-ammo-cur { color: var(--acc); }
.ow-ammo-empty .ow-ammo-cur { color: var(--red); }

.ow-mag {
  display:flex; justify-content:flex-end; gap: calc(1.6px * var(--k));
  margin-top: calc(var(--u) * 1.2);
}
.ow-mag b {
  display:block; width: calc(2.6px * var(--k)); height: calc(10px * var(--k));
  background: var(--ink); box-shadow: 0 0 0 1px rgba(8,9,10,.75);
}
.ow-mag b.off { background: rgba(8,9,10,.62); box-shadow: 0 0 0 1px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.07); }
.ow-mag b.warn { background: var(--acc); }

.ow-reload {
  margin-top: calc(var(--u) * 1.6);
  font-size: max(10px, calc(12px * var(--k))); letter-spacing:.26em; color: var(--acc); font-weight:600;
  text-shadow: var(--sh-o1);
}
.ow-reload-bar {
  margin-top: calc(var(--u) * .8); margin-left:auto; margin-right:0;
  width: calc(86px * var(--k)); height: calc(2.5px * var(--k));
  background: rgba(8,9,10,.7); box-shadow: 0 0 0 1px rgba(0,0,0,.4);
}
.ow-reload-bar i { display:block; height:100%; width:0; background: var(--acc); transform-origin:left; }

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
.ow-slot span { font-size: max(10px, calc(13px * var(--k))); color: var(--ink-2); font-weight:600; text-shadow: var(--sh-o1);
  min-width: calc(7px * var(--k)); text-align:left; }
.ow-slot.empty { opacity:.34; }

/* ============================================================== killfeed */
.ow-killfeed {
  position:absolute; right:var(--pad); top:calc(var(--pad) + var(--u) * 2);
  display:flex; flex-direction:column; align-items:flex-end;
  gap: calc(var(--u) * 1);
}
.ow-kf-row {
  position:relative;
  display:flex; align-items:center; gap: calc(var(--u) * 1.6);
  font-size: calc(15px * var(--k)); letter-spacing:.08em; font-weight:600;
  padding: calc(var(--u) * .9) calc(var(--u) * 1.8);
  border-right: calc(2px * var(--k)) solid rgba(255,255,255,.2);
  text-shadow: var(--sh-o1);
  will-change: transform, opacity;
}
.ow-kf-row::before {
  content:''; position:absolute; inset:0; z-index:-1;
  background: rgba(9,10,11,.56);
  -webkit-mask-image: linear-gradient(to right, rgba(0,0,0,0) 0%, #000 22%, #000 100%);
          mask-image: linear-gradient(to right, rgba(0,0,0,0) 0%, #000 22%, #000 100%);
}
.ow-kf-row.mine { border-right-color: var(--acc); }
.ow-kf-a { color: var(--friend); }
.ow-kf-v { color: var(--enemy); }
.ow-kf-row.mine .ow-kf-a { color: var(--ink); }
/* Role prefix — RIFLEMAN ▸ before the callsign. Dimmer and a size down so the
   eye lands on the name; the role is context, not the headline. */
.ow-kf-vv { color: var(--ink-3); letter-spacing:.12em; font-size: max(10px, calc(12.5px * var(--k))); font-weight:500; }
/* Multi-kill note row: your gain, so the accent. */
.ow-kf-note { color: var(--acc); font-weight:600; letter-spacing:.18em; }
.ow-kf-row.note { border-right-color: var(--acc); }
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
.ow-compass::before {
  content:''; position:absolute; inset:0;
  background: linear-gradient(to bottom,
    rgba(9,10,11,0) 0%, rgba(9,10,11,.42) 20%, rgba(9,10,11,.42) 66%,
    rgba(9,10,11,.18) 88%, rgba(9,10,11,0) 100%);
  -webkit-mask-image: linear-gradient(to right, rgba(0,0,0,0) 0%, #000 20%, #000 80%, rgba(0,0,0,0) 100%);
          mask-image: linear-gradient(to right, rgba(0,0,0,0) 0%, #000 20%, #000 80%, rgba(0,0,0,0) 100%);
}
/* NO will-change:transform on the strip — deliberate. Promoting it to its own
   composited layer froze its sub-pixel raster at a wall-clock-dependent moment
   and broke capture determinism. Unpromoted, it repaints from its transform. */
.ow-compass-strip { position:absolute; left:0; top:0; height:100%; }
.ow-tick {
  position:absolute; top: calc(19px * var(--k));
  width:1px; background: rgba(255,255,255,.7);
  height: calc(4px * var(--k));
  box-shadow: 0 0 0 1px rgba(8,9,10,.6), 0 0 calc(2px * var(--k)) rgba(0,0,0,.9);
}
.ow-tick.maj { height: calc(7.5px * var(--k)); width: calc(1.5px * var(--k)); background: rgba(255,255,255,.95); }
.ow-tick-l {
  position:absolute; top: calc(0px * var(--k)); transform: translateX(-50%);
  font-size: calc(15px * var(--k)); letter-spacing:.08em; font-weight:600;
  color: var(--ink); text-shadow: var(--sh-o1);
}
.ow-tick-l.sub { font-size: max(10px, calc(11px * var(--k))); font-weight:600; color: var(--ink-2);
  top: calc(3px * var(--k)); }
.ow-compass-base {
  position:absolute; left:0; right:0; top: calc(18px * var(--k)); height:1px;
  background: linear-gradient(to right, transparent, rgba(255,255,255,.4), transparent);
  box-shadow: 0 1px 0 rgba(8,9,10,.5);
}
.ow-compass-caret {
  position:absolute; left:50%; top:calc(12.5px * var(--k)); transform:translateX(-50%);
  width:0; height:0;
  border-left: calc(4.5px * var(--k)) solid transparent;
  border-right: calc(4.5px * var(--k)) solid transparent;
  border-top: calc(5.5px * var(--k)) solid var(--acc);
  filter: drop-shadow(0 1px 2px rgba(0,0,0,.95));
}
.ow-compass-obj {
  position:absolute; top: calc(27px * var(--k)); transform:translateX(-50%);
  font-size: max(10px, calc(10.5px * var(--k))); font-weight:700; letter-spacing:.04em;
  width: calc(14px * var(--k)); height: calc(14px * var(--k));
  display:flex; align-items:center; justify-content:center;
  color:#15110a; background: var(--acc);
  box-shadow: 0 1px 2px rgba(0,0,0,.8);
  will-change: transform;
}

/* =============================================================== run bar
   Top centre under the compass: the persistent objective readout — wave,
   objective, the running score (tweened in RunBar) and the streak chip. */
.ow-runbar {
  position:absolute; left:50%; top:calc(var(--pad) * .7 + 44px * var(--k));
  transform: translateX(-50%);
  display:flex; flex-direction:column; align-items:center;
  gap: calc(var(--u) * .9);
  padding: calc(var(--u) * 1.4) calc(var(--u) * 16);
  text-shadow: var(--sh-o1); white-space:nowrap;
  isolation:isolate;
}
.ow-runbar::before {
  content:''; position:absolute; inset:0; z-index:-1;
  background: linear-gradient(to bottom, rgba(9,10,11,0) 0%, rgba(9,10,11,.38) 30%, rgba(9,10,11,.38) 70%, rgba(9,10,11,0) 100%);
  -webkit-mask-image: linear-gradient(to right, rgba(0,0,0,0) 0%, #000 30%, #000 70%, rgba(0,0,0,0) 100%);
          mask-image: linear-gradient(to right, rgba(0,0,0,0) 0%, #000 30%, #000 70%, rgba(0,0,0,0) 100%);
}
.ow-rb-wave {
  display:flex; align-items:center; gap: calc(var(--u) * 2);
  font-size: max(10px, calc(13px * var(--k))); letter-spacing:.22em; color: var(--ink); font-weight:600;
}
.ow-rb-wave b { color: var(--acc); font-weight:700; letter-spacing:.2em; }
.ow-rb-wave .thr { color: var(--ink); }
.ow-rb-wave .dot { width:1px; height:calc(11px * var(--k)); background: var(--hair); }
.ow-rb-main { display:flex; align-items:center; gap: calc(var(--u) * 2); }
.ow-rb-score {
  font-family: var(--fd); font-weight:600; letter-spacing:.04em;
  font-size: calc(30px * var(--k)); line-height:.9; color: var(--ink);
  text-shadow: var(--o1), 0 0 calc(10px * var(--k)) rgba(0,0,0,.4);
}
.ow-rb-mult {
  font-family: var(--fd); font-weight:700; letter-spacing:.02em;
  font-size: calc(15px * var(--k)); color: var(--acc); line-height:1;
  padding: calc(2px * var(--k)) calc(5px * var(--k));
  border: 1px solid var(--acc-2); background: rgba(9,10,11,.4);
  will-change: transform;
}
.ow-rb-mult.hot { color: #15110a; background: var(--acc); border-color: var(--acc); text-shadow:none; }
.ow-rb-mult.hidden { opacity:0; }

/* =============================================================== minimap */
.ow-minimap {
  position:absolute; left:var(--pad); top:var(--pad);
  width: calc(178px * var(--k)); height: calc(178px * var(--k));
}
.ow-minimap::before {
  content:''; position:absolute;
  inset: calc(-7px * var(--k));
  border-radius: calc(6px * var(--k));
  background: rgba(9,10,11,.10);
  box-shadow: 0 0 calc(16px * var(--k)) calc(6px * var(--k)) rgba(9,10,11,.06);
  pointer-events:none;
}
.ow-minimap canvas {
  position:absolute; inset:0; width:100%; height:100%; display:block;
  border-radius: calc(3px * var(--k));
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.14), 0 calc(2px * var(--k)) calc(10px * var(--k)) rgba(0,0,0,.3);
}
.ow-mm-corner { position:absolute; width:calc(9px * var(--k)); height:calc(9px * var(--k)); }
.ow-mm-corner::before, .ow-mm-corner::after { content:''; position:absolute; background:rgba(255,255,255,.34); }
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
  position:absolute; left:50%; top:calc(-15px * var(--k)); transform:translateX(-50%);
  font-size: max(10px, calc(11px * var(--k))); font-weight:600; letter-spacing:.2em; color:var(--ink-2); text-shadow:var(--sh);
}
.ow-mm-tag {
  position:absolute; left:0; top:calc(100% + var(--u) * 1.4); display:flex; gap:calc(var(--u)*1.5);
  font-size: max(10px, calc(12.5px * var(--k))); font-weight:600; letter-spacing:.18em; color:var(--ink-2); text-shadow:var(--sh-o1);
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
  font-size: max(10px, calc(10.5px * var(--k))); color:#15110a; font-weight:700;
}
.ow-mk-dist {
  margin-top: calc(var(--u) * .6);
  font-size: max(10px, calc(11.5px * var(--k))); font-weight:600; letter-spacing:.1em; color: var(--ink);
  text-shadow: var(--sh);
}
.ow-mk-name { font-size: max(10px, calc(10.5px * var(--k))); font-weight:600; letter-spacing:.16em; color: var(--ink-2); text-shadow:var(--sh); }
.ow-mk.threat .ow-mk-dist { color: var(--red); }

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
  font-size: max(10px, calc(10.5px * var(--k))); font-weight:600; letter-spacing:.22em; color:var(--red); white-space:nowrap;
  text-shadow: var(--sh);
}

/* ======================================================== damage numbers */
.ow-dn {
  position:absolute; left:0; top:0; font-family: var(--fd);
  font-size: calc(19px * var(--k)); font-weight:600; letter-spacing:.02em;
  color: var(--ink); text-shadow: 0 1px 2px rgba(0,0,0,.95), 0 0 calc(8px * var(--k)) rgba(0,0,0,.6);
  will-change: transform, opacity;
}
.ow-dn.hs   { color: var(--acc); font-size: calc(23px * var(--k)); }
.ow-dn.kill { color: var(--red); font-size: calc(25px * var(--k)); }
.ow-dn.armour { color: var(--friend); }

/* ======================================================= score callouts
   Just below-right of the reticle, newest on top. Small on purpose: the
   information is "that counted", not a celebration. */
.ow-xp {
  position:absolute; left: calc(50% + 40px); top: calc(50% + 24px);
  display:flex; flex-direction:column; align-items:flex-start;
  gap: calc(var(--u) * .5);
}
.ow-xp-row {
  display:flex; align-items:baseline; gap: calc(var(--u) * 2);
  white-space:nowrap; text-shadow: var(--sh-o1);
  will-change: transform, opacity;
}
.ow-xp-row b { font-family: var(--fd); font-weight:700; font-size: calc(20px * var(--k));
  color: var(--acc); letter-spacing:.02em; min-width: calc(44px * var(--k)); }
.ow-xp-row span { font-size: max(10px, calc(14px * var(--k))); font-weight:600; letter-spacing:.16em; color: var(--ink); }
.ow-xp-row:not(:first-child) b { color: var(--acc-2); }
.ow-xp-row:not(:first-child) span { color: var(--ink-2); }

/* ================================================================ prompt */
.ow-prompt {
  position:absolute; left:50%; top:62%;
  transform: translate(-50%,-50%);
  display:flex; align-items:center; gap: calc(var(--u) * 2);
  will-change: opacity, transform;
}
.ow-key {
  min-width: calc(24px * var(--k)); height: calc(24px * var(--k));
  padding: 0 calc(var(--u) * 1.2);
  display:flex; align-items:center; justify-content:center;
  font-size: max(10px, calc(13px * var(--k))); font-weight:700; letter-spacing:.04em;
  border: 1px solid rgba(255,255,255,.55); border-radius: calc(2px * var(--k));
  background: rgba(9,10,11,.45);
  box-shadow: 0 1px 3px rgba(0,0,0,.7);
  text-shadow: var(--sh-hard);
}
.ow-prompt-txt { font-size: max(10px, calc(14px * var(--k))); font-weight:600; letter-spacing:.18em; text-shadow: var(--sh-o1); }
.ow-prompt-sub { font-size: max(10px, calc(11px * var(--k))); font-weight:600; letter-spacing:.2em; color:var(--ink-2); text-shadow: var(--sh-o1); }
.ow-prompt-arc { position:absolute; left:calc(-6px * var(--k)); top:50%; }

/* ================================================================ banner
   The wave beat. Upper third, on a flat feathered band. */
.ow-banner {
  position:absolute; left:50%; top:27%;
  transform: translate(-50%,-50%);
  text-align:center;
  padding: calc(var(--u) * 4) calc(var(--u) * 32);
  will-change: opacity, transform;
}
.ow-banner::before {
  content:''; position:absolute; inset:0; z-index:-1;
  background: linear-gradient(to bottom,
    rgba(9,10,11,0) 0%, rgba(9,10,11,.58) 22%, rgba(9,10,11,.58) 78%, rgba(9,10,11,0) 100%);
  -webkit-mask-image: linear-gradient(to right, rgba(0,0,0,0) 0%, #000 22%, #000 78%, rgba(0,0,0,0) 100%);
          mask-image: linear-gradient(to right, rgba(0,0,0,0) 0%, #000 22%, #000 78%, rgba(0,0,0,0) 100%);
}
.ow-banner-t {
  font-family: var(--fd);
  font-size: calc(46px * var(--k)); letter-spacing:.16em; font-weight:700; line-height:1;
  text-shadow: var(--sh-o2);
}
.ow-banner-s {
  margin-top: calc(var(--u) * 1.8);
  font-size: max(10px, calc(14px * var(--k))); letter-spacing:.28em; color: var(--acc); font-weight:600;
  text-shadow: var(--sh-o1);
}
.ow-banner.threat .ow-banner-s { color: var(--enemy); }
.ow-banner.clear .ow-banner-s { color: var(--acc); }
.ow-banner-rule {
  margin: calc(var(--u) * 2) auto 0; width: calc(56px * var(--k)); height: calc(2px * var(--k));
  background: var(--acc);
}
.ow-banner.threat .ow-banner-rule { background: var(--red); }

/* ================================================================= radio
   Command's net, bottom centre. Speaker name then line, on a tight dark plate,
   the way a modern shooter subtitles radio traffic. */
.ow-radio {
  position:absolute; left:50%; bottom: 17%;
  transform: translateX(-50%);
  width: min(calc(980px * var(--k)), 86vw);
  text-align:center;
  will-change: opacity;
}
.ow-radio-line {
  display:inline-block;
  padding: calc(var(--u) * 1.6) calc(var(--u) * 3.6);
  max-width: 62ch;
  background: rgba(0,0,0,.85);
  font-family: var(--fs); text-transform:none; letter-spacing:.005em;
  font-size: calc(21px * var(--k)); font-weight:450; line-height:1.4; color: var(--ink);
  text-shadow: 0 1px 2px rgba(0,0,0,.6);
}
.ow-radio-who {
  font-family: var(--ff); text-transform:uppercase; font-weight:700;
  font-size: calc(19px * var(--k)); letter-spacing:.12em; color: var(--acc);
  margin-right: calc(var(--u) * 2.5);
}
.ow-radio-line.hostile .ow-radio-who { color: var(--hostile); }
.ow-radio-line.hostile { color: var(--ink-2); }

/* ================================================================== menu */
.ow-menu {
  position:absolute; inset:0; pointer-events:auto;
  background: linear-gradient(105deg, rgba(7,7,8,.92) 0%, rgba(7,7,8,.74) 46%, rgba(7,7,8,.44) 100%);
  backdrop-filter: blur(calc(9px * var(--k))) saturate(.7) brightness(.8);
  opacity:0; will-change: opacity;
}
.ow-menu-inner {
  position:absolute; left: calc(var(--u) * 22); top:50%;
  transform: translateY(-50%);
  width: calc(440px * var(--k));
  padding-left: calc(var(--u) * 4.5);
  border-left: calc(2px * var(--k)) solid var(--acc);
}
.ow-menu h1 {
  font-family: var(--fd);
  font-size: calc(52px * var(--k)); font-weight:700; letter-spacing:.14em; line-height:1;
  text-shadow: 0 2px 6px rgba(0,0,0,.8);
}
.ow-menu .sub {
  margin-top: calc(var(--u) * 1.6); font-size: max(10px, calc(12px * var(--k))); font-weight:600;
  letter-spacing:.26em; color: var(--acc);
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
.ow-row > .name { font-size: max(10px, calc(13.5px * var(--k))); font-weight:600; letter-spacing:.18em; color: var(--ink); }
.ow-row > .val { font-family: var(--fd); font-size: max(10px, calc(14px * var(--k))); font-weight:600; color: var(--acc);
  letter-spacing:.04em; min-width: calc(46px * var(--k)); text-align:right; }
.ow-seg { display:flex; gap:0; }
.ow-seg button {
  appearance:none; border:1px solid var(--hair); border-right:0; background:rgba(255,255,255,.03);
  color: var(--ink-2); font-family:var(--ff); font-weight:600; text-transform:uppercase;
  font-size: max(10px, calc(12px * var(--k))); letter-spacing:.14em;
  padding: calc(var(--u) * 1.3) calc(var(--u) * 2.2);
  cursor:pointer; position:relative; transition: color .12s, background .12s;
}
.ow-seg button:last-child { border-right:1px solid var(--hair); }
.ow-seg button:hover { color: var(--ink); background: rgba(255,255,255,.08); }
.ow-seg button.on { color:#15110a; background: var(--acc); border-color: var(--acc); text-shadow:none; }
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
}
.ow-slider input {
  position:absolute; inset:0; width:100%; height:100%; margin:0;
  appearance:none; background:transparent; cursor:pointer; opacity:0;
}
.ow-btns { margin-top: calc(var(--u) * 5); display:flex; gap: calc(var(--u) * 2.5); }
.ow-btn {
  appearance:none; border:1px solid var(--hair); background: rgba(255,255,255,.05);
  color: var(--ink); font-family: var(--ff); font-weight:600; text-transform:uppercase;
  font-size: max(10px, calc(14px * var(--k))); letter-spacing:.16em;
  padding: calc(var(--u) * 2.6) calc(var(--u) * 6);
  cursor:pointer; transition: background .12s, border-color .12s, color .12s;
}
.ow-btn:hover { background: rgba(255,255,255,.12); border-color: rgba(255,255,255,.4); }
.ow-btn.primary { background: var(--acc); border-color: var(--acc); color:#15110a; }
.ow-btn.primary:hover { background:#f6c870; border-color:#f6c870; }
.ow-menu .hint {
  margin-top: calc(var(--u) * 4); font-size: max(10px, calc(11px * var(--k))); font-weight:600;
  letter-spacing:.18em; color: var(--ink-3);
}

/* ================================================================= title
   Mission card + loadout select. The render loop keeps running under it, so
   the town reads through the right-hand side: the scrim is a left-weighted
   ramp plus a floor for the loadout cards, not a wall. */
.ow-attract {
  position:absolute; inset:0; pointer-events:auto; overflow:hidden; cursor:default;
  background:
    linear-gradient(0deg, rgba(0,0,0,.86) 0%, rgba(0,0,0,.55) 28%, rgba(0,0,0,0) 54%),
    linear-gradient(90deg, rgba(0,0,0,.70) 0%, rgba(0,0,0,.70) 38%, rgba(0,0,0,.28) 62%, rgba(0,0,0,.06) 100%);
  -webkit-backdrop-filter: blur(7px) saturate(.85);
          backdrop-filter: blur(7px) saturate(.85);
  color: var(--ink);
  opacity:0; will-change:opacity;
}
.ow-att-top {
  position:absolute; left: calc(var(--u) * 18); right: calc(var(--u) * 18); top: calc(var(--u) * 9);
  display:flex; align-items:center; justify-content:space-between;
  font-size: max(10px, calc(14px * var(--k))); font-weight:600; letter-spacing:.28em; color: var(--ink);
}
.ow-att-unit { display:flex; align-items:center; gap: calc(var(--u) * 2.5); }
.ow-crest { width: calc(22px * var(--k)); height: calc(22px * var(--k)); color: var(--acc); display:block; }
.ow-att-net { display:flex; align-items:center; gap: calc(var(--u) * 2); color: var(--ink-2); }
.ow-att-net::before { content:''; width: calc(6px * var(--k)); height: calc(6px * var(--k));
  border-radius:50%; background: var(--acc); }

.ow-att-left {
  position:absolute; left: calc(var(--u) * 18); top: 13%;
  width: calc(640px * var(--k));
}
.ow-att-title {
  font-family: var(--fd); font-weight:700;
  font-size: calc(150px * var(--k)); line-height:.8; letter-spacing:.005em;
  color: var(--ink);
  text-shadow: 0 calc(4px * var(--k)) calc(30px * var(--k)) rgba(0,0,0,.45);
}
.ow-att-rule { width: calc(72px * var(--k)); height: calc(4px * var(--k)); background: var(--acc);
  margin: calc(var(--u) * 7) 0 calc(var(--u) * 6); }
.ow-ms-head { display:flex; align-items:center; gap: calc(var(--u) * 2.5);
  font-size: max(10px, calc(13px * var(--k))); font-weight:600; letter-spacing:.3em; }
.ow-ms-tag { color: var(--acc); }
.ow-ms-tag.dim { color: var(--ink-3); }
.ow-ms-sep { width:1px; height: calc(12px * var(--k)); background: var(--hair); }
.ow-ms-name {
  font-family: var(--fd); font-weight:600; font-size: calc(42px * var(--k));
  letter-spacing:.06em; line-height:1.05; margin: calc(var(--u) * 2) 0 calc(var(--u) * 4.5);
}
.ow-ms-grid {
  display:grid; grid-template-columns: calc(118px * var(--k)) 1fr;
  column-gap: calc(var(--u) * 4); row-gap: calc(var(--u) * 2.4);
  padding-top: calc(var(--u) * 4); border-top: 1px solid var(--hair);
  align-items:baseline;
}
.ow-ms-grid .k { font-size: max(10px, calc(14px * var(--k))); font-weight:600; letter-spacing:.22em; color: var(--ink-2); }
.ow-ms-grid .v { font-family: var(--fs); text-transform:none; letter-spacing:0;
  font-size: calc(17px * var(--k)); line-height:1.35; color: var(--ink); font-weight:400; }

.ow-att-loadouts {
  position:absolute; left: calc(var(--u) * 18); bottom: calc(var(--u) * 19);
  width: min(calc(1200px * var(--k)), calc(100vw - var(--u) * 36));
}
.ow-lo-head {
  display:flex; align-items:baseline; justify-content:space-between;
  font-size: max(10px, calc(14px * var(--k))); font-weight:600; letter-spacing:.3em; color: var(--ink);
  margin-bottom: calc(var(--u) * 3);
}
.ow-lo-hint { font-size: max(10px, calc(13.5px * var(--k))); letter-spacing:.2em; color: var(--ink-2); }
.ow-lo-cards { display:grid; grid-template-columns: repeat(3, 1fr); gap: calc(var(--u) * 3); }
.ow-lo-card {
  position:relative; cursor:pointer; text-align:left;
  padding: calc(var(--u) * 5) calc(var(--u) * 5) calc(var(--u) * 4.5);
  background: rgba(16,16,15,.80);
  border: 1px solid rgba(255,255,255,.09);
  transition: border-color .12s, background .12s;
}
.ow-lo-card::before {
  content:''; position:absolute; left:-1px; right:-1px; top:-1px; height: calc(3px * var(--k));
  background: rgba(255,255,255,.14); transition: background .12s;
}
.ow-lo-card.on { background: rgba(24,22,18,.90); border-color: var(--acc-2); }
.ow-lo-card.on::before { background: var(--acc); }
.ow-lo-top { display:flex; align-items:baseline; gap: calc(var(--u) * 2.5); }
.ow-lo-idx { font-family: var(--fd); font-weight:600; font-size: calc(15px * var(--k)); color: var(--ink-3); }
.ow-lo-code { font-size: max(10px, calc(12.5px * var(--k))); font-weight:600; letter-spacing:.3em; color: var(--ink-2); }
.ow-lo-card.on .ow-lo-code { color: var(--acc); }
.ow-lo-name { font-family: var(--fd); font-weight:600; font-size: calc(32px * var(--k));
  letter-spacing:.05em; line-height:1; margin: calc(var(--u) * 2.5) 0 calc(var(--u) * 1.4); }
.ow-lo-kit { font-size: max(10px, calc(14px * var(--k))); font-weight:600; letter-spacing:.2em; color: var(--ink-2); }
.ow-lo-desc { font-family: var(--fs); text-transform:none; letter-spacing:0; font-weight:400;
  font-size: calc(15px * var(--k)); line-height:1.4; color: var(--ink-2);
  margin: calc(var(--u) * 3) 0 calc(var(--u) * 3.5); min-height: calc(42px * var(--k)); }
.ow-lo-stats { display:grid; gap: calc(var(--u) * 1.6); }
.ow-att-loadouts.compact .ow-lo-cards { grid-template-columns: repeat(5, 1fr); gap: calc(var(--u) * 2); }
.ow-att-loadouts.compact .ow-lo-card { padding: calc(var(--u) * 3) calc(var(--u) * 3.5); }
.ow-att-loadouts.compact .ow-lo-card .ow-lo-desc,
.ow-att-loadouts.compact .ow-lo-card .ow-lo-stats,
.ow-att-loadouts.compact .ow-lo-card .ow-lo-cta { display:none; }
.ow-att-loadouts.compact .ow-lo-name { font-size: calc(20px * var(--k)); margin: calc(var(--u) * 1.6) 0 calc(var(--u) * 1); }
.ow-att-loadouts.compact .ow-lo-kit { font-size: max(9px, calc(11.5px * var(--k))); letter-spacing:.14em; }
.ow-att-loadouts.compact .ow-lo-tick { top: calc(var(--u) * 3); right: calc(var(--u) * 3); }
.ow-lo-detail { display:grid; grid-template-columns: 1.4fr 1fr; gap: calc(var(--u) * 6); align-items:center;
  margin-top: calc(var(--u) * 2); padding: calc(var(--u) * 3) calc(var(--u) * 5);
  background: rgba(16,16,15,.80); border: 1px solid rgba(255,255,255,.09); }
.ow-lo-detail .ow-lo-desc { margin:0; min-height:0; }
.ow-lo-stat { display:grid; grid-template-columns: calc(104px * var(--k)) 1fr calc(30px * var(--k)); align-items:center;
  column-gap: calc(var(--u) * 2);
  font-size: max(10px, calc(12.5px * var(--k))); font-weight:600; letter-spacing:.16em; color: var(--ink-2); }
.ow-lo-stat i { display:block; height:3px; position:relative; }
.ow-lo-stat i::before { content:''; position:absolute; left:0; right:0; top:1px; height:1px; background:#333; }
.ow-lo-stat b { position:absolute; inset:0; background: var(--ink-2); transform-origin:left center; }
.ow-lo-stat em { font-style:normal; text-align:right; color: var(--ink-2); font-family: var(--fd); letter-spacing:.02em; }
.ow-lo-card.on .ow-lo-stat em { color: var(--ink); }
.ow-lo-tick { position:absolute; right: calc(var(--u) * 4); top: calc(var(--u) * 4.5);
  width: calc(20px * var(--k)); height: calc(20px * var(--k)); display:none; }
.ow-lo-tick svg { width:100%; height:100%; display:block; }
.ow-lo-card.on .ow-lo-tick { display:block; }
.ow-lo-card.on .ow-lo-stat b { background: var(--ink); }
.ow-lo-cta {
  margin-top: calc(var(--u) * 4); padding-top: calc(var(--u) * 3);
  border-top: 1px solid var(--hair-2);
  font-size: max(10px, calc(13px * var(--k))); font-weight:600; letter-spacing:.3em; color: var(--ink-3);
}
.ow-lo-card.on .ow-lo-cta { color: var(--acc); }
.ow-lo-card.on .ow-lo-cta::after { content:'  ▸'; }

/* map select: one card per registry map, top right, above the scene */
.ow-att-maps {
  position:absolute; right: calc(var(--u) * 18); top: 13%;
  width: calc(440px * var(--k));
  display:grid; gap: calc(var(--u) * 2.4);
}
.ow-att-maps.docked { position:static; width:auto; margin-top: calc(var(--u) * 5);
  grid-template-columns: 1fr 1fr; column-gap: calc(var(--u) * 2.4); }
.ow-att-maps.docked .ow-lo-head { grid-column: 1 / -1; margin-bottom: 0; }
.ow-att-maps.docked .ow-mp-card { grid-template-columns: calc(84px * var(--k)) 1fr; gap: calc(var(--u) * 3);
  padding: calc(var(--u) * 2.4); }
.ow-att-maps.docked .ow-mp-plan { height: calc(62px * var(--k)); }
.ow-att-maps.docked .ow-mp-name { font-size: calc(22px * var(--k)); margin: calc(var(--u) * 1) 0; }
.ow-att-maps.docked .ow-mp-sub { display:none; }
.ow-mp-card {
  position:relative; cursor:pointer; text-align:left;
  display:grid; grid-template-columns: calc(136px * var(--k)) 1fr; gap: calc(var(--u) * 4);
  align-items:center;
  padding: calc(var(--u) * 3.2) calc(var(--u) * 4) calc(var(--u) * 3.2) calc(var(--u) * 3.2);
  background: rgba(16,16,15,.78);
  border: 1px solid rgba(255,255,255,.09);
  transition: border-color .12s, background .12s;
}
.ow-mp-card::before {
  content:''; position:absolute; left:-1px; top:-1px; bottom:-1px; width: calc(3px * var(--k));
  background: rgba(255,255,255,.14); transition: background .12s;
}
.ow-mp-card:hover { border-color: rgba(255,255,255,.2); }
.ow-mp-card.on { background: rgba(24,22,18,.90); border-color: var(--acc-2); }
.ow-mp-card.on::before { background: var(--acc); }
.ow-mp-card.on .ow-lo-code { color: var(--acc); }
.ow-mp-plan {
  display:block; width: 100%; height: calc(96px * var(--k));
  background: rgba(0,0,0,.42); border: 1px solid rgba(255,255,255,.08);
  color: rgba(255,255,255,.55);
}
.ow-mp-card.on .ow-mp-plan { color: var(--acc); }
.ow-mp-name { font-family: var(--fd); font-weight:600; font-size: calc(28px * var(--k));
  letter-spacing:.05em; line-height:1; margin: calc(var(--u) * 1.6) 0 calc(var(--u) * 1.2); }
.ow-mp-sub { font-family: var(--fs); text-transform:none; letter-spacing:0; font-weight:400;
  font-size: calc(14px * var(--k)); line-height:1.35; color: var(--ink-2); margin-top: calc(var(--u) * 1.4); }

.ow-att-foot {
  position:absolute; left: calc(var(--u) * 18); right: calc(var(--u) * 18); bottom: calc(var(--u) * 8);
  display:flex; justify-content:space-between; align-items:baseline;
  font-size: max(10px, calc(13.5px * var(--k))); font-weight:600; letter-spacing:.22em;
}
.ow-att-best { color: var(--ink-2); white-space:pre; }
.ow-att-build { color: var(--ink-2); }

/* ========================================================= death / report */
.ow-screen {
  position:absolute; inset:0; pointer-events:auto; cursor:default;
  display:flex; align-items:center; justify-content:center;
  color: var(--ink); opacity:0; will-change:opacity;
}
.ow-sc-kicker { font-size: max(10px, calc(13px * var(--k))); font-weight:600; letter-spacing:.34em; color: var(--ink-3); }
.ow-sc-title {
  font-family: var(--fd); font-weight:700; letter-spacing:.08em; line-height:.95;
  font-size: calc(44px * var(--k)); margin: calc(var(--u) * 2.5) 0; color: var(--ink);
}
.ow-sc-body {
  font-family: var(--fs); text-transform:none; letter-spacing:0; font-weight:400;
  font-size: calc(17px * var(--k)); line-height:1.5;
  color: var(--ink-2); max-width: calc(560px * var(--k)); margin: 0 auto calc(var(--u) * 8);
}
.ow-sc-actions { display:flex; gap: calc(var(--u) * 3); justify-content:center; flex-wrap:wrap; }
.ow-sc-ghost {
  appearance:none; background:transparent; border:1px solid var(--hair);
  color: var(--ink-2); font-family: var(--ff); font-weight:600; text-transform:uppercase;
  font-size: max(10px, calc(14px * var(--k))); letter-spacing:.16em;
  padding: calc(var(--u) * 2.6) calc(var(--u) * 6); cursor:pointer;
  transition: color .12s, border-color .12s;
}
.ow-sc-ghost:hover { color: var(--ink); border-color: rgba(255,255,255,.4); }

/* DOUG IS DOWN: the frame goes dark and cold from the edges in, a flat band
   carries the verdict. No card, no glow. */
.ow-screen.death {
  background:
    radial-gradient(ellipse 70% 60% at 50% 50%, rgba(10,6,6,.35) 0%, rgba(10,6,6,.62) 60%, rgba(6,4,4,.88) 100%);
}
.ow-death {
  position:relative; width:100%; text-align:center;
  padding: calc(var(--u) * 12) 0 calc(var(--u) * 11);
}
.ow-death::before {
  content:''; position:absolute; inset:0; z-index:-1;
  background: linear-gradient(to bottom, rgba(8,6,6,0) 0%, rgba(8,6,6,.72) 16%, rgba(8,6,6,.72) 84%, rgba(8,6,6,0) 100%);
}
.ow-screen.death .ow-sc-kicker { color: var(--red); }
.ow-screen.death .ow-sc-title { font-size: calc(96px * var(--k)); letter-spacing:.06em; margin: calc(var(--u) * 3) 0 calc(var(--u) * 4); }
.ow-death-killer {
  display:inline-flex; gap: calc(var(--u) * 2);
  font-size: calc(15px * var(--k)); font-weight:600; letter-spacing:.22em; color: var(--enemy);
  padding: calc(var(--u) * 1.4) calc(var(--u) * 3.5);
  border-top: 1px solid rgba(228,65,46,.35); border-bottom: 1px solid rgba(228,65,46,.35);
  margin-bottom: calc(var(--u) * 6);
}

/* AFTER-ACTION REPORT: a document, left-aligned, on a dark sheet. */
.ow-screen.report {
  background: radial-gradient(ellipse 80% 70% at 50% 50%, rgba(8,8,8,.55) 0%, rgba(8,8,8,.82) 100%);
}
.ow-report {
  position:relative; text-align:left;
  width: min(calc(820px * var(--k)), 92vw);
  max-height: 94vh; overflow-y:auto; overflow-x:hidden;
  padding: calc(var(--u) * 9) calc(var(--u) * 11) calc(var(--u) * 9);
  background: rgba(14,14,13,.92);
  border: 1px solid rgba(255,255,255,.08);
  box-shadow: 0 calc(24px * var(--k)) calc(70px * var(--k)) rgba(0,0,0,.55);
}
.ow-report::before {
  content:''; position:absolute; left:-1px; right:-1px; top:-1px; height: calc(4px * var(--k)); background: var(--acc);
}
.ow-rp-head { display:flex; justify-content:space-between; align-items:baseline;
  font-size: max(10px, calc(13px * var(--k))); font-weight:600; letter-spacing:.3em;
  padding-bottom: calc(var(--u) * 4); border-bottom: 1px solid var(--hair); }
.ow-rp-kicker { color: var(--acc); }
.ow-rp-op { color: var(--ink-3); }
.ow-report .ow-sc-title { margin: calc(var(--u) * 6) 0 calc(var(--u) * 3); font-size: calc(52px * var(--k)); }
.ow-rp-score { display:flex; align-items:baseline; gap: calc(var(--u) * 3); }
.ow-sc-score {
  font-family: var(--fd); font-weight:600; font-size: calc(84px * var(--k)); letter-spacing:.02em;
  color: var(--acc); line-height:.9;
}
.ow-rp-unit { font-size: calc(15px * var(--k)); font-weight:600; letter-spacing:.3em; color: var(--ink-3); }
.ow-sc-delta { font-size: max(10px, calc(13.5px * var(--k))); font-weight:600; letter-spacing:.2em; color: var(--ink-2);
  margin: calc(var(--u) * 2.5) 0 calc(var(--u) * 7); }
.ow-sc-delta.miss { color: var(--enemy); }
.ow-screen.best .ow-sc-title { color: var(--acc); }
.ow-sc-stats {
  display:grid; grid-template-columns: repeat(4,1fr); gap: calc(var(--u) * 4);
  margin: 0 0 calc(var(--u) * 7);
}
.ow-sc-stat { border-top:1px solid var(--hair); padding-top: calc(var(--u) * 2.5); }
.ow-sc-stat .k { font-size: max(10px, calc(11.5px * var(--k))); font-weight:600; letter-spacing:.2em; color: var(--ink-3); }
.ow-sc-stat .v { font-family: var(--fd); font-weight:600; font-size: calc(34px * var(--k));
  color: var(--ink); margin-top: calc(var(--u) * 1.2); letter-spacing:.02em; line-height:1; }
.ow-rp-assess { padding: calc(var(--u) * 5) calc(var(--u) * 6); background: rgba(255,255,255,.035);
  border-left: calc(2px * var(--k)) solid var(--acc); margin-bottom: calc(var(--u) * 8); }
.ow-rp-lbl { font-size: max(10px, calc(12px * var(--k))); font-weight:600; letter-spacing:.3em; color: var(--acc);
  margin-bottom: calc(var(--u) * 3); }
.ow-rp-assess p { font-family: var(--fs); text-transform:none; letter-spacing:0; font-weight:400;
  font-size: calc(16px * var(--k)); line-height:1.5; color: var(--ink-2); }
.ow-rp-assess p + p { margin-top: calc(var(--u) * 2); }
.ow-report .ow-sc-actions { justify-content:flex-start; }
.ow-report::-webkit-scrollbar { width: calc(4px * var(--k)); }
.ow-report::-webkit-scrollbar-thumb { background: rgba(255,255,255,.2); }

/* ============================================================ main menu
   The title's look (wordmark, amber rule, briefing grid, map plans) as a real
   front end: an entry list on the left, the focused entry's card on the right. */
.ow-mm-left {
  position:absolute; left: calc(var(--u) * 18); top: 11%;
  width: calc(560px * var(--k));
}
.ow-mm .ow-att-rule { margin: calc(var(--u) * 6) 0 calc(var(--u) * 4); }
.ow-mm-crumb { font-size: max(10px, calc(13px * var(--k))); font-weight:600; letter-spacing:.3em; color: var(--ink-3);
  margin-bottom: calc(var(--u) * 4); white-space:pre; }
.ow-mm-list { display:grid; gap: calc(var(--u) * .6); }
.ow-mm-row {
  position:relative; display:flex; align-items:baseline; gap: calc(var(--u) * 3);
  padding: calc(var(--u) * 1.6) calc(var(--u) * 4) calc(var(--u) * 1.6) calc(var(--u) * 4.5);
  cursor:pointer; color: var(--ink-2);
  border-left: calc(2px * var(--k)) solid transparent;
}
.ow-mm-row.on { color: var(--ink); background: linear-gradient(90deg, rgba(237,181,76,.14), rgba(237,181,76,0) 85%);
  border-left-color: var(--acc); }
.ow-mm-idx { font-family: var(--fd); font-weight:600; font-size: calc(15px * var(--k)); color: var(--ink-3);
  min-width: calc(22px * var(--k)); }
.ow-mm-row.on .ow-mm-idx { color: var(--acc); }
.ow-mm-label { font-family: var(--fd); font-weight:600; font-size: calc(32px * var(--k)); letter-spacing:.05em; line-height:1.05; }
.ow-mm-row.back .ow-mm-label, .ow-mm-row.value .ow-mm-label { font-size: calc(22px * var(--k)); letter-spacing:.12em; }
.ow-mm-row.back { margin-top: calc(var(--u) * 2); }
.ow-mm-row.deploy .ow-mm-label { color: var(--acc); font-size: calc(40px * var(--k)); }
.ow-mm-tag { margin-left:auto; font-size: max(10px, calc(12.5px * var(--k))); font-weight:600; letter-spacing:.24em; color: var(--ink-3); }
.ow-mm-row.on .ow-mm-tag { color: var(--acc); }
.ow-mm-val { margin-left:auto; display:flex; align-items:baseline; gap: calc(var(--u) * 2.4);
  font-size: max(10px, calc(15px * var(--k))); font-weight:600; letter-spacing:.2em; }
.ow-mm-val b { color: var(--ink); min-width: calc(150px * var(--k)); text-align:center; font-weight:600; }
.ow-mm-row.on .ow-mm-val b { color: var(--acc); }
.ow-mm-arr { font-style:normal; color: var(--ink-3); }
.ow-mm-row.on .ow-mm-arr { color: var(--ink); }

.ow-mm-panel {
  position:absolute; right: calc(var(--u) * 18); top: 13%;
  width: min(calc(600px * var(--k)), calc(100vw - var(--u) * 36 - 560px * var(--k)));
  max-height: 74%; overflow:hidden;
}
.ow-mm-card { padding: calc(var(--u) * 6) calc(var(--u) * 7); background: rgba(14,14,13,.84);
  border: 1px solid rgba(255,255,255,.08); position:relative; }
.ow-mm-card::before { content:''; position:absolute; left:-1px; right:-1px; top:-1px; height: calc(3px * var(--k)); background: var(--acc); }
.ow-mm-card .ow-ms-name { margin-bottom: calc(var(--u) * 3); }
.ow-mm-sub, .ow-mm-text { font-family: var(--fs); text-transform:none; letter-spacing:0; font-weight:400;
  font-size: calc(16px * var(--k)); line-height:1.45; color: var(--ink-2); margin-bottom: calc(var(--u) * 4); }
.ow-mm-plan { margin-bottom: calc(var(--u) * 4); }
.ow-mm-plan .ow-mp-plan { height: calc(150px * var(--k)); color: var(--acc); }
.ow-mm-card .ow-ms-grid .v { font-size: calc(15.5px * var(--k)); }
.ow-mm-go { margin-top: calc(var(--u) * 5); padding-top: calc(var(--u) * 3); border-top: 1px solid var(--hair-2);
  font-size: max(10px, calc(13px * var(--k))); font-weight:600; letter-spacing:.3em; color: var(--acc); }
.ow-mm-hint { color: var(--ink-3); }
.ow-mm-keys { display:grid; grid-template-columns: 1fr 1fr; column-gap: calc(var(--u) * 8); row-gap: calc(var(--u) * 5); }
.ow-mm-khead { font-size: max(10px, calc(12.5px * var(--k))); font-weight:600; letter-spacing:.3em; color: var(--acc);
  margin-bottom: calc(var(--u) * 2); }
.ow-mm-krow { display:flex; align-items:center; gap: calc(var(--u) * 2.5); padding: calc(var(--u) * .7) 0;
  border-bottom: 1px solid var(--hair-2); }
.ow-mm-kk { display:flex; gap: calc(var(--u) * 1); min-width: calc(96px * var(--k)); }
.ow-mm-kk .ow-key { position:static; transform:none; min-width: calc(22px * var(--k)); height: calc(20px * var(--k));
  padding: 0 calc(5px * var(--k)); display:inline-flex; align-items:center; justify-content:center;
  font-size: max(10px, calc(11.5px * var(--k))); }
.ow-mm-kl { font-size: max(10px, calc(12.5px * var(--k))); font-weight:600; letter-spacing:.14em; color: var(--ink-2); }

/* ============================================================== mode HUD
   Bot-match score bar under the compass (the survival run bar's slot). */
.ow-mh {
  position:absolute; left:50%; top:calc(var(--pad) * .7 + 44px * var(--k));
  transform: translateX(-50%);
  display:flex; flex-direction:column; align-items:center; gap: calc(var(--u) * 1.4);
  text-shadow: var(--sh-o1);
}
.ow-mh-bar { display:flex; align-items:flex-end; gap: calc(var(--u) * 5);
  padding: calc(var(--u) * 1.2) calc(var(--u) * 6); background: radial-gradient(ellipse 60% 100% at 50% 50%, rgba(9,10,11,.55), rgba(9,10,11,0)); }
.ow-mh-side { width: calc(150px * var(--k)); }
.ow-mh-top { display:flex; align-items:baseline; gap: calc(var(--u) * 2); }
.ow-mh-side.hos .ow-mh-top { justify-content:flex-end; }
.ow-mh-team { font-size: max(10px, calc(12.5px * var(--k))); font-weight:600; letter-spacing:.24em; }
.ow-mh-side.esf .ow-mh-team { color: var(--friend); }
.ow-mh-side.hos .ow-mh-team { color: var(--enemy); }
.ow-mh-score { font-family: var(--fd); font-weight:600; font-size: calc(30px * var(--k)); line-height:1; }
.ow-mh-side.esf .ow-mh-score { margin-left:auto; }
.ow-mh-side.hos .ow-mh-score { margin-right:auto; }
.ow-mh-prog { margin-top: calc(var(--u) * 1); height: calc(3px * var(--k)); background: rgba(255,255,255,.14); position:relative; }
.ow-mh-prog i { position:absolute; inset:0; transform:scaleX(0); }
.ow-mh-side.esf .ow-mh-prog i { background: var(--friend); transform-origin:right center; }
.ow-mh-side.hos .ow-mh-prog i { background: var(--enemy); transform-origin:left center; }
.ow-mh-mid { text-align:center; min-width: calc(110px * var(--k)); }
.ow-mh-clock { font-family: var(--fd); font-weight:600; font-size: calc(24px * var(--k)); line-height:1; }
.ow-mh-clock.hot { color: var(--red); }
.ow-mh-label { margin-top: calc(var(--u) * 1); font-size: max(10px, calc(10.5px * var(--k))); font-weight:600;
  letter-spacing:.22em; color: var(--ink-2); white-space:nowrap; }
.ow-mh-pips { display:flex; align-items:center; gap: calc(var(--u) * 3); }
.ow-mh-pipset { display:flex; gap: calc(var(--u) * .8); }
.ow-mh-pipset b { width: calc(9px * var(--k)); height: calc(9px * var(--k)); display:block; }
.ow-mh-pipset.esf b { background: var(--friend); }
.ow-mh-pipset.hos b { background: var(--enemy); }
.ow-mh-pipset b.dead { background: rgba(255,255,255,.14); }
.ow-mh-vs { font-size: max(10px, calc(10px * var(--k))); font-weight:600; letter-spacing:.24em; color: var(--ink-3); }
.ow-mh-chips { display:flex; gap: calc(var(--u) * 3); }
.ow-mh-chip { position:relative; width: calc(34px * var(--k)); height: calc(34px * var(--k)); }
.ow-mh-chip svg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
.ow-mh-chip .bg { fill: rgba(9,10,11,.6); stroke: rgba(255,255,255,.22); stroke-width: 2; }
.ow-mh-chip .ring { fill:none; stroke-width: 3.2; }
.ow-mh-chip.esf .bg { fill: rgba(169,198,220,.34); stroke: var(--friend); }
.ow-mh-chip.hos .bg { fill: rgba(242,101,79,.3); stroke: var(--enemy); }
.ow-mh-chip.contested .bg { stroke: var(--acc); }
.ow-mh-chip.planted .bg { fill: rgba(228,65,46,.42); stroke: var(--red); }
.ow-mh-chip span { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  font-family: var(--fd); font-weight:700; font-size: calc(17px * var(--k)); }
.ow-mh-chip.inside::after { content:''; position:absolute; left:25%; right:25%; bottom: calc(-6px * var(--k));
  height: calc(2px * var(--k)); background: var(--acc); }
.ow-mh-status { font-size: max(10px, calc(12px * var(--k))); font-weight:600; letter-spacing:.22em; color: var(--ink-2); white-space:nowrap; }
.ow-mh-status.hot { color: var(--enemy); }

.ow-mh-respawn { position:absolute; left:50%; top:38%; transform: translate(-50%,-50%); text-align:center;
  padding: calc(var(--u) * 5) calc(var(--u) * 24);
  background: linear-gradient(90deg, rgba(8,6,6,0), rgba(8,6,6,.7) 22%, rgba(8,6,6,.7) 78%, rgba(8,6,6,0)); }
.ow-mh-kia { font-family: var(--fd); font-weight:700; font-size: calc(54px * var(--k)); letter-spacing:.12em; color: var(--ink); line-height:1; }
.ow-mh-killer { margin-top: calc(var(--u) * 2.5); font-size: max(10px, calc(14px * var(--k))); font-weight:600; letter-spacing:.22em; color: var(--enemy); }
.ow-mh-redeploy { margin-top: calc(var(--u) * 2); font-size: max(10px, calc(13px * var(--k))); font-weight:600; letter-spacing:.3em; color: var(--acc); }
.ow-mh-spec { position:absolute; left:50%; bottom: 26%; transform: translateX(-50%);
  display:flex; align-items:baseline; gap: calc(var(--u) * 3); padding: calc(var(--u) * 1.6) calc(var(--u) * 5);
  background: rgba(0,0,0,.7); text-shadow: var(--sh-o1); white-space:nowrap; }
.ow-mh-spec-k { font-size: max(10px, calc(12px * var(--k))); font-weight:600; letter-spacing:.3em; color: var(--ink-3); }
.ow-mh-spec b { font-family: var(--fd); font-weight:600; font-size: calc(22px * var(--k)); letter-spacing:.08em; color: var(--friend); }
.ow-mh-spec-h { font-size: max(10px, calc(11px * var(--k))); font-weight:600; letter-spacing:.2em; color: var(--ink-2); }
.ow-mh-confirm { position:absolute; left:50%; top: calc(50% + 46px * var(--k)); transform: translate(-50%,0);
  display:flex; align-items:center; gap: calc(var(--u) * 1.6);
  font-size: max(10px, calc(13px * var(--k))); font-weight:700; letter-spacing:.2em; color: var(--ink); text-shadow: var(--sh-o1); }
.ow-mh-confirm i { font-style:normal; color: var(--red); }
.ow-mh-confirm.head i { color: var(--acc); }

/* match report: team scores */
.ow-mr-score { align-items:baseline; }
.ow-mr-score .ow-sc-score.esf { color: var(--friend); }
.ow-mr-score .ow-sc-score.hos { color: var(--enemy); }
.ow-mr-dash { font-family: var(--fd); font-size: calc(40px * var(--k)); color: var(--ink-3); }
.ow-screen.match.won .ow-sc-title { color: var(--acc); }
.ow-screen.match.lost .ow-sc-title { color: var(--enemy); }

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
  s.textContent = FONTS + CSS;
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
