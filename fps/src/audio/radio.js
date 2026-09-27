/**
 * AUDIO / RADIO — the texture of the comms net, not the words.
 *
 * The UI subtitles every radio line; nothing here synthesises speech. What the
 * player hears is the part of a radio call that is not the voice:
 *
 *   Command   squelch-open (key-up pop + a short burst of open-channel noise),
 *             a band-limited 300–3000 Hz carrier bed held for exactly as long
 *             as the subtitle is up, then the squelch tail — the "kssht" of the
 *             far end unkeying and the receiver closing.
 *   Doug      the player's own push-to-talk: a mechanical click close to the
 *             ear, much quieter, far less filtered (140–6500 Hz), a faint bed
 *             and a softer release click. No squelch burst — you do not hear
 *             your own squelch.
 *   Enemy     a handheld on an enemy's vest, heard across the room: narrower
 *             band (520–2300 Hz), hard-clipped, full of crackle and dropouts.
 *             Positioned at the enemy, so it goes through the same distance,
 *             occlusion and reverb path as everything else in the world.
 *
 * Every buffer is rendered once, in JS, when the graph starts. A transmission
 * costs three buffer sources and four gains, all built on an event (never per
 * frame), and the carrier bed is a seamless loop so a seven-second line costs
 * the same as a one-second one.
 */

import {
  bandLimit, clamp, gain, normalisePeak, normaliseRms, toBuffer,
} from './dsp.js';

const CMD_BAND = [300, 3000];
const DOUG_BAND = [140, 6500];
const ENEMY_BAND = [520, 2300];

/** Playback levels of each layer (buffers are normalised, these set the mix). */
const LVL = {
  cmdOpen: 1.25, cmdBed: 0.25, cmdTail: 0.68,
  dougOpen: 0.5, dougBed: 0.07, dougTail: 0.2,
  enemyOpen: 0.55, enemyBed: 0.34, enemyTail: 0.5,
};

/* ------------------------------------------------------------------ */
/* buffer renderers (init only)                                       */
/* ------------------------------------------------------------------ */

function fadeEdges(d, sr, inS, outS) {
  const ni = Math.floor(inS * sr), no = Math.floor(outS * sr), n = d.length;
  for (let i = 0; i < ni && i < n; i++) d[i] *= i / ni;
  for (let i = 0; i < no && i < n; i++) d[n - 1 - i] *= i / no;
}

function softClip(d, drive) {
  const k = Math.tanh(drive);
  for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * drive) / k;
}

/** Sparse impulsive ticks: static on the channel. */
function addTicks(d, sr, rng, perSecond, amp) {
  const count = Math.round((d.length / sr) * perSecond);
  for (let k = 0; k < count; k++) {
    const at = (rng.u32() % d.length) | 0;
    const a = amp * rng.range(0.4, 1.3) * (rng.float() < 0.5 ? -1 : 1);
    const dec = rng.range(0.0004, 0.0022) * sr;
    for (let j = 0; j < dec * 5 && at + j < d.length; j++) d[at + j] += a * Math.exp(-j / dec) * rng.signed();
  }
}

/**
 * Squelch open: a DC step from the transmitter keying up (becomes a sharp pop
 * once band-limited) followed by a ~30 ms burst of open-channel noise.
 */
function renderOpen(sr, rng, band, seconds, drive) {
  const n = Math.floor(seconds * sr);
  const d = new Float32Array(n);
  const s0 = 0.0015 * sr, relax = 0.004 * sr;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    d[i] = 0.9 * (i < s0 ? 1 : Math.exp(-(i - s0) / relax));
    if (t > 0.003) {
      const u = t - 0.003;
      const env = (1 - Math.exp(-u / 0.0015)) * Math.exp(-u / 0.028);
      d[i] += rng.signed() * 0.75 * env;
    }
  }
  bandLimit(d, band[0], band[1], sr, 2);
  softClip(d, drive);
  fadeEdges(d, sr, 0.0003, 0.01);
  return normalisePeak(d, 0.9);
}

/**
 * The carrier bed: band-limited hiss with slow multipath fading and a little
 * static, looping seamlessly. `choppy` adds dropouts (the enemy's cheap set).
 */
function renderBed(sr, rng, band, seconds, o) {
  const n = Math.floor(seconds * sr);
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = rng.signed();
  addTicks(d, sr, rng, o.crackle, o.tickAmp ?? 3);
  bandLimit(d, band[0], band[1], sr, 2, true);
  normaliseRms(d, 0.25);
  // Fading: loop-periodic (whole cycles per loop), so the seam is invisible.
  const f1 = Math.max(1, Math.round(0.8 * seconds)) / seconds;
  const f2 = Math.max(1, Math.round(2.3 * seconds)) / seconds;
  const p1 = rng.range(0, 6.28), p2 = rng.range(0, 6.28);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const m = (0.5 + 0.5 * Math.sin(6.2832 * f1 * t + p1)) * (0.6 + 0.4 * Math.sin(6.2832 * f2 * t + p2));
    d[i] *= 1 - o.fade * m;
  }
  if (o.choppy) {
    // Dropouts: the signal collapses for 15–70 ms, a few times a second.
    const drops = Math.round(seconds * o.choppy);
    for (let k = 0; k < drops; k++) {
      const at = Math.floor(rng.range(0.05, 0.95) * n);
      const len = Math.floor(rng.range(0.015, 0.07) * sr);
      const depth = rng.range(0.08, 0.3);
      for (let j = 0; j < len && at + j < n; j++) {
        const e = Math.min(1, j / 40, (len - j) / 40);
        d[at + j] *= 1 - (1 - depth) * e;
      }
    }
    // A faint heterodyne whistle drifting across the band.
    const fw = Math.max(1, Math.round(0.35 * seconds)) / seconds;
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const f = 1250 + 160 * Math.sin(6.2832 * fw * (i / sr));
      ph += (6.2832 * f) / sr;
      d[i] += 0.035 * Math.sin(ph);
    }
  }
  if (o.drive) softClip(d, o.drive);
  return normaliseRms(d, 0.25);
}

/**
 * Squelch tail: the far end unkeys — a hiss burst (pre-emphasised, so it is
 * brighter than the bed) that holds ~140 ms and then snaps shut.
 */
function renderTail(sr, rng, band, seconds, drive) {
  const n = Math.floor(seconds * sr);
  const d = new Float32Array(n);
  let prev = 0;
  const close = 0.19;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const att = 1 - Math.exp(-t / 0.004);
    const env = t < 0.14 ? att * (1 - t * 1.6) : (1 - 0.14 * 1.6) * Math.exp(-(t - 0.14) / 0.022);
    const w = rng.signed();
    d[i] = (w - 0.55 * prev) * env; // first-difference pre-emphasis
    prev = w;
    // Unkey pop at the start and the squelch gate snapping shut.
    if (t < 0.006) d[i] += 0.45 * Math.exp(-t / 0.0015);
    if (t > close) d[i] -= 0.4 * Math.exp(-(t - close) / 0.0018);
  }
  bandLimit(d, band[0], band[1], sr, 2);
  softClip(d, drive);
  fadeEdges(d, sr, 0.0003, 0.012);
  return normalisePeak(d, 0.85);
}

/**
 * Push-to-talk switch: two small mechanical transients a few ms apart (press
 * and seat), a little body thump. `release` reverses and softens it.
 */
function renderClick(sr, rng, band, seconds, release) {
  const n = Math.floor(seconds * sr);
  const d = new Float32Array(n);
  const hits = release ? [[0.002, 0.55], [0.0085, 1]] : [[0.002, 1], [0.009, 0.5]];
  for (const [at, a] of hits) {
    const f1 = rng.range(2300, 2900), f2 = rng.range(3900, 4600), f3 = rng.range(700, 950);
    for (let i = Math.floor(at * sr); i < n; i++) {
      const t = i / sr - at;
      d[i] += a * (Math.exp(-t / 0.0009) * Math.sin(6.2832 * f1 * t) * 0.8 +
        Math.exp(-t / 0.0006) * Math.sin(6.2832 * f2 * t) * 0.5 +
        Math.exp(-t / 0.0025) * Math.sin(6.2832 * f3 * t) * 0.45);
    }
  }
  bandLimit(d, band[0], band[1], sr, 1);
  fadeEdges(d, sr, 0.0005, 0.008);
  return normalisePeak(d, 0.8);
}

/* ------------------------------------------------------------------ */
/* runtime                                                            */
/* ------------------------------------------------------------------ */

export class RadioComms {
  /**
   * @param {BaseAudioContext} actx
   * @param {import('../core/rng.js').Rng} rng
   */
  constructor(actx, rng) {
    this.actx = actx;
    this.rng = rng;
    const sr = actx.sampleRate;
    const B = (d) => toBuffer(actx, d);
    this.buf = {
      cmdOpen: B(renderOpen(sr, rng, CMD_BAND, 0.11, 1.8)),
      cmdBed: B(renderBed(sr, rng, CMD_BAND, 3, { crackle: 5, fade: 0.22, drive: 1.2 })),
      cmdTail: B(renderTail(sr, rng, CMD_BAND, 0.3, 1.6)),
      dougOpen: B(renderClick(sr, rng, DOUG_BAND, 0.04, false)),
      dougBed: B(renderBed(sr, rng, DOUG_BAND, 2, { crackle: 1.5, fade: 0.1 })),
      dougTail: B(renderClick(sr, rng, DOUG_BAND, 0.04, true)),
      enemyOpen: B(renderOpen(sr, rng, ENEMY_BAND, 0.09, 4.5)),
      enemyBed: B(renderBed(sr, rng, ENEMY_BAND, 2.6, {
        crackle: 22, tickAmp: 5, fade: 0.45, choppy: 4, drive: 4,
      })),
      enemyTail: B(renderTail(sr, rng, ENEMY_BAND, 0.28, 4)),
    };
    // The one live Command/Doug transmission, so a higher-priority line can
    // cut it. Reused, never reallocated.
    this._cur = { bed: null, bedGain: null, tail: null, tailAt: 0, end: 0 };
  }

  /** A buffer one-shot into `out`. */
  _one(buffer, when, level, out) {
    const src = this.actx.createBufferSource();
    src.buffer = buffer;
    const g = gain(this.actx, level);
    src.connect(g);
    g.connect(out);
    src.start(when);
    return src;
  }

  /** Looped bed from `when` to `tEnd`, with 40 ms fades. */
  _bed(buffer, when, tEnd, level, out) {
    const src = this.actx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const g = gain(this.actx, 0);
    src.connect(g);
    g.connect(out);
    const fade = Math.min(0.04, (tEnd - when) * 0.3);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(level, when + fade);
    g.gain.setValueAtTime(level, tEnd - fade);
    g.gain.linearRampToValueAtTime(0, tEnd);
    src.start(when, this.rng.range(0, buffer.duration * 0.9));
    src.stop(tEnd + 0.02);
    return { src, g };
  }

  get active() {
    return this._cur.bed !== null && this.actx.currentTime < this._cur.end;
  }

  /** Close the live transmission now (an interruption, or the net cleared). */
  cut(t = this.actx.currentTime) {
    const c = this._cur;
    if (!c.bed || t >= c.end) return;
    try {
      c.bedGain.gain.cancelScheduledValues(t);
      c.bedGain.gain.setTargetAtTime(0, t, 0.008);
      c.bed.stop(t + 0.05);
      // A tail already under way is left to finish: it is the close.
      if (t < c.tailAt) c.tail.stop(t);
    } catch { /* already stopped */ }
    c.bed = c.bedGain = c.tail = null;
    c.end = 0;
  }

  /**
   * Command or Doug keying the net for `dur` seconds (the subtitle's life).
   * Returns a voice: { node, end, send }.
   */
  transmission(speaker, when, dur, level = 1) {
    const B = this.buf;
    const doug = speaker === 'doug';
    const out = gain(this.actx, level);
    const tEnd = when + Math.max(0.35, dur);
    this._one(doug ? B.dougOpen : B.cmdOpen, when, doug ? LVL.dougOpen : LVL.cmdOpen, out);
    const bedStart = when + (doug ? 0.006 : 0.025);
    const bed = this._bed(doug ? B.dougBed : B.cmdBed, bedStart, tEnd,
      doug ? LVL.dougBed : LVL.cmdBed, out);
    const tailBuf = doug ? B.dougTail : B.cmdTail;
    const tailAt = tEnd - 0.01;
    const tail = this._one(tailBuf, tailAt, doug ? LVL.dougTail : LVL.cmdTail, out);
    const end = tEnd + tailBuf.duration + 0.02;
    const c = this._cur;
    c.bed = bed.src; c.bedGain = bed.g; c.tail = tail; c.tailAt = tailAt; c.end = end;
    return { node: out, end, send: 0 };
  }

  /** An enemy handheld: positioned by the caller. */
  enemy(when, dur, level = 1) {
    const B = this.buf;
    const out = gain(this.actx, level);
    const tEnd = when + clamp(dur, 0.4, 4);
    this._one(B.enemyOpen, when, LVL.enemyOpen, out);
    this._bed(B.enemyBed, when + 0.02, tEnd, LVL.enemyBed, out);
    this._one(B.enemyTail, tEnd - 0.01, LVL.enemyTail, out);
    return { node: out, end: tEnd + B.enemyTail.duration + 0.02, send: 0.35 };
  }
}

// Exported for the self test's band-energy check.
export const RADIO_BANDS = { command: CMD_BAND, doug: DOUG_BAND, enemy: ENEMY_BAND };
