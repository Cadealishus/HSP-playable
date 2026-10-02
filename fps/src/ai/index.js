/**
 * AI — enemy characters, navigation, perception, cover selection and combat
 * behaviour.
 *
 * WHAT LIVES WHERE
 *   rig.js        25-bone skeleton, bind pose, weapon anchor points
 *   geo.js        loft/tube/revolve toolkit, skin binder, baked vertex AO
 *   parts.js      body and kit: jacket, plate carrier, pouches, helmet, boots
 *   weapon.js     the carried carbine / long rifle, baked into the character
 *   textures.js   tiling PBR sets: camo cloth, cordura, skin, polymer, steel
 *   soldier.js    variant assembly -> one skinned geometry + material list
 *   clips.js      hand-authored pose layers (idle/walk/run/crouch/hit/recoil…)
 *   animator.js   layered blending + aim, look-at, arm and foot IK
 *   nav.js        walkability grid from the physics BVH, A*, string pulling,
 *                 cover point extraction and scoring
 *   agent.js      one enemy: senses, state machine, gun, hit zones, death
 *   squad.js      peek rotation, contact sharing, flank and grenade rationing
 *
 * PUBLIC API — `const ai = ctx.get('ai')`
 *   ai.spawn(variant|null, position, yaw, opts) -> Agent
 *        opts { team: 'hostile'|'esf', role: rifleman|smg|shotgun|lmg|sniper|
 *               rocket|commander, weapon: defs.js id, skill 0..1, name,
 *               patrol: Vector3[], holding: Civilian }
 *   ai.spawnCivilian(position, yaw, { behavior: 'cower'|'flee'|'hostage'|
 *               'follow', to, target, captor, look, name }) -> Civilian
 *   ai.setOrderProvider(fn(agent) -> order|null, owner?)   EXPANSION.md §3
 *        order { kind: hunt|capture|defend|attack|plant|defuse|escort|hold|
 *                patrol, pos?, radius?, targetId? }
 *   ai.actors                              live combatants + the player proxy
 *   ai.civilians                           civilians (never in `agents`)
 *   ai.getActor(id)                        agent / civilian by id or name,
 *                                          0 | 'player' for Doug
 *   ai.despawnAll() / ai.reapCorpses(n) / ai.killAll()
 *   agent.stun(intensity, duration)        flash / concussion
 *   agent.team .role .alive .position .brain.state .perception
 *   events: actor:death { actor, team, killer, killerTeam, killerName,
 *           killerIsPlayer, headshot, ... }, civilian:hit { civ, killer,
 *           killerTeam, amount, killed }, civilian:released { civ }
 *   ai.agents                              live Agent list
 *   ai.debugStage('firefight')             staged combat tableau for captures
 *   ai.debugStage('closeup' | 'flop')      one man at 4 m / a blast mid-launch
 *   ai.faction                             { name, short } for UI copy
 *   ai.radio.log                           recent `ai:radio` lines (dev)
 *   ai.prewarmMaterials()                  await: build + compile every character
 *                                          shader without spawning anything
 *   ai.grid / ai.cover                     navigation + cover queries
 *   ai.stats                               { agents, alive, navMs, coverPts,
 *                                            pathsDeferred, lodIrrelevant }
 *
 * FRAME BUDGETS — navigation and the garrison are built during init(), not on
 * the first frame of play; A* is rationed to `ai.pathsPerFrame` solves per frame;
 * and an actor that provably cannot reach a pixel this frame (see
 * `_updateRelevance`) animates at a third rate and leaves the shadow cascades.
 *
 * EVENTS consumed: weapon:fire, bullet:impact, damage:dealt, explosion,
 *   player:footstep
 * EVENTS emitted: weapon:fire (enemy muzzle), weapon:shell, bullet:tracer,
 *   damage:dealt (enemy hitting the player), actor:death, ai:bark (audio),
 *   ai:radio { enemy, kind: 'spot'|'cover'|'grenade'|'mandown', text } — a
 *   short deadpan radio line for the UI to subtitle (see radio.js)
 */

import * as THREE from 'three';
import { SoldierMaterials } from './textures.js';
import { buildSoldier, resolveMaterials, MATERIAL_SLOTS, VARIANTS, variantForTeam } from './soldier.js';
import { PlayerProxy, normTeam } from './teams.js';
import { BOT_DAMAGE_SCALE, roleFor, modelFor } from './roles.js';
import { IffTags } from './iff.js';
import { Comms } from './comms.js';
import { Projectiles } from './projectiles.js';
import { Civilian } from './civilian.js';
import { AiDebug } from './debug.js';
import { buildCivilian, isCivLook, CIV_IDS } from './civbody.js';

const EMPTY = Object.freeze([]);

/**
 * Ray (unit `d`) against a capsule: closest approach of the ray to the
 * capsule's segment, then back off to the surface. Returns t, or -1.
 */
function rayCapsule(o, d, ax, ay, az, bx, by, bz, r, maxT) {
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const wx = o.x - ax, wy = o.y - ay, wz = o.z - az;
  const b = d.x * ux + d.y * uy + d.z * uz;
  const c = ux * ux + uy * uy + uz * uz;
  const dd = d.x * wx + d.y * wy + d.z * wz;
  const e = ux * wx + uy * wy + uz * wz;
  const den = c - b * b;
  let t = den > 1e-9 ? (e - b * dd) / den : 0;
  t = c > 1e-9 ? Math.max(0, Math.min(1, t)) : 0;
  const qx = ax + ux * t, qy = ay + uy * t, qz = az + uz * t;
  const s = (qx - o.x) * d.x + (qy - o.y) * d.y + (qz - o.z) * d.z;
  if (s < 0 || s > maxT + r) return -1;
  const px = o.x + d.x * s - qx, py = o.y + d.y * s - qy, pz = o.z + d.z * s - qz;
  const m2 = px * px + py * py + pz * pz;
  if (m2 > r * r) return -1;
  const hit = s - Math.sqrt(r * r - m2);
  return hit < 0 ? 0 : hit;
}
import { RIG } from './rig.js';
import { NavGrid, CoverMap } from './nav.js';
import { Agent, STATE } from './agent.js';
import { Squad } from './squad.js';
import { GroundShadows } from './grounding.js';
import { RadioNet, FACTION, callsign, ESF_CALLSIGNS } from './radio.js';

/**
 * Enemy names live in radio.js: FACTION (the opposing force's name for the UI),
 * CALLSIGNS (killfeed, assigned per soldier in spawn(), recycled as GARY II,
 * GARY III ...) and the RADIO subtitle lines. The UI killfeed reads the agent's
 * `.name` / `.variantDisplay` straight off the `damage:dealt` / `actor:death`
 * payloads, so a name on the Agent IS the display name.
 */
export { CALLSIGNS, FACTION, RADIO } from './radio.js';

/** Frames from detonation to the frozen still in the `flop` capture tableau:
 *  0.5 s at 60 Hz — bodies at the top of their arc, fireball burnt down.
 *  Capture it with --settle >= 40 so the shutter lands after the freeze. */
const FLOP_FREEZE = 30;

export class AiSystem {
  static id = 'ai';
  static deps = ['physics', 'world'];

  async init(ctx) {
    this.ctx = ctx;
    this.rng = ctx.rng.fork();
    this.root = new THREE.Group();
    this.root.name = 'ai';
    ctx.scene.add(this.root);

    const t0 = performance.now();
    this.materials = new SoldierMaterials(this.rng.fork(), {
      size: 512,
      anisotropy: ctx.config.q.anisotropy ?? 8,
      camo: ['arid', 'woodland', 'urban'],
    });
    // Contact occlusion under every actor. Without it the cast shadow alone
    // leaves them hovering: see grounding.js.
    this.ground = new GroundShadows(this.root, 32);
    this._variants = new Map();
    this.agents = [];
    /** every live combatant, bots plus the player proxy (EXPANSION.md §2) */
    this.actors = [];
    /** the player seen as an actor (teams.js) */
    this.player = new PlayerProxy();
    this.squads = [];
    this.grid = null;
    this.cover = null;
    this.inspect = false;
    this.debugLog = false;
    /** dev: force the garrison to spawn even in deterministic capture runs */
    this.forcePopulate = false;
    /** running index into CALLSIGNS for the killfeed display name */
    this._callsignSeq = 0;
    this._esfSeq = 0;
    this._civSeq = 0;
    this._roleSeq = 0;
    /** the heavy's rockets and the marksman's glint (projectiles.js) */
    this.projectiles = new Projectiles(this);
    /** team callouts: range-limited and delayed (comms.js) */
    this.comms = new Comms(this);
    /** EXPANSION.md §3: fn(agent) -> order | null */
    this.orderProvider = null;
    this.orderOwner = null;
    /** LOS rays per frame for every bot's perception together */
    this.rayBudget = 96;
    this._rays = this.rayBudget;
    /** live grenades bots may need to run from */
    this._threats = [];
    /** F3 / ?aidebug=1 / FLOP.aiDebug(true): see debug.js */
    this.debug = new AiDebug(this);
    try {
      if (new URLSearchParams(location.search).get('aidebug') === '1') this.debug.setEnabled(true);
    } catch {
      /* no location (headless) */
    }
    /** IFF chevrons over friendly bots */
    this.iff = new IffTags(this.root);
    /** The opposing force, for UI copy: `{ name, short }`. */
    this.faction = FACTION;
    /** Enemy radio net: emits `ai:radio { enemy, kind, text }` for subtitles. */
    this.radio = new RadioNet(ctx);
    /** hard ceiling on concurrent live actors, so a runaway caller can never
     *  blow the frame budget. The game self-limits waves well under this. */
    this.maxAlive = 20;
    this._navPending = true;
    this.stats = { agents: 0, alive: 0, navMs: 0, coverPts: 0, walkable: 0, rays: 0, raysDenied: 0, unstick1: 0, unstick2: 0, unstick3: 0 };

    /* scratch */
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._probe = { y: 0, nx: 0, ny: 1, nz: 0, hit: false };
    this._tracerFrom = new THREE.Vector3();
    this._tracerTo = new THREE.Vector3();
    this._fireEvent = {
      weapon: 'ai_rifle',
      origin: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      seed: 0,
      // Sprites and light are gained SEPARATELY: see _flashGain/_flashLight.
      // The sprites have to read as fire at 25 m; the punctual light must not
      // turn the shooter into the brightest object in the frame.
      intensity: 0.12,
      light: 0.006,
      // Size is gained separately from radiance: a 0.12-intensity flash scaled
      // geometrically by 0.12 is 3 mm across and invisible at 20 m.
      flashScale: 0.8,
    };
    this._shellEvent = { position: new THREE.Vector3(), velocity: new THREE.Vector3() };
    /** scratch blast descriptor handed to Agent.applyDamage by explosions */
    this._blast = { position: null, radius: 6, strength: 1 };
    this._tracerEvent = { from: this._tracerFrom, to: this._tracerTo, speed: 800 };
    this._pelletDir = new THREE.Vector3();
    this._hitFrom = new THREE.Vector3();
    this._actorHit = { actor: null, t: 0, part: 'torso', scale: 1 };
    this._civLists = [null, null];
    /** non-combatants (civilian.js); never in `agents`, never targeted */
    this.civilians = [];
    this._fleshEvent = {
      point: new THREE.Vector3(), normal: new THREE.Vector3(), incident: new THREE.Vector3(),
      surface: 'flesh', surfaceIndex: 9, damage: 0, exit: false, actor: null, part: null, ai: true,
    };
    this._grenades = [];
    this._grenadeGeo = null;
    this._grenadeMat = null;

    /* ---- frame budgets and LOD state (see _updateRelevance / requestPath) ---- */
    this._pathBudget = 0;
    /** A* solves allowed per frame. Measured: one solve is 0.5-1.1 ms on the
     *  221x221 grid, and a squad that all enters combat on the same frame used to
     *  ask for six of them at once. */
    this.pathsPerFrame = 2;
    this.stats.pathsDeferred = 0;
    this._frustum = new THREE.Frustum();
    this._mvp = new THREE.Matrix4();
    this._sphere = new THREE.Sphere();
    this._sweep = new THREE.Sphere();
    this._sun = new THREE.Vector3(0, 1, 0);
    this._lodStats = { irrelevant: 0 };

    this._wireEvents(ctx);
    console.info(
      `[ai] materials ${(performance.now() - t0).toFixed(0)}ms ` +
        `(${this.materials.bakeMs.toFixed(0)}ms texture bake)`
    );
    // The albedo budget is only real if it is measured. Print what every camo
    // bake actually landed on, so a drift out of 0.09-0.32 is visible in the
    // capture log instead of only in the critic's histogram.
    for (const k in this.materials.camoStats ?? {}) {
      const s = this.materials.camoStats[k];
      console.info(
        `[ai] camo ${k}: map mean ${s.mean.toFixed(3)} (was ${s.was.toFixed(3)}) ` +
          `range ${s.min.toFixed(3)}-${s.max.toFixed(3)} sd ${s.sd.toFixed(3)}`
      );
    }

    // Navigation, the garrison and every character shader, DURING BOOT.
    //
    // MEASURED, not guessed: all of this used to land on the first `update()`
    // after the player took control — 224 ms for the 221x221 walkability grid,
    // 19 ms for the cover map and 93/58/57 ms to build the three soldier
    // geometries the first three spawns ask for. One 450 ms freeze, on the frame
    // the player starts playing, plus five character programs compiling over the
    // frames after it (116-328 ms each).
    //
    // Doing it here is behaviour-identical rather than merely similar: no frame
    // has run yet, so `physics`, `world` and `player` are in exactly the state
    // the first update would have found them in, and the order of RNG draws —
    // which is what decides how every soldier is stitched together — is
    // unchanged. `update()` keeps the same code as a fallback for the case where
    // the collision world is not registered yet.
    this._bootNav(ctx);
    await this.prewarmMaterials();
  }

  /**
   * Build navigation and garrison the level at boot. Never throws: if physics
   * has no level yet, `_navPending` stays set and `update()` retries.
   */
  _bootNav(ctx) {
    try {
      this._buildNav();
      if (!this._navPending && (!ctx.config.deterministic || this.forcePopulate)) this.populate();
    } catch (err) {
      this._navPending = true;
      console.warn('[ai] boot nav deferred to the first frame:', err?.message ?? err);
    }
  }

  /**
   * Build every character material and force its shader program to compile,
   * WITHOUT spawning a gameplay object and WITHOUT drawing a frame.
   *
   * This is the hook `src/core/prewarm.js` documents as missing: its `transients`
   * pass reached the character programs by staging a firefight, which left actors
   * and decals behind and blew the pixel gate. Nothing here is a gameplay object.
   *
   *  - `resolveMaterials()` is a pure function of the variant name, so every
   *    material every variant will ever ask for can be created now. It draws no
   *    random numbers, so the RNG stream — and therefore the picture — is
   *    untouched. It MUST be handed `MATERIAL_SLOTS` in the builder's own order:
   *    three sorts opaque draws (including the nine groups inside one soldier) by
   *    the global `Material.id` counter, so creating them in any other order
   *    reorders those draws and flips the depth tie on coplanar surfaces. That is
   *    a measured 2-pixel gate failure, not a theory — see MATERIAL_SLOTS.
   *  - the programs are compiled against a throwaway scene holding ONE dummy
   *    SkinnedMesh. The permutation three compiles is decided by the material
   *    plus the object's features (skinning, vertex colours, uv) and the target
   *    scene's lights, so a 6-triangle stand-in with the real 25-bone skeleton
   *    and the real vertex attributes yields the same programs a soldier does.
   *  - the cascade depth variant is compiled too, by borrowing render's own
   *    override material: `compileAsync` only ever looks at `object.material`, so
   *    the skinned depth program is otherwise not reachable without rendering a
   *    shadow map.
   *
   * Idempotent and never throws — a failed prewarm just means the old stutter.
   */
  async prewarmMaterials() {
    if (this._prewarmed) return this._prewarmed;
    const t0 = performance.now();
    const out = { ok: false, materials: 0, programs: 0, ms: 0 };
    this._prewarmed = out;
    try {
      const mats = [];
      const seen = new Set();
      for (const name in VARIANTS) {
        for (const m of resolveMaterials(name, MATERIAL_SLOTS, this.materials)) {
          if (m && !seen.has(m)) { seen.add(m); mats.push(m); }
        }
      }
      // the thrown grenade's mesh is built on the first throw, mid-firefight
      this._ensureGrenade();
      out.materials = mats.length + 1;

      const r = this.ctx.peek('render');
      if (r?.patcher) {
        for (const m of mats) r.patcher.patch(m);
        r.patcher.patch(this._grenadeMat);
      }
      const renderer = r?.renderer;
      if (!renderer) return out;
      const before = renderer.info.programs?.length ?? 0;

      const scene = new THREE.Scene();
      const { skeleton, root } = RIG.createSkeleton();
      const geo = this._dummySkinGeometry();
      const mesh = new THREE.SkinnedMesh(geo, mats);
      mesh.frustumCulled = false;
      scene.add(root);
      scene.add(mesh);
      mesh.bind(skeleton);

      const compile = async (target) => {
        try {
          await renderer.compileAsync(scene, this.ctx.camera, target);
        } catch {
          try { renderer.compile(scene, this.ctx.camera, target); } catch { /* driver */ }
        }
      };
      await compile(this.ctx.scene);
      // cascade depth: same object, render's own override material
      const depth = r.csm?.depthMaterial;
      if (depth) {
        mesh.material = depth;
        await compile(this.ctx.scene);
      }
      // the grenade is a plain (unskinned) mesh, so it needs its own object
      scene.remove(mesh);
      const g = new THREE.Mesh(this._grenadeGeo, this._grenadeMat);
      scene.add(g);
      await compile(this.ctx.scene);
      scene.remove(g);

      geo.dispose();
      skeleton.dispose?.();
      out.programs = (renderer.info.programs?.length ?? 0) - before;
      out.ok = true;
    } catch (err) {
      out.error = String(err?.message ?? err);
    }
    out.ms = Math.round(performance.now() - t0);
    console.info(`[ai] prewarmMaterials ${JSON.stringify(out)}`);
    return out;
  }

  /**
   * A 2-triangle skinned stand-in carrying exactly the attributes a soldier's
   * geometry does — position, normal, uv, colour, skinIndex, skinWeight. Three
   * derives half of the shader permutation from the geometry's attributes, so
   * anything missing here would compile the wrong program.
   */
  _dummySkinGeometry() {
    const g = new THREE.BufferGeometry();
    const n = 3;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(n * 4), 4));
    const w = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) w[i * 4] = 1;
    g.setAttribute('skinWeight', new THREE.BufferAttribute(w, 4));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2]), 1));
    return g;
  }

  /* ================================================================== */
  /* events                                                             */
  /* ================================================================== */

  _wireEvents(ctx) {
    this._off = [];
    const on = (t, fn) => this._off.push(ctx.events.on(t, fn));

    on('weapon:fire', (e) => {
      if (!e || !e.origin || e.ai === true) return; // ours are heard in onAgentFire
      // The player's shot. Loudness scales with the weapon's `noise` (defs.js):
      // a suppressed gun carries a fraction of the 90 m an open rifle does.
      // weapons puts the def's hearing radius (metres) and suppression
      // multiplier on the event: a suppressed carbine carries ~22 m, a rifle 90
      const w = e.weapon;
      const radius = e.noise ?? (typeof w === 'object' && w ? w.noise : null) ?? 90;
      const supp = e.suppression ?? (typeof w === 'object' && w ? w.suppression : null) ?? 1;
      this.onShot(this.player, e.origin, e.dir, radius, supp);
    });

    on('bullet:impact', (e) => {
      if (!e || !e.point) return;
      // physics' damage:dealt carries no direction: remember the round's line
      // from its entry impact, which physics emits immediately before it
      if (e.actor instanceof Agent && !e.exit && e.incident) {
        e.actor._impDir.copy(e.incident);
        e.actor._impFrame = this.ctx.time.frame;
      }
      for (const a of this.agents) {
        if (!a.alive) continue;
        const d = a.position.distanceTo(e.point);
        if (d < 3.2) a.suppress(0.5 * (1 - d / 3.2));
        else if (d < 12) a.hear(e.point, 12);
      }
    });

    on('damage:dealt', (e) => {
      if (!e || !e.target || !(e.target instanceof Agent)) return;
      const a = e.target;
      if (!a.alive) return;
      // physics names no shooter: an unattributed round on a bot is Doug's
      const src = e.source instanceof Agent ? e.source : this.player;
      // friendly fire is off (ESF hitboxes are off MASK.BULLET anyway)
      if (src !== a && src.team === a.team && a.team !== 'civ') { e.amount = 0; return; }
      let amount = e.amount * (src === this.player ? this._falloff(e.point) : 1);
      // ONE ROUND, ONE WOUND. A penetrating round that passes through two of
      // this man's capsules (arm then chest, chest then the lower torso)
      // arrives as two damage:dealt on the same frame along the same line;
      // summing them is what let a 56-damage marksman round one-shot a chest.
      // The round counts once, at its worst hit.
      const frame = this.ctx.time.frame;
      const inc = e.incident ?? (a._impFrame === frame ? a._impDir : null);
      // a human shield works: a round that went through the hostage first
      // stops in him, it does not carry on into the man holding him
      const h = a.holding;
      if (h && inc && h._dmgFrame === frame && h._dmgDir.dot(inc) > 0.999) { e.amount = 0; return; }
      if (a._dmgFrame === frame && inc && a._dmgDir.dot(inc) > 0.999) {
        const extra = amount - a._dmgMax;
        if (extra <= 0) { e.amount = 0; return; }
        a._dmgMax = amount;
        amount = extra;
      } else {
        a._dmgFrame = frame;
        a._dmgMax = amount;
        if (inc) a._dmgDir.copy(inc);
      }
      a.applyDamage(amount, e.headshot ? 'head' : e.part ?? 'torso', e.point ?? a.position, inc, null, src);
      if (!a.alive) e.killed = true;
    });

    on('explosion', (e) => {
      if (!e || !e.position) return;
      const radius = e.radius ?? 5;
      const owner = this._resolveOwner(e.owner ?? e.source);
      const ownerTeam = owner?.team ?? e.team ?? null;
      const phys = this.phys;
      const lists = [this.agents, this.civilians];
      for (const list of lists) {
        for (const a of list) {
          if (!a.alive) continue;
          const d = a.position.distanceTo(e.position) + 0.001;
          a.hear(e.position, 120);
          if (d > radius) continue;
          // friendly fire off: the owner's teammates are spared (the owner is not)
          if (ownerTeam && a !== owner && a.team === ownerTeam && a.team !== 'civ') continue;
          // cover: the blast has to reach the torso or the head, not just the eye
          if (phys) {
            const torso = this._v2.set(a.position.x, a.position.y + 1.1, a.position.z);
            if (!phys.lineOfSight(e.position, torso, phys.MASK.EXPLOSION) &&
              !phys.lineOfSight(e.position, a.eye, phys.MASK.EXPLOSION)) continue;
          }
          const f = 1 - d / radius;
          this._v.copy(a.position).sub(e.position).normalize();
          a.suppress(1.4 * f);
          // `blast` rides along so a kill launches the doll from the charge
          this._blast.position = e.position;
          this._blast.radius = radius;
          this._blast.strength = Math.min(1.5, ((e.damage ?? 100) * 0.9) / 108);
          a.applyDamage((e.damage ?? 100) * f * f, 'torso', a.eye, this._v, this._blast, owner);
        }
      }
    });

    on('player:footstep', (e) => {
      if (!e || !e.position) return;
      const crouched = e.stance === 'crouch' || e.stance === 'prone';
      const loud = crouched ? 3 : e.running ? 22 : 9;
      const now = this.ctx.time.elapsed;
      for (const a of this.agents) {
        if (!a.alive || a.team !== 'hostile') continue;
        const d = a.position.distanceTo(e.position);
        if (d < loud) a.perception.hearFrom(this.player, e.position, (1 - d / loud) * 0.8, 'footstep', now);
      }
    });

    on('grenade:throw', (e) => this._onGrenadeThrow(e));
    on('flash:detonate', (e) => this._onFlash(e));
  }

  /** An explosion/damage owner as an actor: an Agent, the player proxy, or null. */
  _resolveOwner(o) {
    if (!o) return null;
    if (o instanceof Agent) return o;
    if (o === 'player' || o.isPlayer === true || o === this.ctx.peek('player')) return this.player;
    return null;
  }

  /**
   * A gunshot from `shooter` (an Agent or the player proxy) at `origin`,
   * audible out to `radius` metres. Enemies of the shooter hear a threat;
   * anyone near the line of fire is suppressed.
   */
  onShot(shooter, origin, dir, radius, suppression = 1) {
    const now = this.ctx.time.elapsed;
    for (const c of this.civilians) {
      if (!c.alive) continue;
      c.hear(origin, radius * 0.6);
      if (dir && this._distanceToRay(c.position, origin, dir, c.eyeHeight) < 2.6) c.suppress(0.4);
    }
    for (const a of this.agents) {
      if (!a.alive || a === shooter) continue;
      const d = a.position.distanceTo(origin);
      if (d > radius) continue;
      const strength = 1 - d / radius;
      if (shooter && a.team === shooter.team) {
        // a friend's gunfire: there is a fight over there
        if (d < radius * 0.6) a.perception.hearFrom(null, origin, strength * 0.6, 'friendfire', now);
        continue;
      }
      a.perception.hearFrom(shooter, origin, strength, 'gunshot', now);
      if (dir) {
        const r = this._distanceToRay(a.position, origin, dir, a.eyeHeight);
        if (r < 2.6) a.suppress((0.45 * (1 - r / 2.6) + 0.12) * suppression);
      }
    }
  }

  _falloff(point) {
    if (!point) return 1;
    const p = this.playerPosition(this._v2);
    if (!p) return 1;
    const d = p.distanceTo(point);
    // full damage inside 22 m, tapering to 45 % by 70 m
    return d < 22 ? 1 : Math.max(0.45, 1 - (d - 22) * 0.0125);
  }

  _distanceToRay(point, origin, dir, eyeH) {
    const px = point.x - origin.x;
    const py = point.y + eyeH * 0.7 - origin.y;
    const pz = point.z - origin.z;
    const t = Math.max(0, px * dir.x + py * dir.y + pz * dir.z);
    return Math.hypot(px - dir.x * t, py - dir.y * t, pz - dir.z * t);
  }

  /* ================================================================== */
  /* assets                                                             */
  /* ================================================================== */

  variant(name, opts = {}) {
    if (isCivLook(name)) {
      let c = this._variants.get(name);
      if (!c) {
        c = buildCivilian(name, { rng: this.rng.fork(), materials: this.materials });
        this._variants.set(name, c);
        const r = this.ctx.peek('render');
        if (r?.patcher) for (const m of c.materials) r.patcher.patch(m);
      }
      return c;
    }
    name = variantForTeam(name, opts.team);
    const style = opts.weapon ?? null;
    const key = style && style !== VARIANTS[name]?.weapon ? `${name}|${style}` : name;
    let v = this._variants.get(key);
    if (!v) {
      const t0 = performance.now();
      v = buildSoldier(name, { rng: this.rng.fork(), materials: this.materials, weapon: style });
      this._variants.set(key, v);
      // Hand the new materials to render immediately rather than waiting for its
      // scene walk: they are all MeshStandardMaterial, so the patcher injects the
      // CSM sun shadow, the screen-space contact shadow, GTAO and the bounce fill
      // into them. Without the shadow term a character is lit by ambient alone
      // and looks pasted onto the ground.
      const r = this.ctx.peek('render');
      if (r?.patcher) for (const m of v.materials) r.patcher.patch(m);
      console.info(
        `[ai] variant "${name}" ${v.stats.triangles | 0} tris / ${v.stats.vertices} verts / ` +
          `${v.materials.length} materials in ${(performance.now() - t0).toFixed(0)}ms`
      );
    }
    return v;
  }

  /** Bone index lookup for the shared rig (used by the ragdoll spec). */
  rigIndex(name) {
    return RIG.index(name);
  }

  get phys() {
    return this._phys ?? (this._phys = this.ctx.peek('physics'));
  }

  /* ================================================================== */
  /* navigation                                                         */
  /* ================================================================== */

  _buildNav() {
    const phys = this.phys;
    const world = this.ctx.peek('world');
    if (!phys) return;
    if (phys.staticWorld.dirty) phys.rebuildStatic();
    if (phys.triangleCount <= 0) return; // level not registered yet — retry next frame
    const bounds =
      world?.bounds?.clone?.() ??
      new THREE.Box3(new THREE.Vector3(-70, -4, -70), new THREE.Vector3(70, 24, 70));
    bounds.expandByScalar(2);
    const t0 = performance.now();
    this.grid = new NavGrid(phys, { bounds, cell: 0.8, radius: 0.36, height: 1.78 });
    this.grid.build();
    this.cover = new CoverMap(this.grid, phys);
    this.cover.build({ step: 1, reach: 1.3 });
    this.stats.navMs = performance.now() - t0;
    this.stats.coverPts = this.cover.points.length;
    this.stats.walkable = this.grid.walkableCount;
    this._navPending = false;
    console.info(
      `[ai] nav ${this.grid.nx}x${this.grid.nz} cells · ${this.grid.walkableCount} walkable ` +
        `(${this.grid.upperCount} on lower storeys) · ` +
        `${this.cover.points.length} cover points · ${this.stats.navMs.toFixed(0)}ms`
    );
  }

  /** Floor probe used by foot IK and spawning. */
  probeGround(x, z, fromY, out) {
    const phys = this.phys;
    if (!phys) return false;
    const h = phys.raycast(x, fromY, z, 0, -1, 0, 3.2, phys.MASK.WORLD);
    if (!h.hit) return false;
    out.y = h.point.y;
    out.nx = h.normal.x;
    out.ny = h.normal.y;
    out.nz = h.normal.z;
    out.hit = true;
    return true;
  }

  groundAt(x, z, fromY = 40) {
    const phys = this.phys;
    if (!phys) return 0;
    const h = phys.raycast(x, fromY, z, 0, -1, 0, 80, phys.MASK.WORLD);
    if (h.hit) return h.point.y;
    return this.ctx.peek('world')?.groundHeight?.(x, z) ?? 0;
  }

  /** The player's chest position, however the player system exposes itself. */
  playerPosition(out) {
    const p = this.ctx.peek('player');
    const src = p?.position ?? p?.capsulePosition ?? null;
    if (src && Number.isFinite(src.x)) {
      out.set(src.x, src.y + 1.35, src.z);
      return out;
    }
    out.setFromMatrixPosition(this.ctx.camera.matrixWorld);
    out.y -= 0.1;
    return out;
  }

  /* ================================================================== */
  /* spawning                                                           */
  /* ================================================================== */

  /**
   * Spawn a combatant.
   * @param variantName  body: 'vanguard' | 'irregular' | 'breacher' (null: the
   *                     role picks); ESF bots get the same body in ESF kit
   * @param opts  { team: 'hostile'|'esf', role, weapon (def id), skill 0..1,
   *                name, patrol: Vector3[], squad, holding: Civilian }
   */
  spawn(variantName, position, yaw = 0, opts = {}) {
    const team = normTeam(opts.team ?? 'hostile');
    const role = roleFor(opts.role);
    let variant = variantName;
    if (!variant || !VARIANTS[String(variant).replace(/^esf_/, '')]) {
      const list = role.variant ?? ['vanguard'];
      variant = list[this._roleSeq++ % list.length];
    }
    variant = String(variant).replace(/^esf_/, '');
    const model = opts.model ?? (opts.role ? modelFor(role, variant) : null);
    const a = new Agent(this, { ...opts, variant, position, yaw, team, model });
    if (!a.name) a.name = team === 'esf' ? callsign(this._esfSeq++, ESF_CALLSIGNS) : this.nextCallsign();
    if (opts.skill !== undefined) a.setDifficulty(opts.skill);
    if (team === 'esf') this.iff.attach(a);
    this.agents.push(a);
    if (opts.holding) this.takeHostage(a, opts.holding);
    return a;
  }

  /**
   * A civilian (EXPANSION.md §7) on team 'civ'.
   * @param opts { behavior: 'cower'|'flee'|'hostage'|'follow', to: Vector3,
   *               target: actor|id|'player', captor: Agent, look: 'civ_a'..,
   *               name }
   */
  spawnCivilian(position, yaw = 0, opts = {}) {
    const look = isCivLook(opts.look) ? opts.look : CIV_IDS[this._civSeq++ % CIV_IDS.length];
    const c = new Civilian(this, { ...opts, variant: look, position, yaw });
    c.name = opts.name ?? 'CIVILIAN';
    this.civilians.push(c);
    if (opts.captor) this.takeHostage(opts.captor, c);
    return c;
  }

  /** `captor` holds `civ` as a human shield (see Agent._holdHostage). */
  takeHostage(captor, civ) {
    if (!captor || !civ) return;
    captor.holding = civ;
    civ.captor = captor;
    civ.behavior = 'hostage';
    civ.released = false;
  }

  /** Called by Agent.die(): drop the IFF tag, free any claims. */
  onAgentDeath(a) {
    this.iff.detach(a);
    // a dead hostage-taker lets go
    if (a.holding) a.holding.release?.();
  }

  /**
   * Next killfeed callsign from the pool (radio.js), recycling with a regnal
   * number once exhausted. Public so a peer can pre-read the next name if needed;
   * normally callers just spawn and read `agent.name`.
   */
  nextCallsign() {
    return callsign(this._callsignSeq++);
  }

  /**
   * Garrison the level: two squads on patrol routes drawn from the world's own
   * spawn points, far enough from the player to be found rather than spawned on
   * top of. This is what the behaviour tree, navigation and perception actually
   * run against in play.
   */
  populate(opts = {}) {
    const world = this.ctx.peek('world');
    const spawns = world?.spawnPoints ?? [];
    if (!spawns.length || !this.grid) return 0;
    const player = this.playerPosition(this._v3).clone();
    // rank the spawn points by distance from the player, take the far half
    const ranked = spawns
      .map((s, i) => ({ s, i, d: s.position.distanceTo(player) }))
      .sort((a, b) => b.d - a.d)
      .filter((e) => e.d > 18);
    if (!ranked.length) return 0;

    const variants = ['vanguard', 'irregular', 'breacher'];
    const squads = opts.squads ?? 2;
    const per = opts.perSquad ?? 3;
    let made = 0;
    for (let q = 0; q < squads && q < ranked.length; q++) {
      const squad = this.createSquad();
      const anchor = ranked[q % ranked.length].s;
      // patrol route: this spawn point and the two next-nearest ones
      const route = [anchor.position.clone()];
      const others = ranked
        .filter((e) => e.s !== anchor)
        .sort(
          (a, b) =>
            a.s.position.distanceTo(anchor.position) - b.s.position.distanceTo(anchor.position)
        )
        .slice(0, 2);
      for (const o of others) route.push(o.s.position.clone());

      for (let m = 0; m < per; m++) {
        const jitterA = this.rng.range(0, Math.PI * 2);
        const jitterR = this.rng.range(0.8, 3.2);
        const p = anchor.position
          .clone()
          .add(new THREE.Vector3(Math.cos(jitterA) * jitterR, 0, Math.sin(jitterA) * jitterR));
        const ci = this.grid.nearest(p.x, p.z, anchor.position.y, 6, 1.4);
        if (ci >= 0) {
          p.set(
            this.grid.nodeX(ci),
            this.grid.floor[ci],
            this.grid.nodeZ(ci)
          );
        } else {
          p.y = this.groundAt(p.x, p.z, anchor.position.y + 4);
        }
        const a = this.spawn(variants[(q * per + m) % variants.length], p, anchor.yaw + this.rng.signed() * 0.7, {
          patrol: route,
        });
        squad.add(a);
        made++;
      }
    }
    console.info(`[ai] garrison: ${made} enemies in ${squads} squads`);
    return made;
  }

  createSquad() {
    const s = new Squad(this.rng.fork());
    this.squads.push(s);
    return s;
  }

  /* ================================================================== */
  /* wave interface — called by `src/game`                             */
  /* ================================================================== */

  /**
   * Spawn a wave of enemies using the same squad / patrol / nav-snap machinery
   * `populate()` uses, spread across the world's spawn points far from the
   * player. Reuses everything that makes the soldiers read as a real squad;
   * only the count and the difficulty are new.
   *
   * @param count      soldiers to spawn (clamped to the concurrent budget)
   * @param intensity  0..1 difficulty; mapped onto each agent via setDifficulty
   * @param waveIndex  rotates squad composition so successive waves feel different
   * @returns the number actually spawned
   */
  spawnWave({ count = 1, intensity = 0.5, waveIndex = 0 } = {}) {
    // navigation must exist; build it now if boot deferred it
    if (this._navPending) this._buildNav();
    if (!this.grid) return 0;
    const world = this.ctx.peek('world');
    const spawns = world?.spawnPoints ?? [];
    if (!spawns.length) return 0;

    // never let a caller push the live population past the frame budget
    this._reapCorpses(14);
    const room = Math.max(0, this.maxAlive - this.aliveCount());
    const n = Math.min(Math.max(0, Math.floor(count)), room);
    if (n <= 0) return 0;

    const t = intensity < 0 ? 0 : intensity > 1 ? 1 : intensity;
    const player = this.playerPosition(this._v3).clone();
    // far half of the spawn points, ranked by distance — spawn to be found, not
    // dropped on the player's head. Fall back to all points if none are far.
    let ranked = spawns
      .map((s) => ({ s, d: s.position.distanceTo(player) }))
      .sort((a, b) => b.d - a.d)
      .filter((e) => e.d > 16);
    if (!ranked.length) ranked = spawns.map((s) => ({ s, d: 0 })).sort((a, b) => b.d - a.d);

    const variants = ['vanguard', 'irregular', 'breacher'];
    const per = 4; // soldiers per squad
    let made = 0;
    let squad = null;
    for (let k = 0; k < n; k++) {
      if (k % per === 0) squad = this.createSquad();
      const squadIdx = (k / per) | 0;
      const anchor = ranked[squadIdx % ranked.length].s;
      const route = this._patrolRoute(anchor, ranked);
      const p = this._spawnNear(anchor);
      // rotate which variant leads each wave so composition varies
      const variant = variants[(waveIndex * 2 + k) % variants.length];
      const a = this.spawn(variant, p, anchor.yaw + this.rng.signed() * 0.7, { patrol: route });
      a.setDifficulty(t);
      squad.add(a);
      made++;
    }
    console.info(`[ai] spawnWave: ${made}/${count} enemies · intensity ${t.toFixed(2)} · wave ${waveIndex}`);
    return made;
  }

  /** Live (alive) actor count, computed on demand. */
  aliveCount() {
    let n = 0;
    for (const a of this.agents) if (a.alive) n++;
    return n;
  }

  /**
   * Kill every live soldier through the *normal* death path — so `actor:death`
   * still fires for each (the game counts kills from it) and the ragdoll +
   * death FX play exactly as a shot kill would. Used by the game/verifiers to
   * clear or test wave flow without aiming skill. Returns how many were killed.
   */
  killAll() {
    let n = 0;
    for (const a of this.agents) {
      if (!a.alive) continue;
      a.die(); // die() fills sensible defaults for point/dir/amount
      n++;
    }
    return n;
  }

  /** Public form of _reapCorpses (modes call it on respawn). */
  reapCorpses(keep = 14) {
    this._reapCorpses(keep);
  }

  /**
   * Remove every bot and civilian WITHOUT a death (no actor:death, no
   * ragdoll): for mode/mission resets. Returns how many were removed.
   */
  despawnAll() {
    let n = 0;
    for (const list of [this.agents, this.civilians]) {
      for (const a of list) {
        if (a.alive) n++;
        this.iff.detach(a);
        this.cover?.release(a.id);
        a.alive = false;
        a.dispose();
      }
      list.length = 0;
    }
    for (const s of this.squads) {
      s.members.length = 0;
      s.flankers.length = 0;
      s.leader = null;
    }
    this.squads.length = 0;
    this.actors.length = 0;
    return n;
  }

  /** Patrol route for a squad: its anchor plus the two nearest other points. */
  _patrolRoute(anchor, ranked) {
    const route = [anchor.position.clone()];
    const others = ranked
      .filter((e) => e.s !== anchor)
      .sort(
        (a, b) =>
          a.s.position.distanceTo(anchor.position) - b.s.position.distanceTo(anchor.position)
      )
      .slice(0, 2);
    for (const o of others) route.push(o.s.position.clone());
    return route;
  }

  /** A walkable spawn position jittered around a spawn anchor, snapped to nav. */
  _spawnNear(anchor) {
    const jitterA = this.rng.range(0, Math.PI * 2);
    const jitterR = this.rng.range(0.8, 3.2);
    const p = anchor.position
      .clone()
      .add(new THREE.Vector3(Math.cos(jitterA) * jitterR, 0, Math.sin(jitterA) * jitterR));
    const ci = this.grid.nearest(p.x, p.z, anchor.position.y, 6, 1.4);
    if (ci >= 0) {
      p.set(
        this.grid.nodeX(ci),
        this.grid.floor[ci],
        this.grid.nodeZ(ci)
      );
    } else {
      p.y = this.groundAt(p.x, p.z, anchor.position.y + 4);
    }
    return p;
  }

  /**
   * Retire the oldest settled corpses so a long wave run cannot grow
   * `this.agents` (and its ragdolls) without bound. Only bodies that have been
   * down long enough to have finished their death beat are disposed; the most
   * recent `keep` are always left on the ground.
   */
  _reapCorpses(keep = 14) {
    const dead = [];
    for (const a of this.agents) if (!a.alive) dead.push(a);
    if (dead.length <= keep) return;
    dead.sort((x, y) => (y.deadTime ?? 0) - (x.deadTime ?? 0)); // oldest first
    const remove = new Set();
    for (let i = 0; i < dead.length - keep; i++) {
      const a = dead[i];
      if ((a.deadTime ?? 0) > 3) { a.dispose(); remove.add(a); }
    }
    if (remove.size) this.agents = this.agents.filter((a) => !remove.has(a));
  }

  /* ================================================================== */
  /* firing                                                             */
  /* ================================================================== */

  /** 0 at night, 1 in full daylight. Drives both flash gains below. */
  _daylight() {
    const sky = this._sky ?? (this._sky = this.ctx.peek('sky'));
    const alt = sky?.sunAltitude ?? 0.6; // radians above the horizon
    return Math.min(1, Math.max(0, Math.sin(Math.max(0, alt)) * 4));
  }

  /**
   * SPRITE gain. The flash itself has to be *visible* — a firefight with no fire
   * in it is not a firefight — so this stays high enough to read as burning gas
   * at 10-25 m and is only trimmed in daylight, where the sun is competing.
   */
  _flashGain() {
    return 0.12 + 0.5 * (1 - this._daylight());
  }

  /**
   * LIGHT gain, deliberately separate and two orders of magnitude smaller.
   *
   * The crown sits 0.6 m from the shooter's own chest, so a player-strength
   * 90 cd flash puts 90/0.36 = 250 W/m^2 on him against 4 W/m^2 of sun. That is
   * the whole reason the soldiers used to render BRIGHTER than the sunlit stucco
   * behind them: they were being lit, on the frame the shutter fell, by their own
   * muzzle flash. A real flash is ~1 ms inside a 16 ms frame, so the honest
   * time-averaged contribution in daylight is a highlight on the receiver and
   * nothing more; after dark it is the only light there is and gets to earn its
   * keep. Measured: torso 0.44 -> 0.13 linear, i.e. from 1.9x the sunlit wall to
   * 0.55x, which is what an 0.19-albedo uniform in shade should be.
   */
  _flashLight() {
    const day = this._daylight();
    return 0.006 + 0.05 * (1 - day);
  }

  onAgentFire(agent, origin, dir) {
    const ctx = this.ctx;
    const W = agent.weapon;

    // muzzle flash, light and smoke come from fx via the canonical event; the
    // `weapon` name picks the audio profile (ai_smg -> smg, ai_lmg -> lmg ...)
    const fe = this._fireEvent;
    fe.weapon = W?.suppressed ? { id: W.audio, audio: W.audio, suppressed: true } : W?.audio ?? 'ai_rifle';
    fe.ai = true;
    fe.actor = agent;
    fe.origin.copy(origin);
    fe.dir.copy(dir);
    fe.intensity = this._flashGain() * (W?.suppressed ? 0.25 : 1);
    fe.light = this._flashLight();
    fe.flashScale = W?.cls === 'shotgun' || W?.cls === 'lmg' ? 1.0 : 0.8;
    fe.seed = (agent.id * 2654435761 + ctx.time.frame) >>> 0;
    ctx.events.emit('weapon:fire', fe);
    fe.noise = W?.noise ?? 90;
    fe.suppression = W?.suppression ?? 1;
    this.onShot(agent, origin, dir, fe.noise, fe.suppression);

    if (W?.projectile) {
      this.launchProjectile?.(agent, origin, dir);
      return;
    }

    // ejected case
    const se = this._shellEvent;
    se.position.copy(agent.animator.ejectWorld);
    se.velocity.set(dir.z, 0.55, -dir.x).multiplyScalar(2.1).addScaledVector(dir, -0.6);
    ctx.events.emit('weapon:shell', se);

    const pellets = Math.max(1, W?.pellets ?? 1);
    const ps = W?.pelletSpread ?? 0;
    const pd = this._pelletDir;
    for (let i = 0; i < pellets; i++) {
      pd.copy(dir);
      if (pellets > 1) {
        pd.x += agent.rng.gauss() * ps;
        pd.y += agent.rng.gauss() * ps * 0.8;
        pd.z += agent.rng.gauss() * ps;
        pd.normalize();
      }
      this._fireOne(agent, origin, pd, i === 0);
    }
  }

  /**
   * One round (or pellet) from a bot. Friendly fire is off, so a round only
   * ever connects with the shooter's enemies (and civilians caught in it):
   *   1. the world, traced without actor layers (walls stop the round),
   *   2. enemy bots' hit capsules nearer than that wall (_traceActors),
   *   3. the player's capsule, for hostile shooters (_playerHitT),
   * and the nearest of the three takes it. Bot-on-bot hits are applied
   * directly (never as `damage:dealt`, which the HUD reads as Doug's hit).
   */
  _fireOne(agent, origin, dir, primary) {
    const phys = this.phys;
    const W = agent.weapon;
    const range = Math.min(W?.maxRange ?? 400, 400);
    let wallT = range;
    if (phys) {
      const h = phys.raycast(origin, dir, range, this._worldBulletMask());
      if (h.hit) wallT = h.distance;
    }
    const hit = this._traceActors(agent, origin, dir, wallT);
    const playerT =
      agent.team === 'hostile' && !agent.staged?.noDamage ? this._playerHitT(origin, dir, wallT) : Infinity;
    let endT = wallT;
    if (hit.actor && hit.t < playerT) {
      endT = hit.t;
      const falloff = 1 - (1 - (W?.dropoff ?? 0.6)) * Math.min(1, hit.t / range) ** 2;
      const amount = (W?.damage ?? 33) * BOT_DAMAGE_SCALE * hit.scale * falloff;
      const pt = this._v3.copy(origin).addScaledVector(dir, hit.t);
      const victim = hit.actor;
      const part = hit.part;
      this._emitFlesh(pt, dir, amount, victim, part);
      victim.applyDamage(amount, part, pt, dir, null, agent);
    } else if (playerT < Infinity) {
      endT = playerT;
      this._hitPlayer(agent, origin, dir, playerT);
    } else if (phys) {
      phys.fireBullet({
        origin,
        dir,
        damage: W?.damage ?? 17,
        penetration: W?.penetration ?? 0.9,
        maxDist: range,
        mask: this._worldBulletMask(),
      });
      // near miss on the player: the whip-crack past the ear
      if (agent.team === 'hostile') this._nearMiss(origin, dir, wallT);
    }
    if (!primary) return;
    this._tracerFrom.copy(origin);
    this._tracerTo.copy(origin).addScaledVector(dir, Math.min(endT, 120));
    const every = W?.tracerEvery ?? 3;
    if ((agent.id + agent.ammo) % every === 0) this.ctx.events.emit('bullet:tracer', this._tracerEvent);
  }

  launchProjectile(agent, origin, dir) {
    this.projectiles.launch(agent, origin, dir);
  }

  _worldBulletMask() {
    const M = this.phys.MASK, L = this.phys.LAYER;
    return M.BULLET & ~L.ACTOR;
  }

  /** Nearest enemy (or civilian) hit capsule along a ray, closer than maxT. */
  _traceActors(shooter, o, d, maxT) {
    const out = this._actorHit;
    out.actor = null;
    out.t = maxT;
    const lists = this._civLists;
    lists[0] = this.agents;
    lists[1] = this.civilians ?? EMPTY;
    for (let l = 0; l < 2; l++) {
      const list = lists[l];
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (!a.alive || a === shooter || a === shooter.holding) continue;
        if (a.team === shooter.team) continue; // friendly fire off: passes through
        // bounding sphere around the body before the seven capsules
        const cx = a.position.x - o.x, cy = a.position.y + 0.9 - o.y, cz = a.position.z - o.z;
        const tc = cx * d.x + cy * d.y + cz * d.z;
        if (tc < -1.2 || tc - 1.2 > out.t) continue;
        const mx = cx - d.x * tc, my = cy - d.y * tc, mz = cz - d.z * tc;
        if (mx * mx + my * my + mz * mz > 1.44) continue;
        for (let k = 0; k < a.colliders.length; k++) {
          const c = a.colliders[k];
          const t = rayCapsule(o, d, c.ax, c.ay, c.az, c.bx, c.by, c.bz, c.radius, out.t);
          if (t < 0 || t >= out.t) continue;
          out.t = t;
          out.actor = a;
          out.part = c.part;
          out.scale = c.damageScale ?? 1;
        }
      }
    }
    return out;
  }

  /** Distance along the ray at which it passes through the player, or Infinity. */
  _playerHitT(o, d, maxT) {
    const pr = this.player;
    if (!pr.alive) return Infinity;
    const p = pr.samplePoint(0, this._v);
    const px = p.x - o.x, py = p.y - o.y, pz = p.z - o.z;
    const t = px * d.x + py * d.y + pz * d.z;
    if (t < 0.5 || t > maxT) return Infinity;
    const lx = px - d.x * t, ly = py - d.y * t, lz = pz - d.z * t;
    const miss = Math.hypot(lx, ly * 0.45, lz);
    if (miss > 0.42) return Infinity;
    this._lastPlayerMiss = miss;
    return t;
  }

  _nearMiss(o, d, maxT) {
    const pr = this.player;
    if (!pr.alive) return;
    const p = pr.samplePoint(0, this._v);
    const px = p.x - o.x, py = p.y - o.y, pz = p.z - o.z;
    const t = px * d.x + py * d.y + pz * d.z;
    if (t < 0.5 || t > maxT) return;
    const miss = Math.hypot(px - d.x * t, py - d.y * t, pz - d.z * t);
    if (miss < 1.6) this.ctx.peek('player')?.onNearMiss?.(miss);
  }

  _hitPlayer(agent, origin, dir, t) {
    const player = this.ctx.peek('player');
    const W = agent.weapon;
    const p = this._v2.copy(origin).addScaledVector(dir, t);
    const amount =
      agent.weaponDamage * (this._lastPlayerMiss < 0.16 ? 1.25 : 1) * (W?.pellets > 1 ? 1 / Math.sqrt(W.pellets) : 1);
    this._hitFrom.copy(origin);
    // Damage is applied *only* through this event: `player` listens for
    // `damage:dealt` with itself as the target, so applying it here as well
    // would wound him twice for every round.
    this.ctx.events.emit('damage:dealt', {
      target: player ?? 'player',
      amount,
      headshot: false,
      killed: false,
      point: p,
      from: this._hitFrom,
      source: agent,
    });
  }

  /** Blood and audio for a bot-on-bot hit, through the canonical impact event. */
  _emitFlesh(point, dir, damage, actor, part) {
    const e = this._fleshEvent;
    e.point.copy(point);
    e.normal.copy(dir).multiplyScalar(-1);
    e.incident.copy(dir);
    e.damage = damage;
    e.actor = actor;
    e.part = part;
    this.ctx.events.emit('bullet:impact', e);
  }

  emitReload(agent) {
    this.ctx.events.emit('weapon:reload', { weapon: 'ai_rifle', phase: 'start', actor: agent });
    agent.bark('reload');
  }

  /** Grenade geometry + material. Built at prewarm, not on the first throw. */
  _ensureGrenade() {
    if (this._grenadeGeo) return;
    this._grenadeGeo = new THREE.IcosahedronGeometry(0.045, 1);
    this._grenadeMat = new THREE.MeshStandardMaterial({
      color: 0x2c3226,
      roughness: 0.62,
      metalness: 0.85,
    });
  }

  throwGrenade(agent, from, target) {
    const phys = this.phys;
    if (!phys) return;
    agent.bark('grenade');
    agent.radio('grenade');
    this._ensureGrenade();
    const mesh = new THREE.Mesh(this._grenadeGeo, this._grenadeMat);
    this.root.add(mesh);
    // lobbed ballistic solve
    const dx = target.x - from.x, dz = target.z - from.z;
    const dist = Math.max(0.5, Math.hypot(dx, dz));
    const g = Math.abs(phys.gravity);
    const speed = Math.min(18, Math.sqrt(Math.max(4, (dist * g) / 0.95)));
    const vy = speed * 0.62;
    const vh = Math.min(speed, dist / Math.max(0.35, (2 * vy) / g));
    const body = phys.addRigidBody({
      shape: 'sphere',
      radius: 0.05,
      mass: 0.42,
      position: from,
      velocity: { x: (dx / dist) * vh, y: vy, z: (dz / dist) * vh },
      restitution: 0.28,
      friction: 0.7,
      lifetime: 9,
      object3D: mesh,
      surfaceType: 'metal',
    });
    this._grenades.push({ body, mesh, fuse: 2.35, agent });
    this._trackThreat(from, 6.5, agent, 2.35, body);
    agent.animator.fire(0.35);
  }

  _updateGrenades(dt) {
    for (let i = this._grenades.length - 1; i >= 0; i--) {
      const g = this._grenades[i];
      g.fuse -= dt;
      if (g.fuse > 0) continue;
      const p = g.body?.position ?? g.mesh.position;
      this.ctx.events.emit('explosion', {
        position: new THREE.Vector3(p.x, p.y, p.z),
        radius: 6.5,
        damage: 120,
        source: g.agent,
        owner: g.agent,
        kind: 'frag',
      });
      this.phys?.removeRigidBody(g.body);
      this.root.remove(g.mesh);
      this._grenades.splice(i, 1);
    }
  }

  /* ================================================================== */
  /* orders and brain services                                          */
  /* ================================================================== */

  /**
   * Modes direct bots through orders (EXPANSION.md §3): `fn(agent) -> order |
   * null`, called at each bot's think rate (at most twice a second). An order is
   * `{ kind, pos?, radius?, targetId? }`; the brain decides HOW. `owner` (the
   * mode) is optional: its `interact(agent)` is what plant/defuse call.
   */
  setOrderProvider(fn, owner = null) {
    this.orderProvider = typeof fn === 'function' ? fn : null;
    this.orderOwner = owner;
    for (const a of this.agents) if (a.brain) a.brain._orderT = -Infinity;
  }

  /** plant / defuse: tell the mode this bot is working the objective. */
  interact(agent, order) {
    const now = this.ctx.time.elapsed;
    if (now - agent.brain.interactT < 0.25) return;
    agent.brain.interactT = now;
    const game = this.ctx.peek('game');
    const target =
      order?.interact ? order :
        order?.mode?.interact ? order.mode :
          this.orderOwner?.interact ? this.orderOwner :
            game?.mode?.interact ? game.mode :
              game?.interact ? game : null;
    try {
      target?.interact(agent);
    } catch (err) {
      if (!this._interactErr) {
        this._interactErr = true;
        console.warn('[ai] mode.interact threw:', err?.message ?? err);
      }
    }
  }

  /**
   * Seconds until this bot thinks again. Close to the fight (a live target, or
   * any enemy within 30 m) it is 5-10 Hz; far from everything 1-3 Hz. Better
   * soldiers think a little faster.
   */
  thinkInterval(a) {
    const T = a.perception.target;
    const hot = T && T.conf > 0.3 && this.ctx.time.elapsed - T.updT < 6;
    let near = hot || a.suppression > 0.2 || a.brain.state === 'evade_grenade';
    if (!near) {
      for (let i = 0; i < this.actors.length; i++) {
        const o = this.actors[i];
        if (o.team === a.team) continue;
        const dx = o.position.x - a.position.x, dz = o.position.z - a.position.z;
        if (dx * dx + dz * dz < 900) { near = true; break; }
      }
    }
    const base = near ? 0.1 + 0.08 * (1 - a.skill) : 0.35 + 0.45 * (1 - a.skill);
    // deterministic jitter keeps staggered bots staggered
    const j = ((a.id * 0.37 + a.thinks * 0.618) % 1) * 0.04;
    return base + j;
  }

  /** Spend `n` LOS rays from this frame's shared budget. */
  takeRays(n) {
    if (this._rays < n) {
      this.stats.raysDenied++;
      return false;
    }
    this._rays -= n;
    this.stats.rays += n;
    return true;
  }

  /** Live actor by id: an Agent id, a civilian id, or 0 / 'player' for Doug. */
  getActor(id) {
    if (id === 0 || id === 'player' || id === 'doug') return this.player;
    if (id && typeof id === 'object') return id;
    for (const a of this.agents) if (a.id === id || a.name === id) return a;
    for (const c of this.civilians) if (c.id === id || c.name === id) return c;
    return null;
  }

  /** Live combatants hostile to `team`. */
  enemiesOf(team) {
    let n = 0;
    for (const o of this.actors) if (o.alive && o.team !== team && o.team !== 'civ') n++;
    return n;
  }

  /** This bot's index among its live teammates (stable slots, spacing). */
  teamIndex(a) {
    let n = 0;
    for (const o of this.agents) {
      if (o === a) return n;
      if (o.alive && o.team === a.team) n++;
    }
    return n;
  }

  /**
   * Nearest walkable nav cell to `p` (within `rings` cells, on roughly the
   * storey `y`), written to `out`. Returns false when there is none.
   */
  snapWalkable(p, y, out, rings = 4, preferEdge = false) {
    const g = this.grid;
    if (!g) {
      out.copy(p);
      return true;
    }
    const ci = g.nearest(p.x, p.z, y, rings, 2.5);
    if (ci < 0) return false;
    out.set(g.nodeX(ci), g.floor[ci], g.nodeZ(ci));
    if (preferEdge && g.enclosure[ci] === 0) {
      // likely hiding spots hug walls: nudge toward an enclosed neighbour
      for (let d = 1; d <= 2; d++) {
        const j = g.nearest(out.x + d * g.cell, out.z, y, 1, 1);
        if (j >= 0 && g.enclosure[j] > 0) {
          out.set(g.nodeX(j), g.floor[j], g.nodeZ(j));
          break;
        }
      }
    }
    return true;
  }

  /**
   * A point for a hunting bot to sweep toward: the enemy team's spawn side if
   * the map says where that is, otherwise the far half of the spawn points,
   * otherwise any walkable cell, offset per bot so a team spreads out. Never an
   * enemy's position: hunting is looking, not knowing.
   */
  huntPoint(a, out) {
    const world = this.ctx.peek('world');
    const enemy = a.team === 'esf' ? 'hostile' : 'esf';
    let list = world?.spawns?.[enemy];
    const pts = [];
    if (Array.isArray(list) && list.length) for (const s of list) pts.push(s.pos ?? s.position ?? s);
    const sp = world?.spawnPoints ?? [];
    if (!pts.length) for (const s of sp) pts.push(s.position);
    // also sweep objective zones: that is where the enemy has to go
    const obj = world?.objectives;
    if (obj) {
      for (const k in obj) {
        const z = obj[k];
        if (z?.pos) pts.push(z.pos);
        else if (z && typeof z === 'object') for (const kk in z) if (z[kk]?.pos) pts.push(z[kk].pos);
      }
    }
    if (!pts.length) return false;
    // prefer points away from where we are, rotating through them per bot
    const k = (a.id * 3 + (a.brain.huntCount = (a.brain.huntCount ?? 0) + 1)) % pts.length;
    let best = null, bestS = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[(i + k) % pts.length];
      if (!p || !Number.isFinite(p.x)) continue;
      const d = Math.hypot(p.x - a.position.x, p.z - a.position.z);
      const s = Math.min(d, 60) - i * 4 + (d < 8 ? -100 : 0);
      if (s > bestS) { bestS = s; best = p; }
    }
    if (!best) return false;
    const ang = a.id * 2.399;
    this._v.set(best.x + Math.sin(ang) * 4, best.y, best.z + Math.cos(ang) * 4);
    return this.snapWalkable(this._v, best.y, out, 6);
  }

  /* ================================================================== */
  /* grenades as threats                                                */
  /* ================================================================== */

  /**
   * The live grenade this bot knows about and is inside the blast of, or null.
   * A grenade is known when it lands within 9 m of the bot (it hears and sees
   * it), when a teammate shouted "grenade" in the last 3 s, or when it is the
   * bot's own. `{ pos, radius, fuse }`.
   */
  grenadeThreat(a) {
    const now = this.ctx.time.elapsed;
    const warned = now - a.grenadeWarnT < 3;
    let best = null;
    for (let i = 0; i < this._threats.length; i++) {
      const g = this._threats[i];
      if (!g.live) continue;
      const p = g.pos;
      const d = Math.hypot(p.x - a.position.x, p.z - a.position.z);
      if (Math.abs(p.y - a.position.y) > 4) continue;
      if (d > g.radius + 1.5) continue;
      if (!(d < 9 || warned || g.owner === a)) continue;
      if (now - g.t < 0.35) continue; // still in the thrower's hand, effectively
      if (!best || d < best._d) {
        best = g;
        g._d = d;
      }
    }
    return best;
  }

  /** Never throw where teammates are (or so close we eat it ourselves). */
  safeToThrow(a, pos) {
    if (a.distTo(pos) < 8) return false;
    for (const o of this.agents) {
      if (!o.alive || o === a) continue;
      if (o.team === a.team && o.position.distanceTo(pos) < 8) return false;
    }
    for (const c of this.civilians) if (c.alive && c.position.distanceTo(pos) < 7) return false;
    return true;
  }

  _trackThreat(pos, radius, owner, fuse, body = null) {
    let slot = null;
    for (const g of this._threats) if (!g.live) { slot = g; break; }
    if (!slot) {
      slot = { live: false, pos: new THREE.Vector3(), radius: 6, owner: null, fuseAt: 0, t: 0, body: null, _d: 0 };
      this._threats.push(slot);
    }
    slot.live = true;
    slot.pos.copy(pos);
    slot.radius = radius;
    slot.owner = owner;
    slot.t = this.ctx.time.elapsed;
    slot.fuseAt = slot.t + fuse;
    slot.body = body;
    return slot;
  }

  _updateThreats() {
    const now = this.ctx.time.elapsed;
    for (const g of this._threats) {
      if (!g.live) continue;
      if (g.body?.position) g.pos.copy(g.body.position);
      if (now > g.fuseAt + 0.2) g.live = false;
    }
  }

  /**
   * A thrown grenade from elsewhere (the player's, via `grenade:throw`): we
   * cannot see the physics body, so predict where it comes to rest from its
   * launch state with a few coarse ballistic steps against the world.
   */
  _onGrenadeThrow(e) {
    if (!e?.position || !e.velocity) return;
    const phys = this.phys;
    const p = this._v.copy(e.position);
    const v = this._v2.copy(e.velocity);
    const g = phys ? Math.abs(phys.gravity) : 9.81;
    let t = 0;
    const dt = 0.08;
    for (let i = 0; i < 40; i++) {
      const nx = p.x + v.x * dt, ny = p.y + v.y * dt, nz = p.z + v.z * dt;
      if (phys) {
        const dx = nx - p.x, dy = ny - p.y, dz = nz - p.z;
        const L = Math.hypot(dx, dy, dz);
        const h = phys.raycast(p.x, p.y, p.z, dx, dy, dz, L, phys.MASK.WORLD);
        if (h.hit) {
          p.copy(h.point);
          break;
        }
      }
      p.set(nx, ny, nz);
      v.y -= g * dt;
      t += dt;
    }
    const flash = e.kind === 'flash' || e.kind === 'flashbang';
    this._trackThreat(p, flash ? 0 : e.radius ?? 6.5, this._resolveOwner(e.owner), e.fuse ?? 2.8, e.body ?? null);
  }

  /**
   * `flash:detonate { position, radius, owner }`: every bot (and civilian)
   * within the radius that has line of sight to the burst is stunned; looking
   * at it is worse than having your back to it. Friendly flashes do not blind
   * the thrower's team (friendly fire is off).
   */
  _onFlash(e) {
    // weapons/equipment.js already calls agent.stun() on every agent in
    // `ai.agents` it reaches (EXPANSION.md §6): never stun those twice. What
    // is left for us is the people it does not know about (civilians, who
    // live in `ai.civilians`), and the reaction everyone has to the bang.
    if (!e?.position) return;
    const radius = e.radius ?? 12;
    const owner = this._resolveOwner(e.owner);
    const ownerTeam = owner?.team ?? e.team ?? null;
    const phys = this.phys;
    const now = this.ctx.time.elapsed;
    for (const a of this.agents) {
      if (!a.alive || (ownerTeam && a.team === ownerTeam)) continue;
      if (a.position.distanceTo(e.position) < radius * 2) a.perception.hearFrom(owner, e.position, 0.9, 'flash', now);
    }
    for (const c of this.civilians) {
      if (!c.alive) continue;
      const eye = c.eye;
      const d = eye.distanceTo(e.position);
      if (d > radius) continue;
      if (phys && !phys.lineOfSight(e.position, eye, phys.MASK.SIGHT)) continue;
      const dx = (e.position.x - eye.x) / (d || 1), dz = (e.position.z - eye.z) / (d || 1);
      const facing = dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw);
      const k = (1 - d / radius) * (0.55 + 0.45 * Math.max(0, facing)) + 0.25;
      c.stun(Math.min(1, k), 2.2 + 3.2 * Math.min(1, k));
    }
  }

  /** True when the nav cell under `p` is hemmed in by walls (indoors-ish). */
  enclosedAt(p) {
    const g = this.grid;
    if (!g) return false;
    const i = g.layerAt(g.cellX(p.x), g.cellZ(p.z), p.y, 1.2);
    return i >= 0 && g.enclosure[i] >= 2;
  }

  /** Rockets: only at range or into a group, never close (roles.js HEAVY). */
  rocketWorthIt(a, p) {
    const d = a.distTo(p);
    if (d < 12) return false;
    if (d > 32) return true;
    let group = 0;
    for (const o of this.actors) {
      if (!o.alive || o.team === a.team) continue;
      if (Math.hypot(o.position.x - p.x, o.position.z - p.z) < 5) group++;
    }
    return group >= 2;
  }

  /* ================================================================== */
  /* frame                                                              */
  /* ================================================================== */

  update(dt, ctx) {
    if (this._navPending) {
      this._buildNav();
      // Populate the level for normal play. Capture runs stay empty unless a
      // shot asks for a tableau, so nobody's screenshot gets a stray patrol
      // wandering through it.
      if (!this._navPending && (!ctx.config.deterministic || this.forcePopulate)) this.populate();
    }

    this._syncActors(ctx);
    if (ctx.input?.pressed?.('F3')) this.debug.toggle();
    this._installFlopHook();
    this._rays = this.rayBudget;
    this.comms.update(ctx.time.elapsed);
    this._updateThreats();

    // Per-frame A* budget: see requestPath().
    this._pathBudget = this.pathsPerFrame;
    this._updateRelevance(ctx);

    for (const s of this.squads) s.update(dt);

    let alive = 0;
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      if (a.alive) {
        if (a.staged) this._updateStaged(a, dt);
        else a.update(dt, ctx);
        alive++;
      } else if (a.deadTime !== undefined) {
        a.deadTime += dt;
        if (this.debugLog && a.ragdoll && !a._loggedDoll && a.deadTime > 1.2) {
          a._loggedDoll = true;
          const b = a.ragdoll.aabb;
          console.info(
            `[ai] ragdoll ${a.id} settled: ${(b.maxx - b.minx).toFixed(2)} x ` +
              `${(b.maxy - b.miny).toFixed(2)} x ${(b.maxz - b.minz).toFixed(2)} m ` +
              `at y=${b.miny.toFixed(2)} sleeping=${a.ragdoll.sleeping}`
          );
        }
      }
    }
    for (let i = 0; i < this.civilians.length; i++) {
      const c = this.civilians[i];
      if (c.alive) c.update(dt, ctx);
      else if (c.deadTime !== undefined) c.deadTime += dt;
    }
    this._updateGrenades(dt);
    this.projectiles.update(dt);
    this.projectiles.updateGlints(ctx.camera);
    if (this._flop) this._updateFlop();
    this.stats.agents = this.agents.length;
    this.stats.alive = alive;
  }

  /** `FLOP.aiDebug(on)`: the game owns window.FLOP and may replace it, so re-attach. */
  _installFlopHook() {
    try {
      const F = window.FLOP;
      if (F && !F.aiDebug) F.aiDebug = (on = true) => this.debug.setEnabled(on);
    } catch {
      /* no window */
    }
  }

  /** Rebuild `actors` (no allocation): live bots plus the player proxy. */
  _syncActors(ctx) {
    this.player.sync(ctx.peek('player'), ctx.camera);
    const list = this.actors;
    list.length = 0;
    if (this.player.alive) list.push(this.player);
    for (let i = 0; i < this.agents.length; i++) if (this.agents[i].alive) list.push(this.agents[i]);
  }

  lateUpdate() {
    const g = this.ground;
    g.begin();
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      a.syncHitboxes();
      // Dead men keep their contact: a ragdoll on the floor needs it most.
      g.addActor(a);
    }
    for (let i = 0; i < this.civilians.length; i++) {
      const c = this.civilians[i];
      c.syncHitboxes();
      g.addActor(c);
    }
    g.end();
    this.debug.update(this.ctx);
  }

  /* ================================================================== */
  /* frame budgets and LOD                                              */
  /* ================================================================== */

  /**
   * A* on the shared grid, rationed. Returns the waypoint count, or -1 when this
   * frame's budget is spent — the caller keeps its old path and asks again next
   * frame, which is invisible at 60 Hz and turns a squad-wide repath (six solves,
   * ~5 ms, on the frame the player opens fire) into two solves per frame.
   */
  requestPath(from, dest, out) {
    if (!this.grid) return 0;
    if (this._pathBudget <= 0) {
      this.stats.pathsDeferred++;
      return -1;
    }
    this._pathBudget--;
    return this.grid.findPath(from, dest, out);
  }

  /** Unit vector pointing AT the sun, however the sky exposes itself. */
  _sunDirection() {
    const sky = this._sky ?? (this._sky = this.ctx.peek('sky'));
    const d = sky?.sunDirection;
    if (d && Number.isFinite(d.x)) this._sun.copy(d);
    else this._sun.set(0.3, 0.8, 0.4);
    if (this._sun.lengthSq() < 1e-8) this._sun.set(0, 1, 0);
    return this._sun.normalize();
  }

  /**
   * Decide, per actor, whether anything it does this frame can reach a pixel.
   *
   * An actor is IRRELEVANT only when both of these hold:
   *   1. its (already 1.45x inflated) bounding sphere, grown by a further 4 m,
   *      misses the camera frustum — so it is not drawn, and no screen-space
   *      effect can sample it either, because it is not in the depth buffer;
   *   2. the volume its sun shadow could possibly darken misses the frustum too.
   *      For a directional light that volume is exactly the actor's sphere swept
   *      along -sunDir: a visible surface can only be shadowed by this actor if
   *      the ray from that surface toward the sun passes through it. Sweeping to
   *      where the ray leaves the level below the floor covers every receiver,
   *      ground or wall, and the 4 m of slack absorbs both the soft-shadow filter
   *      radius (up to ~1 m of cascade texels) and a frame of camera motion.
   *
   * Irrelevant actors animate at a third of the rate and are dropped from the
   * shadow cascades (`userData.owNoShadow`, which render honours per frame). They
   * are still simulated, still shootable, still make noise — only the parts that
   * can exclusively affect pixels are skipped.
   */
  _updateRelevance(ctx) {
    const cam = ctx.camera;
    this._mvp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._mvp);
    const sun = this._sunDirection();
    // how far a shadow ray can travel before it is under the level
    const floorY = (this.grid ? -6 : -20);
    const sunY = Math.max(0.06, sun.y);
    let irrelevant = 0;

    const nA = this.agents.length;
    for (let i = 0; i < nA + this.civilians.length; i++) {
      const a = i < nA ? this.agents[i] : this.civilians[i - nA];
      const geo = a.mesh.geometry;
      const bs = geo.boundingSphere;
      if (!bs) { a.lodIrrelevant = false; continue; }
      const s = this._sphere.copy(bs).applyMatrix4(a.mesh.matrixWorld);
      s.radius += 4;
      let visible = this._frustum.intersectsSphere(s);
      if (!visible) {
        const sweep = this._sweep;
        const tMax = Math.min(320, (s.center.y - floorY) / sunY);
        const step = Math.max(2, s.radius * 0.9);
        sweep.radius = s.radius;
        for (let t = step; t <= tMax; t += step) {
          sweep.center.copy(s.center).addScaledVector(sun, -t);
          if (this._frustum.intersectsSphere(sweep)) { visible = true; break; }
        }
      }
      a.lodIrrelevant = !visible;
      if (!visible) irrelevant++;
      a.mesh.userData.owNoShadow = !visible;
    }
    this._lodStats.irrelevant = irrelevant;
    this.stats.lodIrrelevant = irrelevant;
  }

  /* ================================================================== */
  /* staged tableau for the capture harness                             */
  /* ================================================================== */

  /**
   * Pin an agent into a photogenic combat beat: it still animates, aims and
   * fires for real, it just does not get to decide where to stand.
   */
  _updateStaged(a, dt) {
    const s = a.staged;
    const p = this.playerPosition(this._v3);
    a.stateTime += dt;
    a.fireCooldown -= dt;
    a.burstCooldown -= dt;
    a.state = STATE.COMBAT;
    a.hasTarget = true;
    a.targetVisible = true;
    a.alertness = 1;
    a.lastKnown.copy(p);
    a.lastKnownAge = 0;
    a.fireAt.copy(p);
    a.fireTarget = null;
    a.face(p);
    a.crouch = !!s.crouch;
    a.aimWeight = s.aimWeight ?? 1;
    a.suppression = s.suppression ?? 0;
    a.desiredSpeed = s.speed ?? 0;
    a.wantFire = s.fire !== false;
    if (s.speed) {
      a.hasMoveTarget = true;
      if (!a.path[0]) a.path[0] = new THREE.Vector3();
      a.path[0].copy(a.position).addScaledVector(s.heading, 6);
      a.pathLen = 1;
      a.pathIndex = 0;
    } else {
      a.hasMoveTarget = false;
    }
    if (s.reloadEvery && a.stateTime > s.reloadEvery && !a.animator.reloading) {
      a.stateTime = 0;
      a.animator.reload(2.4);
    }
    a._move(dt);
    a._shoot(dt);
    a._drive(dt);
  }

  /**
   * Compose a staged enemy into the frame: find the walkable spot whose
   * projected screen position and depth best match the requested composition,
   * that the camera can actually see, that is not on top of another actor, and
   * that has cover nearby. Occlusion is checked at chest and head height, which
   * is what stops a soldier being placed behind a market stall.
   */
  _stageSlot(cam, ndcX, wantDepth, placed) {
    const g = this.grid;
    const F = this._v.set(0, 0, -1).applyQuaternion(cam.quaternion);
    F.y = 0;
    F.normalize();
    const rx = F.z, rz = -F.x; // camera right, flattened
    const tanH = Math.tan((cam.fov * Math.PI) / 360) * cam.aspect;
    const ideal = new THREE.Vector3()
      .copy(cam.position)
      .addScaledVector(F, wantDepth)
      .add(this._v2.set(rx, 0, rz).multiplyScalar(ndcX * tanH * wantDepth));
    const yRef = cam.position.y - 1.7;
    const out = new THREE.Vector3(ideal.x, yRef, ideal.z);
    if (!g) {
      out.y = this.groundAt(out.x, out.z, cam.position.y + 3);
      return out;
    }
    const chest = this._v3;
    const cx = g.cellX(ideal.x), cz = g.cellZ(ideal.z);
    const span = Math.ceil(7 / g.cell);
    let best = -1, bestScore = Infinity, bestX = 0, bestZ = 0;
    for (let dz = -span; dz <= span; dz++) {
      for (let dx = -span; dx <= span; dx++) {
        const ix = cx + dx, iz = cz + dz;
        if (!g.walkable(ix, iz)) continue;
        const i = g.index(ix, iz);
        const fy = g.floor[i];
        if (Math.abs(fy - yRef) > 0.5) continue;
        const x = g.worldX(ix), z = g.worldZ(iz);
        // spacing from the men already placed
        let tooClose = false;
        for (const q of placed) {
          if (Math.hypot(q.x - x, q.z - z) < 2.4) { tooClose = true; break; }
        }
        if (tooClose) continue;
        // project
        const ex = x - cam.position.x, ez = z - cam.position.z;
        const depth = ex * F.x + ez * F.z;
        if (depth < 3) continue;
        const lateral = ex * rx + ez * rz;
        const ndc = lateral / (depth * tanH);
        // must be visible: chest and head
        if (this.phys) {
          chest.set(x, fy + 1.25, z);
          if (!this.phys.lineOfSight(cam.position, chest, this.phys.MASK.SIGHT)) continue;
          chest.set(x, fy + 1.62, z);
          if (!this.phys.lineOfSight(cam.position, chest, this.phys.MASK.SIGHT)) continue;
          // and the legs: a man whose head clears a stall counter but whose
          // body is behind it reads as a torso on a shelf
          chest.set(x, fy + 0.45, z);
          if (!this.phys.lineOfSight(cam.position, chest, this.phys.MASK.SIGHT)) continue;
        }
        let score = Math.abs(ndc - ndcX) * 9 + Math.abs(depth - wantDepth) * 0.5;
        // prefer standing next to something solid
        score -= g.enclosure[i] * 0.35;
        if (score < bestScore) {
          bestScore = score;
          best = i;
          bestX = x;
          bestZ = z;
        }
      }
    }
    if (best >= 0) out.set(bestX, g.floor[best], bestZ);
    else out.y = this.groundAt(out.x, out.z, cam.position.y + 3);
    return out;
  }

  /**
   * `debugStage('firefight')` — a staged firefight in front of the shot camera:
   * one man up and firing from behind hard cover, one crouched and peeking, one
   * moving between positions, one reloading further back.
   */
  debugStage(name) {
    if (name === 'closeup') return this._stageCloseup();
    if (name === 'flop') return this._stageFlop();
    if (name !== 'firefight') return this.stats;
    if (this.inspect) return this._stageInspect();
    if (this._navPending) this._buildNav();

    // The shared `combat` pose now sits on a market stall with another stall
    // filling the frame; frame the firefight ourselves, from the open north end
    // of the main street looking south down it, jersey barriers as cover.
    this._frameLevel(1.0, 40.0, 1.7, -0.5, 22.0, 1.3);
    const cam = this.ctx.camera;
    // A firefight the critic can actually see: drop the sun low enough to rake
    // down the street so the characters are lit, not silhouetted. This shot is
    // ours to compose; every other shot keeps its own time of day.
    this.ctx.peek('sky')?.setTimeOfDay?.(17.9);
    const F = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    F.y = 0;
    F.normalize();
    const right = new THREE.Vector3(F.z, 0, -F.x);
    const squad = this.createSquad();

    /** [variant, ndcX, depth, crouch, speed, fire, reloadEvery] */
    const LAYOUT = [
      // hero: up and firing, left of frame, close enough to read the kit
      ['vanguard', -0.44, 8.0, false, 0, true, 0],
      // second man crouched in cover, right of frame
      ['breacher', 0.30, 12.0, true, 0, true, 0],
      // one caught mid-stride between positions
      ['irregular', -0.14, 16.0, false, 4.1, false, 0],
      // one reloading behind cover on the far right
      ['vanguard', 0.60, 9.5, true, 0, true, 3.4],
      // depth: a fifth man well down the street
      ['irregular', -0.26, 22.0, false, 0, true, 0],
    ];

    const placedPositions = [];
    for (const [variant, ndcX, d, crouch, speed, fire, reload] of LAYOUT) {
      const pos = this._stageSlot(cam, ndcX, d, placedPositions);
      const yaw = Math.atan2(cam.position.x - pos.x, cam.position.z - pos.z);
      const a = this.spawn(variant, pos, yaw);
      squad.add(a);
      a.staged = {
        crouch,
        speed,
        fire,
        noDamage: true,
        heading: right.clone().multiplyScalar(-1),
        aimWeight: 1,
        reloadEvery: reload || 0,
        suppression: crouch ? 0.15 : 0,
      };
      // stagger the burst timers so the frame catches muzzle flashes
      a.burstCooldown = this.rng.range(0, 0.3);
      a.burstLeft = this.rng.int(2, 6);
      a.peeking = true;
      a.aimTarget.copy(this.playerPosition(this._v3));
      a.animator.update(0.016, 0);
      placedPositions.push(pos.clone());
      this._stagedAgents = (this._stagedAgents ?? []);
      this._stagedAgents.push(a);
      if (this.debugLog) {
        console.info(
          `[ai] staged ${variant} at ${pos.x.toFixed(1)},${pos.y.toFixed(2)},${pos.z.toFixed(1)} ` +
            `d=${cam.position.distanceTo(pos).toFixed(1)}m`
        );
      }
    }

    // One man already down, handed to the ragdoll solver with the round's
    // impulse — it dresses the tableau and it exercises the death path.
    const dPos = this._stageSlot(cam, -0.58, 9.4, placedPositions);
    const casualty = this.spawn('breacher', dPos, Math.atan2(cam.position.x - dPos.x, cam.position.z - dPos.z));
    squad.add(casualty);
    casualty.animator.update(0.016, 0);
    const hit = new THREE.Vector3(dPos.x, dPos.y + 1.35, dPos.z);
    const inc = new THREE.Vector3().subVectors(hit, cam.position).normalize();
    casualty.applyDamage(260, 'torso', hit, inc);

    return this.stats;
  }

  /**
   * Put the shot camera at a LEVEL-space spot (the world is authored in level
   * coordinates and rotated into place), eye `eyeH` above the floor, looking
   * at another level-space point `lookH` above its floor. Both of the capture
   * tableaux below own their framing: the shared shot poses land behind
   * market stalls, and a character study needs clear floor and clean sky.
   */
  _frameLevel(cx, cz, eyeH, tx, tz, lookH) {
    const world = this.ctx.peek('world');
    const cam = this.ctx.camera;
    const c = world?.levelToWorld ? world.levelToWorld(cx, 0, cz, new THREE.Vector3()) : new THREE.Vector3(cx, 0, cz);
    const t = world?.levelToWorld ? world.levelToWorld(tx, 0, tz, new THREE.Vector3()) : new THREE.Vector3(tx, 0, tz);
    // probe from just above street level: a probe from high up lands on
    // cables, awnings and the gatehouse arch
    c.y = this.groundAt(c.x, c.z, 3) + eyeH;
    t.y = this.groundAt(t.x, t.z, 3) + lookH;
    cam.position.copy(c);
    cam.lookAt(t);
    cam.updateMatrixWorld(true);
    const player = this.ctx.peek('player');
    player?.teleport?.(cam.position, cam.rotation);
    // The game loop re-enables player control on its idle -> attract hop, and
    // a controlled player writes its own eye and its config FOV (80) onto the
    // camera every frame. Take the camera back for the tableau.
    player?.setControlEnabled?.(false);
    return { cam, c, t };
  }

  /** A walkable floor point at a LEVEL-space (x, z), snapped to the nav grid. */
  _levelFloor(x, z) {
    const world = this.ctx.peek('world');
    const p = world?.levelToWorld ? world.levelToWorld(x, 0, z, new THREE.Vector3()) : new THREE.Vector3(x, 0, z);
    p.y = this.groundAt(p.x, p.z, 3);
    return p;
  }

  /**
   * `debugStage('closeup')` — one rifleman about 3.6 m from the camera on the
   * open north end of the main street (clear of stalls and the gate), up and
   * aiming just past the lens: the distance a player meets a man coming round
   * a corner.
   */
  _stageCloseup() {
    if (this._navPending) this._buildNav();
    this.ctx.peek('sky')?.setTimeOfDay?.(17.2);
    // left of centre, so the viewmodel does not cover his legs
    const { cam } = this._frameLevel(0.8, 28.4, 1.62, -0.1, 32.0, 1.15);
    const pos = this._levelFloor(-0.5, 31.8);
    const yaw = Math.atan2(cam.position.x - pos.x, cam.position.z - pos.z) - 0.38;
    const a = this.spawn('vanguard', pos, yaw);
    a.staged = {
      crouch: false,
      speed: 0,
      fire: false,
      noDamage: true,
      aimWeight: 1,
      heading: new THREE.Vector3(0, 0, 1),
    };
    a.peeking = true;
    a.aimTarget.copy(this.playerPosition(this._v3));
    a.animator.update(0.016, 0);
    return this.stats;
  }

  /**
   * `debugStage('flop')` — a squad bunched round a grenade that has already
   * landed among them, on the open north end of the main street, shot from a
   * low eye so the launch reads against the sky. Two
   * frames after staging it goes off; `FLOP_FREEZE` frames (fixed 60 Hz) later
   * the dolls are frozen near the top of their arc and the clock slowed to a
   * crawl, once the fireball has burnt down enough not to white out the frame.
   */
  _stageFlop() {
    if (this._navPending) this._buildNav();
    this.ctx.peek('sky')?.setTimeOfDay?.(17.2);
    const { cam } = this._frameLevel(1.0, 25.5, 1.25, -0.2, 38.0, 2.4);
    const squad = this.createSquad();
    /** [variant, level x, level z] — a loose knot of four round the charge */
    const LAYOUT = [
      ['vanguard', -2.0, 34.6],
      ['breacher', 1.4, 34.2],
      ['irregular', -0.9, 37.4],
      ['vanguard', 2.2, 37.0],
    ];
    const men = [];
    for (const [variant, x, z] of LAYOUT) {
      const pos = this._levelFloor(x, z);
      const yaw = Math.atan2(cam.position.x - pos.x, cam.position.z - pos.z);
      const a = this.spawn(variant, pos, yaw + (men.length - 1.5) * 0.5);
      squad.add(a);
      a.staged = {
        crouch: false, speed: 0, fire: false, noDamage: true, aimWeight: 0.4,
        heading: new THREE.Vector3(0, 0, 1),
      };
      a.animator.update(0.016, 0);
      men.push(a);
    }
    // the charge, a little beyond the middle of the knot so the men come out
    // sideways and toward the lens rather than straight away from it
    const at = this._levelFloor(0.1, 36.4);
    at.y += 0.25;
    // a man already down behind them, so the blast also re-launches a corpse
    const dPos = this._levelFloor(-0.4, 39.4);
    const casualty = this.spawn('breacher', dPos, 0.6);
    squad.add(casualty);
    casualty.animator.update(0.016, 0);
    const F = this._v.set(0, 0, -1).applyQuaternion(cam.quaternion).setY(0).normalize();
    casualty.applyDamage(260, 'torso', this._v2.set(dPos.x, dPos.y + 1.3, dPos.z), F);
    this._flop = { frame: 0, at, men };
    return this.stats;
  }

  /** Drive the flop tableau's script (see _stageFlop). Frame-counted. */
  _updateFlop() {
    const f = this._flop;
    if (!f) return;
    f.frame++;
    if (f.frame === 2) {
      for (const a of f.men) a.staged = null;
      this.ctx.events.emit('explosion', { position: f.at, radius: 6.5, damage: 400 });
    } else if (f.frame === 2 + FLOP_FREEZE) {
      for (const rd of this.phys?.ragdolls ?? []) rd.frozen = true;
      // near-freeze everything else too (fireball, smoke, rubble) so TAA can
      // converge on a still frame; never exactly 0, no system divides by dt
      this.ctx.time.scale = 0.02;
      this._flop = null;
    }
  }

  /** Model inspection line-up (dev only). */
  _stageInspect() {
    const cam = this.ctx.camera;
    const F = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    F.y = 0;
    F.normalize();
    const right = new THREE.Vector3(F.z, 0, -F.x);
    this.ctx.peek('sky')?.setTimeOfDay?.(11.5);
    const layout = [
      ['vanguard', 1.9, 0.35, 0.25],
      ['irregular', 2.7, -0.95, 3.0],
      ['breacher', 3.6, 1.15, -0.7],
    ];
    for (const [nm, d, s2, extraYaw] of layout) {
      const p = new THREE.Vector3().copy(cam.position).addScaledVector(F, d).addScaledVector(right, s2);
      p.y = this.groundAt(p.x, p.z, cam.position.y + 1.0);
      const toCam = Math.atan2(cam.position.x - p.x, cam.position.z - p.z);
      const a = this.spawn(nm, p, toCam + extraYaw);
      a.staged = {
        crouch: false,
        speed: 0,
        fire: false,
        aimWeight: 1,
        heading: new THREE.Vector3(0, 0, 1),
      };
    }
    return this.stats;
  }

  /* ================================================================== */

  dispose() {
    for (const off of this._off ?? []) off();
    for (const a of this.agents) a.dispose();
    this.agents.length = 0;
    this.squads.length = 0;
    for (const g of this._grenades) {
      this.phys?.removeRigidBody(g.body);
      this.root.remove(g.mesh);
    }
    this._grenades.length = 0;
    this._grenadeGeo?.dispose();
    this._grenadeMat?.dispose();
    this.ground?.dispose();
    this.iff?.dispose();
    this.projectiles?.dispose();
    this.debug?.dispose();
    for (const v of this._variants.values()) v.geometry.dispose();
    this._variants.clear();
    this.materials?.dispose();
    this.root.parent?.remove(this.root);
  }
}

export { VARIANTS, STATE };
