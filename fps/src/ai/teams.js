/**
 * AI — teams, and the player as an actor.
 *
 * Team ids are the EXPANSION.md §2 contract: `'esf'` (Doug's unit), `'hostile'`
 * and `'civ'` (non-combatants). Nobody targets their own team and nobody
 * targets civilians; friendly fire is off for bots and for the player.
 *
 * `PlayerProxy` is the player seen through the same interface as an Agent, so
 * targeting, perception and kill accounting never special-case him. It is
 * synced from the player system once per frame and is the ONLY place AI reads
 * the player's live transform; perception decides what a bot is allowed to
 * know about it (see perception.js).
 */

import * as THREE from 'three';

export const TEAM = Object.freeze({ ESF: 'esf', HOSTILE: 'hostile', CIV: 'civ' });

/**
 * TEAM RELATION. `'teams'` (default): ESF versus hostiles, civilians neutral.
 * `'ffa'` (FREE FOR ALL, docs/EXPANSION.md §10.6): every combatant is the
 * enemy of every other combatant, including his own "team" (FFA bots all spawn
 * on 'hostile' so their hitboxes and their fire at the player use the hostile
 * paths). Civilians stay neutral either way. The game sets it per mode through
 * `ai.setRelation()` and resets it on teardown.
 */
const REL = { mode: 'teams' };

export function setRelation(mode) {
  REL.mode = mode === 'ffa' ? 'ffa' : 'teams';
  return REL.mode;
}

export function relation() {
  return REL.mode;
}

/** True when actors on teams `a` and `b` fight each other. */
export function isEnemyTeam(a, b) {
  if (REL.mode === 'ffa') return a !== 'civ' && b !== 'civ' && !!a && !!b;
  return (a === 'esf' && b === 'hostile') || (a === 'hostile' && b === 'esf');
}

/** Actor-level: `x` and `y` fight each other (never yourself). */
export function isEnemy(x, y) {
  return !!x && !!y && x !== y && isEnemyTeam(x.team, y.team);
}

/**
 * Actor-level: `x` and `y` are on the same side (the friendly-fire rule, shared
 * callouts, spacing). Always false in FFA. Civilians are nobody's allies.
 */
export function isAlly(x, y) {
  return !!x && !!y && x !== y && REL.mode !== 'ffa' && x.team === y.team && x.team !== 'civ';
}

/** Normalise legacy / loose team ids (the old Agent default was the number 1). */
export function normTeam(t) {
  if (t === 'esf' || t === 'ESF' || t === 'friendly' || t === 'ally') return 'esf';
  if (t === 'civ' || t === 'civilian') return 'civ';
  return 'hostile';
}

/**
 * Physics layer for ESF bot hitboxes. Bit 16 is outside every mask physics
 * defines (MASK.BULLET, SIGHT, WORLD, ALL = 0xffff), so the player's rounds,
 * physics sight lines and every other system's queries pass straight through
 * friendlies: friendly fire is off by construction, and a friendly never draws
 * the player's hitmarker. Hostile bots trace it explicitly (see _traceActors).
 */
export const LAYER_ESF = 1 << 16;

export class PlayerProxy {
  constructor() {
    this.isPlayer = true;
    this.isProxy = true;
    this.id = 0;
    this.team = 'esf';
    this.role = 'player';
    this.name = 'DOUG';
    this.variantDisplay = 'ESF';
    this.alive = true;
    this.friendly = true;
    /** feet */
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.eye = new THREE.Vector3();
    this.yaw = 0;
    this.crouch = false;
    this.prone = false;
    this.height = 1.78;
    this.speed = 0;
    this.radius = 0.35;
    this.present = false;
    this.system = null;
  }

  /** Copy the player's transform. Called once per frame by AiSystem.update. */
  sync(player, camera) {
    this.system = player ?? null;
    const src = player?.position ?? null;
    if (src && Number.isFinite(src.x)) {
      this.position.copy(src);
      this.present = true;
    } else if (camera) {
      this.position.setFromMatrixPosition(camera.matrixWorld);
      this.position.y -= 1.6;
      this.present = !!player;
    }
    const v = player?.velocity;
    if (v && Number.isFinite(v.x)) this.velocity.copy(v);
    else this.velocity.set(0, 0, 0);
    const stance = player?.stance ?? 'stand';
    this.crouch = stance === 'crouch';
    this.prone = stance === 'prone';
    this.height = this.prone ? 0.55 : this.crouch ? 1.2 : 1.78;
    const e = player?.eyePosition;
    if (e && Number.isFinite(e.x)) this.eye.copy(e);
    else this.eye.set(this.position.x, this.position.y + this.height - 0.1, this.position.z);
    this.yaw = player?.yaw ?? 0;
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    const dead = player?.dead === true || player?.health?.dead === true;
    this.alive = this.present && !dead;
  }

  /**
   * Perception sample point `i` (0 chest, 1 head, 2 pelvis) in world space.
   * Crouch and prone lower all three, so a crouched player behind a crate
   * really does present less of himself.
   */
  samplePoint(i, out) {
    const h = this.height;
    const p = this.position;
    if (i === 1) return out.set(p.x, p.y + h * 0.92, p.z);
    if (i === 2) return out.set(p.x, p.y + h * 0.5, p.z);
    return out.set(p.x, p.y + h * 0.74, p.z);
  }
}
