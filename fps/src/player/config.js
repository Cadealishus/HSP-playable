// Player tuning. Units: metres, seconds, degrees (unless noted). Numbers are chosen against
// Modern Warfare II / III reference values (TrueGameData / sym.gg style measurements):
// ~4.9 m/s base move, ~6.6 m/s sprint, ~8.2 m/s tactical sprint, ~1 m jump, ~20 m/s² gravity
// (IW engine g = 800 in/s²), 18" (0.45 m) step height, ~3 s tactical sprint.
export const TUNING = {
  radius: 0.35,
  skin: 0.015, // KCC offset

  // Capsule total height and camera eye height per stance.
  height: { stand: 1.8, crouch: 1.25, slide: 1.25, prone: 0.78 },
  eye: { stand: 1.62, crouch: 1.05, slide: 0.84, prone: 0.4, dead: 0.26 },
  stanceTime: 0.2, // seconds for eye height to settle after a stance change

  // Ground speeds (m/s). ADS speeds are for adsAmount = 1.
  speed: { walk: 4.9, ads: 2.7, crouch: 2.3, crouchAds: 1.55, prone: 0.95, sprint: 6.6, tac: 8.2 },
  strafeMult: 0.9, // pure strafe speed multiplier
  backMult: 0.75, // pure backpedal multiplier

  // Acceleration model (m/s²): vector move-towards with case-dependent rates.
  accel: 34, // speeding up to walk speed (0 → 4.9 in ~0.15 s)
  sprintAccel: 10, // extra speed above walk speed (walk → sprint ~0.17 s, → tac ~0.33 s)
  decel: 30, // no input: 4.9 → 0 in ~0.16 s, sprint stop ~0.22 s
  slowDecel: 16, // above target speed but still steering (e.g. sprint released)
  airAccel: 7, // air strafing
  airDrag: 0.25,

  // Vertical
  gravity: 19.5,
  jumpHeight: 1.0, // feet clearance of a standing jump
  terminalVelocity: 45,
  coyoteTime: 0.12,
  jumpBuffer: 0.15,
  landSlowdown: 0.018, // fraction of horizontal speed lost per m/s of impact speed (capped)

  // Rapier KCC
  stepHeight: 0.45,
  stepMinWidth: 0.12,
  snapToGround: 0.45,
  maxSlopeClimb: 50,
  minSlopeSlide: 55,

  sprint: { minForward: 0.3 },
  tac: { duration: 3.0, rechargeDelay: 0.35, rechargeTime: 4.0, minToStart: 0.2 },

  slide: {
    minSpeed: 5.4, // must be sprinting at least this fast
    boost: 1.5, // m/s added on entry (applied over `boostTime`)
    boostTime: 0.08,
    maxSpeed: 10.2,
    friction: 4.6, // constant decel m/s²
    frictionLin: 0.22, // + per m/s decel
    slopeGain: 0.75, // fraction of gravity along the slope that feeds the slide
    endSpeed: 3.0,
    maxTime: 1.25,
    cooldown: 0.55,
    minCancelTime: 0.12,
    steerRate: 0.6, // rad/s the slide direction can bend towards input
    jumpKeep: 0.95, // horizontal speed kept on slide-jump
  },

  mantle: {
    minHeight: 0.42, // below this autostep / jump handles it
    maxHeight: 1.92, // ledge height above feet
    airMaxAbove: 1.55, // in the air: ledge height above current feet
    reach: 0.62, // how far in front of the capsule a ledge may be
    maxAngle: 55, // max angle between view forward and wall normal
    vaultMaxHeight: 1.3,
    vaultMaxDepth: 0.75, // obstacle thicker than this = mantle onto it
    timeBase: 0.26, // duration = timeBase + timePerMetre * height
    timePerMetre: 0.22,
    vaultTime: 0.46,
    exitSpeed: 2.2,
    vaultExitSpeed: 4.2,
  },

  fall: { minHeight: 4.0, lethalHeight: 11.0 }, // fall damage 0 at min, 100 at lethal
  health: { max: 100, regenDelay: 4.0, regenRate: 40 },
  respawnDelay: 3.6,

  // Stride = metres per footstep (drives head bob frequency and footstep events).
  stride: { walk: 1.72, ads: 1.1, sprint: 2.15, tac: 2.45, crouch: 0.95, prone: 0.62 },
  // Head bob amplitude (metres of vertical travel). CoD bob is subtle; the viewmodel does most of it.
  bob: { walk: 0.011, ads: 0.004, sprint: 0.024, tac: 0.03, crouch: 0.008, prone: 0.006, lateral: 0.55, roll: 0.35 },

  // FOV additions in CoD horizontal-4:3 degrees.
  fov: { sprint: 3, tac: 6.5, slide: 4.5, rate: 7 },
  slideRoll: 5.5, // degrees

  recoil: { recoverFraction: 0.62, recoverDelay: 0.07, recoverRate: 9, sustainedRate: 1.6, punch: 0.3 },
};

export const STEP = 1 / 120; // simulation runs inside physics fixed sub-steps
