/**
 * AUDIO / VOICE — formant synthesis for enemy barks
 *
 * No speech samples, so barks are built the way a vocal tract works:
 *
 *   glottal pulse train (PeriodicWave, 1/n^1.15 harmonics)
 *     + aspiration noise
 *     ─► three parallel band-passes at the formant frequencies F1..F3
 *     ─► chest/throat shaping, presence peak, mild saturation (shouting)
 *     + separately mixed consonant bursts (plosives and fricatives)
 *
 * The formant centres are ramped between vowels, the f0 follows a per-syllable
 * pitch contour, and both are jittered every ~25 ms. That jitter is the single
 * most important ingredient: without it the result is a Speak&Spell, with it a
 * player reads it as a human shouting a word they cannot quite make out — which
 * is exactly the goal for enemy chatter at 30 m.
 */

import { ad, adsr, biquad, clamp, gain, hit, osc, saturationCurve, series, shaper, sweep } from './dsp.js';

/** F1, F2, F3 (Hz) and their bandwidths, adult male, shouted register. */
const VOWELS = {
  a: [730, 1090, 2440, 110, 130, 180],  // "father"
  e: [530, 1840, 2480, 90, 120, 170],   // "bed"
  i: [300, 2290, 3010, 70, 130, 190],   // "see"
  o: [570, 840, 2410, 90, 110, 170],    // "law"
  u: [325, 700, 2530, 70, 100, 170],    // "boot"
  ah: [640, 1200, 2500, 110, 140, 190],
  ehr: [490, 1350, 1690, 100, 130, 180], // "her"
  ohh: [450, 900, 2300, 95, 115, 175],
};

/**
 * Bark scripts. Each syllable: v vowel, d duration, a amplitude, p pitch
 * multiplier, on onset consonant ('p' plosive, 'f' fricative, 'n' nasal),
 * g gap after the syllable.
 */
export const BARKS = {
  /* "CONTACT!" */
  contact: {
    f0: 1.18, drive: 1.25, syl: [
      { v: 'o', d: 0.13, a: 1.0, p: 1.06, on: 'p', g: 0.012 },
      { v: 'a', d: 0.19, a: 1.0, p: 1.16, on: 'p', g: 0 },
    ],
  },
  /* "ENEMY SPOTTED" */
  spotted: {
    f0: 1.1, drive: 1.1, syl: [
      { v: 'e', d: 0.1, a: 0.9, p: 1.05, g: 0.01 },
      { v: 'a', d: 0.08, a: 0.7, p: 1.0, on: 'n', g: 0.01 },
      { v: 'i', d: 0.1, a: 0.8, p: 0.95, g: 0.06 },
      { v: 'a', d: 0.12, a: 1.0, p: 1.1, on: 'f', g: 0.02 },
      { v: 'e', d: 0.13, a: 0.75, p: 0.9, on: 'p', g: 0 },
    ],
  },
  /* "RELOADING!" */
  reloading: {
    f0: 1.05, drive: 1.0, syl: [
      { v: 'i', d: 0.09, a: 0.8, p: 1.0, g: 0.01 },
      { v: 'ohh', d: 0.16, a: 1.0, p: 1.12, g: 0.015 },
      { v: 'i', d: 0.13, a: 0.7, p: 0.9, on: 'p', g: 0 },
    ],
  },
  /* "GRENADE!" — panicked, pitch climbs hard */
  grenade: {
    f0: 1.3, drive: 1.5, syl: [
      { v: 'e', d: 0.1, a: 0.9, p: 1.0, on: 'p', g: 0.012 },
      { v: 'a', d: 0.26, a: 1.15, p: 1.35, on: 'n', g: 0 },
    ],
  },
  /* "FLANKING!" */
  flanking: {
    f0: 1.12, drive: 1.2, syl: [
      { v: 'a', d: 0.16, a: 1.0, p: 1.1, on: 'f', g: 0.015 },
      { v: 'i', d: 0.13, a: 0.8, p: 0.95, on: 'n', g: 0 },
    ],
  },
  /* "SUPPRESSING FIRE!" */
  suppressing: {
    f0: 1.08, drive: 1.15, syl: [
      { v: 'u', d: 0.09, a: 0.75, p: 0.98, on: 'f', g: 0.01 },
      { v: 'e', d: 0.14, a: 1.0, p: 1.12, on: 'p', g: 0.02 },
      { v: 'i', d: 0.1, a: 0.7, p: 0.9, g: 0.05 },
      { v: 'a', d: 0.18, a: 0.95, p: 1.05, on: 'f', g: 0 },
    ],
  },
  /* "MOVE UP!" */
  moveup: {
    f0: 1.1, drive: 1.2, syl: [
      { v: 'u', d: 0.16, a: 1.0, p: 1.08, on: 'n', g: 0.03 },
      { v: 'a', d: 0.14, a: 0.9, p: 1.0, g: 0 },
    ],
  },
  /* wordless taking-fire grunt */
  hit: {
    f0: 1.25, drive: 1.6, breath: 0.5, syl: [
      { v: 'ah', d: 0.16, a: 1.1, p: 1.2, on: 'p', g: 0 },
    ],
  },
  /* pain, longer, wavering */
  pain: {
    f0: 1.15, drive: 1.3, breath: 0.65, tremolo: 14, syl: [
      { v: 'ah', d: 0.34, a: 0.95, p: 1.0, g: 0 },
    ],
  },
  /* death: pitch collapses, breath takes over, ends in an exhale */
  death: {
    f0: 1.05, drive: 1.4, breath: 1.0, tremolo: 22, dying: true, syl: [
      { v: 'ah', d: 0.3, a: 1.0, p: 1.15, g: 0.02 },
      { v: 'ehr', d: 0.42, a: 0.6, p: 0.62, g: 0 },
    ],
  },
  /* short affirmative, for squad chatter */
  copy: {
    f0: 1.0, drive: 0.9, syl: [
      { v: 'a', d: 0.1, a: 0.85, p: 1.0, on: 'p', g: 0.02 },
      { v: 'i', d: 0.12, a: 0.7, p: 0.88, on: 'p', g: 0 },
    ],
  },

  /* ---------------- PA announcer (played with `pa: true`) ----------------
   * These are CADENCE, not words. The horn eats the consonants and the player
   * never resolves the syllables into English — the banner on screen carries
   * the literal copy. What has to survive the horn is the rhythm: an even,
   * measured phrase, a beat of air in the middle where a real announcer breathes,
   * and a settled fall on the last syllable. Long durations, low f0, almost no
   * jitter: authority, not panic. Combat barks are the opposite of all four.
   * -------------------------------------------------------------------- */

  /* "LEGACY CORE INBOUND" — 3 + 3, phrase break before the noun, lifts into
     "CORE" and lands flat. The announcer is reading a status board. */
  pa_wave: {
    f0: 0.92, drive: 0.8, breath: 0.1, jitter: 0.006, syl: [
      { v: 'e', d: 0.15, a: 0.9, p: 1.0, g: 0.02 },
      { v: 'a', d: 0.13, a: 0.75, p: 0.97, g: 0.02 },
      { v: 'i', d: 0.14, a: 0.8, p: 1.02, g: 0.1 },
      { v: 'o', d: 0.22, a: 1.0, p: 1.08, on: 'p', g: 0.03 },
      { v: 'i', d: 0.13, a: 0.8, p: 1.0, g: 0.02 },
      { v: 'ah', d: 0.3, a: 0.95, p: 0.9, on: 'n', g: 0 },
    ],
  },

  /* "WAVE SETTLED — STAND BY" — opens on the stressed long vowel, sags through
     the middle, resolves down. This is the breather beat: it must sound relieved
     without sounding cheerful. */
  pa_settled: {
    f0: 0.88, drive: 0.75, breath: 0.12, jitter: 0.005, syl: [
      { v: 'a', d: 0.2, a: 0.95, p: 1.04, g: 0.03 },
      { v: 'e', d: 0.14, a: 0.85, p: 1.0, on: 'f', g: 0.015 },
      { v: 'ehr', d: 0.16, a: 0.7, p: 0.94, g: 0.11 },
      { v: 'a', d: 0.18, a: 0.85, p: 0.98, g: 0.02 },
      { v: 'i', d: 0.3, a: 0.75, p: 0.88, on: 'p', g: 0 },
    ],
  },

  /* "RUN SETTLED — CLEAR THE FLOOR" — slower than the other two, a full tone
     lower, and the last syllable drops away instead of landing. The verdict. */
  pa_over: {
    f0: 0.82, drive: 0.7, breath: 0.16, jitter: 0.004, syl: [
      { v: 'u', d: 0.22, a: 0.9, p: 1.0, g: 0.025 },
      { v: 'e', d: 0.16, a: 0.85, p: 0.98, on: 'f', g: 0.02 },
      { v: 'ehr', d: 0.18, a: 0.7, p: 0.92, g: 0.13 },
      { v: 'i', d: 0.2, a: 0.85, p: 0.95, g: 0.02 },
      { v: 'ohh', d: 0.16, a: 0.7, p: 0.88, g: 0.02 },
      { v: 'o', d: 0.4, a: 0.9, p: 0.78, g: 0 },
    ],
  },
};

/**
 * Game-loop moment → announcer script + a fixed voice. The f0/tract are pinned
 * (combat barks randomise theirs per agent) so the PA is recognisably the same
 * person every wave of every run.
 */
export const ANNOUNCE = {
  wave:      { bark: 'pa_wave',    f0: 104, tract: 1.02 },
  waveClear: { bark: 'pa_settled', f0: 104, tract: 1.02 },
  over:      { bark: 'pa_over',    f0: 101, tract: 1.03 },
};

/** Seconds the two-tone chime runs before the announcer's first syllable. */
export const PA_LEAD = 0.62;

const WAVE_CACHE = new WeakMap();

/** Glottal-ish pulse: strong fundamental, 1/n^1.15 rolloff, alternating phase. */
function glottalWave(actx) {
  let w = WAVE_CACHE.get(actx);
  if (w) return w;
  const N = 40;
  const real = new Float32Array(N);
  const imag = new Float32Array(N);
  for (let n = 1; n < N; n++) {
    imag[n] = (1 / Math.pow(n, 1.15)) * (n % 2 === 0 ? -0.75 : 1);
  }
  w = actx.createPeriodicWave(real, imag, { disableNormalization: false });
  WAVE_CACHE.set(actx, w);
  return w;
}

/**
 * Synthesize a bark.
 *
 * @param {object} o { when, bark, f0 (base Hz), tract (0.9..1.1), level,
 *                     radio (bool), pa (bool), distance }
 */
export function bark(actx, bank, rng, o = {}) {
  const spec = BARKS[o.bark] ?? BARKS.contact;
  // A PA transmission opens with its two-tone chime, so the voice starts a
  // beat late. Everything below schedules off t0; the chime schedules off cue.
  const cue = o.when ?? actx.currentTime;
  const t0 = o.pa ? cue + PA_LEAD : cue;
  const tract = o.tract ?? rng.range(0.94, 1.07);
  const f0 = (o.f0 ?? rng.range(96, 132)) * spec.f0;
  const level = o.level ?? 1;
  const out = gain(actx, 0.2); // VOICE TRIM

  const total = spec.syl.reduce((s, x) => s + x.d + (x.g ?? 0), 0);

  /* ---- source ---------------------------------------------------- */
  const src = actx.createOscillator();
  src.setPeriodicWave(glottalWave(actx));
  const srcGain = gain(actx, 0);
  src.connect(srcGain);

  // Aspiration: always a little, a lot when hurt or dying.
  const breathLevel = (spec.breath ?? 0.16) * rng.range(0.8, 1.25);
  const noise = bank.source('white', rng, rng.range(0.9, 1.2));
  const noiseBP = biquad(actx, 'bandpass', 1400, 0.6);
  const noiseGain = gain(actx, 0);
  series(noise, noiseBP, noiseGain);

  const excite = gain(actx, 1);
  srcGain.connect(excite);
  noiseGain.connect(excite);

  /* ---- formant bank ---------------------------------------------- */
  const first = VOWELS[spec.syl[0].v] ?? VOWELS.a;
  const fs = [];
  for (let i = 0; i < 3; i++) {
    const f = first[i] * tract;
    const bw = first[i + 3];
    const bp = biquad(actx, 'bandpass', f, clamp(f / bw, 1.5, 14));
    const g = gain(actx, [1.0, 0.55, 0.24][i]);
    excite.connect(bp);
    bp.connect(g);
    fs.push({ bp, g });
  }

  /* ---- vocal tract output shaping -------------------------------- */
  const throat = biquad(actx, 'peaking', 480, 1.1, 4);      // chest resonance
  const presence = biquad(actx, 'peaking', 2600, 1.4, 5);   // shout presence
  const hp = biquad(actx, 'highpass', 150, 0.7);
  const lp = biquad(actx, 'lowpass', 5200, 0.7);
  const drv = shaper(actx, saturationCurve(1.6 * (spec.drive ?? 1), 0.35), '2x');
  const bodyGain = gain(actx, 1.5 * level);
  for (const f of fs) f.g.connect(throat);
  series(throat, presence, hp, lp, drv, bodyGain).connect(out);

  /* ---- tremolo (pain / death gargle) ----------------------------- */
  let trem = null;
  if (spec.tremolo) {
    trem = actx.createOscillator();
    trem.type = 'sine';
    trem.frequency.value = spec.tremolo * rng.range(0.85, 1.15);
    const tg = gain(actx, 0.35);
    trem.connect(tg);
    tg.connect(bodyGain.gain);
    trem.start(t0);
    trem.stop(t0 + total + 0.4);
  }

  /* ---- per-syllable automation ----------------------------------- */
  // Formant jitter is what turns a Speak&Spell into a person. A shouting
  // soldier gets the full 2%; the PA announcer is a recording played through a
  // horn, so it gets almost none — that steadiness IS the authority.
  const jit = spec.jitter ?? 0.02;
  let t = t0;
  src.frequency.setValueAtTime(f0 * spec.syl[0].p, t0);
  for (let i = 0; i < spec.syl.length; i++) {
    const s = spec.syl[i];
    const v = VOWELS[s.v] ?? VOWELS.a;
    const amp = s.a * 0.5;

    /* onset consonant, mixed straight to the output */
    if (s.on) {
      // Onsets lead the vowel; never let that run off the start of the timeline.
      const ct = Math.max(t - (s.on === 'f' ? 0.055 : 0.018), 0);
      const cs = bank.source('white', rng, rng.range(0.9, 1.3));
      const cbp = biquad(actx, s.on === 'f' ? 'bandpass' : 'highpass',
        s.on === 'f' ? rng.range(3800, 6500) : rng.range(1400, 2600),
        s.on === 'f' ? 1.1 : 0.7);
      const cg = gain(actx, 0);
      series(cs, cbp, cg).connect(out);
      if (s.on === 'f') {
        ad(cg.gain, ct, 0.1 * level, 0.012, 0.05);
        cs.start(ct, cs._offset, 0.12);
      } else if (s.on === 'n') {
        // Nasal: hum through a low formant instead of a burst.
        ad(cg.gain, ct, 0.02 * level, 0.01, 0.04);
        cs.start(ct, cs._offset, 0.08);
        fs[0].bp.frequency.setValueAtTime(260 * tract, ct);
      } else {
        hit(cg.gain, ct, 0.16 * level, 0.014);
        cs.start(ct, cs._offset, 0.05);
      }
    }

    /* formant glide into this vowel — 35 ms transition reads as articulation */
    for (let k = 0; k < 3; k++) {
      const f = v[k] * tract * (1 + rng.range(-jit, jit));
      const bw = v[k + 3];
      fs[k].bp.frequency.setTargetAtTime(f, Math.max(t - 0.03, t0), 0.014);
      fs[k].bp.Q.setTargetAtTime(clamp(f / bw, 1.5, 14), Math.max(t - 0.03, t0), 0.02);
    }

    /* pitch contour: rise into the stressed syllable, sag at the end */
    const pTarget = f0 * s.p;
    src.frequency.setTargetAtTime(pTarget, t, 0.03);
    if (spec.dying && i === spec.syl.length - 1) {
      sweep(src.frequency, t + 0.05, pTarget, pTarget * 0.45, s.d);
    } else {
      src.frequency.setTargetAtTime(pTarget * 0.94, t + s.d * 0.6, 0.06);
    }

    /* amplitude: fast onset, held, quick release; last syllable decays longer */
    const last = i === spec.syl.length - 1;
    const rel = last ? (spec.dying ? s.d * 0.9 : 0.055) : 0.028;
    adsr(srcGain.gain, t, amp * level, 0.014, s.d * 0.22, s.d * 0.5, 0.72, rel);
    ad(noiseGain.gain, t, amp * breathLevel * level, 0.02, s.d + rel);

    t += s.d + (s.g ?? 0);
  }

  /* ---- dying exhale ---------------------------------------------- */
  if (spec.dying) {
    const et = t + 0.05;
    const es = bank.source('white', rng, rng.range(0.6, 0.9));
    const ebp = biquad(actx, 'bandpass', 700, 0.55);
    const eg = gain(actx, 0);
    series(es, ebp, eg).connect(out);
    sweep(ebp.frequency, et, 900, 380, 0.6);
    ad(eg.gain, et, 0.16 * level, 0.08, 0.6);
    es.start(et, es._offset, 0.9);
    t = et + 0.7;
  }

  const end = t + 0.35;
  const srcStart = Math.max(t0 - 0.01, 0);
  src.start(srcStart);
  src.stop(end);
  noise.start(srcStart, noise._offset, end - srcStart + 0.05);

  /* ---- PA treatment (plaza announcer) ---------------------------- */
  if (o.pa) {
    // A re-entrant horn on a pole, not a handset. Against `radio` below:
    // the band is far wider (190 Hz–5.2 kHz vs 420–3.2 kHz) so it stays
    // intelligible-adjacent; two fat resonances sit where a horn's throat
    // honks; the chest peak the vocal tract added is notched back out, because
    // a loudspeaker thirty metres away has no chest; and the drive is 2.2
    // instead of 7 — an amp running warm, not comms crunch. The high reverb
    // send is the point: this should arrive off the buildings, not from a
    // point in space.
    const paIn = gain(actx, 1);
    out.connect(paIn);

    const paHP = biquad(actx, 'highpass', 190, 0.7);
    const paLP = biquad(actx, 'lowpass', 5200, 0.8);
    const chest = biquad(actx, 'peaking', 420, 1.1, -5);
    const horn1 = biquad(actx, 'peaking', 1580, 2.4, 6);
    const horn2 = biquad(actx, 'peaking', 2820, 2.9, 4.5);
    const paDrv = shaper(actx, saturationCurve(2.2, 0.15), '2x');
    // Two peaking boosts and a saturator stack up fast. At 1.3 this voice
    // measured peak 0.86 through the master — i.e. pinned against the soft
    // clipper, which would flatten every gunshot underneath it. 0.34 lands it
    // roughly 6 dB above a shouted bark, which is where a PA belongs: clearly
    // the loudest thing in the plaza, without owning the limiter.
    const paGain = gain(actx, 0.34);
    const paOut = gain(actx, 1);
    series(paIn, paHP, paLP, chest, horn1, horn2, paDrv, paGain).connect(paOut);

    // The amp keys up a moment before the chime: a breath of hiss, then tone.
    const ks = bank.source('white', rng, 1);
    const kbp = biquad(actx, 'bandpass', 1700, 0.9);
    const kg = gain(actx, 0);
    series(ks, kbp, kg).connect(paIn);
    ad(kg.gain, cue, 0.022, 0.02, 0.24);
    ks.start(cue, ks._offset, 0.32);

    // Two-tone preamble: a descending perfect fourth, the universal "stop what
    // you are doing and listen" cue. It replaces the radio's squelch clicks.
    for (let i = 0; i < 2; i++) {
      const ct = cue + 0.02 + i * 0.3;
      const cf = i === 0 ? 784 : 588;          // G5 -> D5
      const co = osc(actx, 'sine', cf);
      const ch = osc(actx, 'triangle', cf * 2); // faint octave: metal, not organ
      const chg = gain(actx, 0.15);
      const cg = gain(actx, 0);
      co.connect(cg); ch.connect(chg); chg.connect(cg); cg.connect(paIn);
      ad(cg.gain, ct, 0.32, 0.006, 0.42);
      co.start(ct); ch.start(ct);
      co.stop(ct + 0.62); ch.stop(ct + 0.62);
    }

    // Send is high — 10x the radio treatment, and above a shouted bark — but
    // not as high as it first looks like it should be. Sustained tonal content
    // builds up coherently in a 2.8 s convolution in a way that a bark's short
    // noisy formants do not: measured, this voice gains ~8x from the reverb
    // where `contact` gains ~3.7x. At 0.5 the wet still sits ~3.4:1 over the
    // dry, which is the wash; at 1.15 it pinned the master soft clipper.
    return { node: paOut, end: end + 0.45, send: 0.5 };
  }

  /* ---- radio treatment (squad comms) ----------------------------- */
  if (o.radio) {
    const rbp1 = biquad(actx, 'highpass', 420, 0.8);
    const rbp2 = biquad(actx, 'lowpass', 3200, 0.9);
    const rdrv = shaper(actx, saturationCurve(7, 0.3), '2x');
    const rg = gain(actx, 1.1);
    const radioOut = gain(actx, 1);
    series(out, rbp1, rbp2, rdrv, rg).connect(radioOut);
    // Squelch click at both ends of the transmission.
    for (const st of [Math.max(t0 - 0.05, 0), end - 0.2]) {
      const cs = bank.source('white', rng, 1.1);
      const cbp = biquad(actx, 'bandpass', 2600, 1.6);
      const cg = gain(actx, 0);
      series(cs, cbp, cg).connect(radioOut);
      hit(cg.gain, st, 0.09, 0.03);
      cs.start(st, cs._offset, 0.06);
    }
    return { node: radioOut, end: end + 0.1, send: 0.05 };
  }

  return { node: out, end: end + 0.1, send: 0.45 };
}

/** Pick a plausible bark for an AI event without the ai agent knowing our list. */
export function barkFor(kind, rng) {
  switch (kind) {
    case 'spot': return rng.float() < 0.5 ? 'contact' : 'spotted';
    case 'reload': return 'reloading';
    case 'grenade': return 'grenade';
    case 'flank': return 'flanking';
    case 'suppress': return 'suppressing';
    case 'advance': return 'moveup';
    case 'hurt': return rng.float() < 0.5 ? 'hit' : 'pain';
    case 'death': return 'death';
    case 'copy': return 'copy';
    default: return 'contact';
  }
}
