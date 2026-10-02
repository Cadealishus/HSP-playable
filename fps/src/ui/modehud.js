import * as THREE from 'three';
import { el, svg, setText, setStyle, setClass, clamp01, damp, ease, mmss } from './util.js';

/**
 * ===========================================================================
 * MODE HUD — the bot-match layer (TDM / DOMINATION / HARDPOINT / S&D).
 * ===========================================================================
 *
 * Reads the game's preallocated `hudState()` snapshot every frame (see
 * src/game/modes/team.js) and writes only through the cached setText /
 * setStyle / setClass, so an unchanged frame touches no DOM.
 *
 *   score bar   top centre, under the compass (replaces the survival run bar):
 *               ESF score + progress to the limit · clock · hostile score
 *   zone chips  A B C (Domination), the active hardpoint, S&D sites: an owner
 *               fill, a capture-progress ring in the capturing team's colour,
 *               amber when contested, a notch under the one Doug stands in
 *   status      one line: HP rotation timer, S&D role / charge state
 *   S&D         round, alive pips per team, the fuse in red once planted
 *   respawn     K.I.A. card with the killer and the redeploy countdown
 *   spectate    SPECTATING · <name> with the cycle hint (click / space)
 *   confirm     kill confirmation under the reticle: ✕ CALLSIGN
 *
 * World-space zone markers go through the UI's own setObjectives() (compass,
 * minimap, markers) with a team colour; the S&D plant / defuse prompt goes
 * through setPrompt() with its hold progress.
 */

const ESF = 'var(--friend)';
const HOS = 'var(--enemy)';
const NEUTRAL = 'rgba(255,255,255,.5)';
const RING = 2 * Math.PI * 15;
const MAX_CHIPS = 6;
const MAX_PIPS = 6;

const teamColour = (t) => (t === 'esf' ? ESF : t === 'hostile' ? HOS : NEUTRAL);
const markerColour = (t) => (t === 'esf' ? '#A9C6DC' : t === 'hostile' ? '#F2654F' : '#E9B64A');

export class ModeHud {
  constructor(chrome, centre) {
    // ---- score bar --------------------------------------------------------
    this.root = el('div', 'ow-mh', chrome);
    const bar = (this.bar = el('div', 'ow-mh-bar', this.root));
    const l = el('div', 'ow-mh-side esf', bar);
    const lt = el('div', 'ow-mh-top', l);
    el('span', 'ow-mh-team', lt, 'ESF');
    this.scoreE = el('b', 'ow-mh-score', lt, '0');
    this.fillE = el('i', null, el('div', 'ow-mh-prog', l));
    const c = el('div', 'ow-mh-mid', bar);
    this.clock = el('div', 'ow-mh-clock', c, '10:00');
    this.label = el('div', 'ow-mh-label', c, '');
    const r = el('div', 'ow-mh-side hos', bar);
    const rt = el('div', 'ow-mh-top', r);
    this.scoreH = el('b', 'ow-mh-score', rt, '0');
    el('span', 'ow-mh-team', rt, 'HOSTILE');
    this.fillH = el('i', null, el('div', 'ow-mh-prog', r));

    // alive pips (S&D)
    this.pips = el('div', 'ow-mh-pips', this.root);
    this.pipE = [];
    this.pipH = [];
    const pe = el('div', 'ow-mh-pipset esf', this.pips);
    el('span', 'ow-mh-vs', this.pips, 'ALIVE');
    const ph = el('div', 'ow-mh-pipset hos', this.pips);
    for (let i = 0; i < MAX_PIPS; i++) {
      this.pipE.push(el('b', null, pe));
      this.pipH.push(el('b', null, ph));
    }

    // zone chips
    this.chips = el('div', 'ow-mh-chips', this.root);
    this.chipEls = [];
    for (let i = 0; i < MAX_CHIPS; i++) {
      const ch = el('div', 'ow-mh-chip', this.chips);
      const s = svg('svg', { viewBox: '-18 -18 36 36' }, ch);
      svg('circle', { r: 15, class: 'bg' }, s);
      ch._ring = svg('circle', { r: 15, class: 'ring', transform: 'rotate(-90)', 'stroke-dasharray': `0 ${RING}` }, s);
      ch._txt = el('span', null, ch, 'A');
      setStyle(ch, 'display', 'none');
      this.chipEls.push(ch);
    }

    this.status = el('div', 'ow-mh-status', this.root, '');

    // ---- mission objective line (SPECIAL OPERATIONS) -------------------------
    this.mis = el('div', 'ow-mh-mis', this.root);
    this.misK = el('div', 'ow-mh-mis-k', this.mis, '');
    this.misT = el('div', 'ow-mh-mis-t', this.mis, '');
    this.misS = el('div', 'ow-mh-mis-s', this.mis, '');
    setStyle(this.mis, 'display', 'none');

    // ---- centre cards -------------------------------------------------------
    this.respawn = el('div', 'ow-mh-respawn', centre);
    el('div', 'ow-mh-kia', this.respawn, 'K.I.A.');
    this.killer = el('div', 'ow-mh-killer', this.respawn, '');
    this.redeploy = el('div', 'ow-mh-redeploy', this.respawn, '');
    setStyle(this.respawn, 'display', 'none');

    this.spec = el('div', 'ow-mh-spec', chrome);
    el('span', 'ow-mh-spec-k', this.spec, 'SPECTATING');
    this.specName = el('b', null, this.spec, '');
    el('span', 'ow-mh-spec-h', this.spec, 'CLICK · SPACE  NEXT TEAMMATE');
    setStyle(this.spec, 'display', 'none');

    this.confirm = el('div', 'ow-mh-confirm', centre);
    el('i', null, this.confirm, '✕');
    this.confirmName = el('span', null, this.confirm, '');
    this._confirmT = 9;
    setStyle(this.confirm, 'display', 'none');

    this.shown = 0;
    this.spectating = false;
    this.respawning = false;
    this._objs = [];
    this._objKey = '';
    this._promptOn = false;
    this._ui = null;

    // Spectator controls: the engine's input is off while Doug is dead (so the
    // gun cannot fire), so the cycle keys are read here, straight off the DOM.
    this._onSpec = (e) => {
      if (!this.spectating) return;
      if (e.type === 'mousedown' ? e.button === 0 : e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'KeyD') {
        this._ui?.ctx?.peek('game')?.spectateNext?.(1);
      } else if (e.type === 'keydown' && (e.code === 'ArrowLeft' || e.code === 'KeyA')) {
        this._ui?.ctx?.peek('game')?.spectateNext?.(-1);
      }
    };
    addEventListener('mousedown', this._onSpec);
    addEventListener('keydown', this._onSpec);
  }

  /** Kill confirmation under the reticle. */
  confirmKill(name, head) {
    if (!name) return;
    setText(this.confirmName, String(name).toUpperCase());
    setClass(this.confirm, 'head', !!head);
    this._confirmT = 0;
  }

  reset() {
    this.spectating = false;
    this.respawning = false;
    this._objKey = '';
    if (this._promptOn) {
      this._ui?.clearPrompt?.();
      this._promptOn = false;
    }
  }

  /**
   * @param {number} dt   unscaled seconds
   * @param {object|null} h  game.hudState() for a bot match, else null
   * @param {object} ui   the UI system (setObjectives / setPrompt)
   */
  update(dt, h, ui) {
    this._ui = ui;
    // kill confirm runs in every mode
    this._confirmT += dt;
    const ct = this._confirmT;
    if (ct < 1.3) {
      setStyle(this.confirm, 'display', '');
      const a = ease.outQuad(clamp01(ct / 0.08)) * (1 - ease.inQuad(clamp01((ct - 0.9) / 0.4)));
      setStyle(this.confirm, 'opacity', a.toFixed(3));
      setStyle(this.confirm, 'transform', `translate(-50%,0) scale(${(1.12 - 0.12 * ease.outCubic(clamp01(ct / 0.18))).toFixed(3)})`);
    } else setStyle(this.confirm, 'display', 'none');

    const live = !!h && !h.over;
    this.shown = damp(this.shown, h ? 1 : 0, 10, dt);
    setStyle(this.root, 'display', this.shown < 0.01 ? 'none' : '');
    setStyle(this.root, 'opacity', this.shown.toFixed(3));
    this.spectating = live && !!h.spectating;
    this.respawning = live && !h.spectating && h.respawnIn > 0;
    setStyle(this.spec, 'display', this.spectating ? '' : 'none');
    setStyle(this.respawn, 'display', this.respawning ? '' : 'none');
    if (!h) {
      if (this._promptOn) {
        ui.clearPrompt();
        this._promptOn = false;
      }
      return;
    }

    // ---- mission: an objective line instead of a score bar --------------------
    const mission = h.mode === 'mission';
    setStyle(this.bar, 'display', mission ? 'none' : '');
    setStyle(this.mis, 'display', mission ? '' : 'none');
    if (mission) {
      const ob = h.objective;
      setText(this.misK, h.over ? h.label ?? '' : `OBJECTIVE ${Math.min(ob.total, ob.index + 1)}/${ob.total}`);
      setText(this.misT, ob.text ?? '');
      setText(this.misS, ob.sub ?? '');
      setStyle(this.misS, 'display', ob.sub ? '' : 'none');
    }

    // ---- score bar ----------------------------------------------------------
    const sd = h.mode === 'sd';
    setText(this.scoreE, h.scoreEsf | 0);
    setText(this.scoreH, h.scoreHostile | 0);
    const lim = Math.max(1, h.limit | 0);
    setStyle(this.fillE, 'transform', `scaleX(${clamp01(h.scoreEsf / lim).toFixed(3)})`);
    setStyle(this.fillH, 'transform', `scaleX(${clamp01(h.scoreHostile / lim).toFixed(3)})`);
    const planted = sd && h.bomb?.state === 'planted';
    setText(this.clock, mmss(Math.ceil(h.timeLeft ?? 0)));
    setClass(this.clock, 'hot', planted || (h.timeLeft < 30 && !sd && h.timeLeft > 0));
    setText(this.label, sd ? `ROUND ${h.round ?? 1} · FIRST TO ${h.roundsToWin ?? 4}` : `${h.label} · ${lim}`);

    // ---- alive pips (S&D) ---------------------------------------------------
    setStyle(this.pips, 'display', sd ? '' : 'none');
    if (sd) {
      const n = Math.min(MAX_PIPS, h.teamSize ?? 6);
      for (let i = 0; i < MAX_PIPS; i++) {
        setStyle(this.pipE[i], 'display', i < n ? '' : 'none');
        setStyle(this.pipH[i], 'display', i < n ? '' : 'none');
        setClass(this.pipE[i], 'dead', i >= (h.alive?.esf ?? 0));
        setClass(this.pipH[i], 'dead', i >= (h.alive?.hostile ?? 0));
      }
    }

    // ---- chips ----------------------------------------------------------------
    const objs = h.objectives ?? [];
    let shownChips = 0;
    for (let i = 0; i < MAX_CHIPS; i++) {
      const ch = this.chipEls[i];
      const o = objs[i];
      // Hardpoint shows the active zone only; a mission's waypoint is not a zone.
      const vis = !!o && !mission && (h.mode !== 'hp' || o.active);
      setStyle(ch, 'display', vis ? '' : 'none');
      if (!vis) continue;
      shownChips++;
      setText(ch._txt, o.label);
      setClass(ch, 'esf', o.owner === 'esf');
      setClass(ch, 'hos', o.owner === 'hostile');
      setClass(ch, 'contested', !!o.contested);
      setClass(ch, 'inside', !!o.playerInside);
      setClass(ch, 'planted', !!o.planted);
      const prog = clamp01(o.progress ?? 0);
      ch._ring.setAttribute('stroke-dasharray', `${(prog * RING).toFixed(2)} ${RING.toFixed(2)}`);
      ch._ring.style.stroke = o.planted ? '#E4412E' : o.contested ? '#E9B64A' : h.mode === 'hp' ? 'rgba(255,255,255,.75)' : teamColour(o.capTeam);
    }
    setStyle(this.chips, 'display', shownChips ? '' : 'none');

    // ---- status line --------------------------------------------------------
    let status = '';
    if (h.mode === 'hp') {
      const who = h.contested ? 'CONTESTED' : h.holder === 'esf' ? 'HELD BY ESF' : h.holder === 'hostile' ? 'HELD BY HOSTILES' : 'UNCLAIMED';
      status = `HARDPOINT · MOVES IN ${mmss(Math.ceil(h.rotateIn ?? 0))} · ${who}`;
    } else if (sd) {
      const b = h.bomb;
      const role = h.attacking ? 'ATTACKING' : 'DEFENDING';
      if (h.phase === 'pre') status = `${role} · ROUND BEGINS IN ${Math.ceil(h.phaseLeft ?? 0)}`;
      else if (h.phase === 'post') status = h.message ?? '';
      else if (b?.state === 'planted') status = `CHARGE PLANTED AT ${b.site} · ${h.attacking ? 'DEFEND IT' : 'DEFUSE IT'}`;
      else if (b?.state === 'dropped') status = `${role} · CHARGE DROPPED`;
      else if (b?.carrierIsPlayer) status = `${role} · YOU HAVE THE CHARGE · PLANT AT A OR B`;
      else status = `${role}${h.attacking && b?.carrier ? ' · CHARGE: ' + String(b.carrier).toUpperCase() : ''}`;
    } else if (h.mode === 'dom') {
      let ours = 0;
      let theirs = 0;
      for (const o of objs) {
        if (o.owner === 'esf') ours++;
        else if (o.owner === 'hostile') theirs++;
      }
      status = `ZONES  ESF ${ours} · HOSTILE ${theirs}`;
    } else if (mission) {
      const civ = h.civLimit ? ` · CIVILIAN HITS ${h.civHits | 0}/${h.civLimit}` : '';
      status = `${mmss(Math.floor(h.elapsed ?? 0))} · KILLS ${h.kills | 0}${civ}`;
    } else {
      status = `K ${h.kills | 0} · D ${h.deaths | 0}`;
    }
    setText(this.status, status);
    setClass(this.status, 'hot', planted && !h.attacking);

    // ---- respawn / spectate ---------------------------------------------------
    if (this.respawning) {
      setText(this.killer, h.killer ? 'KILLED BY  ' + h.killer : 'DOUG IS DOWN');
      setText(this.redeploy, `REDEPLOYING IN ${Math.ceil(h.respawnIn)}`);
    }
    if (this.spectating) setText(this.specName, h.spectateName ? String(h.spectateName).toUpperCase() : 'NO TEAMMATES STANDING');

    // ---- prompt -----------------------------------------------------------------
    if (h.prompt && live) {
      ui.setPrompt({ key: 'F', text: h.prompt.text, sub: h.prompt.sub, progress: h.prompt.progress });
      this._promptOn = true;
    } else if (this._promptOn) {
      ui.clearPrompt();
      this._promptOn = false;
    }

    // ---- world markers ----------------------------------------------------------
    this._syncMarkers(h, ui);
  }

  /** Zone / site / charge markers through ui.setObjectives (records reused). */
  _syncMarkers(h, ui) {
    const objs = h.objectives ?? [];
    const list = this._objs;
    let n = 0;
    const put = (pos, label, name, color, lift = 1.6) => {
      let r = list[n];
      if (!r) r = list[n] = { position: new THREE.Vector3(), label: '', name: '', color: '' };
      r.position.set(pos.x, pos.y + lift, pos.z);
      r.label = label;
      r.name = name;
      r.color = color;
      n++;
    };
    for (const o of objs) {
      if (!o.pos) continue;
      if (h.mode === 'mission') {
        put(o.pos, o.label ?? '', o.name ?? 'OBJECTIVE', o.color ?? '#E9B64A', o.lift ?? 1.6);
        continue;
      }
      if (h.mode === 'hp' && !o.active) continue;
      let name;
      if (h.mode === 'sd') name = h.attacking ? (o.planted ? 'DEFEND' : 'PLANT') : o.planted ? 'DEFUSE' : 'DEFEND';
      else if (o.owner === 'esf') name = 'DEFEND';
      else name = 'CAPTURE';
      const col = h.mode === 'sd' ? (o.planted ? '#E4412E' : '#E9B64A') : o.contested ? '#E9B64A' : markerColour(o.owner);
      put(o.pos, o.label, name, col);
    }
    const b = h.bomb;
    if (h.mode === 'sd' && b && b.state === 'dropped' && h.attacking && b.pos) put(b.pos, '!', 'CHARGE', '#E9B64A', 0.6);
    list.length = Math.max(list.length, n);
    const view = this._view ?? (this._view = []);
    view.length = n;
    for (let i = 0; i < n; i++) view[i] = list[i];
    ui.setObjectives(view);
  }

  dispose() {
    removeEventListener('mousedown', this._onSpec);
    removeEventListener('keydown', this._onSpec);
    this.root.remove();
    this.respawn.remove();
    this.spec.remove();
    this.confirm.remove();
  }
}
