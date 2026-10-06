import { DEG } from './mathx.js';

/**
 * Weapon data.
 *
 * Ballistics are real: 5.56x45 leaves a 14.5" barrel at ~880 m/s, 9x19 from a
 * 4.5" barrel at ~360 m/s, and both drop under gravity on the way to the
 * target. Rates of fire, magazine capacities and ADS times are the real ones
 * too (an M4A1 is 800 rpm and reaches the optic in about 220 ms).
 *
 * Recoil is split in two, exactly as a modern shooter does it:
 *   - `pattern`  a DETERMINISTIC per-shot camera climb a player can memorise
 *                and counter. Generated once from a fixed seed.
 *   - `spread`   a random cone that grows with sustained fire and shrinks when
 *                aiming, crouched or still. This is the part you cannot learn.
 */

export const WEAPON_DEFS = {
  /**
   * The ESF primary: an M4A1-pattern carbine (14.5" barrel, A2 birdcage,
   * free-float M-LOK rail, FDE furniture) under a holographic sight.
   * Model: models/carbine.js. Fire/reload audio and the muzzle profile route
   * exactly like the rifle's (`audio: 'rifle'`, `class: 'carbine'`).
   */
  carbine: {
    id: 'carbine',
    displayName: 'KESTREL 556',
    label: 'KESTREL 556',
    blurb: 'Standard-issue 5.56 carbine with a holographic sight. Auto and semi.',
    class: 'carbine',
    audio: 'rifle',
    caliber: '5.56x45',
    rpm: 830,
    modes: ['auto', 'semi'],
    burstCount: 3,
    burstRpm: 950,
    burstDelay: 0.16,
    magSize: 30,
    reserve: 210,
    muzzleVelocity: 880,
    damage: 32,
    penetration: 1.0,
    dropoff: 0.6,
    maxRange: 400,
    dragK: 0.28,
    tracerEvery: 3,
    spreadHip: 1.95,
    spreadAds: 0.22,
    spreadPerShot: 0.28,
    spreadMax: 3.3,
    spreadDecay: 3.8,
    recoil: {
      pitch: 0.0081,
      yaw: 0.002,
      kickBack: 0.018,
      kickUp: 0.0068,
      roll: 0.03,
      punch: 0.34,
      freq: 8.8,
      damping: 0.42,
      patternLength: 30,
      patternSeed: 0x6b1e53,
      climbShape: [1.4, 1.26, 1.12, 1.04, 1.0],
      drift: 0.5,
    },
    adsTime: 0.2,
    adsFov: 0.74,
    viewFov: 0.86,
    reloadTac: 2.05,
    reloadEmpty: 2.8,
    inspectTime: 3.2,
    drawTime: 0.6,
    holsterTime: 0.4,
    /* Pose: the rifle's bore-axis solve (see there) carries over because the
     * carbine is placed so its rail, grip and optic height land within ~1 cm of
     * the rifle's (models/carbine.js PLACEMENT). The carbine's muzzle is 41 mm
     * further out, so the gun sits 12 mm further from the eye to keep the crown
     * in the same part of the frame, and the holo (a taller, wider box than the
     * tube sight) is rolled 0.01 less so its left flank does not fill the
     * lower-right quarter. */
    hipPos: [0.12, -0.186, -0.31],
    hipRot: [-0.05, 0.081, -0.125],
    adsCant: [0, 0, 0],
    /* Eye to the holo WINDOW (the sight node is the window centre, not the rear
     * of the hood). 0.105 frames the 35 x 27.5 mm window at about a third of the
     * frame height with the hood's arch inside the frame, which is where a modern
     * shooter frames a holographic sight; see models/carbine.js buildHolo. */
    eyeRelief: 0.105,
    sprintPos: [0.09, -0.262, -0.28],
    sprintRot: [-0.4, 0.6, 0.2],
    lowReadyPos: [0.112, -0.28, -0.295],
    lowReadyRot: [-0.46, 0.125, -0.09],
    swayScale: 0.96,
    bobScale: 1,
    magLen: 0.17,
  },

  rifle: {
    id: 'rifle',
    // `displayName` is the ESF designation shown in the loadout and the HUD
    // (`label` mirrors it for the HUD adapter, which has always read `label`).
    // The internal id 'rifle' is the stable key every other subsystem references.
    displayName: 'HARRIER 556',
    label: 'HARRIER 556',
    blurb: 'Rifle-length flat-top with a 1x tube sight. Three fire modes.',
    class: 'carbine',
    audio: 'rifle',
    caliber: '5.56x45',
    /* --- fire control --- */
    rpm: 800,
    modes: ['auto', 'burst', 'semi'],
    burstCount: 3,
    burstRpm: 950,
    burstDelay: 0.16,
    /* --- ammunition --- */
    magSize: 30,
    reserve: 210,
    /* --- terminal ballistics --- */
    muzzleVelocity: 880,
    damage: 33,
    penetration: 1.0,
    dropoff: 0.62,
    maxRange: 420,
    dragK: 0.28,
    tracerEvery: 3,
    /* --- accuracy (degrees) --- */
    spreadHip: 2.05,
    spreadAds: 0.24,
    spreadPerShot: 0.3,
    spreadMax: 3.4,
    spreadDecay: 3.6,
    /* --- recoil --- */
    recoil: {
      pitch: 0.0085, // radians of camera climb per shot
      yaw: 0.0022,
      kickBack: 0.019, // metres the viewmodel travels rearward
      kickUp: 0.0072,
      roll: 0.032,
      punch: 0.35,
      freq: 8.5,
      damping: 0.42,
      patternLength: 30,
      patternSeed: 0x4d34a1,
      climbShape: [1.45, 1.3, 1.15, 1.05, 1.0], // first-shots multiplier
      drift: 0.55, // how much the pattern wanders horizontally
    },
    /* --- handling (seconds) --- */
    adsTime: 0.22,
    adsFov: 0.74,
    viewFov: 0.86,
    reloadTac: 2.1,
    reloadEmpty: 2.9,
    inspectTime: 3.2,
    drawTime: 0.62,
    holsterTime: 0.4,
    /* --- pose ---
     * Weapon-local origin is the web of the shooting hand (top of the grip).
     * The butt pad is at z=+0.245, the muzzle crown at z=-0.502, the optic
     * ocular at (0, 0.142, +0.006) and the mag floorplate ~150 mm below origin.
     *
     * SOLVED FROM THE BORE AXIS, not from where the optic happens to land.
     *
     * The previous pose (hipPos [0.081,-0.192,-0.215], hipRot [-0.026,0.076,
     * 0.055]) was derived by putting the OPTIC at a chosen screen position, and
     * that is the wrong constraint: it left the bore 1.5 deg nose-down with the
     * weapon only 215 mm from the eye, so the whole barrel forward of the
     * receiver ran off the top-left of the frame and the muzzle crown — where
     * the flash spawns — projected onto empty street. What reads as "the gun
     * points at the crosshair" is the MUZZLE being visible, up-left of the
     * receiver, on the way to the centre of the screen.
     *
     * Constraints, in order:
     *   1. bore axis 4.0 deg LEFT of view-forward (converging on the crosshair)
     *      and 2.9 deg nose-down:  rx = -0.050, ry = +0.070
     *   2. rolled 7.7 deg so the LEFT flank of the receiver (the side that
     *      carries the rollmark, the bolt catch and the port) faces the camera
     *      and the rail deck turns edge-on instead of presenting its lit top
     *      face:  rz = -0.135
     *   3. muzzle crown inside x 1050-1300, y 620-780 at 1920x1080
     *   4. optic ocular below and right of screen centre
     *   5. magazine + pistol grip in the lower-right frame
     *
     * With the rotation above the muzzle offset is (-0.025, +0.049, -0.505) and
     * the ocular offset (+0.019, +0.141, -0.003), so at a 60 deg vertical view
     * FOV (half-height 0.5774|z|, half-width 1.0264|z|):
     *   muzzle -> (1064, 698)   ocular -> (1374, 677)   magwell mouth -> (1268, 870)
     * i.e. the muzzle is 300 px up-LEFT of the optic and heading for the middle
     * of the frame, which is the read that was missing.
     *
     * z = -0.30 (was -0.215) is what makes the weapon small enough for the mag
     * and grip to enter the frame at all: the gun's vertical extent from optic
     * to floorplate is 291 mm, and at 215 mm from the eye that is 93% of the
     * frame height. It is also the limit — the support hand is then 620 mm
     * downrange of a shoulder 200 mm off the eye, and a 572 mm arm has nothing
     * left. The butt pad ends up 60 mm in FRONT of the eye but 140 mm off axis,
     * so it is outside the frustum rather than clipped by the near plane. */
    hipPos: [0.118, -0.185, -0.3],
    hipRot: [-0.05, 0.081, -0.135],
    adsCant: [0, 0, 0.004],
    /* Eye to the rear lens.
     *
     * MEASURED FROM THE ADS FRAME, not chosen for realism. Two numbers have to
     * come out right and they pull in opposite directions:
     *
     *   housing size     the 31 mm tube's outer rim subtends rOuter/relief. At
     *                    0.078 that was 256 px of radius — a 512 px ring, HALF
     *                    the frame height, and every critic called the optic
     *                    oversized. 0.115 puts it at 168 px (336 px across,
     *                    31% of frame height), which is where a modern shooter
     *                    frames a tube sight.
     *   sight picture    is stopped by the objective bore at (relief + len), so a
     *                    LONGER relief improves the picture-to-housing ratio:
     *                    (relief)/(relief+len) goes from 0.53 to 0.69.
     *
     * So both wanted the same thing and the old value was simply too close. With
     * the 52 mm tube and the flared bore (see parts.js buildOptic) this lands the
     * clear aperture at 115 px against a 168 px housing. */
    eyeRelief: 0.115,
    /* Sprint: gun dropped and angled across the body, muzzle down-left.
     * Carried over by the same delta as the hip pose so the blend does not
     * translate the weapon 90 mm sideways on the way into a sprint. */
    sprintPos: [0.09, -0.262, -0.275],
    sprintRot: [-0.4, 0.6, 0.2],
    lowReadyPos: [0.112, -0.28, -0.289],
    lowReadyRot: [-0.46, 0.125, -0.09],
    swayScale: 1,
    bobScale: 1,
    magLen: 0.212,
  },

  smg: {
    id: 'smg',
    displayName: 'MERLIN 9',
    label: 'MERLIN 9',
    blurb: '9 mm submachine gun. Fast handling, short reach.',
    class: 'smg',
    audio: 'smg',
    caliber: '9x19',
    rpm: 950,
    modes: ['auto', 'semi'],
    burstCount: 2,
    burstRpm: 1100,
    burstDelay: 0.14,
    magSize: 32,
    reserve: 224,
    muzzleVelocity: 400,
    damage: 24,
    penetration: 0.45,
    dropoff: 0.48,
    maxRange: 240,
    dragK: 0.42,
    tracerEvery: 4,
    spreadHip: 2.5,
    spreadAds: 0.4,
    spreadPerShot: 0.26,
    spreadMax: 3.9,
    spreadDecay: 4.4,
    recoil: {
      pitch: 0.0058,
      yaw: 0.0026,
      kickBack: 0.0135,
      kickUp: 0.0052,
      roll: 0.026,
      punch: 0.24,
      freq: 10.5,
      damping: 0.4,
      patternLength: 32,
      patternSeed: 0x9ac31f,
      climbShape: [1.3, 1.18, 1.08, 1.0],
      drift: 0.8,
    },
    adsTime: 0.185,
    adsFov: 0.78,
    viewFov: 0.88,
    reloadTac: 1.85,
    reloadEmpty: 2.5,
    inspectTime: 2.9,
    drawTime: 0.52,
    holsterTime: 0.34,
    /* Solved from the bore axis exactly as the rifle's is (see there): 4.1 deg of
     * convergence, 2.9 deg nose-down, 7.5 deg of outboard roll, and far enough
     * out that the muzzle of a 210 mm barrel is on screen up-left of the optic. */
    hipPos: [0.111, -0.163, -0.288],
    hipRot: [-0.05, 0.072, -0.131],
    adsCant: [0, 0, 0.005],
    /* Same aperture-budget derivation as the rifle (see there): the 27.6 mm tube's
     * outer rim wants to land near 165 px of radius and the 44 mm bore wants the
     * eye far enough back that the objective is not the stop. */
    eyeRelief: 0.104,
    sprintPos: [0.088, -0.24, -0.262],
    sprintRot: [-0.38, 0.58, 0.19],
    lowReadyPos: [0.108, -0.252, -0.276],
    lowReadyRot: [-0.44, 0.125, -0.085],
    swayScale: 0.92,
    bobScale: 0.95,
    magLen: 0.192,
  },

  pistol: {
    id: 'pistol',
    displayName: 'P19 SIDEARM',
    label: 'P19 SIDEARM',
    blurb: '9 mm service pistol, 17 rounds.',
    class: 'pistol',
    audio: 'pistol',
    caliber: '9x19',
    rpm: 460,
    modes: ['semi'],
    burstCount: 1,
    burstRpm: 460,
    burstDelay: 0.1,
    magSize: 17,
    reserve: 68,
    muzzleVelocity: 360,
    damage: 28,
    penetration: 0.35,
    dropoff: 0.42,
    maxRange: 180,
    dragK: 0.46,
    tracerEvery: 5,
    spreadHip: 3.1,
    spreadAds: 0.5,
    spreadPerShot: 0.42,
    spreadMax: 4.6,
    spreadDecay: 5.2,
    recoil: {
      pitch: 0.0125,
      yaw: 0.0032,
      kickBack: 0.012,
      kickUp: 0.0105,
      roll: 0.018,
      punch: 0.3,
      freq: 9.0,
      damping: 0.45,
      patternLength: 17,
      patternSeed: 0x1f77bc,
      climbShape: [1.0],
      drift: 1.2,
    },
    adsTime: 0.16,
    adsFov: 0.86,
    viewFov: 0.92,
    reloadTac: 1.6,
    reloadEmpty: 2.2,
    inspectTime: 2.6,
    // The fast-swap sidearm: out in 0.3 s, and anything switching TO it holsters
    // at `fastSwap` x speed (see index.js setWeapon).
    drawTime: 0.3,
    holsterTime: 0.22,
    fastSwap: 1.9,
    /* A pistol is held out on the arms rather than braced on the shoulder, so
     * the hip pose is FURTHER from the eye than a carbine's and the ADS eye
     * relief is most of an arm's length. 0.34 m keeps both elbows visibly bent;
     * past ~0.40 m the two-bone solve hits full extension and they lock. */
    hipPos: [0.115, -0.15, -0.34],
    hipRot: [-0.05, 0.066, -0.115],
    adsCant: [0, 0, 0.003],
    eyeRelief: 0.34,
    sprintPos: [0.09, -0.25, -0.28],
    sprintRot: [-0.42, 0.5, 0.14],
    lowReadyPos: [0.1, -0.26, -0.32],
    lowReadyRot: [-0.44, 0.105, -0.07],
    swayScale: 1.15,
    bobScale: 1.1,
    magLen: 0.108,
  },
};

/* ========================================================================== */
/*  THE ARSENAL — added weapons                                               */
/* ========================================================================== */

/** The rifle's bore-axis-solved poses, shared by every shouldered long gun. */
const LONG_POSE = {
  hipPos: [0.118, -0.185, -0.3],
  hipRot: [-0.05, 0.081, -0.135],
  adsCant: [0, 0, 0.004],
  sprintPos: [0.09, -0.262, -0.275],
  sprintRot: [-0.4, 0.6, 0.2],
  lowReadyPos: [0.112, -0.28, -0.289],
  lowReadyRot: [-0.46, 0.125, -0.09],
};

Object.assign(WEAPON_DEFS, {
  /**
   * Pump shotgun. Nine pellets in a real cone, a pump stroke between shots, a
   * shell-by-shell reload that any trigger pull interrupts, and damage that
   * falls off LINEARLY (falloffExp 1) so it is brutal at 5 m and a courtesy
   * at 30.
   */
  shotgun: {
    id: 'shotgun',
    displayName: 'SHRIKE 12',
    label: 'SHRIKE 12',
    blurb: '12-gauge pump. Nine pellets, eight shells, and a strong opinion about doorways.',
    class: 'shotgun',
    slot: 'primary',
    model: 'shotgun',
    audio: 'shotgun',
    caliber: '12ga',
    rpm: 68,
    modes: ['pump'],
    action: 'pump',
    cycleTime: 0.62,
    burstCount: 1, burstRpm: 68, burstDelay: 0.1,
    magSize: 8,
    reserve: 32,
    reloadStyle: 'shell',
    reloadStart: 0.36,
    reloadShell: 0.5,
    reloadEnd: 0.5,
    pellets: 9,
    pelletSpread: 3.4,
    pelletSpreadAds: 2.5,
    muzzleVelocity: 420,
    damage: 22,
    penetration: 0.3,
    dropoff: 0.08,
    falloffExp: 1,
    maxRange: 48,
    dragK: 0.9,
    tracerEvery: 1,
    spreadHip: 1.2,
    spreadAds: 0.4,
    spreadPerShot: 0.3,
    spreadMax: 2.2,
    spreadDecay: 3,
    recoil: {
      pitch: 0.034, yaw: 0.006, kickBack: 0.05, kickUp: 0.018, roll: 0.06, punch: 0.8,
      freq: 6.5, damping: 0.45, patternLength: 8, patternSeed: 0x51a7e2, climbShape: [1.0], drift: 1.2,
    },
    adsTime: 0.26,
    adsFov: 0.8,
    viewFov: 0.88,
    reloadTac: 2.4,
    reloadEmpty: 2.9,
    inspectTime: 3.0,
    drawTime: 0.6,
    holsterTime: 0.42,
    ...LONG_POSE,
    eyeRelief: 0.2,
    swayScale: 1.1,
    bobScale: 1.05,
    magLen: 0.07,
    moveMult: 0.95,
    noise: 110,
  },

  /**
   * Belt-fed light machine gun with a 100-round box. Slow to aim, slow to move
   * with, climbs hard, and reloads like an argument. Its rounds suppress
   * (weapon:fire.suppression) well above a rifle's.
   */
  lmg: {
    id: 'lmg',
    displayName: 'BUZZARD 762',
    label: 'BUZZARD 762',
    blurb: '7.62 belt-fed LMG, 100-round box. Suppresses the target, the street and the shooter.',
    class: 'lmg',
    slot: 'primary',
    model: 'lmg',
    audio: 'lmg',
    caliber: '7.62x51',
    rpm: 720,
    modes: ['auto'],
    burstCount: 3, burstRpm: 720, burstDelay: 0.2,
    magSize: 100,
    reserve: 200,
    muzzleVelocity: 840,
    damage: 38,
    penetration: 1.7,
    dropoff: 0.68,
    maxRange: 520,
    dragK: 0.24,
    tracerEvery: 2,
    spreadHip: 3.6,
    spreadAds: 0.34,
    spreadPerShot: 0.22,
    spreadMax: 5.2,
    spreadDecay: 3.0,
    recoil: {
      pitch: 0.0112, yaw: 0.0034, kickBack: 0.022, kickUp: 0.008, roll: 0.036, punch: 0.42,
      freq: 7.2, damping: 0.4, patternLength: 60, patternSeed: 0x7715c3,
      climbShape: [1.6, 1.45, 1.35, 1.25, 1.2, 1.15, 1.1], drift: 0.7,
    },
    adsTime: 0.44,
    adsFov: 0.74,
    viewFov: 0.86,
    reloadTac: 5.4,
    reloadEmpty: 6.2,
    inspectTime: 3.4,
    drawTime: 0.95,
    holsterTime: 0.55,
    ...LONG_POSE,
    hipPos: [0.122, -0.2, -0.31],
    eyeRelief: 0.2,
    swayScale: 1.25,
    bobScale: 1.2,
    magLen: 0.12,
    moveMult: 0.8,
    suppression: 1.8,
    noise: 130,
  },

  /**
   * Bolt-action sniper rifle under a 12x scope. One round to the head or upper
   * chest; a bolt stroke between shots; a scope overlay (and no viewmodel)
   * when fully aimed; hold SHIFT while scoped to steady the sway.
   */
  sniper: {
    id: 'sniper',
    displayName: 'OSPREY 338',
    label: 'OSPREY 338',
    blurb: '.338 bolt-action under a 12x scope. One shot, if you do your part.',
    class: 'sniper',
    slot: 'primary',
    model: 'sniper',
    audio: 'sniper',
    caliber: '.338 LM',
    rpm: 46,
    modes: ['bolt'],
    action: 'bolt',
    cycleTime: 1.05,
    burstCount: 1, burstRpm: 46, burstDelay: 0.1,
    magSize: 5,
    reserve: 25,
    muzzleVelocity: 900,
    damage: 125,
    penetration: 2.6,
    dropoff: 0.9,
    maxRange: 950,
    dragK: 0.12,
    tracerEvery: 1,
    spreadHip: 6.5,
    spreadAds: 0.0,
    spreadPerShot: 1.2,
    spreadMax: 7,
    spreadDecay: 4,
    recoil: {
      pitch: 0.045, yaw: 0.006, kickBack: 0.06, kickUp: 0.02, roll: 0.05, punch: 1.0,
      freq: 5.5, damping: 0.5, patternLength: 5, patternSeed: 0x3a8b1d, climbShape: [1.0], drift: 0.6,
    },
    scope: { fov: 15, overlay: 'sniper', sway: 1.0, sens: 0.22 },
    adsTime: 0.46,
    adsFov: 0.74,
    viewFov: 0.86,
    reloadTac: 3.3,
    reloadEmpty: 3.9,
    inspectTime: 3.4,
    drawTime: 0.85,
    holsterTime: 0.5,
    ...LONG_POSE,
    eyeRelief: 0.09,
    swayScale: 1.3,
    bobScale: 1.15,
    magLen: 0.09,
    moveMult: 0.88,
    noise: 170,
  },

  /** Semi-automatic 7.62 marksman rifle under a 4x combat optic. */
  marksman: {
    id: 'marksman',
    displayName: 'FALCON 762',
    label: 'FALCON 762',
    blurb: 'Semi-auto 7.62 marksman rifle, 4x optic. Two to the chest; one if you aim higher.',
    class: 'marksman',
    slot: 'primary',
    model: 'marksman',
    audio: 'marksman',
    caliber: '7.62x51',
    rpm: 320,
    modes: ['semi'],
    burstCount: 1, burstRpm: 320, burstDelay: 0.1,
    magSize: 20,
    reserve: 100,
    muzzleVelocity: 830,
    damage: 56,
    penetration: 1.9,
    dropoff: 0.82,
    maxRange: 700,
    dragK: 0.18,
    tracerEvery: 2,
    spreadHip: 3.8,
    spreadAds: 0.05,
    spreadPerShot: 0.6,
    spreadMax: 4.5,
    spreadDecay: 4.2,
    recoil: {
      pitch: 0.021, yaw: 0.004, kickBack: 0.03, kickUp: 0.011, roll: 0.04, punch: 0.55,
      freq: 7, damping: 0.44, patternLength: 20, patternSeed: 0x2c61f9, climbShape: [1.0], drift: 0.8,
    },
    scope: { fov: 21, overlay: 'marksman', sway: 0.55, sens: 0.35 },
    adsTime: 0.34,
    adsFov: 0.74,
    viewFov: 0.86,
    reloadTac: 2.6,
    reloadEmpty: 3.3,
    inspectTime: 3.2,
    drawTime: 0.7,
    holsterTime: 0.45,
    ...LONG_POSE,
    eyeRelief: 0.085,
    swayScale: 1.1,
    bobScale: 1.05,
    magLen: 0.14,
    moveMult: 0.92,
    noise: 120,
  },

  /**
   * The KESTREL with a can on it. Quieter in every sense: a suppressed report,
   * a small flash, and a hearing radius (weapon:fire.noise) a quarter of an
   * unsuppressed rifle's, which is what AI perception keys off.
   */
  carbine_sd: {
    id: 'carbine_sd',
    displayName: 'KESTREL 556 SD',
    label: 'KESTREL 556 SD',
    blurb: 'The KESTREL with a suppressor. Quieter, which Command describes as "tactful".',
    class: 'carbine',
    slot: 'primary',
    model: 'carbine_sd',
    audio: 'suppressed',
    suppressed: true,
    caliber: '5.56x45',
    rpm: 800,
    modes: ['auto', 'semi'],
    burstCount: 3, burstRpm: 950, burstDelay: 0.16,
    magSize: 30,
    reserve: 210,
    muzzleVelocity: 850,
    damage: 29,
    penetration: 0.9,
    dropoff: 0.55,
    maxRange: 320,
    dragK: 0.3,
    tracerEvery: 0,
    spreadHip: 1.95,
    spreadAds: 0.22,
    spreadPerShot: 0.26,
    spreadMax: 3.2,
    spreadDecay: 3.9,
    recoil: {
      pitch: 0.0074, yaw: 0.0018, kickBack: 0.016, kickUp: 0.006, roll: 0.028, punch: 0.3,
      freq: 8.8, damping: 0.42, patternLength: 30, patternSeed: 0x6b1e54,
      climbShape: [1.35, 1.22, 1.1, 1.03, 1.0], drift: 0.5,
    },
    adsTime: 0.22,
    adsFov: 0.74,
    viewFov: 0.86,
    reloadTac: 2.05,
    reloadEmpty: 2.8,
    inspectTime: 3.2,
    drawTime: 0.62,
    holsterTime: 0.4,
    hipPos: [0.12, -0.186, -0.31],
    hipRot: [-0.05, 0.081, -0.125],
    adsCant: [0, 0, 0],
    eyeRelief: 0.105,
    sprintPos: [0.09, -0.262, -0.28],
    sprintRot: [-0.4, 0.6, 0.2],
    lowReadyPos: [0.112, -0.28, -0.295],
    lowReadyRot: [-0.46, 0.125, -0.09],
    swayScale: 1.0,
    bobScale: 1,
    magLen: 0.17,
    moveMult: 0.97,
    noise: 22,
    flashScale: 0.3,
    flashIntensity: 0.35,
    flashLight: 0.2,
  },

  /** Full-auto machine pistol: a sidearm that behaves like a hose. */
  mpistol: {
    id: 'mpistol',
    displayName: 'WREN 9',
    label: 'WREN 9',
    blurb: 'Select-fire 9 mm machine pistol, 20-round extended magazine. Empties itself quickly.',
    class: 'pistol',
    slot: 'secondary',
    model: 'mpistol',
    audio: 'mpistol',
    caliber: '9x19',
    rpm: 1100,
    modes: ['auto', 'semi'],
    burstCount: 3, burstRpm: 1100, burstDelay: 0.12,
    magSize: 20,
    reserve: 100,
    muzzleVelocity: 370,
    damage: 21,
    penetration: 0.35,
    dropoff: 0.4,
    maxRange: 150,
    dragK: 0.48,
    tracerEvery: 4,
    spreadHip: 3.0,
    spreadAds: 0.8,
    spreadPerShot: 0.36,
    spreadMax: 5.2,
    spreadDecay: 5.0,
    recoil: {
      pitch: 0.0078, yaw: 0.0042, kickBack: 0.011, kickUp: 0.0085, roll: 0.022, punch: 0.24,
      freq: 10, damping: 0.42, patternLength: 20, patternSeed: 0x1f77bd, climbShape: [1.2, 1.1, 1.0], drift: 1.4,
    },
    adsTime: 0.15,
    adsFov: 0.86,
    viewFov: 0.92,
    reloadTac: 1.7,
    reloadEmpty: 2.2,
    inspectTime: 2.6,
    drawTime: 0.32,
    holsterTime: 0.24,
    fastSwap: 1.6,
    hipPos: [0.115, -0.15, -0.34],
    hipRot: [-0.05, 0.066, -0.115],
    adsCant: [0, 0, 0.003],
    eyeRelief: 0.34,
    sprintPos: [0.09, -0.25, -0.28],
    sprintRot: [-0.42, 0.5, 0.14],
    lowReadyPos: [0.1, -0.26, -0.32],
    lowReadyRot: [-0.44, 0.105, -0.07],
    swayScale: 1.2,
    bobScale: 1.1,
    magLen: 0.15,
    moveMult: 1.0,
    noise: 80,
  },

  /**
   * Unguided rocket launcher. One in the tube and two spare; a real projectile
   * (rockets.js) that ignites, accelerates, trails smoke and ARMS at 6 m — an
   * impact inside the arming distance is a dud, so it can never go off in the
   * shooter's face.
   */
  rocket: {
    id: 'rocket',
    displayName: 'PELICAN RL',
    label: 'PELICAN RL',
    blurb: 'Unguided 84 mm launcher. One in the tube, two on the back. Arms at 6 metres, as the manual stresses.',
    class: 'launcher',
    slot: 'secondary',
    model: 'rocket',
    audio: 'rocket',
    caliber: '84 mm',
    rpm: 40,
    modes: ['single'],
    burstCount: 1, burstRpm: 40, burstDelay: 0.1,
    magSize: 1,
    reserve: 2,
    muzzleVelocity: 30,
    damage: 0,
    penetration: 0,
    dropoff: 1,
    maxRange: 400,
    dragK: 0,
    tracerEvery: 0,
    projectile: {
      kind: 'rocket',
      speed: 30,
      maxSpeed: 78,
      thrust: 110,
      burn: 0.7,
      gravity: 1.2,
      armDistance: 6,
      radius: 8.5,
      damage: 420,
      impulse: 170,
      life: 5,
    },
    spreadHip: 2.6,
    spreadAds: 0.25,
    spreadPerShot: 0,
    spreadMax: 2.6,
    spreadDecay: 3,
    recoil: {
      pitch: 0.05, yaw: 0.01, kickBack: 0.07, kickUp: 0.02, roll: 0.05, punch: 1.2,
      freq: 5, damping: 0.5, patternLength: 1, patternSeed: 0x6e0c41, climbShape: [1.0], drift: 0.2,
    },
    adsTime: 0.5,
    adsFov: 0.8,
    viewFov: 0.88,
    reloadTac: 4.6,
    reloadEmpty: 4.6,
    inspectTime: 3.0,
    drawTime: 1.0,
    holsterTime: 0.6,
    hipPos: [0.13, -0.2, -0.3],
    hipRot: [-0.05, 0.07, -0.08],
    adsCant: [0, 0, 0],
    eyeRelief: 0.14,
    sprintPos: [0.1, -0.27, -0.27],
    sprintRot: [-0.38, 0.55, 0.18],
    lowReadyPos: [0.112, -0.28, -0.29],
    lowReadyRot: [-0.46, 0.125, -0.09],
    swayScale: 1.3,
    bobScale: 1.2,
    magLen: 0.3,
    moveMult: 0.85,
    noise: 150,
  },
});

/**
 * GUNSMITH (attachments.js, EXPANSION §10.2): what each gun takes, per slot.
 * The stock part (`null`) is always allowed and not listed: the carbine's holo,
 * the rifle / SMG / LMG tube dot, the shotgun's ghost ring. Scoped guns keep
 * their scope (no optic slot); the launcher takes nothing.
 */
const OPTICS = ['reddot', 'holo', 'acog'];
const MUZZLES = ['suppressor', 'compensator', 'flashhider'];
const BARRELS = ['longbarrel', 'shortbarrel'];
const GRIPS = ['vgrip', 'agrip'];
const MAGS = ['extmag', 'fastmag'];
const LASER = ['laser'];
const ALLOWS = {
  carbine: { optic: ['reddot', 'acog'], muzzle: MUZZLES, barrel: BARRELS, underbarrel: GRIPS, magazine: MAGS, laser: LASER },
  carbine_sd: { optic: ['reddot', 'acog'], underbarrel: GRIPS, magazine: MAGS, laser: LASER },
  rifle: { optic: OPTICS, muzzle: MUZZLES, barrel: BARRELS, underbarrel: GRIPS, magazine: MAGS, laser: LASER },
  smg: { optic: OPTICS, muzzle: MUZZLES, barrel: BARRELS, magazine: MAGS, laser: LASER },
  shotgun: { optic: ['reddot', 'holo'], laser: LASER },
  lmg: { optic: OPTICS, muzzle: MUZZLES, magazine: MAGS, laser: LASER },
  marksman: { muzzle: MUZZLES, barrel: BARRELS, underbarrel: GRIPS, magazine: MAGS, laser: LASER },
  sniper: { muzzle: ['suppressor'], barrel: BARRELS, magazine: MAGS, laser: LASER },
  pistol: { muzzle: ['suppressor', 'compensator'], magazine: MAGS, laser: LASER },
  mpistol: { muzzle: ['suppressor', 'compensator'], magazine: MAGS, laser: LASER },
  rocket: {},
};
for (const [id, allows] of Object.entries(ALLOWS)) if (WEAPON_DEFS[id]) WEAPON_DEFS[id].allows = allows;

/** Slot of each weapon (primary / secondary) for the loadout. */
const DEFAULT_SLOT = { carbine: 'primary', rifle: 'primary', smg: 'primary', pistol: 'secondary' };

/**
 * Fill every def with the registry defaults, so every consumer can read every
 * field without guarding: slot, model, action, pellets, reload style, move
 * multiplier, suppression and hearing radius.
 */
export function normalizeDef(d) {
  const out = { ...d };
  out.slot = d.slot ?? DEFAULT_SLOT[d.id] ?? 'primary';
  out.model = d.model ?? d.id;
  out.action = d.action ?? 'auto';
  out.pellets = d.pellets ?? 1;
  out.reloadStyle = d.reloadStyle ?? 'mag';
  out.moveMult = d.moveMult ?? (d.class === 'smg' ? 1.03 : d.class === 'pistol' ? 1.05 : 1.0);
  out.suppression = d.suppression ?? 1;
  out.noise = d.noise ?? (d.class === 'pistol' ? 70 : 90);
  out.falloffExp = d.falloffExp ?? 2;
  out.scope = d.scope ?? null;
  out.projectile = d.projectile ?? null;
  out.suppressed = d.suppressed === true;
  out.fastSwap = d.fastSwap ?? 1;
  out.cycleTime = d.cycleTime ?? 60 / d.rpm;
  out.allows = d.allows ?? {};
  return out;
}

/** Registry order: primaries, then secondaries. */
export const WEAPON_IDS = [
  'carbine', 'rifle', 'smg', 'shotgun', 'lmg', 'marksman', 'sniper', 'carbine_sd',
  'pistol', 'mpistol', 'rocket',
];

/**
 * Generate the deterministic recoil pattern for a weapon.
 *
 * The shape is what a player learns: a strong vertical climb for the first few
 * shots, then the vertical settles while the muzzle starts to wander sideways
 * in a smooth, repeatable S. Everything comes from one fixed seed so the same
 * weapon always kicks the same way — including in capture mode.
 *
 * @returns {Float32Array} pairs of [pitch, yaw] in radians, length n*2.
 */
export function buildRecoilPattern(def, Rng) {
  const r = def.recoil;
  const n = r.patternLength;
  const rng = new Rng(r.patternSeed);
  const out = new Float32Array(n * 2);
  // Two out-of-phase wanders make the horizontal read as a learnable snake
  // rather than as noise.
  const phase = rng.float() * Math.PI * 2;
  const phase2 = rng.float() * Math.PI * 2;
  const bias = rng.signed() * 0.35;
  for (let i = 0; i < n; i++) {
    const shot = i;
    const climb = r.climbShape[Math.min(shot, r.climbShape.length - 1)];
    // Vertical: strong early, tapering, with a per-shot signature bump.
    const sig = 0.88 + rng.float() * 0.24;
    out[i * 2] = r.pitch * climb * sig;
    // Horizontal: a smooth snake plus a fixed per-shot signature.
    const t = i / Math.max(1, n - 1);
    const snake =
      Math.sin(phase + t * Math.PI * 2.6) * 0.75 + Math.sin(phase2 + t * Math.PI * 5.1) * 0.35;
    out[i * 2 + 1] = r.yaw * (snake * r.drift * 3.2 + bias + rng.signed() * 0.25);
  }
  return out;
}

/**
 * Throwables. Fuse times are TOTAL, cook included: the fuse starts when the pin
 * comes out at the end of the prime, so holding the key eats into it and a frag
 * held for 3.5 s goes off in the hand.
 *
 * Damage is handed to the canonical `explosion` event and applied by each
 * target's own listener (ai: damage x (1-d/r)^2 with a blast-to-eye occlusion
 * ray; player: damage x (1-d/r)^1.6, occluded blasts only shake). 250 over 7 m
 * is what makes a frag reliably lethal to a soldier inside ~2.5 m and wounding
 * out to ~5 m under those two curves; `impulse` 108 keeps the prop/ragdoll
 * shove on the reference frag the physics blast was calibrated against.
 */
export const EQUIPMENT_DEFS = {
  frag: {
    id: 'frag',
    slot: 'lethal',
    displayName: 'M67 FRAG',
    fuse: 3.5,
    radius: 7,
    damage: 250,
    impulse: 108,
    count: 2,
    max: 2,
    throwSpeed: 17,
    loft: 8, // degrees above the view axis
    gravityScale: 0.62,
    shape: 'sphere',
    mass: 0.4,
    restitution: 0.34,
    friction: 0.7,
  },
  flash: {
    id: 'flash',
    slot: 'tactical',
    displayName: 'M84 FLASH',
    fuse: 1.5,
    radius: 16,
    count: 2,
    max: 2,
    throwSpeed: 16,
    loft: 7,
    gravityScale: 0.62,
    shape: 'capsule',
    mass: 0.34,
    restitution: 0.28,
    friction: 0.72,
  },
};

export const SPREAD_MODS = {
  crouch: 0.78,
  prone: 0.6,
  still: 0.82,
  walking: 1.15,
  sprinting: 2.2,
  airborne: 2.0,
  hipfire: 1,
};

export const DEG2RAD = DEG;
