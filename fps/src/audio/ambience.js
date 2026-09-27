/**
 * AUDIO / AMBIENCE
 *
 * Continuous beds plus a scheduler that drops positioned one-shots into the
 * world, per map:
 *
 *   town     wind, a distant city, a distant war rumble; volleys, booms,
 *            rubble, dogs, sirens, a helicopter
 *   airport  see airport.js: HVAC room tone, the escalator bank as a point
 *            source, an airliner idling on the apron that spools up now and
 *            then; rolling luggage and the ceiling PA chime as one-shots; the
 *            distant battle kept, but rarer
 *
 * Everything is driven by audio-rate LFOs rather than per-frame JS
 * automation, so the beds cost nothing on the main thread, and every scheduled
 * event's time, position, pitch and level comes from ctx.rng — the beds are
 * literally never in the same state twice, which is what kills the "looping
 * wav" tell.
 *
 * The beds react to the space probe through two chains: the outdoor chain
 * closes a lowpass and drops when the listener is enclosed (a doorway feels
 * like a doorway), the indoor chain (airport only) opens up under a roof.
 */

import { ad, biquad, clamp, gain, lerp, osc, series, struckResonator, sweep } from './dsp.js';
import { airportOneShot, buildAirportBeds, renderAirportKit } from './airport.js';

/** Per-map scheduler character. `intensity` scales the distant battle. */
const MAP_PROFILES = {
  town: { intensity: 1, wind: 0.5, oneshot: [6, 20] },
  airport: { intensity: 0.35, wind: 0.28, oneshot: [4, 11] },
};

export class Ambience {
  /**
   * @param {object} [opts] { map: 'town' | 'airport', anchors }
   */
  constructor(actx, bank, mixer, field, rng, opts = {}) {
    this.actx = actx;
    this.bank = bank;
    this.mixer = mixer;
    this.field = field;
    this.rng = rng;
    this.map = MAP_PROFILES[opts.map] ? opts.map : 'town';
    this.profile = MAP_PROFILES[this.map];
    this.anchors = opts.anchors ?? null;
    this.nodes = [];
    this.started = false;
    this.enclosure = 0;
    this.roofed = 0;
    this.intensity = this.profile.intensity; // scales the distant-battle scheduler
    this.kit = null;       // airport one-shot buffers
    this._airport = null;  // airport bed handles (jet spool)
    this._timers = { gust: 2, volley: 4, boom: 18, oneshot: 6, chatter: 25, spool: 30 };
  }

  /** Build the beds. Called once, after the graph is live. */
  start() {
    if (this.started) return;
    const { actx, bank, rng } = this;
    this.started = true;
    const airport = this.map === 'airport';

    const bus = this.mixer.bus('ambience');
    const outdoorLP = biquad(actx, 'lowpass', 20000, 0.6);
    const outdoorGain = gain(actx, 1);
    series(outdoorLP, outdoorGain).connect(bus);
    this._outdoorLP = outdoorLP;
    this._outdoorGain = outdoorGain;
    this.nodes.push(outdoorLP, outdoorGain);

    // A little of the bed goes through the reverb so interiors get a wash of
    // outside noise rather than a dead room.
    const sendTap = gain(actx, 0.22);
    outdoorGain.connect(sendTap);
    sendTap.connect(this.mixer.reverbSend);
    this.nodes.push(sendTap);

    /* ---- wind: two decorrelated brown-noise layers ---------------- */
    this._windGain = gain(actx, this.profile.wind);
    this._windGain.connect(outdoorLP);
    this.nodes.push(this._windGain);
    for (let i = 0; i < 2; i++) {
      const src = bank.source('brown', rng, rng.range(0.82, 1.15), true);
      const lp = biquad(actx, 'lowpass', rng.range(260, 520), 0.6);
      const hp = biquad(actx, 'highpass', 40, 0.7);
      const g = gain(actx, 0.5);
      const pan = actx.createStereoPanner();
      pan.pan.value = i === 0 ? -0.55 : 0.55;
      series(src, hp, lp, g, pan).connect(this._windGain);
      src.start(0, src._offset);

      // Two incommensurate LFOs per layer: the sum never repeats audibly.
      this._lfo(0.041 + i * 0.017, rng.range(0.18, 0.3), g.gain);
      this._lfo(0.0917 + i * 0.031, rng.range(0.08, 0.16), g.gain);
      this._lfo(0.037 + i * 0.023, rng.range(80, 170), lp.frequency);
      this.nodes.push(src, lp, hp, g, pan);
      this._windLayers ??= [];
      this._windLayers.push({ g, lp });
    }

    /* ---- wind whistle through edges and wires --------------------- */
    {
      const src = bank.source('white', rng, 1, true);
      const bp = biquad(actx, 'bandpass', 820, 7);
      const g = gain(actx, 0.012);
      series(src, bp, g).connect(this._windGain);
      src.start(0, src._offset);
      this._lfo(0.053, 640, bp.frequency);
      this._lfo(0.071, 0.011, g.gain);
      this.nodes.push(src, bp, g);
    }

    if (airport) {
      /* ---- indoor chain: the hall ---------------------------------- */
      const indoorGain = gain(actx, 0.1);
      indoorGain.connect(bus);
      // The hall answers its own room tone: a modest send, so the HVAC reads
      // as filling a big space rather than coming out of the wall.
      const inSend = gain(actx, 0.18);
      indoorGain.connect(inSend);
      inSend.connect(this.mixer.reverbSend);
      this._indoorGain = indoorGain;
      this.nodes.push(indoorGain, inSend);
      this.kit = renderAirportKit(actx, rng);
      this._airport = buildAirportBeds(this, indoorGain, outdoorLP, this.anchors);
    } else {
      /* ---- distant city: traffic hum, indistinct life --------------- */
      {
        const src = bank.source('pink', rng, 0.9, true);
        const lp = biquad(actx, 'lowpass', 480, 0.7);
        const hp = biquad(actx, 'highpass', 70, 0.7);
        const g = gain(actx, 0.06);
        series(src, hp, lp, g).connect(outdoorLP);
        src.start(0, src._offset);
        this._lfo(0.023, 0.025, g.gain);
        this._lfo(0.0311, 120, lp.frequency);
        this.nodes.push(src, lp, hp, g);
        this._cityGain = g;
      }

      /* ---- distant war rumble: sub-100 Hz, always there ------------- */
      {
        const src = bank.source('brown', rng, 0.7, true);
        const lp = biquad(actx, 'lowpass', 105, 0.9);
        const g = gain(actx, 0.05);
        series(src, lp, g).connect(outdoorLP);
        src.start(0, src._offset);
        this._lfo(0.0137, 0.035, g.gain);
        this.nodes.push(src, lp, g);
        this._warGain = g;
      }
    }

    this._reseedTimers();
  }

  /** Attach a slow oscillator to an AudioParam. */
  _lfo(freq, depth, param) {
    const o = osc(this.actx, 'sine', freq);
    const g = gain(this.actx, depth);
    o.connect(g);
    g.connect(param);
    o.start(this.rng.range(0, 10)); // random phase so nothing lines up
    this.nodes.push(o, g);
    return o;
  }

  _reseedTimers() {
    const r = this.rng;
    this._timers.gust = r.range(4, 14);
    this._timers.volley = r.range(3, 11);
    this._timers.boom = r.range(14, 44);
    this._timers.oneshot = r.range(this.profile.oneshot[0], this.profile.oneshot[1]);
    this._timers.chatter = r.range(18, 50);
    this._timers.spool = r.range(12, 40);
  }

  /**
   * Outdoor content is filtered and dropped when the listener is enclosed; the
   * airport's indoor chain opens up under a roof (`roofed`, 0..1).
   */
  setEnclosure(v, roofed = v) {
    this.enclosure = clamp(v, 0, 1);
    this.roofed = clamp(roofed, 0, 1);
    if (!this.started) return;
    const t = this.actx.currentTime;
    this._outdoorLP.frequency.setTargetAtTime(lerp(20000, 620, this.enclosure), t, 0.6);
    this._outdoorGain.gain.setTargetAtTime(lerp(1, 0.45, this.enclosure), t, 0.6);
    const w = this.profile.wind;
    if (this._windGain) this._windGain.gain.setTargetAtTime(lerp(w, w * 0.24, this.enclosure), t, 0.8);
    if (this._indoorGain) this._indoorGain.gain.setTargetAtTime(lerp(0.1, 1, this.roofed), t, 0.8);
  }

  update(dt, api) {
    if (!this.started) return;
    const r = this.rng;
    const T = this._timers;

    T.gust -= dt;
    if (T.gust <= 0) {
      T.gust = r.range(5, 16);
      this._gust();
    }

    T.volley -= dt;
    if (T.volley <= 0) {
      T.volley = r.range(2.5, 12) / clamp(this.intensity, 0.25, 2);
      api?.distantVolley?.();
    }

    T.boom -= dt;
    if (T.boom <= 0) {
      T.boom = r.range(16, 50) / clamp(this.intensity, 0.25, 2);
      api?.distantBoom?.();
    }

    T.oneshot -= dt;
    if (T.oneshot <= 0) {
      T.oneshot = r.range(this.profile.oneshot[0], this.profile.oneshot[1]);
      api?.oneShot?.();
    }

    T.chatter -= dt;
    if (T.chatter <= 0) {
      T.chatter = r.range(20, 60);
      api?.distantChatter?.();
    }

    if (this._airport) {
      T.spool -= dt;
      if (T.spool <= 0) {
        T.spool = r.range(35, 80);
        this._airport.spool();
      }
    }
  }

  /** A gust: level swell plus the lowpass opening as the air speeds up. */
  _gust() {
    const t = this.actx.currentTime;
    const r = this.rng;
    const dur = r.range(2.2, 6.5);
    const strength = r.range(0.25, 1) * lerp(1, 0.25, this.enclosure);
    for (const l of this._windLayers ?? []) {
      const peak = 0.5 + 0.5 * strength * r.range(0.7, 1.2);
      l.g.gain.setTargetAtTime(peak, t + r.range(0, 0.5), dur * 0.28);
      l.g.gain.setTargetAtTime(0.5, t + dur * 0.55, dur * 0.4);
      const f = l.lp.frequency.value;
      l.lp.frequency.setTargetAtTime(f * (1 + strength * 0.9), t, dur * 0.3);
      l.lp.frequency.setTargetAtTime(f, t + dur * 0.6, dur * 0.5);
    }
  }

  dispose() {
    for (const n of this.nodes) {
      try { n.stop?.(); } catch { /* not a source */ }
      n.disconnect();
    }
    this.nodes.length = 0;
    this.kit = null;
    this._airport = null;
    this.started = false;
  }
}

/* ------------------------------------------------------------------ */
/* Positioned ambient one-shots                                       */
/* ------------------------------------------------------------------ */

/**
 * The scheduler's one-shot tables, per map, as relative pick weights.
 *   town     a war-damaged border town, mostly empty
 *   airport  a terminal mid-evacuation: abandoned luggage still rolling, the
 *            ceiling PA chiming with nobody left to make the announcement
 */
export const ONE_SHOT_TABLES = {
  town: {
    settle: 1.4,   // rubble and roof tin shifting
    creak: 1.2,
    vehicle: 1.2,
    shout: 1.1,
    birds: 1.0,
    dog: 1.0,
    heli: 1.0,
    siren: 0.8,
  },
  airport: {
    luggage: 1.8,
    terminal_chime: 0.7,
    vehicle: 0.6,  // a tug or a baggage train out on the apron
    shout: 0.5,
    creak: 0.4,    // the roof steel moving in the sun
  },
};

/** Every one-shot the synth can build (debug storm, self test). */
export const ONE_SHOTS = [...new Set(Object.values(ONE_SHOT_TABLES).flatMap(Object.keys))];

/** One-shots rendered from the airport kit rather than synthesised live. */
export const KIT_ONE_SHOTS = new Set(['luggage', 'terminal_chime']);

/** Metres from the listener a one-shot is placed at: [min, max]. */
export const ONE_SHOT_RANGE = {
  default: [14, 90],
  heli: [90, 260],
  siren: [120, 300],
  luggage: [5, 28],         // somebody's case, a few gates down
  terminal_chime: [8, 30],  // the nearest ceiling speaker
};

/** Placed above the rooftops: no occlusion, big makeup gain. */
export const ONE_SHOT_FAR = new Set(['heli', 'siren']);

/** Weighted pick. Deterministic — `rng` is always a ctx.rng fork. */
export function pickOneShot(rng, map = 'town') {
  const table = ONE_SHOT_TABLES[map] ?? ONE_SHOT_TABLES.town;
  let total = 0;
  for (const k in table) total += table[k];
  let r = rng.range(0, total);
  let last = 'settle';
  for (const k in table) {
    r -= table[k];
    last = k;
    if (r <= 0) return k;
  }
  return last;
}

export function ambientOneShot(actx, bank, rng, kind, o = {}) {
  // Pre-rendered airport voices. Without a kit (another map) they fall
  // through to the default below rather than throwing.
  if (KIT_ONE_SHOTS.has(kind) && o.kit) return airportOneShot(actx, rng, o.kit, kind, o);
  const t0 = o.when ?? actx.currentTime;
  const out = gain(actx, 0.55); // VOICE TRIM
  const lvl = o.level ?? 1;
  let end = t0 + 1;

  switch (kind) {
    case 'dog': {
      // Two or three barks, each a short formant-ish yelp.
      const n = 2 + ((rng.u32() % 2) | 0);
      for (let i = 0; i < n; i++) {
        const bt = t0 + i * rng.range(0.24, 0.44);
        const o1 = osc(actx, 'sawtooth', rng.range(220, 340));
        const bp = biquad(actx, 'bandpass', rng.range(700, 1200), 2.2);
        const g = gain(actx, 0);
        series(o1, bp, g).connect(out);
        sweep(o1.frequency, bt, rng.range(300, 420), rng.range(150, 220), 0.11);
        ad(g.gain, bt, 0.5 * lvl, 0.01, 0.1);
        o1.start(bt); o1.stop(bt + 0.3);
        const ns = bank.source('white', rng, 1);
        const nbp = biquad(actx, 'bandpass', 2400, 1.2);
        const ng = gain(actx, 0);
        series(ns, nbp, ng).connect(out);
        ad(ng.gain, bt, 0.12 * lvl, 0.008, 0.08);
        ns.start(bt, ns._offset, 0.2);
        end = bt + 0.4;
      }
      return { node: out, end, send: 0.7 };
    }
    case 'siren': {
      // Distant two-tone, wailing, drifting in and out.
      const dur = rng.range(4, 9);
      const o1 = osc(actx, 'sine', 620);
      const o2 = osc(actx, 'sine', 930);
      const g = gain(actx, 0);
      const lp = biquad(actx, 'lowpass', 1800, 0.8);
      o1.connect(g); o2.connect(g); series(g, lp).connect(out);
      const wob = osc(actx, 'sine', rng.range(0.35, 0.6));
      const wg = gain(actx, 110);
      wob.connect(wg); wg.connect(o1.frequency); wg.connect(o2.frequency);
      wob.start(t0);
      ad(g.gain, t0, 0.022 * lvl, dur * 0.3, dur * 0.7);
      o1.start(t0); o2.start(t0);
      o1.stop(t0 + dur + 0.5); o2.stop(t0 + dur + 0.5); wob.stop(t0 + dur + 0.5);
      return { node: out, end: t0 + dur + 0.6, send: 1.1 };
    }
    case 'creak': {
      // Metal fatigue: a high-Q band swept slowly, plus a final pop.
      const dur = rng.range(0.9, 2.4);
      const src = bank.source('white', rng, rng.range(0.6, 1));
      const bp = biquad(actx, 'bandpass', 900, 22);
      const g = gain(actx, 0);
      series(src, bp, g).connect(out);
      sweep(bp.frequency, t0, rng.range(500, 900), rng.range(1100, 2200), dur);
      ad(g.gain, t0, 0.3 * lvl, dur * 0.3, dur * 0.8);
      src.start(t0, src._offset, dur * 1.5);
      struckResonator(actx, bank, rng, t0 + dur * 0.9, [
        { f: rng.range(400, 1400), q: 20, g: 0.18 * lvl, decay: 0.1 },
      ], 0.003).connect(out);
      return { node: out, end: t0 + dur * 1.6, send: 0.8 };
    }
    case 'settle': {
      // Rubble shifting: a handful of grains and a soft low thump.
      for (let i = 0; i < 7; i++) {
        struckResonator(actx, bank, rng, t0 + rng.range(0, 0.7), [
          { f: rng.range(600, 5000), q: rng.range(8, 26), g: rng.range(0.02, 0.09) * lvl, decay: rng.range(0.01, 0.07) },
        ], 0.002).connect(out);
      }
      const b = osc(actx, 'sine', 90);
      const g = gain(actx, 0);
      b.connect(g); g.connect(out);
      sweep(b.frequency, t0, 110, 55, 0.15);
      ad(g.gain, t0, 0.14 * lvl, 0.01, 0.16);
      b.start(t0); b.stop(t0 + 0.4);
      return { node: out, end: t0 + 1.1, send: 0.6 };
    }
    case 'birds': {
      const n = 3 + ((rng.u32() % 5) | 0);
      for (let i = 0; i < n; i++) {
        const bt = t0 + rng.range(0, 1.4);
        const o1 = osc(actx, 'sine', 3200);
        const g = gain(actx, 0);
        o1.connect(g); g.connect(out);
        const up = rng.float() < 0.5;
        sweep(o1.frequency, bt, up ? 2600 : 4400, up ? 4600 : 2700, 0.06);
        ad(g.gain, bt, 0.05 * lvl, 0.008, 0.06);
        o1.start(bt); o1.stop(bt + 0.2);
      }
      return { node: out, end: t0 + 1.8, send: 0.9 };
    }
    case 'vehicle': {
      // A truck passing somewhere out of sight.
      const dur = rng.range(3.5, 7);
      const src = bank.source('brown', rng, rng.range(0.7, 1));
      const lp = biquad(actx, 'lowpass', 300, 0.9);
      const g = gain(actx, 0);
      series(src, lp, g).connect(out);
      sweep(lp.frequency, t0, 200, 460, dur * 0.5);
      sweep(lp.frequency, t0 + dur * 0.5, 460, 180, dur * 0.5);
      ad(g.gain, t0, 0.16 * lvl, dur * 0.45, dur * 0.55);
      src.start(t0, src._offset, dur * 1.2);
      // Engine order: a low buzz that follows the same envelope.
      const e = osc(actx, 'sawtooth', rng.range(52, 78));
      const eg = gain(actx, 0);
      const elp = biquad(actx, 'lowpass', 240, 1.2);
      e.connect(eg); series(eg, elp).connect(out);
      ad(eg.gain, t0, 0.035 * lvl, dur * 0.45, dur * 0.55);
      e.start(t0); e.stop(t0 + dur * 1.2);
      return { node: out, end: t0 + dur * 1.3, send: 0.7 };
    }
    case 'heli': {
      // Rotor thump: an amplitude-modulated dark noise bed, no sample needed.
      const dur = rng.range(6, 12);
      const src = bank.source('brown', rng, rng.range(0.8, 1.1));
      const lp = biquad(actx, 'lowpass', 420, 0.9);
      const g = gain(actx, 0);
      // Blade-pass modulation: a separate multiplier, because an LFO connected
      // to a gain param sums with the envelope instead of scaling it.
      const am = gain(actx, 0.45);
      series(src, lp, g, am).connect(out);
      ad(g.gain, t0, 2.1 * lvl, dur * 0.4, dur * 0.6);
      src.start(t0, src._offset, dur * 1.2);
      const thump = osc(actx, 'sine', rng.range(4.6, 6.4));
      const tg = gain(actx, 0.5);
      thump.connect(tg); tg.connect(am.gain);
      thump.start(t0); thump.stop(t0 + dur * 1.2);
      // Turbine whine an octave-ish above the blade rate harmonics.
      const w = osc(actx, 'sawtooth', rng.range(280, 420));
      const wbp = biquad(actx, 'bandpass', 1400, 6);
      const wg = gain(actx, 0);
      series(w, wbp, wg).connect(out);
      ad(wg.gain, t0, 0.11 * lvl, dur * 0.4, dur * 0.6);
      w.start(t0); w.stop(t0 + dur * 1.2);
      return { node: out, end: t0 + dur * 1.3, send: 0.9 };
    }
    case 'shout':
    default: {
      // Unintelligible distant shouting — deliberately just contour, no words.
      const dur = rng.range(0.3, 0.7);
      const o1 = osc(actx, 'sawtooth', rng.range(110, 160));
      const bp1 = biquad(actx, 'bandpass', rng.range(600, 900), 4);
      const bp2 = biquad(actx, 'bandpass', rng.range(1300, 2000), 5);
      const g = gain(actx, 0);
      o1.connect(bp1); o1.connect(bp2);
      bp1.connect(g); bp2.connect(g);
      const lp = biquad(actx, 'lowpass', 2600, 0.8);
      series(g, lp).connect(out);
      sweep(o1.frequency, t0, rng.range(130, 170), rng.range(95, 125), dur);
      ad(g.gain, t0, 0.2 * lvl, 0.05, dur);
      o1.start(t0); o1.stop(t0 + dur + 0.2);
      return { node: out, end: t0 + dur + 0.3, send: 1.2 };
    }
  }
}
