import { SurvivalMode } from './survival.js';
import { TdmMode } from './tdm.js';
import { DomMode } from './dom.js';
import { HpMode } from './hp.js';
import { SdMode } from './sd.js';
import { aiCaps } from './team.js';

/**
 * MODE REGISTRY (docs/EXPANSION.md §4). The menu lists what `availableModes`
 * says is playable in the running build: bot matches need the AI's team and
 * order support (`ai.setOrderProvider`), which is what makes ESF bots fight on
 * Doug's side; without it they are not offered at all.
 */
export const MODES = {
  survival: SurvivalMode,
  tdm: TdmMode,
  dom: DomMode,
  hp: HpMode,
  sd: SdMode,
};

/** Menu copy. Serious presentation; the jokes are in the sentences. */
export const MODE_INFO = {
  tdm: {
    id: 'tdm',
    label: 'TEAM DEATHMATCH',
    short: 'TDM',
    blurb: 'Two teams. One objective: the other team. Command has confirmed this is the whole plan.',
    rules: ['6 V 6 · ESF BOTS ON YOUR SIDE', 'FIRST TO 50 KILLS · 10:00', 'RESPAWN AFTER 4 S'],
  },
  dom: {
    id: 'dom',
    label: 'DOMINATION',
    short: 'DOM',
    blurb: 'Three zones. Hold more of them than the other side does. Command calls this strategy.',
    rules: ['CAPTURE A · B · C', '1 POINT PER ZONE PER SECOND · FIRST TO 200', 'RESPAWN AFTER 4 S'],
  },
  hp: {
    id: 'hp',
    label: 'HARDPOINT',
    short: 'HP',
    blurb: 'One zone at a time. It moves every sixty seconds. Nobody has asked it why.',
    rules: ['HOLD THE ZONE UNCONTESTED · 1 POINT PER SECOND', 'ZONE ROTATES EVERY 60 S · FIRST TO 150', 'RESPAWN AFTER 4 S'],
  },
  sd: {
    id: 'sd',
    label: 'SEARCH & DESTROY',
    short: 'S&D',
    blurb: 'One life per round. Attackers plant the charge. Defenders stop them, or defuse it. Politely.',
    rules: ['FIRST TO 4 ROUNDS · SIDES SWAP AFTER ROUND 3', 'NO RESPAWNS · SPECTATE WHEN DOWN', 'PLANT 4 S · FUSE 40 S · DEFUSE 6 S'],
  },
  survival: {
    id: 'survival',
    label: 'SURVIVAL',
    short: 'SURVIVAL',
    blurb: 'Hold the position against escalating waves. Command estimates about a wave.',
    rules: ['WAVES ESCALATE · SPECIALISTS FROM WAVE 3', 'RESUPPLY BETWEEN WAVES', 'ONE (1) ADDITIONAL CHANCE'],
  },
};

/** Why a mode is (not) playable right now. */
export function modeAvailable(id, ctx) {
  if (!MODES[id]) return { ok: false, why: 'unknown mode' };
  if (id === 'survival') return { ok: true };
  const caps = aiCaps(ctx);
  if (!caps.spawn) return { ok: false, why: 'no AI' };
  if (!caps.orders || !caps.teams) return { ok: false, why: 'AI team support pending' };
  return { ok: true };
}
