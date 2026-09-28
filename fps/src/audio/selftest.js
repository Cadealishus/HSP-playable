/**
 * AUDIO / SELF TEST
 *
 * Renders every voice through the real mixer graph in an OfflineAudioContext
 * and measures what came out. This is how the audio subsystem is verified:
 * screenshots prove nothing about sound, and OfflineAudioContext needs no user
 * gesture, so the whole synthesis path can be exercised headlessly.
 *
 * For each case we report:
 *   peak     absolute sample peak — >= 1.0 means the limiter failed
 *   rms      loudness; 0 means the voice is silent (a bug)
 *   dc       mean sample value; a large offset means an envelope never closed
 *   nan      any non-finite samples (bad exponentialRamp targets, /0, ...)
 *   centroid rough spectral centre of mass in Hz (via zero-crossing rate),
 *            enough to prove a "distant" shot is darker than a near one
 *
 * Usage from a page (see probe.mjs):
 *   const { runAudioSelfTest } = await import('/src/audio/selftest.js');
 *   const report = await runAudioSelfTest();
 */

import { Rng } from '../core/rng.js';
import { NoiseBank, bandLimit, filterBuffer } from './dsp.js';
import { Mixer } from './mixer.js';
import { WEAPON_PROFILES, weaponShot, bulletWhizz, dryFire } from './weapons.js';
import {
  surfaceImpact, footstep, shellCasing, reloadPhase, explosion, bodyFall, uiSound,
  heartbeat, cloth,
} from './foley.js';
import { bark, BARKS } from './vox.js';
import { Ambience, ambientOneShot, ONE_SHOTS, KIT_ONE_SHOTS } from './ambience.js';
import { renderAirportKit } from './airport.js';
import { RadioComms } from './radio.js';
import { IR_SPECS, generateIR, classifySpace } from './ir.js';

const SR = 48000;

function measure(buf) {
  const n = buf.length;
  let peak = 0, sum = 0, sumSq = 0, nan = 0, crossings = 0;
  let prev = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) {
      const v = d[i];
      if (!Number.isFinite(v)) { nan++; continue; }
      const a = Math.abs(v);
      if (a > peak) peak = a;
      sum += v;
      sumSq += v * v;
      if (ch === 0) {
        if ((v > 0 && prev <= 0) || (v < 0 && prev >= 0)) crossings++;
        prev = v;
      }
    }
  }
  const total = n * buf.numberOfChannels;
  const rms = Math.sqrt(sumSq / total);
  // Zero crossing rate -> a crude but stable spectral centre indicator.
  const centroid = (crossings / (n / SR)) * 0.5;
  return {
    peak: +peak.toFixed(4),
    rms: +rms.toFixed(5),
    dc: +(sum / total).toFixed(5),
    nan,
    centroid: Math.round(centroid),
  };
}

const db = (v) => +(20 * Math.log10(Math.max(v, 1e-9))).toFixed(1);

/** Peak and RMS (dBFS, left channel) of the window [t0, t1) seconds. */
function seg(buf, t0, t1) {
  const d = buf.getChannelData(0);
  const a = Math.max(0, Math.floor(t0 * SR)), b = Math.min(d.length, Math.floor(t1 * SR));
  let peak = 0, sq = 0;
  for (let i = a; i < b; i++) { const v = d[i]; sq += v * v; if (Math.abs(v) > peak) peak = Math.abs(v); }
  const rms = Math.sqrt(sq / Math.max(1, b - a));
  return { peakDb: db(peak), rmsDb: db(rms), crest: +(peak / Math.max(rms, 1e-9)).toFixed(2) };
}

/**
 * Share of the window's energy (%) below `lo`, between `lo` and `hi`, and
 * above `hi` — each measured through a 4th-order split at the edge, so the
 * three do not sum to exactly 100 (the crossover regions overlap).
 */
function bands(buf, t0, t1, lo = 300, hi = 3000) {
  const src = buf.getChannelData(0);
  const a = Math.max(0, Math.floor(t0 * SR)), b = Math.min(src.length, Math.floor(t1 * SR));
  const e = (x) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return s; };
  const total = e(src.subarray(a, b)) || 1e-12;
  const low = src.slice(a, b); filterBuffer(low, 'lowpass', lo, 0.7071, SR); filterBuffer(low, 'lowpass', lo, 0.7071, SR);
  const mid = src.slice(a, b); bandLimit(mid, lo, hi, SR, 2);
  const high = src.slice(a, b); filterBuffer(high, 'highpass', hi, 0.7071, SR); filterBuffer(high, 'highpass', hi, 0.7071, SR);
  const pct = (x) => +((100 * e(x)) / total).toFixed(1);
  return { [`<${lo}`]: pct(low), [`${lo}-${hi}`]: pct(mid), [`>${hi}`]: pct(high) };
}

/** One offline render: build a fresh mixer, run `fn`, measure the master out. */
async function renderCase(seconds, seed, fn, opts = {}) {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
  const rng = new Rng(seed);
  const bank = new NoiseBank(ctx, rng.fork(), 1.2);
  const mixer = new Mixer(ctx, rng.fork(), { hall: !!opts.hall });
  if (opts.reverb !== false) mixer.buildReverbs();
  if (opts.space) mixer.setSpace(opts.space, 0.001);
  if (opts.listener) {
    const L = ctx.listener;
    if (L.positionX) {
      L.positionX.value = opts.listener.x; L.positionY.value = opts.listener.y; L.positionZ.value = opts.listener.z;
    } else {
      L.setPosition(opts.listener.x, opts.listener.y, opts.listener.z);
    }
  }
  fn({ ctx, rng, bank, mixer, t: 0.02 });
  const buf = await ctx.startRendering();
  const m = measure(buf);
  if (opts.analyse) Object.assign(m, opts.analyse(buf));
  return m;
}

/** Connect a voice to a bus and its reverb send, the way the live system does. */
function route(mixer, voice, busName = 'weapons', sendScale = 1) {
  voice.node.connect(mixer.bus(busName));
  if ((voice.send ?? 0) > 0) {
    const g = mixer.actx.createGain();
    g.gain.value = voice.send * sendScale;
    voice.node.connect(g);
    g.connect(mixer.reverbSend);
  }
  return voice;
}

export async function runAudioSelfTest(opts = {}) {
  const results = [];
  const push = async (name, seconds, fn, o) => {
    const t0 = performance.now();
    try {
      const m = await renderCase(seconds, 0xA0D10 + results.length * 7919, fn, o);
      results.push({ name, ms: Math.round(performance.now() - t0), ...m });
    } catch (err) {
      results.push({ name, error: String(err?.message ?? err) });
    }
  };

  /* ---- impulse responses ---------------------------------------- */
  for (const key of Object.keys(IR_SPECS)) {
    const t0 = performance.now();
    try {
      const ctx = new OfflineAudioContext(2, SR * 0.05, SR);
      const buf = generateIR(ctx, new Rng(0x1234 + key.length), IR_SPECS[key]);
      const m = measure(buf);
      results.push({ name: `ir:${key}`, ms: Math.round(performance.now() - t0), seconds: +buf.duration.toFixed(2), ...m });
    } catch (err) {
      results.push({ name: `ir:${key}`, error: String(err?.message ?? err) });
    }
  }

  /* ---- weapons, near and far ------------------------------------ */
  for (const key of Object.keys(WEAPON_PROFILES)) {
    await push(`shot:${key}@2m`, 3.5, ({ bank, rng, mixer, t }) => {
      route(mixer, weaponShot(mixer.actx, bank, rng, WEAPON_PROFILES[key], { when: t, distance: 2, firstPerson: true }));
    });
  }
  await push('shot:rifle@120m', 4.5, ({ bank, rng, mixer, t }) => {
    route(mixer, weaponShot(mixer.actx, bank, rng, WEAPON_PROFILES.rifle, { when: t, distance: 120 }));
  });
  await push('shot:rifle@300m', 5.5, ({ bank, rng, mixer, t }) => {
    route(mixer, weaponShot(mixer.actx, bank, rng, WEAPON_PROFILES.rifle, { when: t, distance: 300 }));
  });

  /* round-robin variation: 8 rounds of automatic fire must not be identical */
  await push('auto:8rounds', 2.5, ({ bank, rng, mixer, t }) => {
    for (let i = 0; i < 8; i++) {
      route(mixer, weaponShot(mixer.actx, bank, rng, WEAPON_PROFILES.rifle, {
        when: t + i * 0.085, distance: 2, firstPerson: true,
      }));
    }
  });

  /* ---- foley ----------------------------------------------------- */
  const surfaces = ['concrete', 'metal', 'wood', 'dirt', 'sand', 'glass', 'water', 'foliage', 'fabric', 'flesh', 'rubber', 'plaster'];
  for (const s of surfaces) {
    await push(`impact:${s}`, 2.2, ({ bank, rng, mixer, t }) => {
      route(mixer, surfaceImpact(mixer.actx, bank, rng, { when: t, surface: s, energy: 1 }), 'foley');
    });
    await push(`step:${s}`, 2.2, ({ bank, rng, mixer, t }) => {
      route(mixer, footstep(mixer.actx, bank, rng, { when: t, surface: s, gait: 'run' }), 'foley');
    });
  }
  for (const gait of ['walk', 'run', 'sprint', 'crouch', 'land']) {
    await push(`step:concrete:${gait}`, 2.2, ({ bank, rng, mixer, t }) => {
      route(mixer, footstep(mixer.actx, bank, rng, { when: t, surface: 'concrete', gait }), 'foley');
    });
  }
  await push('shell:concrete', 3, ({ bank, rng, mixer, t }) => {
    route(mixer, shellCasing(mixer.actx, bank, rng, { when: t, surface: 'concrete' }), 'foley');
  });
  await push('shell:dirt', 3, ({ bank, rng, mixer, t }) => {
    route(mixer, shellCasing(mixer.actx, bank, rng, { when: t, surface: 'dirt' }), 'foley');
  });
  for (const phase of ['start', 'magout', 'magin', 'end']) {
    await push(`reload:${phase}`, 2.5, ({ bank, rng, mixer, t }) => {
      route(mixer, reloadPhase(mixer.actx, bank, rng, phase, { when: t }), 'foley');
    });
  }
  await push('explosion@5m', 6, ({ bank, rng, mixer, t }) => {
    route(mixer, explosion(mixer.actx, bank, rng, { when: t, distance: 5, radius: 8 }));
  });
  await push('explosion@180m', 7, ({ bank, rng, mixer, t }) => {
    route(mixer, explosion(mixer.actx, bank, rng, { when: t, distance: 180, radius: 12 }));
  });
  await push('bodyfall', 2, ({ bank, rng, mixer, t }) => {
    route(mixer, bodyFall(mixer.actx, bank, rng, { when: t }), 'foley');
  });
  await push('cloth', 1.5, ({ bank, rng, mixer, t }) => {
    route(mixer, cloth(mixer.actx, bank, rng, { when: t }), 'foley');
  });
  await push('whizz', 1.2, ({ bank, rng, mixer, t }) => {
    route(mixer, bulletWhizz(mixer.actx, bank, rng, { when: t, miss: 1.2 }), 'foley');
  });
  await push('dryfire', 1, ({ bank, rng, mixer, t }) => {
    route(mixer, dryFire(mixer.actx, bank, rng, { when: t }), 'weapons');
  });
  await push('heartbeat', 1.5, ({ bank, rng, mixer, t }) => {
    route(mixer, heartbeat(mixer.actx, bank, rng, { when: t }), 'foley');
  });
  // Render length per UI voice. The wave stingers are musical figures rather
  // than blips, so they need a longer window than a hitmarker or the tail gets
  // cut off inside the measurement and the duration comparison means nothing.
  const UI_CASES = {
    hitmarker: 1.5, headshot: 1.5, kill: 1.5, damage: 1.5, lowhealth: 1.5,
    grenade_warn: 1.5, armour: 1.5, regen: 1.5,
    wave_start: 2, wave_clear: 2.5, run_over: 3,
  };
  for (const k of Object.keys(UI_CASES)) {
    await push(`ui:${k}`, UI_CASES[k], ({ bank, rng, mixer, t }) => {
      route(mixer, uiSound(mixer.actx, bank, rng, k, { when: t }), 'ui');
    }, { reverb: false });
  }

  /* ---- voice ----------------------------------------------------- */
  for (const key of Object.keys(BARKS)) {
    await push(`bark:${key}`, 3, ({ bank, rng, mixer, t }) => {
      route(mixer, bark(mixer.actx, bank, rng, { when: t, bark: key }), 'voice');
    });
  }
  await push('bark:radio', 3, ({ bank, rng, mixer, t }) => {
    route(mixer, bark(mixer.actx, bank, rng, { when: t, bark: 'contact', radio: true }), 'voice');
  });

  /* ---- comms radio ------------------------------------------------ */
  // Command: open at 0.02, carrier to 2.52, squelch tail 2.51..2.81.
  await push('radio:command', 3.4, ({ rng, mixer, t }) => {
    const comms = new RadioComms(mixer.actx, rng.fork());
    route(mixer, comms.transmission('command', t, 2.5), 'ui');
  }, {
    reverb: false,
    analyse: (b) => ({
      open: seg(b, 0.02, 0.1), bed: seg(b, 0.6, 2.4), tail: seg(b, 2.52, 2.8),
      openBands: bands(b, 0.02, 0.1), bedBands: bands(b, 0.6, 2.4), tailBands: bands(b, 2.52, 2.8),
    }),
  });
  // Doug: click at 0.02, faint bed to 1.42, release click 1.41..1.45.
  await push('radio:doug', 2, ({ rng, mixer, t }) => {
    const comms = new RadioComms(mixer.actx, rng.fork());
    route(mixer, comms.transmission('doug', t, 1.4), 'ui');
  }, {
    reverb: false,
    analyse: (b) => ({
      open: seg(b, 0.02, 0.06), bed: seg(b, 0.3, 1.3), tail: seg(b, 1.41, 1.46),
      openBands: bands(b, 0.02, 0.06, 300, 3000), bedBands: bands(b, 0.3, 1.3),
    }),
  });
  // Enemy handheld, dry at the source (the live path adds distance/occlusion).
  await push('radio:enemy', 2.6, ({ rng, mixer, t }) => {
    const comms = new RadioComms(mixer.actx, rng.fork());
    route(mixer, comms.enemy(t, 1.8), 'voice');
  }, {
    reverb: false,
    analyse: (b) => ({
      open: seg(b, 0.02, 0.1), bed: seg(b, 0.3, 1.7), tail: seg(b, 1.82, 2.08),
      bedBands: bands(b, 0.3, 1.7, 520, 2300), bedBandsCmd: bands(b, 0.3, 1.7),
    }),
  });

  /* ---- ambience beds, per map --------------------------------------- */
  const HALL = { tight: 0, room: 0, street: 0, tunnel: 0, open: 0, hall: 1 };
  const bed = (map, enclosure, roofed, spool) => ({ bank, rng, mixer }) => {
    const amb = new Ambience(mixer.actx, bank, mixer, null, rng.fork(), { map });
    amb.start();
    amb.setEnclosure(enclosure, roofed);
    if (spool) amb._airport.spool();
  };
  const bedAnalyse = (b) => ({
    early: seg(b, 1, 3), late: seg(b, 7, 9.5), bands: bands(b, 3, 9.5, 300, 3000),
  });
  await push('amb:town:street', 9.5, bed('town', 0, 0), { analyse: bedAnalyse });
  // Mid-hall, 20 m from the escalators.
  await push('amb:airport:hall', 9.5, bed('airport', 0.8, 1), {
    hall: true, space: HALL, listener: { x: -12, y: 1.6, z: -8 }, analyse: bedAnalyse,
  });
  // Two metres from the escalator bank.
  await push('amb:airport:escalator', 9.5, bed('airport', 0.8, 1), {
    hall: true, space: HALL, listener: { x: 6.1, y: 1.6, z: 9 }, analyse: bedAnalyse,
  });
  // Out on the apron, 80 m from the idling airliner; then the same with a spool-up.
  await push('amb:airport:apron', 9.5, bed('airport', 0, 0), {
    listener: { x: -60, y: 1.6, z: 30 }, analyse: bedAnalyse,
  });
  await push('amb:airport:spool', 9.5, bed('airport', 0, 0, true), {
    listener: { x: -60, y: 1.6, z: 30 }, analyse: bedAnalyse,
  });

  /* ---- ambient one-shots ---------------------------------------- */
  for (const k of ONE_SHOTS) {
    await push(`ambient:${k}`, 14, ({ bank, rng, mixer, t }) => {
      const kit = KIT_ONE_SHOTS.has(k) ? renderAirportKit(mixer.actx, rng) : null;
      route(mixer, ambientOneShot(mixer.actx, bank, rng, k, { when: t, kit }), 'ambience');
    }, {
      hall: KIT_ONE_SHOTS.has(k),
      space: KIT_ONE_SHOTS.has(k) ? { tight: 0, room: 0, street: 0, tunnel: 0, open: 0, hall: 1 } : undefined,
      analyse: (b) => ({ bands: bands(b, 0, 6) }),
    });
  }

  /* ---- reverb space comparison ---------------------------------- */
  // `ring` = time for the output to fall 40 dB below the shot's peak.
  const ring = (b) => {
    const d = b.getChannelData(0);
    let peak = 0, at = 0;
    for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > peak) { peak = Math.abs(d[i]); at = i; }
    const win = Math.floor(0.05 * SR);
    let last = at;
    for (let i = at; i + win < d.length; i += win) {
      let m = 0;
      for (let k = i; k < i + win; k++) m = Math.max(m, Math.abs(d[k]));
      if (m > peak * 0.01) last = i + win;
    }
    return { ring40: +((last - at) / SR).toFixed(2), tailRms: seg(b, 0.8, 3).rmsDb };
  };
  for (const space of ['tight', 'room', 'street', 'open', 'tunnel', 'hall']) {
    const w = { tight: 0, room: 0, street: 0, tunnel: 0, open: 0, hall: 0 };
    w[space] = 1;
    await push(`tail:${space}`, 6, ({ bank, rng, mixer, t }) => {
      route(mixer, weaponShot(mixer.actx, bank, rng, WEAPON_PROFILES.rifle, {
        when: t, distance: 2, firstPerson: true, echoBoost: 2,
      }), 'weapons', 1.4);
    }, { space: w, hall: space === 'hall', analyse: ring });
  }

  /* ---- limiter stress: everything at once ----------------------- */
  await push('stress:limiter', 4, ({ bank, rng, mixer, t }) => {
    for (let i = 0; i < 14; i++) {
      route(mixer, weaponShot(mixer.actx, bank, rng, WEAPON_PROFILES.sniper, {
        when: t + i * 0.004, distance: 1, firstPerson: true,
      }));
    }
    for (let i = 0; i < 6; i++) {
      route(mixer, explosion(mixer.actx, bank, rng, { when: t + i * 0.01, distance: 1, radius: 14 }));
    }
  });

  /* ---- space classifier (pure function, no audio) ---------------- */
  const spaces = {};
  const box = new Array(9).fill(3.5); box[8] = 2.6;
  spaces.smallRoom = classifySpace(box, 40, null);
  const street = [4, 30, 40, 30, 4, 30, 40, 30, 40];
  spaces.street = classifySpace(street, 40, null);
  const field = new Array(9).fill(40);
  spaces.open = classifySpace(field, 40, null);
  const corridor = [1.8, 12, 38, 12, 1.8, 12, 38, 12, 2.4];
  spaces.corridor = classifySpace(corridor, 40, null);
  // The airport: a 10 m roof (8.4 m above the ear), walls 18–40 m away.
  const AIRPORT = { hallCeil: 11, hall: 1 };
  const hall = [18, 25, 40, 30, 22, 40, 35, 28, 8.4];
  spaces.hallUnbiased = classifySpace(hall, 40, null);
  spaces.hall = classifySpace(hall, 40, null, AIRPORT);
  spaces.airportOffice = classifySpace(box, 40, null, AIRPORT);
  spaces.airportApron = classifySpace(field, 40, null, AIRPORT);

  const failures = results.filter((r) =>
    r.error || r.nan > 0 || r.peak >= 1.0 || (r.rms ?? 0) <= 0.00002 || Math.abs(r.dc ?? 0) > 0.02
  );

  return {
    ok: failures.length === 0,
    cases: results.length,
    failures,
    results: opts.verbose === false ? undefined : results,
    spaces,
  };
}

if (typeof window !== 'undefined') window.__AUDIO_SELFTEST__ = runAudioSelfTest;
