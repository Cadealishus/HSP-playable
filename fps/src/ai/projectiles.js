/**
 * AI — the heavy's rocket, and the marksman's scope glint.
 *
 * ROCKETS: if the arsenal exposes a projectile spawner
 * (`weapons.spawnProjectile(opts)` or `weapons.fireProjectile(opts)`) the AI
 * uses it, so an AI rocket is the player's rocket. Otherwise this module flies
 * its own: a pooled mesh travelling in a straight line, swept each frame
 * against the world and against actor hit capsules, exploding through the
 * canonical `explosion { position, radius, damage, owner, kind: 'rocket' }`
 * event (so fx, audio, physics, player and ai all react as they do to a frag).
 * It is SAFE: it will not arm inside `arm` metres of the launcher (a rocket
 * that hits a wall at the muzzle is a dud, not a suicide), and friendly fire is
 * off for its blast like every other (see AiSystem explosion handler).
 *
 * GLINT: a marksman aiming at the player flashes a small additive sprite off
 * his objective lens. It is only visible within a narrow cone around his line
 * of aim, so it is a warning that he is looking at YOU.
 */

import * as THREE from 'three';

const POOL = 6;

function glintTexture(size = 64) {
  const buf = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = ((x + 0.5) / size) * 2 - 1, v = ((y + 0.5) / size) * 2 - 1;
      const r = Math.hypot(u, v);
      // soft core plus a four-point star
      const core = Math.exp(-r * r * 18);
      const star = Math.exp(-Math.abs(u) * 40) * Math.exp(-Math.abs(v) * 3) + Math.exp(-Math.abs(v) * 40) * Math.exp(-Math.abs(u) * 3);
      const a = Math.min(1, core + star * 0.6);
      const i = (y * size + x) * 4;
      buf[i] = 255; buf[i + 1] = 250; buf[i + 2] = 235;
      buf[i + 3] = Math.round(255 * a);
    }
  }
  const t = new THREE.DataTexture(buf, size, size, THREE.RGBAFormat);
  t.needsUpdate = true;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

export class Projectiles {
  constructor(ai) {
    this.ai = ai;
    this.ctx = ai.ctx;
    this.live = [];
    this.pool = [];
    this._geo = null;
    this._mat = null;
    this._v = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._tracer = { from: new THREE.Vector3(), to: new THREE.Vector3(), speed: 60, kind: 'rocket' };
    this.stats = { launched: 0, exploded: 0, duds: 0, external: 0 };
    // glints
    this.glints = new Map();
    this._glintMat = null;
    this._toCam = new THREE.Vector3();
  }

  _ensure() {
    if (this._geo) return;
    const body = new THREE.CylinderGeometry(0.035, 0.035, 0.7, 10, 1);
    body.rotateX(Math.PI / 2);
    this._geo = body;
    this._mat = new THREE.MeshStandardMaterial({ color: 0x3a4030, roughness: 0.6, metalness: 0.4 });
    for (let i = 0; i < POOL; i++) {
      const m = new THREE.Mesh(this._geo, this._mat);
      m.visible = false;
      m.frustumCulled = true;
      m.userData.owNoShadow = true;
      this.ai.root.add(m);
      this.pool.push({ mesh: m, pos: new THREE.Vector3(), dir: new THREE.Vector3(), speed: 0, travelled: 0, owner: null, P: null, live: false });
    }
  }

  /** Fire `agent`'s rocket from `origin` along `dir`. */
  launch(agent, origin, dir) {
    const P = agent.weapon.projectile;
    const wp = this.ctx.peek('weapons');
    const spawn = wp?.spawnProjectile ?? wp?.fireProjectile;
    if (typeof spawn === 'function') {
      try {
        spawn.call(wp, { kind: 'rocket', weapon: agent.weaponId, owner: agent, team: agent.team, origin, dir, speed: P.speed, radius: P.radius, damage: P.damage });
        this.stats.external++;
        this.stats.launched++;
        return;
      } catch {
        /* fall through to our own */
      }
    }
    this._ensure();
    const r = this.pool.find((p) => !p.live);
    if (!r) return;
    r.live = true;
    r.pos.copy(origin);
    r.dir.copy(dir).normalize();
    r.speed = P.speed;
    r.travelled = 0;
    r.owner = agent;
    r.P = P;
    r.mesh.visible = true;
    r.mesh.position.copy(origin);
    r.mesh.lookAt(this._v.copy(origin).add(r.dir));
    this.live.push(r);
    this.stats.launched++;
    // the streak: fx draws a tracer moving at rocket speed
    const tr = this._tracer;
    tr.from.copy(origin);
    tr.to.copy(origin).addScaledVector(r.dir, 90);
    tr.speed = P.speed;
    this.ctx.events.emit('bullet:tracer', tr);
  }

  update(dt) {
    if (!this.live.length) return;
    const ai = this.ai;
    const phys = ai.phys;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const r = this.live[i];
      const step = r.speed * dt;
      let hitT = step;
      let hit = false;
      if (phys) {
        const h = phys.raycast(r.pos, r.dir, step, ai._worldBulletMask());
        if (h.hit) { hitT = h.distance; hit = true; }
      }
      const act = ai._traceActors(r.owner, r.pos, r.dir, hitT);
      if (act.actor) { hitT = act.t; hit = true; }
      if (r.owner?.team === 'hostile' && ai._playerHitT(r.pos, r.dir, hitT) < Infinity) {
        hitT = Math.max(0, ai._playerHitT(r.pos, r.dir, hitT) - 0.2);
        hit = true;
      }
      r.pos.addScaledVector(r.dir, hitT);
      r.travelled += hitT;
      r.mesh.position.copy(r.pos);
      if (hit || r.travelled > 260) {
        if (r.travelled >= r.P.arm || !hit) {
          this.ctx.events.emit('explosion', {
            position: r.pos.clone(),
            radius: r.P.radius,
            damage: r.P.damage,
            owner: r.owner,
            source: r.owner,
            kind: 'rocket',
            impulse: r.P.impulse,
            team: r.owner?.team,
          });
          this.stats.exploded++;
        } else this.stats.duds++;
        r.live = false;
        r.mesh.visible = false;
        this.live.splice(i, 1);
      }
    }
  }

  /* ---------------- scope glint ---------------- */

  _glintFor(agent) {
    let s = this.glints.get(agent);
    if (s) return s;
    if (!this._glintMat) {
      this._glintMat = new THREE.SpriteMaterial({
        map: glintTexture(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        color: new THREE.Color(6, 5.6, 5),
      });
    }
    s = new THREE.Sprite(this._glintMat);
    s.userData.owNoPrepass = true;
    s.userData.owNoShadow = true;
    s.visible = false;
    this.ai.root.add(s);
    this.glints.set(agent, s);
    return s;
  }

  /** Per frame: place and fade every marksman's glint. */
  updateGlints(camera) {
    for (const a of this.ai.agents) {
      if (a.roleDef?.id !== 'sniper') continue;
      const s = this._glintFor(a);
      if (!a.alive) { s.visible = false; continue; }
      const an = a.animator;
      // objective lens: a little behind the muzzle and above the bore
      const p = this._v.copy(an.muzzleWorld).addScaledVector(an.muzzleDir, -0.52);
      p.y += 0.07;
      const toCam = this._toCam.copy(camera.position).sub(p);
      const d = toCam.length() || 1;
      toCam.multiplyScalar(1 / d);
      const along = toCam.dot(an.muzzleDir);
      const aiming = a.aimWeight > 0.75 && a.fireTarget?.actor?.isPlayer;
      const k = aiming ? Math.max(0, (along - 0.96) / 0.04) : 0;
      if (k <= 0.01) { s.visible = false; continue; }
      s.visible = true;
      s.position.copy(p);
      const flick = 0.75 + 0.25 * Math.sin(this.ctx.time.elapsed * 9 + a.id);
      const size = Math.min(1.6, 0.05 * d * 0.06 + 0.12) * k * flick;
      s.scale.set(size, size, 1);
    }
  }

  dispose() {
    for (const r of this.pool) r.mesh.parent?.remove(r.mesh);
    this._geo?.dispose();
    this._mat?.dispose();
    for (const s of this.glints.values()) s.parent?.remove(s);
    this._glintMat?.map?.dispose();
    this._glintMat?.dispose();
  }
}
