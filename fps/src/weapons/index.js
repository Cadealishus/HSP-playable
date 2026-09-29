import * as THREE from 'three';
import { Rng } from '../core/rng.js';
import { WeaponMaterials, ENV_OCCLUSION } from './materials.js';
import { Viewmodel } from './viewmodel.js';
import { ProjectileSim } from './ballistics.js';
import { WEAPON_DEFS, WEAPON_IDS, normalizeDef, buildRecoilPattern, SPREAD_MODS } from './defs.js';
import { buildCarbine } from './models/carbine.js';
import { buildRifle } from './models/rifle.js';
import { buildSmg } from './models/smg.js';
import { buildPistol } from './models/pistol.js';
import { buildShotgun } from './models/shotgun.js';
import { buildSniper, buildMarksman } from './models/sniper.js';
import { buildLmg } from './models/lmg.js';
import { buildLauncher } from './models/launcher.js';
import { RocketSim } from './rockets.js';
import { clamp, clamp01, lerp, damp, DEG } from './mathx.js';
import { Equipment } from './equipment.js';
import { WeaponOverlays } from './overlay.js';

/**
 * WEAPONS — weapon meshes, the first-person viewmodel rig, ADS, recoil, sway,
 * bob, reload/inspect animation and projectile ballistics.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT LIVES HERE
 *   geometry.js   hard-surface kit: chamfered boxes, lathes, extrusions,
 *                 Picatinny rail, M-LOK, knurling, screws, and the Assembly
 *                 that merges everything down to a handful of draw calls.
 *   parts.js      real firearm components built from published dimensions:
 *                 receivers, barrels, muzzle devices, handguards, stocks,
 *                 grips, magazines, optics, iron sights, triggers.
 *   models/*.js   the four weapons assembled from those parts. The carbine
 *                 is authored in millimetres with mmgeo.js and funnelled into
 *                 the same Assembly/material pipeline.
 *   hands.js      gloved hands + sleeved arms, two-bone IK from the hand.
 *   viewmodel.js  the animation stack (sway/bob/lag/recoil/ADS/clips).
 *   clips.js      keyframed reload / inspect / draw timelines.
 *   ballistics.js travelling projectiles with gravity and drag.
 *   defs.js       every tuning number, plus the deterministic recoil patterns.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * PUBLIC API — `const wp = ctx.get('weapons')`
 * ────────────────────────────────────────────────────────────────────────────
 *   wp.current            { id, label, class, mode, magSize, ... } (the def)
 *   wp.ammo               { mag, chambered, reserve, magSize, total, empty }
 *   wp.fireMode           'auto' | 'burst' | 'semi'
 *   wp.spreadDegrees      live cone half-angle — drive the crosshair gap with it
 *   wp.adsProgress        0..1
 *   wp.reloading / wp.firing / wp.switching / wp.inspecting
 *   wp.weaponIds          ['carbine','rifle','smg','pistol']  (swap order)
 *   wp.primaryId          'carbine' — the default primary
 *   wp.loadoutInfo()      [{ id, displayName, class, caliber, magSize, blurb }]
 *   wp.setWeapon(id)      draw/holster animated swap
 *   wp.selectLoadout(id, {animated,refill})  run-start loadout (game subsystem)
 *   wp.nextWeapon()
 *   wp.cycleFireMode()
 *   wp.reload()           no-op if full or empty of reserve
 *   wp.inspect()
 *   wp.tryFire()          honours fire mode + rpm; returns true if a shot left
 *   wp.viewmodel          the rig (fx/ui may read muzzle/eject transforms)
 *   wp.muzzleWorld(v3)    world-space muzzle, for anything that needs it
 *   wp.debugPose(kind, {weapon})  'idle' | 'ads' | 'fire'  (the capture harness)
 *   wp.stats              { tris, drawCalls, live, fired }
 *
 * EVENTS EMITTED  (all canonical, see ARCHITECTURE.md)
 *   weapon:fire    { weapon, origin, dir, seed }
 *   weapon:shell   { position, velocity }
 *   weapon:reload  { weapon, phase: 'start'|'magout'|'magin'|'end' }
 *   bullet:tracer  { from, to, speed }
 * `bullet:impact` comes from physics, because physics owns penetration.
 * Anything else (ammo counts, fire mode, the current weapon) is a getter on
 * this object rather than an event, so no new event types are introduced.
 */
/**
 * Model builders by `def.model`. Adding a gun is adding a def (defs.js) plus a
 * builder here.
 */
const BUILDERS = {
  carbine: () => buildCarbine(),
  carbine_sd: () => buildCarbine({ suppressed: true }),
  rifle: () => buildRifle(),
  smg: () => buildSmg(),
  pistol: () => buildPistol(),
  mpistol: () => buildPistol({ auto: true }),
  shotgun: () => buildShotgun(),
  sniper: () => buildSniper(),
  marksman: () => buildMarksman(),
  lmg: () => buildLmg(),
  rocket: () => buildLauncher(),
};
/** Registry order (every weapon the game knows). */
const WEAPON_ORDER = WEAPON_IDS;
const PRIMARY_ID = 'carbine';
const SECONDARY_ID = 'pistol';
const DIGITS = ['Digit1', 'Digit2', 'Digit3'];
const RELOAD_CLIPS = new Set(['reloadTac', 'reloadEmpty', 'reloadStart', 'reloadShell', 'reloadEnd']);

export class WeaponSystem {
  static id = 'weapons';
  static deps = ['materials', 'physics'];

  constructor() {
    this.viewmodel = null;
    this.sim = null;
    this.states = new Map();
    this.activeId = PRIMARY_ID;
    this.debugMode = null;

    this._fireTimer = 0;
    this._burstLeft = 0;
    this._burstCooldown = 0;
    this._semiLatch = false;
    this._spread = 0;
    this._shotIndex = 0;
    this._sinceShot = 10;
    this._switchTimer = 0;
    this._switchTo = null;
    this._reloadPhase = null;

    this._muzzle = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._camDir = new THREE.Vector3();
    this._firePayload = {
      weapon: null, origin: new THREE.Vector3(), dir: new THREE.Vector3(), seed: 0,
      // Additive (EXPANSION §6): def id + class, the hearing radius AI should use
      // (a suppressed carbine is ~22 m, a rifle 90), a suppression multiplier
      // for the line of fire, the pellet count, and fx overrides.
      id: null, class: null, noise: 90, suppression: 1, suppressed: false, pellets: 1,
      flashScale: undefined, intensity: undefined, light: undefined,
    };
    this._reloadPayload = { weapon: null, phase: 'start' };
    // `weapon:shell` carries the canonical { position, velocity } plus the real
    // case dimensions and a spin, so fx can size and tumble the brass instead of
    // guessing: a 9x19 case is less than half the length of a 5.56x45 one.
    this._shellPayload = {
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      weapon: null,
      caseLen: 0.0446,
      caseRadius: 0.00495,
      spin: 0,
    };
    this._pendingShots = 0;
    this._pendingFirst = false;
    /** The carried loadout (EXPANSION §6). `carried` is the swap order. */
    this.loadout = { primary: PRIMARY_ID, secondary: SECONDARY_ID, lethal: 'frag', tactical: 'flash' };
    this.carried = [PRIMARY_ID, SECONDARY_ID];
    this._cycling = false;
    this._shellReload = false;
    this._shellStop = false;
    this._scopeT = 0;
    this._breath = { hold: 0, tired: 0, t: 0 };
    this._swayAim = { x: 0, y: 0 };
    this.moveSpeedScale = 1;

    // Deferred shell ejections (a case leaves the port a few ms after the shot).
    this._shellQueue = [];
    for (let i = 0; i < 8; i++) {
      this._shellQueue.push({ t: -1, pos: new THREE.Vector3(), vel: new THREE.Vector3() });
    }
    this._droppedMags = [];
    this._state = {
      ads: false,
      sprint: false,
      lowReady: false,
      speed: 0,
      crouch: false,
      airborne: false,
      trigger: false,
      empty: false,
    };
    // Preallocated HUD snapshot handed to `ui` (see getHudState).
    this._hudState = {
      name: '', mode: 'auto', ammo: 0, reserve: 0, magSize: 0,
      reloading: false, reloadProgress: 0, ads: false, spread: 0, firing: false,
      lethalCount: 0, tacticalCount: 0, lethal: 'frag', tactical: 'flash',
      cook: -1, cookKind: null, cookRemaining: 0, throwing: false,
      scoped: false,
    };
    this._overlayState = { scope: 0, style: 'sniper', swayX: 0, swayY: 0, flash: 0, blur: 0, cook: -1, cookText: '', danger: false };
  }

  /* ====================================================================== */
  /*  init                                                                  */
  /* ====================================================================== */

  async init(ctx) {
    this.ctx = ctx;
    this.rng = ctx.rng.fork();
    this.mats = new WeaponMaterials(ctx);
    this.sim = new ProjectileSim(ctx);
    this.viewmodel = new Viewmodel(ctx, this.mats);
    // three only honours `material.envMapIntensity` when the material carries its
    // OWN `envMap`; for a material lit by `scene.environment` the renderer
    // overwrites that uniform with `scene.environmentIntensity` every frame
    // (WebGLRenderer.setProgram, the isMeshStandardMaterial branch). The
    // viewmodel is drawn from its own scene, so ENV_OCCLUSION — how much of the
    // sky a shouldered weapon actually sees, see materials.js — has to be
    // expressed there or it is silently a no-op.
    ctx.viewScene.environmentIntensity = ENV_OCCLUSION;
    this.viewmodel.onClipEvent = (name, clip) => this._onClipEvent(name, clip);

    const t0 = performance.now();
    let tris = 0;
    for (const id of WEAPON_ORDER) {
      const def = normalizeDef(WEAPON_DEFS[id]);
      const build = BUILDERS[def.model];
      if (!build) continue;
      const model = build();
      const entry = this.viewmodel.addWeapon(model, def);
      tris += entry.tris;
      const st = {
        def,
        pattern: buildRecoilPattern(def, Rng),
        mag: 0,
        chambered: true,
        reserve: 0,
        mode: def.modes[0],
        modeIndex: 0,
      };
      this._fill(st);
      this.states.set(id, st);
    }
    this.rockets = new RocketSim(ctx, this.mats);
    this.viewmodel.setActive(this.activeId);
    this.viewmodel.play('draw');

    // ---- equipment (frag / flashbang) + screen overlays ----
    this.physics = ctx.peek('physics');
    this.equipment = new Equipment(ctx, this);
    this.equipment.build(this.mats, this.viewmodel);
    this.overlays = new WeaponOverlays(ctx);

    // Player hooks (all optional: the viewmodel works standalone).
    this.player = ctx.peek('player');
    this.fx = ctx.peek('fx');
    this.physics = ctx.peek('physics');
    // EXPANSION §6: `player.flash(intensity, duration)` is implemented here (the
    // white-out is a weapons overlay). Installed only if the player system does
    // not provide its own.
    if (this.player && typeof this.player.flash !== 'function') {
      this.player.flash = (i, d) => this.equipment.flashPlayer(i, d);
    }
    // ADS zoom / sensitivity: the registry drives them per weapon (and per
    // scope). The configured values are kept as the fallback.
    this._baseAdsFov = ctx.config.adsFovScale ?? 0.72;
    this._baseAdsSens = ctx.config.adsSensScale ?? 0.8;
    this._installMoveScale();
    // Run start / redeploy: a fresh loadout of ammunition and equipment.
    this._lastGameState = null;
    this._off_gs = ctx.events.on('game:state', (e) => {
      const st = e?.state ?? null;
      if (st === 'play' && this._lastGameState !== 'play' && this._lastGameState !== null) this.resupply();
      this._lastGameState = st;
    });
    this._off = [];
    this._off.push(
      ctx.events.on('player:land', (e) => this.viewmodel.land(Math.abs(e?.velocity ?? 3)))
    );
    this._off.push(ctx.events.on('player:jump', () => this.viewmodel.jump()));
    /**
     * Hide the viewmodel while a full-screen state is up (title/attract, the
     * death beat, the run report). The gun was drawing through those screens.
     * `game:state` is re-broadcast by the game once after init, so a late
     * subscriber still syncs. No game system (preview harness) = always shown.
     */
    this._gameState = null;
    this._off.push(ctx.events.on('game:state', (e) => { this._gameState = e?.state ?? null; }));
    // Presentation layer: `ui:screen { name }` ('title'|'death'|'report', null = gameplay).
    this._uiScreen = null;
    this._off.push(ctx.events.on('ui:screen', (e) => { this._uiScreen = e?.name ?? null; }));

    this.stats = { tris, drawCalls: 0, live: 0, fired: 0 };
    console.info(
      `[weapons] ${this.states.size} weapons · ${(tris / 1000).toFixed(1)}k tris viewmodel · ` +
        `built in ${(performance.now() - t0).toFixed(0)}ms`
    );
  }

  /* ====================================================================== */
  /*  public getters                                                        */
  /* ====================================================================== */

  get state() {
    return this.states.get(this.activeId);
  }

  get current() {
    return this.state?.def ?? null;
  }

  /** The carried weapons, in swap order (1 / 2 / 3, Tab, wheel). */
  get weaponIds() {
    return this.carried.slice();
  }

  /** Every weapon in the registry. */
  get allWeaponIds() {
    return [...this.states.keys()];
  }

  /** Magazine + chamber (+ reserve) to full. A chamberless weapon (the
   *  launcher: `magSize` is what the tube holds) keeps its round in `mag`. */
  _fill(s) {
    const d = s.def;
    s.reserve = d.reserve;
    if (d.projectile) {
      s.mag = d.magSize;
      s.chambered = false;
    } else {
      s.mag = d.magSize;
      s.chambered = true;
    }
  }

  /** Rounds ready to fire (chamber + magazine; a launcher's tube). */
  _loaded(s) {
    return s.mag + (s.chambered ? 1 : 0);
  }

  get ammo() {
    const s = this.state;
    if (!s) return { mag: 0, chambered: false, reserve: 0, magSize: 0, total: 0, empty: true };
    const mag = s.mag;
    const ch = s.chambered ? 1 : 0;
    return {
      mag: mag + ch,
      inMag: mag,
      chambered: s.chambered,
      reserve: s.reserve,
      magSize: s.def.magSize,
      total: mag + ch + s.reserve,
      empty: mag + ch === 0,
    };
  }

  get fireMode() {
    return this.state?.mode ?? 'semi';
  }

  get adsProgress() {
    return this.viewmodel?.adsT ?? 0;
  }

  get reloading() {
    return RELOAD_CLIPS.has(this.viewmodel?.clipName) || this._shellReload;
  }

  /** 0..1 how far into the scope the player is (1 = overlay up, gun hidden). */
  get scopeProgress() {
    return this._scopeT;
  }

  get inspecting() {
    return this.viewmodel?.clipName === 'inspect';
  }

  get switching() {
    return this._switchTo !== null;
  }

  get firing() {
    return this._sinceShot < 0.12;
  }

  /** Current spread cone half-angle in degrees — the crosshair should use this. */
  get spreadDegrees() {
    return this._spread;
  }

  muzzleWorld(out) {
    return this.viewmodel.muzzleWorld(out ?? this._tmp);
  }

  /**
   * HUD adapter polled by `ui` every lateUpdate. Shape is fixed by the contract
   * documented at the top of src/ui/index.js; the object is preallocated and
   * mutated in place because `ui` reads it once per frame and never keeps it.
   */
  getHudState() {
    const h = this._hudState;
    const s = this.state;
    if (!s) return h;
    const a = this.ammo;
    const vm = this.viewmodel;
    h.name = s.def.displayName ?? s.def.label ?? s.def.id;
    h.mode = s.mode;
    // `a.mag` counts the chambered round, so a topped-off rifle is 31. The HUD
    // draws one pip per round against magSize, so clamp the *display* to the
    // magazine capacity rather than overflowing the pip strip.
    h.ammo = Math.min(a.mag, a.magSize);
    h.reserve = a.reserve;
    h.magSize = a.magSize;
    h.reloading = this.reloading;
    // 0..1 through the active reload clip; the bar is meaningless otherwise.
    h.reloadProgress = !h.reloading ? 0
      : this._shellReload ? Math.min(1, s.mag / Math.max(1, s.def.magSize))
        : vm?.clip?.duration ? Math.min(1, vm.clipT / vm.clip.duration) : 0;
    h.scoped = this._scopeT > 0.98;
    h.weaponId = s.def.id;
    h.weaponClass = s.def.class;
    h.ads = (vm?.adsT ?? 0) > 0.5;
    // `ui` maps this to reticle bloom as 4 + spread * 40 px, so hand it a
    // normalised 0..1 rather than raw degrees.
    h.spread = Math.min(1, Math.max(0, this._spread / 6));
    h.firing = this.firing;
    const eq = this.equipment;
    if (eq) {
      h.lethalCount = eq.lethalCount;
      h.tacticalCount = eq.tacticalCount;
      h.lethal = eq.lethal;
      h.tactical = eq.tactical;
      h.cook = eq.cookFraction;
      h.cookKind = h.cook >= 0 ? eq.th.kind : null;
      h.cookRemaining = eq.cookRemaining;
      h.throwing = eq.throwing;
    }
    return h;
  }

  /* ====================================================================== */
  /*  weapon management                                                     */
  /* ====================================================================== */

  setWeapon(id) {
    if (!this.states.has(id) || id === this.activeId || this._switchTo) return false;
    if (!this.carried.includes(id)) return false;
    if (this.equipment?.throwing) return false;
    this._abortShellReload();
    this._cycling = false;
    this._switchTo = id;
    this._switchTimer = this.viewmodel.play('holster');
    // Fast swap: going TO the sidearm, the long gun comes down at x speed.
    const fast = this.states.get(id).def.fastSwap ?? 1;
    if (fast > 1) {
      this.viewmodel.clipRate = fast;
      this._switchTimer /= fast;
    }
    return true;
  }

  nextWeapon(step = 1) {
    const ids = this.carried;
    const i = Math.max(0, ids.indexOf(this.activeId));
    const n = ids.length;
    return this.setWeapon(ids[(((i + step) % n) + n) % n]);
  }

  /**
   * EXPANSION §6. `{ primary, secondary, lethal, tactical }` — any may be
   * omitted to keep the current one. Weapons must exist and fit the slot
   * (a primary in the primary slot, a secondary in the secondary slot).
   * Refills ammunition and equipment by default (`opts.refill === false` to
   * keep counts); swaps instantly unless `opts.animated`.
   * @returns {object} the resulting loadout
   */
  setLoadout(lo = {}, opts = {}) {
    const ok = (id, slot) => id && this.states.has(id) && this.states.get(id).def.slot === slot;
    if (ok(lo.primary, 'primary')) this.loadout.primary = lo.primary;
    if (ok(lo.secondary, 'secondary')) this.loadout.secondary = lo.secondary;
    if (lo.lethal) this.loadout.lethal = lo.lethal;
    if (lo.tactical) this.loadout.tactical = lo.tactical;
    this.carried = [this.loadout.primary, this.loadout.secondary];
    this.equipment?.setLoadout(this.loadout.lethal, this.loadout.tactical);
    this.loadout.lethal = this.equipment?.lethal ?? this.loadout.lethal;
    this.loadout.tactical = this.equipment?.tactical ?? this.loadout.tactical;
    if (opts.refill !== false) this.resupply();
    const want = this.carried.includes(this.activeId) ? this.activeId : this.loadout.primary;
    if (opts.animated) this.setWeapon(want);
    else this.setWeaponImmediate(want);
    return { ...this.loadout };
  }

  cycleFireMode() {
    const s = this.state;
    if (!s || s.def.modes.length < 2) return s?.mode;
    s.modeIndex = (s.modeIndex + 1) % s.def.modes.length;
    s.mode = s.def.modes[s.modeIndex];
    this._burstLeft = 0;
    return s.mode;
  }

  /** Abort a running reload (a grenade throw does this). Ammo is only moved at
   *  'magin', so an aborted reload leaves the magazine exactly as it was. */
  cancelReload() {
    if (!this.reloading) return false;
    this._shellReload = false;
    this.viewmodel.stopClip();
    this.viewmodel.boltHold = this.state && !this.state.chambered ? 1 : 0;
    return true;
  }

  /** Refill every carried weapon (mag + reserve) and the equipment slots. */
  resupply() {
    for (const s of this.states.values()) this._fill(s);
    this.equipment?.resupply();
    return true;
  }

  reload() {
    const s = this.state;
    if (!s || this.reloading || this.switching) return false;
    if (this.equipment?.throwing) return false;
    if (s.mag >= s.def.magSize || s.reserve <= 0) return false;
    this._cycling = false;
    if (s.def.reloadStyle === 'shell') {
      this.viewmodel.stopClip();
      this._shellReload = true;
      this._shellStop = false;
      this.viewmodel.play('reloadStart');
      return true;
    }
    this.viewmodel.stopClip();
    const empty = s.mag === 0 && !s.chambered;
    this.viewmodel.play(empty ? 'reloadEmpty' : 'reloadTac');
    this._pendingReloadEmpty = empty;
    return true;
  }

  inspect() {
    if (this.reloading || this.switching || this.inspecting) return false;
    this.viewmodel.play('inspect');
    return true;
  }

  /* ====================================================================== */
  /*  firing                                                                */
  /* ====================================================================== */

  canFire() {
    const s = this.state;
    if (!s) return false;
    if (this.switching || this._cycling) return false;
    if (this.reloading && !(this._shellReload && this._loaded(s) > 0)) return false;
    if (this._fireTimer > 0) return false;
    return this._loaded(s) > 0;
  }

  /** A trigger pull during a shell-by-shell load stops it (CoD: fire to cancel). */
  _abortShellReload() {
    if (!this._shellReload) return;
    this._shellReload = false;
    const n = this.viewmodel.clipName;
    if (n === 'reloadStart' || n === 'reloadShell' || n === 'reloadEnd') this.viewmodel.stopClip();
  }

  /** One round leaves the barrel. Returns false if the trigger clicked dry. */
  tryFire() {
    const s = this.state;
    if (!s) return false;
    if (this._shellReload && this._loaded(s) > 0) this._abortShellReload();
    if (this.reloading || this.switching || this._cycling || this._fireTimer > 0) return false;
    if (this.equipment?.throwing || this.viewmodel.throwLower > 0.05) return false;
    if (s.def.projectile) return this._fireProjectile(s);
    if (!s.chambered) {
      // Dry: lock the bolt back and let the player know by feel.
      this.viewmodel.boltHold = 1;
      this._fireTimer = 0.25;
      return false;
    }
    if (this.inspecting) this.viewmodel.stopClip();

    const def = s.def;
    const first = this._sinceShot > 0.35;
    // ---- feed the next round ----
    s.chambered = false;
    if (s.mag > 0) {
      s.mag--;
      s.chambered = true;
    } else {
      this.viewmodel.boltHold = 1;
    }

    // ---- deterministic recoil pattern ----
    const idx = Math.min(this._shotIndex, def.recoil.patternLength - 1);
    const pitch = s.pattern[idx * 2];
    const yaw = s.pattern[idx * 2 + 1];
    this._shotIndex++;

    // ---- aim: camera forward + a spread cone ----
    const cam = this.ctx.camera;
    cam.updateMatrixWorld();
    this._camDir.set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    this._aimDir(cam, this._spread, this._dir);

    // ---- projectile(s) ----
    // Rounds leave from the muzzle when scoped the muzzle is hidden under the
    // overlay; from the eye, so the shot goes where the reticle is.
    if (this._scopeT > 0.98) this._muzzle.copy(cam.position);
    else this.viewmodel.muzzleWorld(this._muzzle);
    const seed = this.rng.u32();
    const pellets = def.pellets;
    const cone = pellets > 1 ? lerp(def.pelletSpread ?? 3, def.pelletSpreadAds ?? 2, this.adsProgress) : 0;
    for (let k = 0; k < pellets; k++) {
      if (pellets > 1) {
        // Each pellet: the aimed direction plus its own point in the cone.
        this._pellet = this._pellet ?? new THREE.Vector3();
        this._pellet.copy(this._dir);
        this._coneAround(this._pellet, cone, cam);
      }
      this.sim.spawn({
        origin: this._muzzle,
        dir: pellets > 1 ? this._pellet : this._dir,
        speed: def.muzzleVelocity,
        damage: def.damage,
        penetration: def.penetration,
        dragK: def.dragK,
        dropoff: def.dropoff,
        falloffExp: def.falloffExp,
        maxRange: def.maxRange,
        weapon: def,
        tracer: def.tracerEvery > 0 && (pellets > 1 ? k < 2 : this.stats.fired % def.tracerEvery === 0),
      });
    }

    // ---- feedback ----
    this.viewmodel.addRecoil(pitch, yaw, first);
    const p = this.player;
    if (p?.addRecoil) {
      // The camera climb is the learnable part; the viewmodel kick is the feel.
      p.addRecoil(pitch, yaw, def.recoil.roll * 0.35, def.recoil.punch);
    }
    this._spread = Math.min(def.spreadMax, this._spread + def.spreadPerShot);
    this._fireTimer = 60 / def.rpm;
    this._sinceShot = 0;
    this.stats.fired++;
    this._pendingShots++;
    this._pendingFirst = this._pendingFirst || first;
    this._fireSeed = seed;

    // Shell leaves the port shortly after the shot, once the bolt is back — or,
    // on a pump / bolt gun, when the action is worked (the `cycle` clip).
    if (def.action === 'pump' || def.action === 'bolt') {
      if (this._loaded(s) > 0) {
        this._cycling = true;
        this.viewmodel.play('cycle');
      } else {
        this._queueShell(0.3);
      }
    } else {
      this._queueShell(Math.min(0.05, this._fireTimer * 0.45));
    }
    return true;
  }

  /** Aim direction: camera forward + the spread cone + scope sway. */
  _aimDir(cam, spreadDeg, out) {
    this._camDir.set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    out.copy(this._camDir);
    this._right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    this._up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const spreadRad = spreadDeg * DEG;
    if (spreadRad > 1e-5) {
      const d = this.rng.disc(this._disc ?? (this._disc = { x: 0, y: 0 }));
      out.addScaledVector(this._right, Math.tan(spreadRad) * d.x).addScaledVector(this._up, Math.tan(spreadRad) * d.y);
    }
    // The scope's breathing sway is real: the round goes where the reticle is.
    if (this._scopeT > 0.5) {
      out.addScaledVector(this._right, this._swayAim.x * this._scopeT).addScaledVector(this._up, -this._swayAim.y * this._scopeT);
    }
    return out.normalize();
  }

  /** Rotate `v` to a uniformly distributed point inside a cone of half-angle `deg`. */
  _coneAround(v, deg, cam) {
    const d = this.rng.disc(this._disc ?? (this._disc = { x: 0, y: 0 }));
    const t = Math.tan(deg * DEG);
    v.addScaledVector(this._right, t * d.x).addScaledVector(this._up, t * d.y).normalize();
    void cam;
    return v;
  }

  /** The launcher: a rocket, not a round. */
  _fireProjectile(s) {
    const def = s.def;
    if (s.mag <= 0) {
      this._fireTimer = 0.25;
      return false;
    }
    if (this.inspecting) this.viewmodel.stopClip();
    s.mag--;
    const cam = this.ctx.camera;
    cam.updateMatrixWorld();
    this._aimDir(cam, this._spread, this._dir);
    this.viewmodel.muzzleWorld(this._muzzle);
    // Launch from the muzzle, but never from inside a wall the tube is poking
    // into: pull the origin back along eye->muzzle to just short of it.
    const phys = this.physics;
    if (phys?.raycast) {
      this._tmp.copy(this._muzzle).sub(cam.position);
      const len = this._tmp.length();
      const hit = phys.raycast(cam.position, this._tmp, len, phys.MASK?.BULLET);
      if (hit?.hit) this._muzzle.copy(cam.position).addScaledVector(this._tmp.divideScalar(len), Math.max(0.05, hit.distance - 0.05));
    }
    this.rockets.fire(this._muzzle, this._dir, def.projectile, this.player ?? null);
    const idx = 0;
    const pitch = s.pattern[idx * 2];
    const yaw = s.pattern[idx * 2 + 1];
    this.viewmodel.addRecoil(pitch, yaw, true);
    this.player?.addRecoil?.(pitch, yaw, def.recoil.roll * 0.35, def.recoil.punch);
    this.player?.addTrauma?.(0.55);
    this._fireTimer = 60 / def.rpm;
    this._sinceShot = 0;
    this.stats.fired++;
    this._pendingShots++;
    this._fireSeed = this.rng.u32();
    return true;
  }

  _queueShell(delay) {
    for (const q of this._shellQueue) {
      if (q.t < 0) {
        q.t = delay;
        return q;
      }
    }
    return null;
  }

  /* ====================================================================== */
  /*  reload / clip callbacks                                               */
  /* ====================================================================== */

  _onClipEvent(name, clipName) {
    const s = this.state;
    const isReload = clipName === 'reloadTac' || clipName === 'reloadEmpty';
    if (clipName === 'cycle') {
      if (name === 'eject') {
        this._queueShell(0);
        this._emitReload('end');
      }
      if (name === 'end') this._cycling = false;
      return;
    }
    if (clipName === 'reloadStart' || clipName === 'reloadShell' || clipName === 'reloadEnd') {
      this._onShellEvent(name, clipName, s);
      return;
    }
    switch (name) {
      case 'start':
        if (isReload) this._emitReload('start');
        break;
      case 'magout':
        if (isReload) this._emitReload('magout');
        break;
      case 'magdrop':
        if (isReload) this._dropMagazine();
        break;
      case 'magin':
        if (isReload) {
          this._emitReload('magin');
          this._completeReload(clipName === 'reloadEmpty');
        }
        break;
      case 'boltrelease':
        this.viewmodel.boltHold = 0;
        break;
      case 'end':
        if (isReload) {
          this._emitReload('end');
          this.viewmodel.boltHold = 0;
        }
        if (clipName === 'holster' && this._switchTo) {
          this.activeId = this._switchTo;
          this._switchTo = null;
          this.viewmodel.setActive(this.activeId);
          this.viewmodel.play('draw');
          this._shotIndex = 0;
          this._spread = 0;
          this._cycling = false;
        }
        break;
      default:
        break;
    }
  }

  /** Shell-by-shell loading loop (shotgun). */
  _onShellEvent(name, clipName, s) {
    if (!s || !this._shellReload) return;
    const vm = this.viewmodel;
    if (name === 'start') this._emitReload('start');
    if (name === 'shell' && s.reserve > 0 && s.mag < s.def.magSize) {
      s.mag++;
      s.reserve--;
      this._emitReload('magin');
    }
    if (name !== 'end') return;
    if (clipName === 'reloadEnd') {
      this._shellReload = false;
      if (!s.chambered && s.mag > 0) {
        // Empty gun: the last act of the load is racking one into the chamber.
        s.mag--;
        s.chambered = true;
        this._cycling = true;
        vm.play('cycle');
      }
      return;
    }
    const more = s.mag < s.def.magSize && s.reserve > 0 && !this._shellStop;
    vm.play(more ? 'reloadShell' : 'reloadEnd');
  }

  /**
   * The chambered-round model: a tactical reload keeps the round in the chamber
   * and gives you magSize+1; an empty reload has to feed one out of the fresh
   * magazine, so you end up with exactly magSize.
   */
  _completeReload(empty) {
    const s = this.state;
    if (!s) return;
    const want = s.def.magSize - s.mag;
    const take = Math.min(want, s.reserve);
    s.reserve -= take;
    s.mag += take;
    if (s.def.projectile) {
      this._shotIndex = 0;
      return;
    }
    if (empty && !s.chambered && s.mag > 0) {
      s.mag--;
      s.chambered = true;
    }
    this._shotIndex = 0;
  }

  _emitReload(phase) {
    this._reloadPayload.weapon = this.current;
    this._reloadPayload.phase = phase;
    this.ctx.events.emit('weapon:reload', this._reloadPayload);
  }

  /** Spawn the discarded magazine as a real rigid body in the world. */
  _dropMagazine() {
    const phys = this.physics ?? (this.physics = this.ctx.peek('physics'));
    const w = this.viewmodel.active;
    if (!w) return;
    const proxy = this._magProxy(w);
    if (!proxy) return;
    const mag = w.parts.magazine;
    mag.updateMatrixWorld();
    proxy.group.position.setFromMatrixPosition(mag.matrixWorld);
    proxy.group.quaternion.setFromRotationMatrix(mag.matrixWorld);
    proxy.group.visible = true;
    // Magazine geometry hangs below its origin, so bias the body centre down.
    const half = w.magLen * 0.45;
    proxy.group.position.y -= half * 0.4;

    const vel = this._tmp.set(0, -0.7, 0);
    const pv = this.player?.velocity;
    if (pv) vel.add(pv);
    vel.x += this.rng.signed() * 0.25;
    vel.z += this.rng.signed() * 0.25;

    if (phys?.spawnDebris) {
      proxy.body = phys.spawnDebris(proxy.group.position, vel, {
        size: Math.max(0.02, w.magLen * 0.28),
        surface: 'rubber',
        mass: 0.38,
        lifetime: 22,
        restitution: 0.18,
        object3D: proxy.group,
      });
      proxy.until = this.ctx.time.elapsed + 22;
    } else {
      proxy.until = this.ctx.time.elapsed + 2;
    }
  }

  /** Two reusable world-space magazine props per weapon. */
  _magProxy(w) {
    if (!this._magPools) this._magPools = new Map();
    let pool = this._magPools.get(w.id);
    if (!pool) {
      pool = [];
      for (let i = 0; i < 2; i++) {
        const group = new THREE.Object3D();
        group.name = `dropped-mag-${w.id}-${i}`;
        group.visible = false;
        // Share the viewmodel's geometry and materials; the world copy needs no
        // resources of its own.
        w.parts.magazine.traverse((o) => {
          if (o.isMesh) {
            const m = new THREE.Mesh(o.geometry, o.material);
            m.position.copy(o.position);
            m.quaternion.copy(o.quaternion);
            m.castShadow = true;
            group.add(m);
          }
        });
        this.ctx.scene.add(group);
        pool.push({ group, body: null, until: 0 });
        this._droppedMags.push(pool[i]);
      }
      this._magPools.set(w.id, pool);
    }
    // Reuse the oldest.
    let best = pool[0];
    for (const p of pool) if (p.until < best.until) best = p;
    if (best.body && this.physics?.removeRigidBody) this.physics.removeRigidBody(best.body);
    best.body = null;
    return best;
  }

  /* ====================================================================== */
  /*  frame                                                                 */
  /* ====================================================================== */

  fixedUpdate(h) {
    this.sim.fixedUpdate(h);
    this.equipment?.fixedUpdate(h);
    this.rockets?.fixedUpdate(h);
  }

  update(dt, ctx) {
    const s = this.state;
    if (!s) return;
    const def = s.def;
    const input = ctx.input;
    const player = this.player ?? (this.player = ctx.peek('player'));
    const st = this._state;

    this._sinceShot += dt;
    if (this._fireTimer > 0) this._fireTimer -= dt;
    if (this._burstCooldown > 0) this._burstCooldown -= dt;

    // ---- spread recovery -------------------------------------------------
    const rest = this._restSpread(def, player, st);
    this._spread = Math.max(rest, this._spread - def.spreadDecay * dt * (1 + this.adsProgress));
    if (this._sinceShot > 0.6) this._shotIndex = 0;

    // ---- gather state ----------------------------------------------------
    const live = !input.frozen && input.enabled !== false && this.debugMode === null;
    const throwing = this.equipment?.throwing === true;
    st.ads = live ? (input.ads || player?.adsRequested === true) && !throwing : this.debugMode === 'ads';
    // A throw pending behind a sprint brings the sprint pose down first.
    st.sprint = live ? player?.sprinting === true && this._sinceShot > 0.3 && !throwing : false;
    st.speed = player?.horizontalSpeed ?? player?.speed ?? 0;
    st.crouch = player?.stance === 'crouch';
    st.airborne = player?.airborne === true;
    st.lowReady = player?.state === 'mantle' || player?.mantling === true;
    st.empty = this._loaded(s) === 0;

    // ---- input -----------------------------------------------------------
    this.equipment?.update(dt, input, live);
    if (live && throwing) {
      st.trigger = false;
    } else if (live) {
      if (input.actionPressed('reload')) this.reload();
      if (input.pressed('KeyB')) this.cycleFireMode();
      if (input.pressed('KeyI')) this.inspect();
      // 1 / 2 / 3 select the carried weapons in slot order; Tab and the wheel
      // cycle them (wheel down = next, wheel up = previous).
      for (let i = 0; i < DIGITS.length && i < this.carried.length; i++) {
        if (input.pressed(DIGITS[i])) this.setWeapon(this.carried[i]);
      }
      if (input.pressed('Tab')) this.nextWeapon(1);
      if (input.wheel) this.nextWeapon(input.wheel > 0 ? 1 : -1);
      this._runTrigger(dt, input.fire, input.firePressed, def, s);
      st.trigger = input.fire && this.canFire();
      // Auto-reload on a dry trigger pull, like every modern shooter.
      if (input.firePressed && st.empty) this.reload();
    } else if (this.debugMode) {
      this._runDebug(ctx);
      st.trigger = this._sinceShot < 0.09;
    }

    // Push the ADS curve to the player so camera FOV / move speed follow it.
    player?.setAdsProgress?.(this.viewmodel.adsT);
    this._updateScope(dt, def, live ? input : null);
    // Registry-driven zoom and aim sensitivity (per weapon, per scope).
    const cfg = ctx.config;
    const sc = def.scope;
    cfg.adsFovScale = sc ? Math.min(1, sc.fov / Math.max(1, cfg.fov)) : def.adsFov ?? this._baseAdsFov;
    cfg.adsSensScale = sc ? sc.sens : this._baseAdsSens;
    this.moveSpeedScale = def.moveMult ?? 1;
    player?.setMoveSpeedScale?.(this.moveSpeedScale);
    this.rockets?.update(dt);

    this.stats.live = this.sim.stats.live;
    this.stats.fired = this.sim.stats.fired;
  }

  /** Fire-mode state machine. */
  _runTrigger(dt, held, pressed, def, s) {
    switch (s.mode) {
      case 'auto':
        if (held) this.tryFire();
        break;
      case 'burst':
        if (pressed && this._burstLeft === 0 && this._burstCooldown <= 0) {
          this._burstLeft = def.burstCount;
        }
        if (this._burstLeft > 0 && this._fireTimer <= 0) {
          if (this.tryFire()) {
            this._burstLeft--;
            this._fireTimer = 60 / def.burstRpm;
            if (this._burstLeft === 0) this._burstCooldown = def.burstDelay;
          } else {
            this._burstLeft = 0;
          }
        }
        break;
      default: // semi
        if (pressed) this.tryFire();
        break;
    }
  }

  _restSpread(def, player, st) {
    let base = lerp(def.spreadHip, def.spreadAds, this.adsProgress);
    if (st.crouch) base *= SPREAD_MODS.crouch;
    if (player?.stance === 'prone') base *= SPREAD_MODS.prone;
    if (st.speed < 0.4) base *= SPREAD_MODS.still;
    else if (st.speed > 3.2) base *= SPREAD_MODS.walking;
    if (st.sprint) base *= SPREAD_MODS.sprinting;
    if (st.airborne) base *= SPREAD_MODS.airborne;
    return base;
  }

  lateUpdate(dt, ctx) {
    const vm = this.viewmodel;
    if (!vm) return;
    const gs = this._gameState;
    // The capture harness (debugMode) always shows the gun, whatever the state.
    vm.anchor.visible =
      this.debugMode !== null || (!this._uiScreen && !(gs === 'attract' || gs === 'down' || gs === 'over'));
    vm.update(dt, this._state);
    this._updateOverlays(dt);

    // ---- muzzle flash / audio, now that the pose is final ---------------
    if (this._pendingShots > 0) {
      const def = this.current;
      vm.muzzleWorld(this._firePayload.origin);
      vm.boreDir(this._firePayload.dir);
      const fp = this._firePayload;
      fp.weapon = def;
      fp.seed = this._fireSeed >>> 0;
      fp.id = def.id;
      fp.class = def.class;
      fp.noise = def.noise;
      fp.suppression = def.suppression;
      fp.suppressed = def.suppressed;
      fp.pellets = def.pellets;
      fp.flashScale = def.flashScale;
      fp.intensity = def.flashIntensity;
      fp.light = def.flashLight;
      for (let i = 0; i < this._pendingShots; i++) {
        ctx.events.emit('weapon:fire', this._firePayload);
      }
      this._pendingShots = 0;
      this._pendingFirst = false;
    }

    // ---- deferred shell ejection ---------------------------------------
    for (const q of this._shellQueue) {
      if (q.t < 0) continue;
      q.t -= dt;
      if (q.t > 0) continue;
      q.t = -1;
      vm.ejectWorld(this._shellPayload.position);
      vm.ejectVelocity(this._shellPayload.velocity, 2.3 + this.rng.float() * 1.2);
      const pv = this.player?.velocity;
      if (pv) this._shellPayload.velocity.add(pv);
      this._shellPayload.velocity.y += 1.1;
      this._shellPayload.weapon = this.current;
      const shell = vm.active?.shell;
      this._shellPayload.caseLen = shell?.caseLen ?? 0.0446;
      this._shellPayload.caseRadius = shell?.rimR ?? 0.00495;
      this._shellPayload.spin = 28 + this.rng.float() * 34;
      ctx.events.emit('weapon:shell', this._shellPayload);
    }

    // ---- retire dropped magazines --------------------------------------
    if (this._droppedMags.length) {
      const now = ctx.time.elapsed;
      for (const p of this._droppedMags) {
        if (p.group.visible && p.until && now > p.until) {
          p.group.visible = false;
          if (p.body && this.physics?.removeRigidBody) {
            this.physics.removeRigidBody(p.body);
            p.body = null;
          }
        }
      }
    }
  }

  /**
   * Scope: the overlay fades in over the last 15% of the ADS curve. While it is
   * up, the aim point sways on a slow breathing figure-eight scaled by
   * `scope.sway`; SHIFT holds the breath (sway x0.15) for up to 4 s, after
   * which the shooter gasps (sway x2 for 1.5 s). The sway is applied to the
   * aim direction in tryFire, so it is a real skill, not a decoration.
   */
  _updateScope(dt, def, input) {
    const sc = def.scope;
    const ads = this.viewmodel.adsT;
    this._scopeT = sc ? clamp01((ads - 0.85) / 0.15) : 0;
    const b = this._breath;
    b.t += dt;
    if (!sc || this._scopeT <= 0) {
      b.hold = 0;
      b.tired = Math.max(0, b.tired - dt);
      this._swayAim.x = 0;
      this._swayAim.y = 0;
      return;
    }
    const wantHold = input ? input.action('sprint') : false;
    if (wantHold && b.tired <= 0) {
      b.hold += dt;
      if (b.hold > 4) {
        b.hold = 0;
        b.tired = 1.5;
      }
    } else {
      b.hold = 0;
      if (b.tired > 0) b.tired -= dt;
    }
    const mult = b.hold > 0 ? 0.15 : b.tired > 0 ? 2 : 1;
    this._swayMult = damp(this._swayMult ?? 1, mult, 6, dt);
    const t = b.t;
    // Radians of aim offset: ~0.25 deg at sway 1 (a 12x reticle wanders ~1/3 of
    // a mil-dot per breath).
    const a = 0.0045 * (sc.sway ?? 1) * this._swayMult;
    this._swayAim.x = a * (Math.sin(t * 0.9) * 0.7 + Math.sin(t * 2.3 + 1.1) * 0.3);
    this._swayAim.y = a * (Math.sin(t * 1.8 + 0.4) * 0.5 + Math.sin(t * 0.55) * 0.5);
  }

  /**
   * Weapon weight: `def.moveMult` scales the player's move speed. The player
   * system may implement `setMoveSpeedScale(x)` itself; until it does, its
   * `movement.targetSpeed()` is wrapped once here (composition only; nothing in
   * src/player is edited).
   */
  _installMoveScale() {
    const p = this.player;
    if (!p || typeof p.setMoveSpeedScale === 'function') return;
    const mv = p.movement;
    if (!mv || typeof mv.targetSpeed !== 'function' || mv.__owSpeedScaled) return;
    const orig = mv.targetSpeed.bind(mv);
    mv.targetSpeed = () => orig() * (this.moveSpeedScale ?? 1);
    mv.__owSpeedScaled = true;
  }

  _updateOverlays() {
    const o = this._overlayState;
    const eq = this.equipment;
    const shown = this.viewmodel.anchor.visible;
    o.flash = eq ? eq.flashLevel : 0;
    o.blur = eq ? eq.flashBlur : 0;
    const cf = eq && shown ? eq.cookFraction : -1;
    o.cook = cf;
    o.danger = cf > 0.65 && eq.th.kind === 'frag';
    o.cookText = cf >= 0 ? eq.cookRemaining.toFixed(1) : '';
    const sd = this.current?.scope;
    o.scope = shown && sd ? this._scopeT : 0;
    o.style = sd?.overlay ?? 'sniper';
    const px = (typeof innerHeight === 'number' ? innerHeight : 1080) * 0.5;
    const fovR = ((this.ctx.camera.fov ?? 20) * DEG) / 2;
    const k = px / Math.tan(fovR);
    o.swayX = -this._swayAim.x * k * 0;
    o.swayY = -this._swayAim.y * k * 0;
    this.viewmodel.scopeHide = o.scope > 0.98;
    this.overlays?.update(o);
  }

  /* ====================================================================== */
  /*  capture harness                                                       */
  /* ====================================================================== */

  /**
   * Freeze the viewmodel in a photogenic state.
   * The harness applies a shot, then pumps `SETTLE` frames before grabbing the
   * frame, so 'fire' schedules a short burst that peaks right at the capture.
   */
  debugPose(kind = 'idle', opts = {}) {
    const vm = this.viewmodel;
    this.debugMode = kind;
    // The harness shows the primary unless a shot asks for a specific gun.
    const want = opts?.weapon ?? PRIMARY_ID;
    this.setWeaponImmediate(this.states.has(want) ? want : PRIMARY_ID);
    vm.stopClip();
    vm.recPos.reset();
    vm.recRot.reset();
    vm.settle.reset();
    vm.lag.reset();
    vm.lagRot.reset();
    vm.boltHold = 0;
    vm.boltCycle = 0;
    vm.sprintT = 0;
    vm.lowReadyT = 0;
    vm.bobPhase = 0;
    vm._angVel.yaw = 0;
    vm._angVel.pitch = 0;
    vm._hasPrev = false;
    // A fixed, non-zero noise phase: a settled but not artificially symmetric pose.
    vm.noiseT = 12.37;
    vm.debugFrozen = true;
    this._spread = kind === 'ads' ? this.current.spreadAds : this.current.spreadHip;
    this._sinceShot = 10;
    this._debugFrame = 0;

    const s = this.state;
    if (s) {
      this._fill(s);
      if (kind === 'fire') s.mag = Math.max(1, Math.min(s.mag, 22));
    }
    this._cycling = false;
    this._shellReload = false;

    if (kind === 'ads') {
      vm.adsT = 1;
      this._state.ads = true;
    } else {
      vm.adsT = 0;
      this._state.ads = false;
    }
    this._state.sprint = false;
    this._state.speed = 0;
    this._state.trigger = false;
    // Frames (at the harness's fixed 60 Hz) on which to fire for the 'fire'
    // shot. The burst has to land at the END of the harness's settle window: a
    // flash core lives 52 ms (~3 frames), so the last rounds must leave the
    // barrel a frame or two before the grab or there is nothing to photograph.
    // `grabFrame` is how many frames the harness will pump — it is a CLI flag
    // (`--settle`), so it cannot be hard-coded here. The offsets below straddle
    // the grab because the harness pumps on its own rAF chain, which can land a
    // frame either side of the engine's.
    // A flash core lives 52 ms — about three frames at 60 Hz — while the exact
    // frame the shutter lands on is only known to within a handful of frames
    // (the harness pumps its settle count on its own rAF chain, then the
    // screenshot RPC costs a few more). So: three spaced rounds early to fill
    // the frame with drifting smoke, brass in flight and a tracer, then a
    // sustained tail on a 2-frame cadence, so a flash is lit continuously
    // across the whole uncertainty window.
    //
    // The cadence was 3 frames, which is the flash core's own lifetime rounded
    // UP: measured across settle 86/88/90/92/94, frame 90 landed in the trough
    // between two cores and photographed a dying flash (10k hot pixels against
    // 26-29k on either side). Two frames guarantees overlap.
    if (kind === 'fire') {
      const grab = Math.round(opts?.grabFrame ?? 90);
      const frames = [grab - 26, grab - 19, grab - 12];
      for (let f = grab - 6; f <= grab + 18; f += 2) frames.push(f);
      this._scriptFrames = frames.filter((f) => f >= 2);
    } else {
      this._scriptFrames = null;
    }
    return kind;
  }

  /**
   * Swap without the draw animation (run start, harness, debug). A weapon that
   * is not carried takes its slot in the loadout.
   */
  setWeaponImmediate(id) {
    if (!this.states.has(id)) return false;
    if (!this.carried.includes(id)) {
      const slot = this.states.get(id).def.slot;
      this.loadout[slot === 'secondary' ? 'secondary' : 'primary'] = id;
      this.carried = [this.loadout.primary, this.loadout.secondary];
    }
    this._switchTo = null;
    this._cycling = false;
    this._shellReload = false;
    this.activeId = id;
    this.viewmodel.setActive(id);
    return true;
  }

  /**
   * LOADOUT ENTRY POINT for the game subsystem (`ctx.get('weapons')`).
   *
   * Sets the player's active weapon at run start. The game/ui side owns the
   * loadout copy; weapons just takes an id. Ids and their ESF designations
   * (def.displayName, also listed by `loadoutInfo()`):
   *   'carbine' KESTREL 556   the default primary
   *   'rifle'   HARRIER 556
   *   'smg'     MERLIN 9
   *   'pistol'  P19 SIDEARM
   *
   * Defaults to an instant swap (no draw animation) because a run-start loadout
   * should already be in hand. Pass { animated:true } for the holster/draw swap,
   * { refill:true } to top the mag + reserve to full (e.g. on continue/restart).
   *
   * @param {'carbine'|'rifle'|'smg'|'pistol'} id
   * @param {{animated?:boolean, refill?:boolean}} [opts]
   * @returns {boolean} true if `id` is a real weapon and is now (or is becoming) active.
   */
  selectLoadout(id, opts = {}) {
    if (!this.states.has(id)) return false;
    if (opts.refill) this._fill(this.states.get(id));
    if (opts.animated && this.carried.includes(id)) return id === this.activeId ? true : this.setWeapon(id);
    return this.setWeaponImmediate(id);
  }

  /** The default primary (what a run starts with if the loadout names nothing). */
  get primaryId() {
    return PRIMARY_ID;
  }

  /**
   * Loadout copy source for `ui`/`game`: one plain object per weapon, in swap
   * order. Freshly allocated — call it when building a menu, not per frame.
   */
  loadoutInfo() {
    const out = [];
    for (const id of WEAPON_ORDER) {
      const d = this.states.get(id)?.def ?? WEAPON_DEFS[id];
      out.push({
        id,
        displayName: d.displayName,
        class: d.class,
        caliber: d.caliber,
        magSize: d.magSize,
        rpm: d.rpm,
        modes: d.modes.slice(),
        blurb: d.blurb ?? '',
        primary: id === PRIMARY_ID,
        slot: d.slot ?? 'primary',
        damage: d.projectile ? d.projectile.damage : d.damage * (d.pellets ?? 1),
        pellets: d.pellets ?? 1,
        reserve: d.reserve,
      });
    }
    return out;
  }

  _runDebug(ctx) {
    this._debugFrame = (this._debugFrame ?? 0) + 1;
    const frames = this._scriptFrames;
    if (!frames) return;
    for (const f of frames) {
      if (f === this._debugFrame) {
        this._fireTimer = 0;
        this.tryFire();
      }
    }
  }

  /* ====================================================================== */

  resize() {}

  dispose() {
    for (const off of this._off ?? []) off();
    this._off_gs?.();
    this.rockets?.dispose();
    this.equipment?.dispose();
    this.overlays?.dispose();
    this.sim?.clear();
    for (const p of this._droppedMags) {
      p.group.removeFromParent();
      if (p.body && this.physics?.removeRigidBody) this.physics.removeRigidBody(p.body);
    }
    this._droppedMags.length = 0;
    this.viewmodel?.dispose();
    this.mats?.dispose();
  }
}
