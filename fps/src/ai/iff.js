/**
 * AI — IFF cue over friendly (ESF) bots: a small blue chevron with the man's
 * callsign under it, screen-constant in size so it reads at 5 m and at 60 m.
 *
 * One Sprite per friendly, one CanvasTexture per name (a dozen at most), built
 * at spawn, never per frame. Sprites are transparent, so render keeps them out
 * of the depth prepass and the shadow cascades.
 */

import * as THREE from 'three';

const W = 256;
const H = 96;

export class IffTags {
  constructor(parent) {
    this.parent = parent;
    this.tags = new Map(); // agent -> sprite
    this.ok = typeof document !== 'undefined';
  }

  /** Attach a tag to `agent` (its group), sitting just over the helmet. */
  attach(agent) {
    if (!this.ok || this.tags.has(agent)) return null;
    let canvas;
    try {
      canvas = document.createElement('canvas');
    } catch {
      return null;
    }
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.clearRect(0, 0, W, H);
    // chevron
    const cx = W / 2;
    g.fillStyle = 'rgba(8,16,28,0.55)';
    g.beginPath();
    g.moveTo(cx - 22, 10); g.lineTo(cx, 30); g.lineTo(cx + 22, 10); g.lineTo(cx + 22, 20); g.lineTo(cx, 40); g.lineTo(cx - 22, 20);
    g.closePath();
    g.fill();
    g.fillStyle = '#5fb4ff';
    g.beginPath();
    g.moveTo(cx - 19, 8); g.lineTo(cx, 26); g.lineTo(cx + 19, 8); g.lineTo(cx + 19, 17); g.lineTo(cx, 35); g.lineTo(cx - 19, 17);
    g.closePath();
    g.fill();
    // callsign
    g.font = '600 26px "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 5;
    g.strokeStyle = 'rgba(4,10,18,0.8)';
    const name = String(agent.name ?? '').toUpperCase();
    g.strokeText(name, cx, 66);
    g.fillStyle = '#cfe6ff';
    g.fillText(name, cx, 66);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: false,
      toneMapped: false,
    });
    const s = new THREE.Sprite(mat);
    s.name = `iff_${agent.id}`;
    s.center.set(0.5, 0.2);
    s.scale.set(0.075, 0.028, 1);
    s.position.set(0, 2.08, 0);
    s.renderOrder = 10;
    s.frustumCulled = false;
    s.userData.owNoPrepass = true;
    s.userData.owNoShadow = true;
    agent.group.add(s);
    this.tags.set(agent, s);
    return s;
  }

  detach(agent) {
    const s = this.tags.get(agent);
    if (!s) return;
    s.parent?.remove(s);
    s.material.map?.dispose();
    s.material.dispose();
    this.tags.delete(agent);
  }

  dispose() {
    for (const a of [...this.tags.keys()]) this.detach(a);
  }
}
