/**
 * AUDIO / AIRPORT — the large-interior ambience for HOLDING PATTERN.
 *
 * The terminal is one enormous hard room with a tarmac outside the glass, so
 * the bed is split the same way the building is:
 *
 *   indoor chain   HVAC room tone (low pink rumble, diffuser hiss, a motor hum)
 *                  and the escalator bank (motor, gearbox whine, step clatter)
 *                  as a real point source at the escalators, so it only
 *                  matters when you are near it. Faded up by the space probe's
 *                  "roofed" reading, down to almost nothing on the apron.
 *   outdoor chain  an airliner idling somewhere out on the far apron — exhaust
 *                  roar, fan tone and compressor whine — as a fixed point
 *                  source, so it sits in one direction as you turn. It spools
 *                  up and back down every minute or so. Indoors the shared
 *                  outdoor lowpass turns it into a rumble through the glass.
 *
 * One-shots (scheduled by ambience.js, positioned by index.js):
 *   luggage          a wheeled case rolling over floor tiles, grout joints
 *                    clicking under both axles, passing by and away
 *   terminal_chime   the two-tone chime of a ceiling PA with no announcement
 *                    after it: a descending major third, soft bell partials.
 *                    Generic by design; it is no real airport's signature.
 *
 * The one-shots are pre-rendered here, once, when the graph starts; playing
 * one is a buffer source and a gain.
 */

import { bandLimit, biquad, filterBuffer, gain, normalisePeak, osc, series, toBuffer } from './dsp.js';

/**
 * Where things are, in world metres. The map builds its level with a -90°
 * yaw (level +z -> world -x) and no offset, so these are the layout's level
 * coordinates turned into world ones. A world system may override them with
 * `world.audioAnchors = { escalator: {x,y,z}, jet: {x,y,z} }`.
 */
export const AIRPORT_ANCHORS = {
  // Escalator bank centre: level (7, 2.25, -6.1) -> world (6.1, 2.25, 7).
  escalator: { x: 6.1, y: 2.25, z: 7 },
  // An airliner idling past the far apron: level (30, 3, 140) -> world.
  jet: { x: -140, y: 3, z: 30 },
};

/* ------------------------------------------------------------------ */
/* pre-rendered one-shots                                             */
/* ------------------------------------------------------------------ */

/** A wheeled case crossing tiles: rumble + grout clicks under two axles. */
function renderLuggage(sr, rng, seconds) {
  const n = Math.floor(seconds * sr);
  const shell = new Float32Array(n);
  const wheel = new Float32Array(n);
  for (let i = 0; i < n; i++) { const w = rng.signed(); shell[i] = w; wheel[i] = rng.signed(); }
  filterBuffer(shell, 'bandpass', rng.range(280, 360), 1.3, sr);   // the case body booming
  filterBuffer(wheel, 'bandpass', rng.range(1000, 1400), 0.9, sr); // hard wheels on stone
  const speed = rng.range(1.0, 1.5);           // m/s, a brisk walk
  const tile = rng.range(0.55, 0.65);          // grout spacing
  const axle = 0.34;                           // front/back wheel spacing
  const rot = speed / 0.19;                    // wheel revolutions per second
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    // Wheel roughness: a flat-spotted wheel wobbles the level once a turn.
    const am = 1 + 0.25 * Math.sin(6.2832 * rot * t) + 0.1 * Math.sin(6.2832 * rot * 2.03 * t);
    d[i] = (shell[i] * 2.2 + wheel[i] * 1.1) * am;
  }
  // Grout joints: a short knock each time an axle crosses one.
  for (let k = 0; ; k++) {
    const t = (k * tile) / speed;
    if (t > seconds) break;
    for (const off of [0, axle / speed]) {
      const at = Math.floor((t + off) * sr);
      const a = rng.range(0.6, 1.1);
      const f = rng.range(1500, 2300);
      for (let j = 0; j < 0.02 * sr && at + j < n; j++) {
        const u = j / sr;
        d[at + j] += a * (Math.exp(-u / 0.0025) * Math.sin(6.2832 * f * u) +
          0.6 * Math.exp(-u / 0.006) * Math.sin(6.2832 * 320 * u));
      }
    }
  }
  bandLimit(d, 120, 7000, sr, 1);
  // Pass-by: in, past, away (the peak a little before the middle).
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const env = Math.pow(Math.sin(Math.PI * Math.pow(x, 0.8)), 1.6);
    d[i] *= env;
  }
  return normalisePeak(d, 0.8);
}

/** Ceiling PA chime: two soft bell tones a major third apart, descending. */
function renderChime(sr, rng, seconds) {
  const n = Math.floor(seconds * sr);
  const d = new Float32Array(n);
  const hi = rng.range(870, 890);
  const notes = [[0.0, hi], [0.62, hi * 0.8]];   // major third down
  for (const [at, f] of notes) {
    const s0 = Math.floor(at * sr);
    for (let i = s0; i < n; i++) {
      const t = (i - s0) / sr;
      const att = Math.min(1, t / 0.006);
      d[i] += att * (
        Math.exp(-t / 0.95) * Math.sin(6.2832 * f * t) +
        0.22 * Math.exp(-t / 0.4) * Math.sin(6.2832 * f * 2.0 * t) +
        0.07 * Math.exp(-t / 0.18) * Math.sin(6.2832 * f * 3.01 * t)
      );
    }
  }
  // A ceiling loudspeaker: no real low end, a soft top.
  bandLimit(d, 250, 5500, sr, 1);
  const fade = Math.floor(0.05 * sr);
  for (let i = 0; i < fade; i++) d[n - 1 - i] *= i / fade;
  return normalisePeak(d, 0.8);
}

/** Pre-render the airport one-shots. Called once, from Ambience.start(). */
export function renderAirportKit(actx, rng) {
  const sr = actx.sampleRate;
  return {
    luggage: [
      toBuffer(actx, renderLuggage(sr, rng, 5.5)),
      toBuffer(actx, renderLuggage(sr, rng, 4.2)),
      toBuffer(actx, renderLuggage(sr, rng, 6.5)),
    ],
    chime: toBuffer(actx, renderChime(sr, rng, 3.2)),
  };
}

/** Play a pre-rendered airport one-shot. Same voice contract as ambientOneShot. */
export function airportOneShot(actx, rng, kit, kind, o = {}) {
  const t0 = o.when ?? actx.currentTime;
  const lvl = o.level ?? 1;
  const src = actx.createBufferSource();
  const out = gain(actx, 0);
  src.connect(out);
  if (kind === 'terminal_chime') {
    src.buffer = kit.chime;
    out.gain.value = 0.09 * lvl;
    src.start(t0);
    // Wet: the chime is heard off the whole hall, not from one speaker. Two
    // sustained sines build up hard in a 4 s hall, so the send is not higher.
    return { node: out, end: t0 + kit.chime.duration + 0.05, send: 0.6 };
  }
  const buf = kit.luggage[(rng.u32() % kit.luggage.length) | 0];
  src.buffer = buf;
  const rate = rng.range(0.9, 1.12);
  src.playbackRate.value = rate;
  out.gain.value = 0.07 * lvl;
  src.start(t0);
  return { node: out, end: t0 + buf.duration / rate + 0.05, send: 0.45 };
}

/* ------------------------------------------------------------------ */
/* beds                                                               */
/* ------------------------------------------------------------------ */

/** Idle exhaust roar level (the spool scales it). */
const ROAR = 0.2;

function panner(actx, p, model, ref, rolloff) {
  const pn = actx.createPanner();
  pn.panningModel = 'equalpower';
  pn.distanceModel = model;
  pn.refDistance = ref;
  pn.rolloffFactor = rolloff;
  pn.maxDistance = 10000;
  if (pn.positionX) {
    pn.positionX.value = p.x; pn.positionY.value = p.y; pn.positionZ.value = p.z;
  } else {
    pn.setPosition(p.x, p.y, p.z);
  }
  return pn;
}

/**
 * Build the airport beds. `amb` is the Ambience instance (for its nodes list,
 * LFO helper and bank); `indoor` and `outdoor` are its two chains.
 * Returns handles the scheduler drives (the jet spool).
 */
export function buildAirportBeds(amb, indoor, outdoor, anchors) {
  const { actx, bank, rng } = amb;
  const keep = (...n) => { for (const x of n) amb.nodes.push(x); };
  const A = { ...AIRPORT_ANCHORS, ...(anchors ?? {}) };

  /* ---- HVAC room tone ------------------------------------------- */
  {
    const src = bank.source('pink', rng, 0.8, true);
    const hp = biquad(actx, 'highpass', 38, 0.7);
    const lp = biquad(actx, 'lowpass', 360, 0.7);
    const g = gain(actx, 0.055);
    series(src, hp, lp, g).connect(indoor);
    src.start(0, src._offset);
    amb._lfo(0.019, 0.01, g.gain);
    keep(src, hp, lp, g);

    // Air through the ceiling diffusers.
    const hs = bank.source('white', rng, 1, true);
    const bp = biquad(actx, 'bandpass', 2900, 0.55);
    const hg = gain(actx, 0.0075);
    series(hs, bp, hg).connect(indoor);
    hs.start(0, hs._offset);
    amb._lfo(0.027, 0.0018, hg.gain);
    keep(hs, bp, hg);

    // Air-handler motor: fundamental plus its second harmonic.
    const f0 = rng.range(57, 61);
    for (const [f, a] of [[f0, 0.01], [f0 * 2, 0.0035]]) {
      const o = osc(actx, 'sine', f);
      const og = gain(actx, a);
      o.connect(og); og.connect(indoor);
      o.start(0);
      keep(o, og);
    }
  }

  /* ---- escalator bank: a real point source ----------------------- */
  {
    const pn = panner(actx, A.escalator, 'exponential', 2.5, 1.6);
    pn.connect(indoor);
    const motor = osc(actx, 'sawtooth', rng.range(98, 102));
    const mlp = biquad(actx, 'lowpass', 280, 0.8);
    const mg = gain(actx, 0.22);
    series(motor, mlp, mg).connect(pn);
    const whine = osc(actx, 'sine', rng.range(410, 440));
    const wg = gain(actx, 0.04);
    whine.connect(wg); wg.connect(pn);
    // Step clatter: mid noise pulsed at the rate the steps pass the comb.
    const cs = bank.source('pink', rng, 1, true);
    const cbp = biquad(actx, 'bandpass', 950, 1.4);
    const cg = gain(actx, 0.16);
    const pulse = osc(actx, 'sine', 1.35);
    const pg = gain(actx, 0.13);
    pulse.connect(pg); pg.connect(cg.gain);
    series(cs, cbp, cg).connect(pn);
    const rb = bank.source('brown', rng, 0.9, true);
    const rhp = biquad(actx, 'highpass', 35, 0.7);
    const rlp = biquad(actx, 'lowpass', 140, 0.8);
    const rg = gain(actx, 0.45);
    series(rb, rhp, rlp, rg).connect(pn);
    motor.start(0); whine.start(0); pulse.start(0);
    cs.start(0, cs._offset); rb.start(0, rb._offset);
    keep(pn, motor, mlp, mg, whine, wg, cs, cbp, cg, pulse, pg, rb, rhp, rlp, rg);
  }

  /* ---- jet idling out on the apron ------------------------------- */
  const jet = {};
  {
    const pn = panner(actx, A.jet, 'inverse', 80, 1);
    const sum = gain(actx, 1);
    sum.connect(pn);
    pn.connect(outdoor);

    const roar = bank.source('brown', rng, 1, true);
    const rhp = biquad(actx, 'highpass', 30, 0.7);
    const rlp = biquad(actx, 'lowpass', 650, 0.7);
    const rg = gain(actx, ROAR);
    series(roar, rhp, rlp, rg).connect(sum);

    const hiss = bank.source('pink', rng, 1.1, true);
    const hbp = biquad(actx, 'bandpass', 1900, 0.7);
    const hg = gain(actx, 0.07);
    series(hiss, hbp, hg).connect(sum);

    // Fan blade-pass tone and the compressor whine above it.
    const fan = osc(actx, 'sine', 1450);
    const fg = gain(actx, 0.014);
    fan.connect(fg); fg.connect(sum);
    const comp = osc(actx, 'sine', 4350);
    const cg = gain(actx, 0.0045);
    comp.connect(cg); cg.connect(sum);
    amb._lfo(0.21, 6, fan.frequency);
    amb._lfo(0.17, 14, comp.frequency);

    roar.start(0, roar._offset); hiss.start(0, hiss._offset);
    fan.start(0); comp.start(0);
    keep(pn, sum, roar, rhp, rlp, rg, hiss, hbp, hg, fan, fg, comp, cg);
    Object.assign(jet, { roar: rg, roarLP: rlp, hiss: hg, fan, comp, fanG: fg });
  }

  return {
    /** Spool the idling engine up and back down (a pushback, a taxi start). */
    spool() {
      const t = actx.currentTime;
      const up = rng.range(4.5, 7.5);
      const hold = rng.range(3, 8);
      const down = rng.range(7, 11);
      const k = rng.range(1.3, 1.6);
      const tH = t + up, tD = tH + hold;
      const P = (param, base, peak) => {
        param.cancelScheduledValues(t);
        param.setTargetAtTime(peak, t, up * 0.4);
        param.setTargetAtTime(base, tD, down * 0.35);
      };
      P(jet.fan.frequency, 1450, 1450 * k);
      P(jet.comp.frequency, 4350, 4350 * k);
      P(jet.roar.gain, ROAR, ROAR * k * 1.15);
      P(jet.roarLP.frequency, 650, 650 * k * 1.9);
      P(jet.hiss.gain, 0.07, 0.07 * k * 2.2);
      P(jet.fanG.gain, 0.014, 0.014 * k * 1.5);
    },
  };
}
