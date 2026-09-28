import { el, setText, setStyle, setClass, clamp01, ease } from './util.js';

/**
 * ===========================================================================
 * COMMAND RADIO — the subtitle track.
 * ===========================================================================
 *
 * Bottom-centre, one line at a time, speaker name then line, the way a modern
 * military shooter subtitles its radio net. This is where most of the game's
 * writing lives, so the rules are strict:
 *
 *   Command   perfect military cadence, complete sentences, total confidence
 *             in a plan that is visibly not working. Never jokes. Never winks.
 *   Doug      one to four words. Flat. Practical. Never an exclamation mark.
 *
 * Each game event has several variants; a Command line may carry a Doug reply
 * that plays after it. Variants are picked from the UI's own RNG fork (never
 * Math.random) and never repeat back to back within a category.
 *
 * `{n}` in a line is the wave number, `{m}` the streak multiplier.
 */
export const RADIO_LINES = {
  /** First wave of a run: the briefing, over the net. */
  deploy: [
    ['Doug, Command. You are cleared to hold the square. Hold it for as long as it takes.', 'Copy.'],
    ['Command to Doug. Intelligence estimates this will take about a wave. Intelligence is one man, but he is very sure.', 'Understood.'],
    ['Doug, the plan is simple. Phase one: hold the square. Phase two: Doug.', 'Noted.'],
    ['Doug, Command. Air support is available on request. Requests are currently closed.', 'Fine.'],
    ['Command to all ESF units. All ESF units, this is Command. That was the roll call, Doug.', 'Present.'],
  ],
  /** Every wave after the first. */
  wave: [
    ['Command estimates this is the final wave. Command estimated that last time, and stands by both estimates.', 'Sure.'],
    ['Hostiles inbound. More than expected, fewer than feared. Roughly as many as there are.', 'Okay.'],
    ['Doug, we have revised the estimate from "about a wave" to "about another wave".', 'Copy.'],
    ['Wave {n} inbound. Command would like to reassure you that this is going to plan.', 'Which plan.'],
    ['Doug, be advised: there are more of them. Command has counted twice.', 'Thanks.'],
  ],
  /** Wave cleared, breather starts. */
  clear: [
    ['Square is holding. Command is logging this as a success. Provisionally.', 'Great.'],
    ['Good work, Doug. Command has told the Minister it went fine.', 'It did.'],
    ['Wave {n} repelled. Command is updating the estimate. Please stand by.', null],
    ['Nice shooting. The paperwork on those is going to be enormous.', 'Not mine.'],
    ['Wave cleared. Command has upgraded the situation from "bad" to "ongoing".', 'Noted.'],
  ],
  /** Health has dropped into the red. */
  hurt: [
    ['Doug, your vitals are concerning. Command is concerned in a supportive capacity.', 'Fine.'],
    ['Medical advises you stop being shot.', 'Working on it.'],
    ['Doug, you appear to be bleeding. Is that part of the plan?', 'No.'],
    ['Your health is low. Find cover. Cover is the thing the bullets are not going through.', null],
  ],
  /** Multiplier climbing, or a multi-kill. */
  streak: [
    ['Command is seeing a lot of confirmed kills. Please slow down, the forms are backing up.', 'No.'],
    ['Excellent work, Doug. Command will be taking partial credit.', 'Sure.'],
    ['That is a multiplier of {m}. Command does not know what that means, but it looks good on a slide.', null],
    ['Doug, the enemy has asked us to stop doing that.', 'Denied.'],
    ['Confirmed. Command is recommending you for a medal. The medal is also recommending you.', 'Okay.'],
  ],
  /** Doug has gone down. */
  down: [
    ['Doug is down. Repeat, Doug is down. Command is going to need a moment.', 'Ow.'],
    ['We have lost Doug. Can someone check whether we have lost Doug.', 'Mostly.'],
    ['Doug, Command. You appear to be lying down. Was that ordered?', 'No.'],
    ['Doug is down. Command is reviewing the plan. The plan was Doug.', null],
  ],
  /** One more chance, granted. */
  continue: [
    ['Request approved. You have one (1) more chance. Please use it more carefully than the first.', 'Will do.'],
    ['Doug, you are back in. Command has decided the earlier incident did not happen.', 'Agreed.'],
    ['Additional chance authorised. There is no form for a third.', 'Understood.'],
  ],
  /** Operation over. */
  over: [
    ['Operation concluded. Command is calling it a strategic success.', null],
    ['That will do, Doug. The square was held for as long as it took.', 'Okay.'],
    ['All units, the operation is complete. The estimate stands.', 'It does.'],
  ],
};

/**
 * Who interrupts whom. A higher tier cuts off whatever is playing; an equal or
 * lower tier queues behind it (one slot) or is dropped.
 */
const TIER = { hurt: 1, streak: 1, clear: 2, wave: 2, deploy: 3, continue: 4, down: 4, over: 5 };

/** Seconds a category must rest before it can speak again. */
const COOLDOWN = { hurt: 22, streak: 18 };

/** Speaker display names. */
const SPEAKER = { command: 'COMMAND', doug: 'DOUG' };

/** Reading time for one line, seconds. */
function lineLife(text) {
  let words = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 32) words++;
  return Math.min(7, Math.max(1.6, 1.1 + words * 0.3));
}

export class RadioSubs {
  /**
   * @param {HTMLElement} parent
   * @param {{ int:(lo:number,hi:number)=>number }} rng  a UI-owned fork
   */
  constructor(parent, rng) {
    this.rng = rng;
    this.root = el('div', 'ow-radio', parent);
    this.line = el('div', 'ow-radio-line', this.root);
    this.who = el('span', 'ow-radio-who', this.line, SPEAKER.command);
    this.txt = el('span', 'ow-radio-txt', this.line, '');

    /** Current line: speaker, text, life, elapsed; plus the reply parked behind it. */
    this.cur = { speaker: 'command', text: '', life: 0, t: 1e9, tier: 0 };
    this.reply = null;
    this._replyGap = 0;
    /** One queued Command line (the next event while this one is speaking). */
    this.queued = null;

    this._last = Object.create(null);
    this._rest = Object.create(null);
    this.shown = 0;
    setStyle(this.root, 'display', 'none');
  }

  /**
   * Speak a line for a game event.
   * @param {keyof RADIO_LINES} kind
   * @param {{n?:number, m?:number}} [vars]
   * @param {{force?:boolean}} [opts] force = ignore the cooldown
   */
  say(kind, vars, opts) {
    const bank = RADIO_LINES[kind];
    if (!bank || !bank.length) return false;
    if (!opts?.force && (this._rest[kind] ?? 0) > 0) return false;

    // No immediate repeats within a category.
    let i = bank.length > 1 ? this.rng.int(0, bank.length - 1) : 0;
    if (bank.length > 1 && i === this._last[kind]) i = (i + 1) % bank.length;
    this._last[kind] = i;
    if (COOLDOWN[kind]) this._rest[kind] = COOLDOWN[kind];

    const entry = {
      kind,
      tier: TIER[kind] ?? 1,
      text: fill(bank[i][0], vars),
      reply: bank[i][1] ? fill(bank[i][1], vars) : null,
    };

    const busy = this.cur.t < this.cur.life || this.reply;
    if (!busy || entry.tier > this.cur.tier) {
      this._play(entry);
    } else if (!this.queued || entry.tier >= this.queued.tier) {
      this.queued = entry;
    }
    return true;
  }

  /**
   * Hostile radio chatter (ai:radio). Lowest priority: only shown when the net is
   * quiet, never interrupts or queues behind Command.
   */
  hostile(callsign, text) {
    if (!text || this.cur.t < this.cur.life || this.reply || this.queued) return false;
    this._play({ kind: 'hostile', tier: 0.5, text, reply: null }, callsign || 'HOSTILE');
    return true;
  }

  /** Put a specific line up immediately (debug / capture). */
  sayExact(speaker, text, reply = null, tier = 3) {
    this._play({ kind: 'exact', tier, text, reply }, speaker);
  }

  _play(entry, speaker = 'command') {
    this._show(speaker, entry.text, entry.tier);
    this.reply = entry.reply;
    this._replyGap = 0.3;
  }

  _show(speaker, text, tier) {
    const c = this.cur;
    c.speaker = speaker;
    c.text = text;
    c.life = lineLife(text);
    c.t = 0;
    c.tier = tier;
    setText(this.who, SPEAKER[speaker] ?? String(speaker).toUpperCase());
    setText(this.txt, text);
    setClass(this.line, 'doug', speaker === 'doug');
    setClass(this.line, 'hostile', speaker !== 'doug' && speaker !== 'command');
  }

  clear() {
    this.cur.t = 1e9;
    this.cur.tier = 0;
    this.reply = null;
    this.queued = null;
    this.shown = 0;
    setStyle(this.root, 'display', 'none');
  }

  /** @param {number} dt unscaled seconds — the radio keeps talking through slow-mo */
  update(dt) {
    for (const k in this._rest) if (this._rest[k] > 0) this._rest[k] -= dt;

    const c = this.cur;
    if (c.t < c.life) {
      c.t += dt;
    } else if (this.reply) {
      this._replyGap -= dt;
      if (this._replyGap <= 0) {
        const r = this.reply;
        this.reply = null;
        this._show('doug', r, c.tier);
        c.life = Math.max(1.4, c.life);
      }
    } else if (this.queued) {
      const q = this.queued;
      this.queued = null;
      this._play(q);
    }

    // Per-line fade: 0.14 s in, 0.3 s out. Between a line and its reply the
    // plate dips but the gap is short enough that it reads as one exchange.
    const live = c.t < c.life;
    let a = 0;
    if (live) {
      const inT = clamp01(c.t / 0.14);
      const outT = clamp01((c.t - (c.life - 0.3)) / 0.3);
      a = ease.outQuad(inT) * (1 - ease.inQuad(outT));
    }
    this.shown = a;
    if (a < 0.004) {
      setStyle(this.root, 'display', 'none');
      return;
    }
    setStyle(this.root, 'display', '');
    setStyle(this.root, 'opacity', a.toFixed(3));
  }

  dispose() {
    this.root.remove();
  }
}

function fill(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}
