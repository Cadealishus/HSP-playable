/**
 * AI — the enemy's names and radio net.
 *
 * FLOP OPS tone rule: the enemy is a real hostile force in real kit, and the
 * only thing that is funny about them is what they are called and what they say
 * on the radio. Everything here is delivered completely straight.
 *
 * FACTION is what the UI shows for the opposing force. CALLSIGNS feed the
 * killfeed (`agent.name`). RADIO holds the subtitle lines for `ai:radio`.
 */

export const FACTION = Object.freeze({
  /** Full name, for wave banners / briefings. */
  name: 'INTERIM ARMED COMMITTEE',
  /** Short form for tight HUD slots. */
  short: 'THE COMMITTEE',
});

/**
 * Killfeed callsigns, assigned in spawn order. Once the pool runs out it
 * recycles with a regnal number (GARY II, THE INTERN II, ...), which is how the
 * Committee handles succession planning.
 */
export const CALLSIGNS = Object.freeze([
  'GARY',
  'THE INTERN',
  'BACKUP GARY',
  'STEVE (ACTING)',
  'DENNIS',
  'OTHER DENNIS',
  'KEITH',
  'NEW KEITH',
  'CLIVE',
  'NIGEL (TEMP)',
  'BIG MARTIN',
  'SMALL MARTIN',
  'TREVOR',
  'PAUL (NIGHTS)',
  'ROGER',
  'NOT LEN',
]);

const ROMAN = ['', '', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];

/** Callsign for the i-th soldier spawned this session. */
export function callsign(i) {
  const base = CALLSIGNS[i % CALLSIGNS.length];
  const gen = ((i / CALLSIGNS.length) | 0) + 1;
  return base + (ROMAN[gen] ?? ` ${gen}`);
}

/**
 * Radio chatter, one list per `kind`. `{name}` is replaced with the fallen
 * squadmate's callsign on `mandown`. Deadpan: nobody on this net ever raises
 * their voice.
 */
export const RADIO = Object.freeze({
  spot: [
    "Contact. It's him.",
    "Eyes on one hostile. He's just standing there.",
    'Contact front. Does anyone have the plan?',
    "Visual on the target. Only one. Somehow that's worse.",
    'Hostile spotted. Everyone act normal.',
  ],
  cover: [
    'Moving to cover.',
    "In cover. It's a crate. It'll do.",
    'Taking cover. This wall looks structural.',
    'Holding here. This is where I live now.',
    'In position. Please nobody shoot the wall.',
  ],
  grenade: [
    'Frag out.',
    'Grenade out. Probably the right way.',
    'Throwing one. Nobody go and fetch it this time.',
    'Frag out. That was my only one.',
    'Grenade. Everybody stop standing there.',
  ],
  mandown: [
    "Man down. {name}'s down.",
    "We've lost {name}. Update the roster.",
    '{name} is down. Who has his sandwiches?',
    "Man down. That's the second {name} this week.",
    "{name}'s gone. I'll take his parking space.",
  ],
});

/**
 * Per-kind cooldowns across the whole net, in seconds. A subtitle has to be
 * readable, and a squad of four all shouting "contact" in the same second is
 * one call, not four.
 */
const KIND_GAP = { spot: 7, cover: 9, grenade: 2.5, mandown: 2 };
/** Minimum gap between any two lines. Urgent kinds cut the queue harder. */
const NET_GAP = 2.2;
const URGENT_GAP = 0.9;

/**
 * The radio net. Deterministic: lines are picked by a per-kind rotation seeded
 * with the speaker's id, never by an RNG draw, so adding chatter cannot shift
 * any gameplay random stream. Emits `ai:radio { enemy, kind, text }`.
 */
export class RadioNet {
  constructor(ctx) {
    this.ctx = ctx;
    this._last = -Infinity;
    this._kindLast = { spot: -Infinity, cover: -Infinity, grenade: -Infinity, mandown: -Infinity };
    this._seq = { spot: 0, cover: 0, grenade: 0, mandown: 0 };
    /** Every line said this session, newest last (bounded). Dev/verification only. */
    this.log = [];
  }

  /**
   * Say a line if the net is clear. Returns the text, or null when throttled.
   * @param enemy  the speaking Agent
   * @param kind   'spot' | 'cover' | 'grenade' | 'mandown'
   * @param about  optional Agent the line is about (the fallen man on mandown)
   */
  say(enemy, kind, about = null) {
    const lines = RADIO[kind];
    if (!lines || !enemy) return null;
    const now = this.ctx.time.elapsed;
    const urgent = kind === 'grenade' || kind === 'mandown';
    if (now - this._last < (urgent ? URGENT_GAP : NET_GAP)) return null;
    if (now - this._kindLast[kind] < KIND_GAP[kind]) return null;
    this._last = now;
    this._kindLast[kind] = now;
    const i = (this._seq[kind]++ + (enemy.id | 0)) % lines.length;
    let text = lines[i];
    if (text.includes('{name}')) text = text.split('{name}').join(about?.name ?? 'Gary');
    this.log.push({ t: now, name: enemy.name, kind, text });
    if (this.log.length > 32) this.log.shift();
    this.ctx.events.emit('ai:radio', { enemy, kind, text });
    return text;
  }
}
