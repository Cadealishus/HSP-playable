/**
 * AI — debug view. F3, `?aidebug=1` or `FLOP.aiDebug(true)`.
 *
 * Per bot: a label (name, role, state, target, confidence %, seconds since
 * last seen, destination), the vision cone, the current path, its cover point
 * and the cover candidates around it, the last-known marker of its target
 * (where it THINKS the target is), and a ring for the last sound it heard.
 *
 * Zero cost when off: nothing is built until the first enable, and update()
 * returns on its first line while disabled.
 */

import * as THREE from 'three';

const MAX_VERTS = 24000;
const COL = {
  cone: [0.9, 0.85, 0.2],
  coneEsf: [0.3, 0.7, 1],
  path: [0.2, 1, 0.4],
  cover: [0.2, 0.9, 1],
  cand: [0.15, 0.4, 0.5],
  lkp: [1, 0.25, 0.2],
  ring: [1, 0.6, 0.1],
};

export class AiDebug {
  constructor(ai) {
    this.ai = ai;
    this.enabled = false;
    this._built = false;
  }

  setEnabled(on) {
    on = !!on;
    if (on && !this._built) this._build();
    this.enabled = on;
    if (this.lines) this.lines.visible = on;
    if (this.dom) this.dom.style.display = on ? '' : 'none';
    return on;
  }

  toggle() {
    return this.setEnabled(!this.enabled);
  }

  _build() {
    this._built = true;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX_VERTS * 3);
    this.col = new Float32Array(MAX_VERTS * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    this.lines = new THREE.LineSegments(geo, mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 20;
    this.lines.userData.owNoPrepass = true;
    this.lines.userData.owNoShadow = true;
    this.ai.root.add(this.lines);
    this.labels = [];
    if (typeof document !== 'undefined') {
      const d = document.createElement('div');
      d.id = 'ai-debug';
      d.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:60;font:11px/1.25 ui-monospace,Menlo,monospace;color:#fff';
      document.body.appendChild(d);
      this.dom = d;
    }
    this._v = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  _label(i) {
    let l = this.labels[i];
    if (!l && this.dom) {
      l = document.createElement('div');
      l.style.cssText = 'position:absolute;white-space:pre;background:rgba(0,0,0,.55);padding:2px 4px;border-left:2px solid #fc3;transform:translate(-50%,-100%)';
      this.dom.appendChild(l);
      this.labels.push(l);
    }
    return l;
  }

  _seg(ax, ay, az, bx, by, bz, c) {
    if (this.n + 2 > MAX_VERTS) return;
    const p = this.pos, k = this.col;
    let i = this.n * 3;
    p[i] = ax; p[i + 1] = ay; p[i + 2] = az; k[i] = c[0]; k[i + 1] = c[1]; k[i + 2] = c[2];
    i += 3;
    p[i] = bx; p[i + 1] = by; p[i + 2] = bz; k[i] = c[0]; k[i + 1] = c[1]; k[i + 2] = c[2];
    this.n += 2;
  }

  _ring(x, y, z, r, c, seg = 20) {
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
      this._seg(x + Math.sin(a0) * r, y, z + Math.cos(a0) * r, x + Math.sin(a1) * r, y, z + Math.cos(a1) * r, c);
    }
  }

  _cross(x, y, z, r, c) {
    this._seg(x - r, y, z, x + r, y, z, c);
    this._seg(x, y, z - r, x, y, z + r, c);
    this._seg(x, y, z, x, y + r * 2, z, c);
  }

  update(ctx) {
    if (!this.enabled) return;
    const ai = this.ai;
    const now = ctx.time.elapsed;
    this.n = 0;
    const cam = ctx.camera;
    const w = innerWidth, h = innerHeight;
    let li = 0;
    const all = ai.agents;
    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      if (!a.alive) continue;
      const P = a.position;
      const y = P.y + 0.08;
      // vision cone
      const range = Math.min(a.viewRange, 30);
      const half = Math.acos(Math.max(-1, Math.min(1, a.viewCos - a.perception.alert * 0.3)));
      const cc = a.team === 'esf' ? COL.coneEsf : COL.cone;
      const l = a.yaw - half, r = a.yaw + half;
      this._seg(P.x, y, P.z, P.x + Math.sin(l) * range, y, P.z + Math.cos(l) * range, cc);
      this._seg(P.x, y, P.z, P.x + Math.sin(r) * range, y, P.z + Math.cos(r) * range, cc);
      for (let s = 0; s < 8; s++) {
        const a0 = l + ((r - l) * s) / 8, a1 = l + ((r - l) * (s + 1)) / 8;
        this._seg(P.x + Math.sin(a0) * range, y, P.z + Math.cos(a0) * range, P.x + Math.sin(a1) * range, y, P.z + Math.cos(a1) * range, cc);
      }
      // path
      if (a.hasMoveTarget) {
        let px = P.x, py = P.y + 0.15, pz = P.z;
        for (let k = a.pathIndex; k < a.pathLen; k++) {
          const q = a.path[k];
          this._seg(px, py, pz, q.x, q.y + 0.15, q.z, COL.path);
          px = q.x; py = q.y + 0.15; pz = q.z;
        }
      }
      // cover
      if (a.cover) this._cross(a.cover.x, a.cover.y + 0.05, a.cover.z, 0.35, COL.cover);
      // last-known position of its target
      const T = a.perception.target;
      if (T) {
        const q = T.pos;
        const c = COL.lkp;
        this._seg(q.x - 0.3, q.y, q.z, q.x, q.y + 0.3, q.z, c);
        this._seg(q.x, q.y + 0.3, q.z, q.x + 0.3, q.y, q.z, c);
        this._seg(q.x + 0.3, q.y, q.z, q.x, q.y - 0.3, q.z, c);
        this._seg(q.x, q.y - 0.3, q.z, q.x - 0.3, q.y, q.z, c);
        this._seg(P.x, P.y + 1.6, P.z, q.x, q.y, q.z, [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5]);
      }
      // hearing ring for the latest noise
      const st = a.perception.stim;
      if (now - st.t < 3) this._ring(st.pos.x, st.pos.y + 0.1, st.pos.z, 0.5 + (now - st.t) * 2, COL.ring, 16);
      // label
      const lab = this._label(li);
      if (lab) {
        const v = this._v.set(P.x, P.y + 2.25, P.z).project(cam);
        if (v.z > 1 || v.z < -1) {
          lab.style.display = 'none';
        } else {
          lab.style.display = '';
          lab.style.left = `${((v.x + 1) / 2) * w}px`;
          lab.style.top = `${((1 - v.y) / 2) * h}px`;
          lab.style.borderLeftColor = a.team === 'esf' ? '#4af' : '#fc3';
          const tgt = T ? `${T.actor?.name ?? '?'} ${Math.round(T.conf * 100)}% ${T.visible ? 'IN VIEW' : `seen ${(now - T.seenT).toFixed(1)}s`}` : '-';
          const dest = a.isMoving() ? `${a._moveDest.x.toFixed(0)},${a._moveDest.z.toFixed(0)}` : 'hold';
          const order = a.brain.order ? ` [${a.brain.order.kind}]` : '';
          lab.textContent = `${a.name} ${a.roleDef.display}${order}\n${a.brain.state}  hp ${Math.round(a.health)}  ammo ${a.ammo}\ntgt ${tgt}\ndest ${dest}`;
        }
      }
      li++;
    }
    // cover candidates near the camera (sampled)
    const cm = ai.cover;
    if (cm) {
      const cx = cam.position.x, cz = cam.position.z;
      for (let i = 0; i < cm.points.length; i += 2) {
        const c = cm.points[i];
        if (Math.abs(c.x - cx) > 25 || Math.abs(c.z - cz) > 25) continue;
        this._seg(c.x, c.y + 0.05, c.z, c.x + c.dx * 0.4, c.y + 0.05, c.z + c.dz * 0.4, c.claimed >= 0 ? COL.cover : COL.cand);
      }
    }
    for (let i = li; i < this.labels.length; i++) this.labels[i].style.display = 'none';
    const g = this.lines.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.setDrawRange(0, this.n);
  }

  dispose() {
    this.lines?.parent?.remove(this.lines);
    this.lines?.geometry.dispose();
    this.lines?.material.dispose();
    this.dom?.remove();
  }
}
