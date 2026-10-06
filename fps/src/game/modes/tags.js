import * as THREE from 'three';

/**
 * DOG TAGS — the pooled world objects of KILL CONFIRMED.
 *
 * A tag is two small stamped steel plates on a bead chain stub, spinning and
 * bobbing over the spot a man fell, with a team-coloured glow (an additive
 * billboard plus a ground ring) so it reads at 40 m in daylight. ESF tags glow
 * the friendly steel blue, hostile tags the threat red, matching the HUD.
 *
 * Everything is built once (POOL tags, shared geometry and materials, one
 * procedural glow texture); drop/take only flip `visible` and mutate vectors.
 * The glow parts are transparent, so they stay out of the depth prepass and the
 * shadow cascades (render's owNoPrepass / owNoShadow).
 */

export const POOL = 24;
/** Seconds a tag lies there before it is collected by nobody. */
export const TAG_LIFE = 30;

const COLOURS = {
  esf: new THREE.Color(0.33, 0.62, 1.0),
  hostile: new THREE.Color(1.0, 0.34, 0.2),
};

function glowTexture() {
  const S = 64;
  let canvas = null;
  try {
    canvas = document.createElement('canvas');
  } catch {
    return null;
  }
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class DogTags {
  constructor(ctx) {
    this.ctx = ctx;
    this.root = new THREE.Group();
    this.root.name = 'dogtags';
    ctx.scene.add(this.root);
    this.tex = glowTexture();

    this.plateGeo = new THREE.BoxGeometry(0.055, 0.09, 0.006);
    this.chainGeo = new THREE.TorusGeometry(0.045, 0.004, 4, 16);
    this.ringGeo = new THREE.RingGeometry(0.42, 0.55, 32);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.mats = {};
    for (const team of ['esf', 'hostile']) {
      const c = COLOURS[team];
      this.mats[team] = {
        plate: new THREE.MeshStandardMaterial({
          color: 0x9a9a96,
          metalness: 1,
          roughness: 0.32,
          emissive: c.clone(),
          emissiveIntensity: 2.2,
        }),
        glow: new THREE.SpriteMaterial({
          map: this.tex,
          color: c.clone().multiplyScalar(3),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          opacity: 0.85,
        }),
        ring: new THREE.MeshBasicMaterial({
          color: c.clone().multiplyScalar(2.2),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          opacity: 0.55,
          side: THREE.DoubleSide,
        }),
      };
    }

    this.tags = [];
    for (let i = 0; i < POOL; i++) this.tags.push(this._make(i));
  }

  _make(i) {
    const g = new THREE.Group();
    g.name = `dogtag${i}`;
    const spin = new THREE.Group();
    g.add(spin);
    const m = this.mats.esf;
    const a = new THREE.Mesh(this.plateGeo, m.plate);
    a.position.set(-0.012, 0, 0);
    a.rotation.z = 0.12;
    const b = new THREE.Mesh(this.plateGeo, m.plate);
    b.position.set(0.016, -0.018, 0.008);
    b.rotation.z = -0.2;
    const chain = new THREE.Mesh(this.chainGeo, m.plate);
    chain.position.set(0, 0.07, 0);
    spin.add(a, b, chain);
    const glow = new THREE.Sprite(m.glow);
    glow.scale.set(0.85, 0.85, 1);
    const ring = new THREE.Mesh(this.ringGeo, m.ring);
    ring.position.y = -0.62;
    for (const o of [glow, ring]) {
      o.userData.owNoPrepass = true;
      o.userData.owNoShadow = true;
      o.renderOrder = 2;
    }
    g.add(glow, ring);
    g.visible = false;
    this.root.add(g);
    return {
      i,
      active: false,
      team: 'esf',
      pos: new THREE.Vector3(),
      born: 0,
      victimName: '',
      group: g,
      spin,
      parts: [a, b, chain],
      glow,
      ring,
    };
  }

  _skin(tag, team) {
    const m = this.mats[team] ?? this.mats.hostile;
    for (const p of tag.parts) p.material = m.plate;
    tag.glow.material = m.glow;
    tag.ring.material = m.ring;
  }

  /** Drop a tag of `team` at a feet position. Recycles the oldest when full. */
  drop(team, feet, now, victimName = '') {
    let tag = null;
    for (const t of this.tags) {
      if (!t.active) {
        tag = t;
        break;
      }
    }
    if (!tag) {
      tag = this.tags[0];
      for (const t of this.tags) if (t.born < tag.born) tag = t;
    }
    tag.active = true;
    tag.team = team;
    tag.born = now;
    tag.victimName = victimName;
    tag.pos.copy(feet);
    // ground it: the AI's corpse point is the chest
    const phys = this.ctx.peek('physics');
    const gy = phys?.groundHeight?.(feet.x, feet.z, feet.y + 1.5);
    if (Number.isFinite(gy) && Math.abs(gy - feet.y) < 3) tag.pos.y = gy;
    this._skin(tag, team);
    tag.group.position.set(tag.pos.x, tag.pos.y + 0.65, tag.pos.z);
    tag.group.visible = true;
    return tag;
  }

  take(tag) {
    tag.active = false;
    tag.group.visible = false;
  }

  clear() {
    for (const t of this.tags) this.take(t);
  }

  count() {
    let n = 0;
    for (const t of this.tags) if (t.active) n++;
    return n;
  }

  /** Spin, bob, pulse, expire. `t` is game time, `rawT` drives the look. */
  update(now, rawT) {
    for (const tag of this.tags) {
      if (!tag.active) continue;
      if (now - tag.born > TAG_LIFE) {
        this.take(tag);
        continue;
      }
      const ph = rawT * 1.0 + tag.i * 0.7;
      tag.spin.rotation.y = ph * 2.2;
      tag.group.position.y = tag.pos.y + 0.62 + Math.sin(ph * 2.4) * 0.06;
      const age = now - tag.born;
      // fade the last 4 s so a dying tag says so
      const k = age > TAG_LIFE - 4 ? 0.35 + 0.65 * Math.abs(Math.sin(age * 6)) : 1;
      const s = (0.8 + 0.08 * Math.sin(ph * 3.1)) * k;
      tag.glow.scale.set(s, s, 1);
    }
  }

  dispose() {
    this.root.parent?.remove(this.root);
    this.plateGeo.dispose();
    this.chainGeo.dispose();
    this.ringGeo.dispose();
    for (const m of Object.values(this.mats)) for (const x of Object.values(m)) x.dispose();
    this.tex?.dispose();
  }
}
