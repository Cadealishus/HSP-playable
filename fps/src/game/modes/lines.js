/**
 * COMMAND ON THE NET — announcer copy for the bot-match modes.
 *
 * Tone (docs/FLOP_OPS.md): Command speaks in perfect military cadence with
 * total confidence in a plan that is visibly not working. Doug answers in one
 * to four flat words, never an exclamation mark. The modes pick a variant from
 * their own RNG fork and emit `mode:announce { text, kind, reply }`; the UI
 * subtitles it on the existing radio track.
 *
 * `{z}` zone letter · `{n}` round / number · `{limit}` score limit.
 */
export const MODE_LINES = {
  'tdm.start': [
    ['Team Deathmatch. Command recommends killing them before they kill you.', 'Noted.'],
    ['Team Deathmatch. First team to {limit} wins. Command has not decided what they win.', 'Fine.'],
    ['Six of ours, six of theirs. Command has run the numbers and they are equal.', 'Copy.'],
  ],
  'tdm.close': [
    ['Five more and this is over. Command can already smell the medal.', 'Sure.'],
    ['We are close. Command would like to remind everyone that close does not count.', null],
  ],
  'tdm.threat': [
    ['The enemy is five kills from victory. Command considers this their problem to solve, Doug.', 'Mine.'],
  ],
  'dom.start': [
    ['Domination. Command recommends dominating.', 'Copy.'],
    ['Three zones. Take them. Keep them. Command will handle the metaphor.', 'Sure.'],
    ['Domination. A, B and C. Command has named them in order of importance, alphabetically.', 'Okay.'],
  ],
  'dom.captured': [
    ['{z} secured. Command is updating the slide.', null],
    ['We have {z}. Hold it. Holding is the part after taking.', 'Copy.'],
    ['{z} is ours. Command would like that minuted.', null],
  ],
  'dom.lost': [
    ["We've lost {z}. Command would like it back.", 'Noted.'],
    ['{z} has been taken. Command is choosing to see this as temporary.', null],
    ['The enemy has {z}. Nobody tell the Minister.', 'Okay.'],
  ],
  'hp.start': [
    ['Hardpoint. Hold the zone. When the zone moves, follow it. Do not ask why it moves.', 'Okay.'],
    ['Hardpoint. One zone, one minute, then another zone. Command did not design this.', 'Fine.'],
  ],
  'hp.move': [
    ['Hardpoint moving. Command recommends moving with it.', null],
    ['The zone has relocated. The zone did not consult Command.', 'Typical.'],
    ['New hardpoint. Same instructions. Stand in it.', 'Copy.'],
  ],
  'hp.held': [
    ['We hold the hardpoint. Keep standing in it. That is the whole plan.', null],
    ['Hardpoint secured. Command has upgraded this to a position.', 'Great.'],
  ],
  'hp.lostHold': [
    ['The enemy holds the hardpoint. Command suggests standing in it instead of them.', 'Working on it.'],
    ['They have the zone. Command would like them removed from it.', 'Copy.'],
  ],
  'sd.start': [
    ['Search and Destroy. One life each. Command suggests keeping it.', 'Understood.'],
    ['Search and Destroy. Command reminds you there are no additional chances. There is no form.', 'Fine.'],
  ],
  'sd.attack': [
    ['Round {n}. We are attacking. Plant the charge at A or B. Command has no preference.', 'Copy.'],
    ['Round {n}. We attack. Somebody carry the charge. Not upside down.', 'Noted.'],
  ],
  'sd.defend': [
    ['Round {n}. We are defending. Do not let them plant the charge.', 'Copy.'],
    ['Round {n}. Defence. Command would like both sites to still exist afterwards.', 'Sure.'],
  ],
  'sd.plantedUs': [
    ['Charge planted. Defend it. Do not stand on it.', 'Noted.'],
    ['The charge is set. Forty seconds. Command is counting on its fingers.', null],
  ],
  'sd.plantedThem': [
    ['The enemy has planted a charge. Defuse it. The red wire, probably.', 'Probably.'],
    ['Charge planted on our site. Command recommends it not going off.', 'Agreed.'],
  ],
  'sd.defusedUs': [
    ['Charge defused. Command is exhaling.', null],
    ['Defused. Doug, please put it down gently.', 'Done.'],
  ],
  'sd.defusedThem': [
    ['They defused it. Command has questions for the charge.', null],
  ],
  'sd.detonatedUs': [
    ['Target destroyed. As planned. Command would like that minuted.', 'Loud.'],
  ],
  'sd.detonatedThem': [
    ['That was our site. Command is reviewing the defensive posture.', 'Yeah.'],
  ],
  'sd.roundWon': [
    ['Round won. Command calls it tidy.', null],
    ['Round to us. Command is pretending it was never worried.', 'Sure.'],
  ],
  'sd.roundLost': [
    ['Round lost. Command is reviewing the tape.', null],
    ['Round to them. Command recommends not doing that again.', 'Noted.'],
  ],
  'sd.timeUs': [
    ['Time. Nothing exploded. Command considers that a win.', null],
  ],
  'sd.timeThem': [
    ['Time. The charge was never planted. Command is disappointed in the charge.', 'And us.'],
  ],
  'sd.half': [
    ['Switching sides. Same plan, other direction.', 'Copy.'],
    ['Halftime. Swap sides. Command has had a biscuit.', null],
  ],
  'sd.lastAlive': [
    ['Doug, you are the last one. Command has faith. Command has a limited supply of faith.', 'Great.'],
  ],
  'ffa.start': [
    ['Free for all. There are no teams. Command has checked twice.', 'Fine.'],
    ['Free for all. Everyone is the enemy. Command considers this simplifying.', 'Copy.'],
    ['Free for all. First to {limit}. Command recommends not being shot by anyone.', 'Noted.'],
  ],
  'ffa.close': [
    ['Five more, Doug. Command has started writing the citation in pencil.', 'Sure.'],
  ],
  'ffa.threat': [
    ['{name} is five from winning. Command would prefer it was you.', 'Me too.'],
    ['{name} is close. Command has no idea whose side {name} is on. Nobody\'s, technically.', 'Right.'],
  ],
  'ffa.won': [
    ['Free for all won. Command is taking full credit, as is tradition.', 'Sure.'],
    ['First place. Command has always believed in you, retroactively.', 'Okay.'],
  ],
  'ffa.lost': [
    ['{name} has won the free for all. Command is reviewing whether {name} was ever ours.', 'He wasn\'t.'],
    ['Match to {name}. Command describes your placement as a placement.', 'Noted.'],
  ],
  'kc.start': [
    ['Kill Confirmed. A kill does not count until you collect the tags. Command needs the paperwork.', 'Copy.'],
    ['Kill Confirmed. Pick up their tags to confirm. Pick up ours to deny. Do not pick up anything else.', 'Noted.'],
  ],
  'kc.confirmUs': [
    ['Kill confirmed. Command has the receipt.', null],
    ['Confirmed. That is {n}. Command is filing them alphabetically.', null],
  ],
  'kc.denyUs': [
    ['Kill denied. Command appreciates the tidiness.', null],
  ],
  'gun.start': [
    ['Gun Game. Every kill, a new weapon. {n} tiers. The last one is a knife. Command did not design this.', 'Okay.'],
    ['Gun Game. Kill to advance. Finish with the knife. Command assures you there is a reason.', 'Is there.'],
  ],
  'gun.pistol': [
    ['Pistol. Two tiers left. Command recommends getting closer.', 'Copy.'],
  ],
  'gun.knifeTier': [
    ['Final tier, Doug. Knife only. Command recommends approaching from behind.', 'Noted.'],
    ['One knife kill wins it. Command is not watching. Command is watching.', 'Okay.'],
  ],
  'gun.knifeOnly': [
    ['That does not count. Knife, Doug. Command was very specific.', 'Fine.'],
  ],
  'gun.threat': [
    ['{name} is on the final tier. Command recommends not letting him near you.', 'Noted.'],
  ],
  'gun.setbackUs': [
    ['Setback. You have been demoted by knife. Command will not be mentioning this.', 'Thanks.'],
    ['Knifed. One tier down. Command recommends facing the other way next time.', 'Noted.'],
  ],
  'gun.setbackThem': [
    ['{name} has been set back a tier. Command is pretending that was planned.', null],
    ['{name}, demoted by knife. Command has sent a card.', null],
  ],
  'gun.setbackFloor': [
    ['Knifed on tier one. There is no tier zero. Command checked.', 'Good.'],
  ],
  'match.won': [
    ['Victory. Command is taking full credit.', 'Sure.'],
    ['That is the match. Command will be mentioning this at every opportunity.', 'Okay.'],
  ],
  'match.lost': [
    ['Defeat. Command is calling it a strategic repositioning.', 'Right.'],
    ['Match lost. Command has already begun blaming the map.', null],
  ],
  'match.draw': [
    ['Draw. Command is calling it a win.', 'It isn\'t.'],
  ],
};

/** Deterministic pick from a bank; never repeats back to back. */
export class LinePicker {
  constructor(rng) {
    this.rng = rng;
    this._last = Object.create(null);
  }

  pick(key, vars) {
    const bank = MODE_LINES[key];
    if (!bank || !bank.length) return null;
    let i = bank.length > 1 ? this.rng.int(0, bank.length - 1) : 0;
    if (bank.length > 1 && i === this._last[key]) i = (i + 1) % bank.length;
    this._last[key] = i;
    return { text: fill(bank[i][0], vars), reply: bank[i][1] ? fill(bank[i][1], vars) : null };
  }
}

function fill(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}
