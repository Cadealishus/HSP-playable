import * as THREE from 'three';
import { Rng } from '../core/rng.js';

/**
 * Tileable multi-terrain camouflage for the combat-shirt sleeves.
 *
 * Ported from the standalone weapon prototype's `makeCamoTex`. The critic's
 * read of the old sleeve was "a brown plank": a single flat coyote value over a
 * 300 mm tube has nothing on it to say FABRIC at hipfire distance, however good
 * the folds are. A six-colour disruptive pattern with a warped, layered blob
 * structure is the one thing a sleeve in every modern shooter carries, and it
 * breaks the forearm's long straight silhouette into patches.
 *
 * Deterministic (seeded Rng), generated once on the CPU at init.
 */

function valueNoise(seed) {
  const rng = new Rng(seed);
  const N = 256;
  const perm = new Uint8Array(N * 2);
  const vals = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    perm[i] = i;
    vals[i] = rng.float();
  }
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(rng.float() * (i + 1));
    const t = perm[i];
    perm[i] = perm[j];
    perm[j] = t;
  }
  for (let i = 0; i < N; i++) perm[N + i] = perm[i];
  const h = (x, y) => vals[perm[(perm[x & 255] + y) & 255]];
  const s = (t) => t * t * (3 - 2 * t);
  return (x, y, per) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const x0 = ((xi % per) + per) % per;
    const y0 = ((yi % per) + per) % per;
    const x1 = (x0 + 1) % per;
    const y1 = (y0 + 1) % per;
    const u = s(xf);
    const v = s(yf);
    const a = h(x0, y0);
    const b = h(x1, y0);
    const c = h(x0, y1);
    const d = h(x1, y1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

function fbm(noise, x, y, per, oct = 4) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < oct; o++) {
    sum += noise(x * f, y * f, per * f) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** @returns {THREE.DataTexture} sRGB, RepeatWrapping */
export function makeCamoTexture(size = 256, seed = 21) {
  const na = valueNoise(seed);
  const nb = valueNoise(seed + 1);
  const nc = valueNoise(seed + 2);
  const nd = valueNoise(seed + 3);
  const ne = valueNoise(seed + 4);
  const col = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const base = col(0x9c8f6e);
  const tan2 = col(0xb4a784);
  const green = col(0x6b6a48);
  const brown = col(0x6a5238);
  const dark = col(0x3d3528);
  const light = col(0xc4b894);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const wu = u + (fbm(ne, u * 4, v * 4, 4, 3) - 0.5) * 0.08;
      const wv = v + (fbm(ne, u * 4 + 7, v * 4 + 3, 4, 3) - 0.5) * 0.08;
      let c = base;
      if (fbm(na, wu * 3, wv * 3, 3) > 0.52) c = tan2;
      if (fbm(nb, wu * 4, wv * 4, 4) > 0.56) c = green;
      const g2 = fbm(nc, wu * 6, wv * 6, 6);
      if (g2 > 0.6) c = brown;
      if (fbm(nd, wu * 10, wv * 10, 10, 3) > 0.66 && g2 > 0.45) c = dark;
      if (fbm(na, wu * 12 + 3, wv * 12 + 5, 12, 3) > 0.7) c = light;
      // ripstop grain
      const grain = (fbm(ne, u * 64, v * 64, 64, 2) - 0.5) * 16 + ((x & 3) === 0 || (y & 3) === 0 ? -6 : 0);
      const i = (y * size + x) * 4;
      data[i] = Math.max(0, Math.min(255, c[0] + grain));
      data[i + 1] = Math.max(0, Math.min(255, c[1] + grain));
      data[i + 2] = Math.max(0, Math.min(255, c[2] + grain));
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Ripstop weave normal map: a fine plain weave with a raised reinforcement grid
 * every 8 threads, the texture that makes a sleeve read as woven at 0.4 m.
 * @returns {THREE.DataTexture} linear, RepeatWrapping
 */
export function makeWeaveNormal(size = 128) {
  const hgt = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wx = Math.sin((x / 2) * Math.PI) * 0.5 + 0.5;
      const wy = Math.sin((y / 2) * Math.PI) * 0.5 + 0.5;
      const over = ((x >> 1) + (y >> 1)) & 1 ? wx : wy;
      const grid = x % 16 < 2 || y % 16 < 2 ? 0.7 : 0;
      hgt[y * size + x] = over * 0.5 + grid;
    }
  }
  const data = new Uint8Array(size * size * 4);
  const k = 1.6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const h = (xx, yy) => hgt[((yy + size) % size) * size + ((xx + size) % size)];
      const dx = (h(x + 1, y) - h(x - 1, y)) * k;
      const dy = (h(x, y + 1) - h(x, y - 1)) * k;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      data[i] = Math.round(((-dx / l) * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round(((-dy / l) * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round(((1 / l) * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
