/**
 * AI — navigation and cover.
 *
 * NAVIGATION is a dense walkability grid sampled straight out of the physics
 * BVH at boot: one downward ray per cell finds the floor, one upward ray checks
 * standing clearance, and the floor normal gives the slope. That is a navmesh's
 * worth of information for a fraction of the code, and it stays correct for a
 * level the `world` system generated procedurally without any authoring pass.
 *
 *   • A* over the 8-connected grid with a heap, slope and step penalties
 *   • string pulling against a line-of-walk test, so paths hug corners instead
 *     of zig-zagging cell to cell
 *   • per-agent local avoidance so a squad flows around itself
 *
 * COVER is derived from the same grid. Every walkable cell next to a blocker
 * becomes a cover point with a direction and a height class (full / crouch),
 * plus a peek offset that has line of sight past the edge. At runtime cover is
 * scored against the live threat direction, the agent's distance, and what the
 * rest of the squad has already claimed.
 */

import * as THREE from 'three';

const SQRT2 = Math.SQRT2;

/* ------------------------------------------------------------------ */
/* Binary heap for A*                                                  */
/* ------------------------------------------------------------------ */

class Heap {
  constructor(cap) {
    this.idx = new Int32Array(cap);
    this.key = new Float32Array(cap);
    this.n = 0;
  }

  clear() {
    this.n = 0;
  }

  push(i, k) {
    if (this.n >= this.idx.length) return;
    let c = this.n++;
    this.idx[c] = i;
    this.key[c] = k;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (this.key[p] <= this.key[c]) break;
      const ti = this.idx[p], tk = this.key[p];
      this.idx[p] = this.idx[c]; this.key[p] = this.key[c];
      this.idx[c] = ti; this.key[c] = tk;
      c = p;
    }
  }

  pop() {
    const top = this.idx[0];
    this.n--;
    if (this.n > 0) {
      this.idx[0] = this.idx[this.n];
      this.key[0] = this.key[this.n];
      let c = 0;
      for (;;) {
        const l = c * 2 + 1, r = l + 1;
        let m = c;
        if (l < this.n && this.key[l] < this.key[m]) m = l;
        if (r < this.n && this.key[r] < this.key[m]) m = r;
        if (m === c) break;
        const ti = this.idx[m], tk = this.key[m];
        this.idx[m] = this.idx[c]; this.key[m] = this.key[c];
        this.idx[c] = ti; this.key[c] = tk;
        c = m;
      }
    }
    return top;
  }
}

/* ------------------------------------------------------------------ */
/* Nav grid                                                            */
/* ------------------------------------------------------------------ */

export class NavGrid {
  constructor(physics, opts = {}) {
    this.physics = physics;
    this.cell = opts.cell ?? 0.8;
    this.radius = opts.radius ?? 0.36;
    this.height = opts.height ?? 1.78;
    this.crouchHeight = opts.crouchHeight ?? 1.15;
    // cell-to-cell rise the planner accepts: a flight of stairs or an escalator
    // climbs ~0.5 m per 0.8 m cell; anything a man cannot step the controller
    // vaults (Agent._tryVault)
    this.maxStep = opts.maxStep ?? 0.62;
    this.maxSlope = Math.cos((opts.maxSlopeDeg ?? 46) * Math.PI / 180);
    /** floors per column: a deck over a hall, a cabin over a hold over the apron */
    this.L = opts.layers ?? 3;

    const b = opts.bounds;
    this.minX = Math.floor(b.min.x / this.cell) * this.cell;
    this.minZ = Math.floor(b.min.z / this.cell) * this.cell;
    this.nx = Math.max(1, Math.ceil((b.max.x - this.minX) / this.cell));
    this.nz = Math.max(1, Math.ceil((b.max.z - this.minZ) / this.cell));
    this.topY = b.max.y + 4;
    this.minY = b.min.y;

    const n = this.nx * this.nz;
    /** cells per layer; node id = layer * n + iz * nx + ix */
    this.n = n;
    const N = n * this.L;
    /** 0 = blocked, 1 = walkable standing, 2 = walkable crouched only */
    this.flags = new Uint8Array(N);
    this.floor = new Float32Array(N);
    this.floor.fill(-Infinity);
    /** how enclosed a cell is: 0 open .. 4 hemmed in — used for cover scoring */
    this.enclosure = new Uint8Array(N);

    // A* working set
    this.gScore = new Float32Array(N);
    this.came = new Int32Array(N);
    this.visitStamp = new Int32Array(N);
    this.stamp = 0;
    this.open = new Heap(Math.min(N, 1 << 17));

    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._p0 = new THREE.Vector3();
    this._p1 = new THREE.Vector3();
    this.buildMs = 0;
    this.walkableCount = 0;
    this.upperCount = 0;
    this.lastExpanded = 0;
  }

  /** Layer-0 (topmost floor) node of a column. */
  index(ix, iz) {
    return iz * this.nx + ix;
  }

  nodeIX(node) {
    return (node % this.n) % this.nx;
  }

  nodeIZ(node) {
    return ((node % this.n) / this.nx) | 0;
  }

  nodeX(node) {
    return this.worldX(this.nodeIX(node));
  }

  nodeZ(node) {
    return this.worldZ(this.nodeIZ(node));
  }

  cellX(x) {
    return Math.round((x - this.minX) / this.cell);
  }

  cellZ(z) {
    return Math.round((z - this.minZ) / this.cell);
  }

  worldX(ix) {
    return this.minX + ix * this.cell;
  }

  worldZ(iz) {
    return this.minZ + iz * this.cell;
  }

  inside(ix, iz) {
    return ix >= 0 && iz >= 0 && ix < this.nx && iz < this.nz;
  }

  /**
   * Sample the physics world. Per column: a ray down from the top finds the
   * highest floor; further rays continue down from just under it to find the
   * floors beneath (a deck over a hall, a cabin over a hold over the apron).
   * Each floor gets a clearance ray up and four shoulder probes. Rays use
   * MASK.WORLD, so overhead slabs maps author on CLIP|DEBRIS are seen through.
   */
  build() {
    const t0 = performance.now();
    const phys = this.physics;
    const MASK = phys.MASK.WORLD;
    const r = this.radius;
    const n = this.n;
    let walk = 0, upper = 0;
    for (let iz = 0; iz < this.nz; iz++) {
      for (let ix = 0; ix < this.nx; ix++) {
        const ci = iz * this.nx + ix;
        const x = this.worldX(ix), z = this.worldZ(iz);
        let y = this.topY;
        let layer = 0;
        for (let cast = 0; cast < 7 && layer < this.L; cast++) {
          const down = phys.raycast(x, y, z, 0, -1, 0, y - this.minY + 30, MASK);
          if (!down.hit) break;
          const fy = down.point.y;
          y = fy - 0.06;
          if (down.normal.y < 0) continue; // the underside of a slab: keep going
          const i = layer * n + ci;
          if (layer === 0) this.floor[i] = fy;
          if (down.normal.y < this.maxSlope) {
            if (layer === 0) layer = 1;
            continue;
          }
          // standing clearance straight up
          const up = phys.raycast(x, fy + 0.25, z, 0, 1, 0, this.height - 0.2, MASK);
          let f = 0;
          if (!up.hit) f = 1;
          else if (up.distance > this.crouchHeight - 0.25) f = 2;
          if (!f) {
            if (layer > 0) continue; // a crawlspace under a floor: not a floor
            layer = 1;
            continue;
          }
          let blocked = 0;
          for (let d = 0; d < 4; d++) {
            const dx = d === 0 ? 1 : d === 1 ? -1 : 0;
            const dz = d === 2 ? 1 : d === 3 ? -1 : 0;
            if (phys.raycastAny(x, fy + 0.95, z, dx, 0, dz, r + 0.06, MASK)) blocked++;
          }
          if (blocked >= 3) {
            if (layer === 0) layer = 1;
            continue;
          }
          this.floor[i] = fy;
          this.flags[i] = f;
          this.enclosure[i] = blocked;
          walk++;
          if (layer > 0) upper++;
          layer++;
        }
      }
    }
    this.walkableCount = walk;
    this.upperCount = upper;
    this.buildMs = performance.now() - t0;
    return this;
  }

  /** Is the topmost floor of a column walkable (legacy, layer 0). */
  walkable(ix, iz, crouch = true) {
    if (!this.inside(ix, iz)) return false;
    const f = this.flags[this.index(ix, iz)];
    return crouch ? f !== 0 : f === 1;
  }

  /** Is node `node` walkable. */
  walkableNode(node, crouch = true) {
    const f = this.flags[node];
    return crouch ? f !== 0 : f === 1;
  }

  floorAt(ix, iz) {
    return this.floor[this.index(ix, iz)];
  }

  /** The walkable node of column (ix, iz) whose floor is nearest `y` within `tol`, or -1. */
  layerAt(ix, iz, y, tol = Infinity) {
    if (!this.inside(ix, iz)) return -1;
    const ci = iz * this.nx + ix;
    let best = -1, bd = tol;
    for (let l = 0; l < this.L; l++) {
      const i = l * this.n + ci;
      if (!this.flags[i]) continue;
      const d = y === null ? l : Math.abs(this.floor[i] - y);
      if (d <= bd) {
        bd = d;
        best = i;
        if (y === null) break;
      }
    }
    return best;
  }

  /**
   * Nearest walkable node to a world point, searched in rings. Pass `y` plus a
   * `yTol` to stay on a storey — otherwise a spawn point in a street happily
   * snaps onto a market stall's table top (or a cabin onto the apron).
   */
  nearest(x, z, y = null, maxRings = 8, yTol = Infinity) {
    const cx = this.cellX(x), cz = this.cellZ(z);
    const own = this.layerAt(cx, cz, y, y === null ? Infinity : Math.min(yTol, 1.2));
    if (own >= 0) return own;
    for (let ring = 1; ring <= maxRings; ring++) {
      let best = -1, bestD = Infinity;
      for (let dz = -ring; dz <= ring; dz++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const i = this.layerAt(cx + dx, cz + dz, y, yTol);
          if (i < 0) continue;
          let d = dx * dx + dz * dz;
          if (y !== null) d += (this.floor[i] - y) ** 2 * 4;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** Walkable node in neighbouring column (ix, iz) reachable from floor height `fy`. */
  _step(ix, iz, fy) {
    if (!this.inside(ix, iz)) return -1;
    const ci = iz * this.nx + ix;
    let best = -1, bd = this.maxStep;
    for (let l = 0; l < this.L; l++) {
      const i = l * this.n + ci;
      if (!this.flags[i]) continue;
      const d = Math.abs(this.floor[i] - fy);
      if (d <= bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  /**
   * A* between two world points. Writes world-space waypoints into `out`
   * (an array of THREE.Vector3, reused) and returns the count.
   */
  findPath(from, to, out, opts = {}) {
    const start = this.nearest(from.x, from.z, from.y, 8, 2.5);
    const goal = this.nearest(to.x, to.z, to.y, 8, 3);
    if (start < 0 || goal < 0) return 0;
    if (start === goal) {
      this._emit(out, 0, to);
      return 1;
    }
    const nx = this.nx;
    const gx = this.nodeIX(goal), gz = this.nodeIZ(goal), gy = this.floor[goal];
    const cell = this.cell;
    const maxNodes = opts.maxNodes ?? 14000;

    this.stamp++;
    const stamp = this.stamp;
    this.open.clear();
    this.gScore[start] = 0;
    this.came[start] = -1;
    this.visitStamp[start] = stamp;
    this.open.push(start, 0);

    let expanded = 0;
    let found = false;
    while (this.open.n > 0 && expanded < maxNodes) {
      const cur = this.open.pop();
      if (cur === goal) {
        found = true;
        break;
      }
      expanded++;
      const cxi = this.nodeIX(cur), czi = this.nodeIZ(cur);
      const cg = this.gScore[cur];
      const cy = this.floor[cur];
      for (let d = 0; d < 8; d++) {
        const dx = DX[d], dz = DZ[d];
        const ni = this._step(cxi + dx, czi + dz, cy);
        if (ni < 0) continue;
        if (dx && dz) {
          // no corner cutting
          if (this._step(cxi + dx, czi, cy) < 0 || this._step(cxi, czi + dz, cy) < 0) continue;
        }
        const dy = this.floor[ni] - cy;
        let cost = (dx && dz ? SQRT2 : 1) * cell;
        cost += Math.abs(dy) * 2.2; // prefer flat ground
        if (this.flags[ni] === 2) cost += cell * 1.6; // crouch-only squeeze
        cost += this.enclosure[ni] * cell * 0.25; // avoid scraping walls
        const g = cg + cost;
        if (this.visitStamp[ni] === stamp && g >= this.gScore[ni]) continue;
        this.visitStamp[ni] = stamp;
        this.gScore[ni] = g;
        this.came[ni] = cur;
        const hx = Math.abs(this.nodeIX(ni) - gx), hz = Math.abs(this.nodeIZ(ni) - gz);
        const h = (Math.max(hx, hz) + (SQRT2 - 1) * Math.min(hx, hz)) * cell + Math.abs(this.floor[ni] - gy);
        this.open.push(ni, g + h * 1.12);
      }
    }
    this.lastExpanded = expanded;
    if (!found) return 0;

    // walk the parents back, then string-pull
    const raw = this._raw ?? (this._raw = []);
    raw.length = 0;
    let k = goal;
    while (k >= 0) {
      raw.push(k);
      k = this.came[k];
    }
    raw.reverse();
    return this._stringPull(raw, from, to, out);
  }

  _emit(out, i, v) {
    if (!out[i]) out[i] = new THREE.Vector3();
    out[i].copy(v);
  }

  /**
   * Greedy string pull: keep the furthest waypoint still reachable in a
   * straight walkable line from the anchor. Turns a staircase into a corner.
   */
  _stringPull(raw, from, to, out) {
    let count = 0;
    const anchor = this._v.copy(from);
    anchor.y = this.floor[raw[0]];
    let i = 0;
    const pos = this._v2;
    while (i < raw.length - 1) {
      let best = i + 1;
      // bounded look-ahead keeps a long path's pull linear-ish
      for (let j = Math.min(raw.length - 1, i + 40); j > i; j--) {
        const c = raw[j];
        pos.set(this.nodeX(c), this.floor[c], this.nodeZ(c));
        if (this.lineOfWalk(anchor, pos)) {
          best = j;
          break;
        }
      }
      const c = raw[best];
      pos.set(this.nodeX(c), this.floor[c], this.nodeZ(c));
      this._emit(out, count++, pos);
      anchor.copy(pos);
      i = best;
      if (count >= 48) break;
    }
    // finish on the exact goal if we can see it
    if (this.lineOfWalk(anchor, to) && count < 48) this._emit(out, count++, to);
    else if (count === 0) this._emit(out, count++, to);
    return count;
  }

  /** Is the straight segment walkable end to end (following one storey)? */
  lineOfWalk(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / (this.cell * 0.65)));
    let prevY = a.y;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = a.x + dx * t, z = a.z + dz * t;
      const i = this._step(this.cellX(x), this.cellZ(z), prevY);
      if (i < 0) return false;
      prevY = this.floor[i];
    }
    return true;
  }
}

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];

/* ------------------------------------------------------------------ */
/* Cover                                                               */
/* ------------------------------------------------------------------ */

/**
 * A cover point: a spot to stand plus the direction the protection comes from.
 * `high` means the blocker stops a standing shot; otherwise it is crouch cover.
 * `peek` is a lateral offset that clears the edge for shooting.
 */
export class CoverMap {
  constructor(grid, physics) {
    this.grid = grid;
    this.physics = physics;
    this.points = [];
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this.buildMs = 0;
  }

  build(opts = {}) {
    const t0 = performance.now();
    const g = this.grid;
    const phys = this.physics;
    const MASK = phys.MASK.WORLD;
    const step = opts.step ?? 1; // sample every Nth cell
    const reach = opts.reach ?? 1.25;
    this.points.length = 0;
    const N = g.n * g.L;
    for (let i = 0; i < N; i += step) {
      if (!g.flags[i]) continue;
      const ix = g.nodeIX(i), iz = g.nodeIZ(i);
      if (ix < 1 || iz < 1 || ix >= g.nx - 1 || iz >= g.nz - 1) continue;
      const y = g.floor[i];
      if (g.enclosure[i] === 0) {
        // still allow cover next to a blocked cell (thin props, sandbags)
        let adj = false;
        for (let d = 0; d < 4 && !adj; d++) {
          if (g._step(ix + DX[d], iz + DZ[d], y) < 0) adj = true;
        }
        if (!adj) continue;
      }
      const x = g.worldX(ix), z = g.worldZ(iz);
      {
        // find the strongest blocking direction at chest and knee height
        for (let d = 0; d < 8; d++) {
          const dx = DX[d] / (d < 4 ? 1 : SQRT2);
          const dz = DZ[d] / (d < 4 ? 1 : SQRT2);
          const low = phys.raycast(x, y + 0.55, z, dx, 0, dz, reach, MASK);
          if (!low.hit) continue;
          const high = phys.raycastAny(x, y + 1.32, z, dx, 0, dz, reach, MASK);
          // must be able to shoot over/around: check a peek to both sides
          this.points.push({
            x, y, z,
            dx, dz, // direction the cover faces (toward the blocker)
            high,
            dist: low.distance,
            claimed: -1,
            score: 0,
          });
          break;
        }
      }
    }
    this.buildMs = performance.now() - t0;
    return this;
  }

  /**
   * Best cover for an agent at `pos` against a threat at `threat`.
   * Scoring, in order of weight: does the blocker actually sit between us and
   * the threat, is the spot a sensible distance from both, is it free, and does
   * a peek from it have line of sight (a hole to shoot through).
   */
  pick(pos, threat, opts = {}) {
    const wantMin = opts.minRange ?? 6;
    const wantMax = opts.maxRange ?? 26;
    const claimId = opts.id ?? -1;
    const squad = opts.squad ?? null;
    const maxTravel = opts.maxTravel ?? 22;
    const yRef = opts.yRef ?? null;
    const yTol = opts.yTol ?? Infinity;
    const team = opts.team ?? null;
    const exclude = opts.exclude ?? null;
    const zone = opts.zone ?? null;
    const zoneR = opts.zoneR ?? Infinity;
    let best = null;
    let bestScore = -Infinity;
    const tx = threat.x, tz = threat.z;
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      if (p.claimed >= 0 && p.claimed !== claimId) continue;
      if (p === exclude) continue;
      if (zone && Math.hypot(p.x - zone.x, p.z - zone.z) > zoneR) continue;
      const toThreatX = tx - p.x, toThreatZ = tz - p.z;
      const dT = Math.hypot(toThreatX, toThreatZ);
      if (dT < 2.5 || dT > 40) continue;
      const travel = Math.hypot(p.x - pos.x, p.z - pos.z);
      if (travel > maxTravel) continue;
      if (yRef !== null && Math.abs(p.y - yRef) > yTol) continue;
      // protection: the blocker must be on the threat side
      const prot = (toThreatX / dT) * p.dx + (toThreatZ / dT) * p.dz;
      if (prot < 0.25) continue;
      let score = prot * 5 + (p.high ? 2.2 : 1.0);
      // range preference
      if (dT < wantMin) score -= (wantMin - dT) * 0.55;
      else if (dT > wantMax) score -= (dT - wantMax) * 0.28;
      score -= travel * 0.16;
      // do not bunch up
      if (squad) {
        for (const other of squad) {
          if (!other || other.id === claimId || !other.alive) continue;
          if (team && other.team !== team) continue;
          const d = Math.hypot(other.position.x - p.x, other.position.z - p.z);
          if (d < 3.2) score -= (3.2 - d) * 1.4;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best && claimId >= 0) {
      for (const p of this.points) if (p.claimed === claimId) p.claimed = -1;
      best.claimed = claimId;
    }
    return best;
  }

  release(claimId) {
    for (const p of this.points) if (p.claimed === claimId) p.claimed = -1;
  }

  /**
   * Where to lean out from a cover point to shoot: try both sides and pick the
   * one with line of sight from the eye to the threat.
   */
  peekOffset(cover, threat, eyeH, out) {
    const phys = this.physics;
    // lateral axis = perpendicular to the cover facing
    const lx = -cover.dz, lz = cover.dx;
    const from = this._v;
    const to = this._v2.set(threat.x, threat.y, threat.z);
    for (const s of [1, -1, 0]) {
      const px = cover.x + lx * 0.62 * s;
      const pz = cover.z + lz * 0.62 * s;
      from.set(px, cover.y + eyeH, pz);
      if (phys.lineOfSight(from, to, phys.MASK.SIGHT)) {
        out.set(px, cover.y, pz);
        return s;
      }
    }
    out.set(cover.x, cover.y, cover.z);
    return 0;
  }
}
