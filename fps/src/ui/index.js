import * as THREE from 'three';
import { installStyles, removeStyles } from './style.js';
import { el, clamp, clamp01, damp, setStyle } from './util.js';
import { Crosshair } from './crosshair.js';
import { Hitmarkers } from './hitmarkers.js';
import { DamageArcs } from './damage.js';
import { HealthFx } from './health.js';
import { AmmoPanel } from './ammo.js';
import { Killfeed } from './killfeed.js';
import { Compass, RunBar } from './compass.js';
import { Minimap } from './minimap.js';
import { WorldMarkers } from './markers.js';
import { Prompt, Banner } from './prompts.js';
import { PauseMenu } from './menu.js';
import { CombatDemo } from './demo.js';
import { AttractScreen, DeathScreen, GameOverScreen } from './screens.js';
import { BoardsScreen } from './boards.js';
import { CabinetMode } from './cabinet.js';
import { shareRun, copyLink } from './sharecard.js';

/**
 * NO CALLSIGN TABLE HERE — deliberately.
 *
 * There used to be a copy of the contract's ten LEGACY CORE SECURITY callsigns
 * in this file, duplicating `CALLSIGNS` in src/ai/index.js, and it existed only
 * to invent a name when an event didn't carry one. Every live soldier already
 * carries its own `agent.name` (callsign, assigned in AiSystem.spawn) and
 * `agent.variantDisplay` (faction rank: ENFORCER / CONSULTANT / AUDITOR), and
 * both ride on the payloads this subsystem receives. The killfeed reads those.
 * If a payload has no name, the row says so or is dropped — it does not guess.
 */

const MAX_BLIPS = 48;

/** How stale the last enemy round may be and still be blamed for your death. */
const ATTACKER_MEMORY_S = 6;

/**
 * submit-score error codes → Arcade Terminal copy. Terse, uppercase, and it
 * always tells the player what to DO next — an error message that only names
 * the fault is a dead end on a cabinet with a queue behind it.
 */
const SUBMIT_ERRORS = {
  bad_initials: 'THREE LETTERS A–Z.',
  blocked_initials: 'NOT ON A CONFERENCE SCREEN. PICK ANOTHER THREE.',
  bad_job: 'RUN DATA CORRUPT — RUN IT BACK.',
  out_of_range: 'RUN DATA CORRUPT — RUN IT BACK.',
  implausible: 'THE LEDGER DOES NOT BALANCE. THIS RUN WAS NOT FILED.',
  rate_limited: 'TOO MANY FILINGS THIS HOUR. COOL OFF.',
  bad_token: 'RUN TOKEN EXPIRED — RUN IT BACK.',
  token_spent: 'ALREADY FILED.',
  insert_failed: 'THE BOARD IS DOWN. TRY AGAIN.',
  server_error: 'THE BOARD IS DOWN. TRY AGAIN.',
};

/**
 * ===========================================================================
 * HUD / UI subsystem
 * ===========================================================================
 *
 * A DOM+CSS overlay (see style.js for the design system) driven entirely from
 * `lateUpdate`, after the camera has reached its final transform for the frame.
 * Nothing animates on a CSS keyframe or transition: every value is integrated
 * from `dt` here, which is what makes the capture harness deterministic and
 * lets the whole HUD freeze correctly when the game is paused.
 *
 * ---------------------------------------------------------------------------
 * PUBLIC API — `const ui = ctx.get('ui')`
 * ---------------------------------------------------------------------------
 *   ui.hitmarker(kind)                  'hit' | 'armour' | 'head' | 'kill'
 *   ui.damageNumber(worldPos, n, kind)  'hit' | 'hs' | 'armour' | 'kill'
 *   ui.hurt(amount, dirX, dirZ)         directional arc + flash + flinch
 *   ui.killfeed.push({attacker,attackerVariant,victim,victimVariant,headshot,
 *                     mine,attackerFriendly})  |  ui.killfeed.push({note})
 *   ui.banner.show(title, sub, life)    kill / objective confirmation
 *   ui.setPrompt({key,text,sub,progress}) / ui.clearPrompt()
 *   ui.setObjectives([{position,label,name}])
 *   ui.setBlips([{x,z,kind:'enemy'|'friend',heading}])
 *   ui.spawnGrenade(worldPos, fuse)
 *   ui.setMatch({scoreUs,scoreThem,timeLeft,mode})
 *   ui.setHudVisible(bool)              hide everything (cinematics)
 *   ui.pause() / ui.resume() / ui.menu.toggle()
 *   ui.debugState('combat'|'menu'|'clean')
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS SUBSYSTEM READS FROM OTHERS (all optional, all duck-typed)
 * ---------------------------------------------------------------------------
 *   weapons.getHudState() -> { name, mode, ammo, reserve, magSize, reloading,
 *                              reloadProgress, ads, spread, lethalCount,
 *                              tacticalCount }
 *   player.getHudState()  -> { health, maxHealth, armour, maxArmour, regen,
 *                              move, sprint, crouch, ads, airborne, position }
 *                            (or plain `player.health` / `player.position`)
 *   ai.agents             -> live Agent[]; read `.alive`, `.position`, `.yaw`,
 *                            `.name` (callsign) and `.variantDisplay` (rank)
 *   audio.playUi(id, gain) | audio.play(id) — hit ticks, heartbeat, warnings
 *
 * Events consumed: weapon:fire, weapon:reload, damage:dealt, damage:taken,
 * player:death, player:state, explosion, resize, game:*.
 * Events emitted:  ui:pause, ui:quality, ui:sensitivity, ui:fov, ui:setting.
 */
export class UiSystem {
  static id = 'ui';
  static deps = ['render'];

  async init(ctx) {
    this.ctx = ctx;
    this.rng = ctx.rng.fork();
    installStyles();

    const host = document.getElementById('ui') ?? document.body;
    this.root = el('div', 'ow-hud', host);

    // Stacking order: hurt overlays sit under the HUD, the menu over everything.
    this.hurtLayer = el('div', 'ow-layer', this.root);
    this.worldLayer = el('div', 'ow-layer', this.root);
    this.centreLayer = el('div', 'ow-layer', this.root);
    this.chromeLayer = el('div', 'ow-layer', this.root);

    this.health = new HealthFx(this.hurtLayer, this.chromeLayer);
    this.markers = new WorldMarkers(this.worldLayer, this.rng.fork());
    this.arcs = new DamageArcs(this.centreLayer);
    this.crosshair = new Crosshair(this.centreLayer);
    this.hit = new Hitmarkers(this.centreLayer);
    this.minimap = new Minimap(this.chromeLayer, this.rng.fork());
    this.compass = new Compass(this.chromeLayer);
    this.runBar = new RunBar(this.chromeLayer);
    this.killfeed = new Killfeed(this.chromeLayer);
    this.ammo = new AmmoPanel(this.chromeLayer);
    this.prompt = new Prompt(this.chromeLayer);
    this.banner = new Banner(this.chromeLayer);

    // Arcade meta-screens (over the HUD chrome, under the pause menu).
    this.attract = new AttractScreen(
      this.root,
      (job) => this._startRun(job),
      () => this.showBoards()
    );
    this.death = new DeathScreen(this.root, {
      onContinue: () => {
        this.death.hide();
        ctx.events.emit('ui:continue', {});
        ctx.input?.requestPointerLock?.();
      },
      onAccept: () => {
        ctx.events.emit('ui:accept', {});
      },
    });
    this.over = new GameOverScreen(this.root, {
      onRestart: () => {
        this.over.hide();
        this._resetRunState();
        ctx.events.emit('ui:restart', {});
        ctx.input?.requestPointerLock?.();
      },
      onSubmit: (initials) => this._submitScore(initials),
      onSkip: () => this.over.setSkipped(),
      onShare: () => this._shareRun(),
      onCopy: () => this._copyShareLink(),
      onBoards: () => this.showBoards(),
    });

    // THE BOARD. Reads through the game subsystem's leaderboard client at
    // runtime (ctx.peek), never an import — src/ui owns no network code.
    this.boards = new BoardsScreen(this.root, {
      fetchBoard: (opts) => this._fetchBoard(opts),
      onClose: () => this.hideBoards(),
    });

    // `?cabinet=1`: fullscreen, attract loop, 60s idle reset.
    this.cabinet = new CabinetMode(this.root, {
      onPage: (page) => this._cabinetPage(page),
      onIdleReset: () => this._cabinetIdleReset(),
    });

    /** Result of the last submit — drives the share card + board highlight. */
    this._lastSubmit = null;
    /** The run behind the current game-over card. */
    this._runData = null;
    /** Which screen the boards overlay was opened from, so BACK returns there. */
    this._boardsFrom = null;

    this.menu = new PauseMenu(this.root, ctx);

    this.health.onBeat = (i) => this.sfx('heartbeat', 0.35 + i * 0.5);

    /** Single source of truth for everything the HUD draws. */
    this.state = {
      health: 100,
      maxHealth: 100,
      armour: 0,
      maxArmour: 150,
      regen: false,
      ammo: 30,
      reserve: 210,
      magSize: 30,
      reloading: false,
      reloadProgress: 0,
      weaponName: 'RULES ENGINE MK4',
      fireMode: 'AUTO',
      lethalCount: 2,
      tacticalCount: 1,
      move: 0,
      sprint: false,
      crouch: false,
      ads: false,
      airborne: false,
      baseSpread: 5.5,
      mode: 'HOLD THE LEDGER',
      // ---- HOLD THE LEDGER run state (driven by game:* events) ----
      wave: 1,
      score: 0,
      mult: 1,
      waveThreat: 'HOLD THE LEDGER',
      job: null,
      /** true when no player/weapons subsystem is driving us (stub-safe demo) */
      simulate: false,
      time: 0,
    };

    this.k = 1;
    this.vw = 1920;
    this.vh = 1080;
    this.hudVisible = 1;
    this.hudTarget = 1;
    this._lastRaw = ctx.time.raw;
    /** Time of your last confirmed kill. Read by nothing right now — kept
     *  because it is the honest hook for any future "kills within N seconds"
     *  feedback, and it costs one number. */
    this._lastKillAt = -10;
    /** Freshest enemy that put a round in the player — the death row's source. */
    this._lastAttacker = null;
    this._lastAttackerAt = -1e9;
    this._regenTimer = 0;
    this._hadPointerLock = false;
    this._bakeFrame = 0;

    this._pos = new THREE.Vector3();
    this._prevPos = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._objectives = [];
    this._compassObjs = [];
    this._blips = new Array(MAX_BLIPS);
    for (let i = 0; i < MAX_BLIPS; i++) this._blips[i] = { x: 0, z: 0, kind: 'enemy', heading: 0 };
    this._blipCount = 0;
    this._blipView = [];

    this.demo = null;

    this._unsubs = [];
    const on = (type, fn) => this._unsubs.push(ctx.events.on(type, fn));

    on('weapon:fire', (e) => {
      this.crosshair.onFire(e?.recoil ?? 1);
      if (this.state.simulate) return;
      const w = this._weaponState();
      if (!w) this.state.ammo = Math.max(0, this.state.ammo - 1);
    });

    on('weapon:reload', (e) => {
      const s = this.state;
      if (e?.phase === 'start') {
        s.reloading = true;
        s.reloadProgress = 0;
      } else if (e?.phase === 'end') {
        s.reloading = false;
        if (!this._weaponState()) {
          const take = Math.min(s.magSize - s.ammo, s.reserve);
          s.ammo += take;
          s.reserve -= take;
        }
      }
    });

    on('damage:dealt', (e) => {
      if (!e) return;
      // The payload means "damage dealt TO e.target". `ai` uses it for enemy
      // rounds that connect with the player, which must not draw a hitmarker or
      // a "YOU killed" killfeed row — that arrives as `damage:taken` below.
      if (this._isPlayerTarget(e.target)) {
        // …but it IS the only truthful attacker data in the game: src/ai puts
        // the firing soldier on the round it sends at you (`source: agent`).
        // Stash the freshest one so the death row can name who actually did it
        // instead of inventing somebody.
        if (e.source) {
          this._lastAttacker = e.source;
          this._lastAttackerAt = ctx.time.elapsed;
        }
        return;
      }
      const kind = e.killed ? 'kill' : e.headshot ? 'head' : e.armour ? 'armour' : 'hit';
      this.hitmarker(kind);
      if (e.point) {
        this.damageNumber(
          e.point,
          e.amount ?? 0,
          e.killed ? 'kill' : e.headshot ? 'hs' : e.armour ? 'armour' : 'hit'
        );
      }
      if (e.killed) {
        this._lastKillAt = ctx.time.elapsed;
        // `AUDITOR ▸ COBOL`: the faction rank and the callsign, both read off
        // the actual Agent that just died. No fallback rotation.
        this.killfeed.push({
          attacker: 'YOU',
          victim: e.target?.name ?? e.name ?? null,
          victimVariant: e.target?.variantDisplay ?? null,
          headshot: !!e.headshot,
          mine: true,
        });
        // Score-feed copy (NERDCON_CONTRACT): headshot = SAR FILED +150, else CARD DECLINED +100.
        this.banner.show(e.headshot ? 'SAR FILED' : 'CARD DECLINED', e.headshot ? '+150' : '+100', 1.6, 'kill');
        // Defensive fallback: if no `game` subsystem drives the score, still move
        // the counter locally so the run bar is never static. game:score overrides.
        if (!this.ctx.peek('game')) this.state.score += e.headshot ? 150 : 100;
      }
    });

    on('damage:taken', (e) => {
      const amount = e?.amount ?? 10;
      if (e?.health !== undefined) this.state.health = e.health;
      else this.state.health = Math.max(0, this.state.health - amount);
      let dx = 0;
      let dz = 1;
      if (e?.from) {
        this._tmp.copy(e.from).sub(this._playerPos());
        dx = this._tmp.x;
        dz = this._tmp.z;
      }
      this.hurt(amount, dx, dz);
    });

    // ------------------------------------------------------------------ //
    // THERE IS NO `actor:death` KILLFEED ROW, AND THAT IS THE FIX.
    //
    // What used to be here read `e?.by?.name` and fell back to a rotating
    // callsign. Both halves were wrong:
    //
    //  1. `actor:death` has no `by` field. Its payload is
    //     `{actor, point, impulse, headshot}` (src/ai/agent.js:943), so the
    //     `??` fallback fired 100% of the time and printed a LEGACY CORE
    //     SECURITY soldier credited with a kill it did not make.
    //  2. Its "already credited" guard could never work. `ai` emits
    //     `actor:death` from *inside* its own `damage:dealt` handler, and the
    //     registry topo-sorts `ai` ahead of `ui`, so the death arrived here
    //     BEFORE this subsystem's `damage:dealt` handler had run for the same
    //     round — `_lastKillAt` was always stale. Every player kill therefore
    //     produced two rows: an invented one, and the correct `YOU` row.
    //
    // Nothing in the payload identifies a killer and no other source for one
    // exists, so the row is gone rather than guessed. Kills you make are
    // credited from `damage:dealt` above (which knows it was you); the round
    // that kills YOU is credited from its `source` on `player:death` below. If
    // `actor:death` ever grows a real attacker field, render THAT here — do
    // not reintroduce a rotation.
    // ------------------------------------------------------------------ //

    on('player:death', () => {
      const a = this._lastAttacker;
      const fresh = a && ctx.time.elapsed - this._lastAttackerAt < ATTACKER_MEMORY_S;
      this._lastAttacker = null;
      if (!fresh || !a.name) return; // fell, drowned, unattributable — say nothing
      this.killfeed.push({
        attacker: a.name,
        attackerVariant: a.variantDisplay ?? null,
        victim: 'YOU',
        attackerFriendly: false,
        mine: true,
      });
    });

    // Double kill inside the 1.2s window (src/game/scoring.js). Contract copy:
    // `BATCH PROCESSED`. It lands in the feed, not the banner — see Killfeed.
    on('game:multiKill', (e) => {
      const n = Math.max(2, Math.round(e?.count ?? 2));
      this.killfeed.push({ note: n > 2 ? 'BATCH PROCESSED ×' + n : 'BATCH PROCESSED', mine: true });
      this.sfx('hit_kill', 0.9);
    });

    on('explosion', (e) => {
      if (!e?.position) return;
      this._tmp.copy(e.position).sub(this._playerPos());
      const d = this._tmp.length();
      if (d < (e.radius ?? 6) * 2.5) this.crosshair.onFlinch(0.6);
    });

    on('player:state', (e) => {
      if (!e) return;
      const s = this.state;
      if (e.ads !== undefined) s.ads = !!e.ads;
      if (e.sprinting !== undefined) s.sprint = !!e.sprinting;
      if (e.stance !== undefined) s.crouch = e.stance === 'crouch' || e.stance === 'prone';
    });

    // ==================================================================== //
    // HOLD THE LEDGER game loop (src/game, id `game`). All optional: if the
    // game subsystem never emits, the attract screen + job click alone still
    // release the player into the running game.
    // ==================================================================== //
    on('game:state', (e) => this._setGameState(e?.state));

    on('game:wave', (e) => {
      const wave = e?.wave ?? this.state.wave ?? 1;
      const count = e?.count;
      this.state.wave = wave;
      this.state.waveThreat = 'LEGACY CORE SECURITY';
      const sub = count ? count + ' INBOUND · LEGACY CORE SECURITY' : 'LEGACY CORE SECURITY INBOUND';
      this.banner.show('WAVE ' + wave, sub, 2.4, 'threat');
      this.sfx('wave_start', 0.7);
    });

    on('game:waveClear', (e) => {
      const wave = e?.wave ?? this.state.wave ?? 1;
      const bonus = Math.max(0, Math.round(e?.bonus ?? 0));
      this.banner.show('WAVE ' + wave + ' SETTLED', '+' + bonus.toLocaleString('en-US'), 2.6, 'settle');
      this.sfx('wave_clear', 0.8);
    });

    on('game:score', (e) => {
      if (e?.score !== undefined) this.state.score = e.score;
      if (e?.mult !== undefined) this.state.mult = e.mult;
    });

    on('game:mult', (e) => {
      if (e?.mult !== undefined) this.state.mult = e.mult;
    });

    on('game:continueOffer', () => {
      this._setGameState('down');
      this.death.show({ canContinue: true });
    });

    on('game:over', (e) => {
      this.death.hide();
      this.attract.hide();
      this.hideBoards();
      this.over.show(e ?? {});
      this._armSubmit(e ?? {});
      this.sfx('run_over', 0.8);
    });

    // Capture harness applies a camera shot; clear the attract/end overlays so
    // world + combat shots frame the game, not a menu. (Unknown `default` shot
    // returns before emitting this, so the title screen still captures clean.)
    on('shot:applied', () => {
      this.attract.hide();
      this.death.hide();
      this.over.hide();
      this.hideBoards();
    });

    this.resize(ctx.canvas.clientWidth || innerWidth, ctx.canvas.clientHeight || innerHeight, ctx);
    this._prevPos.copy(this._playerPos());

    // Boot straight into the attract screen (no game subsystem required).
    this.attract.show(true);
  }

  /* ------------------------------------------------------------- helpers -- */

  _weaponState() {
    const w = this.ctx.peek('weapons');
    if (!w) return null;
    const s = typeof w.getHudState === 'function' ? w.getHudState() : w.hudState ?? null;
    return s && typeof s === 'object' ? s : null;
  }

  /** True when a `damage:dealt` payload is aimed at the local player. */
  _isPlayerTarget(t) {
    if (!t) return false;
    return t === 'player' || t === this.ctx.peek('player') || t.isPlayer === true;
  }

  _playerState() {
    const p = this.ctx.peek('player');
    if (!p) return null;
    const s = typeof p.getHudState === 'function' ? p.getHudState() : p.hudState ?? null;
    return s && typeof s === 'object' ? s : null;
  }

  _playerPos() {
    const p = this.ctx.peek('player');
    const pos = p?.position ?? p?.getPosition?.();
    if (pos && pos.isVector3) return this._pos.copy(pos);
    return this._pos.copy(this.ctx.camera.position);
  }

  /** Fire-and-forget audio; the audio subsystem may not exist yet. */
  sfx(id, gain = 1) {
    const a = this.ctx.peek('audio');
    if (!a) return;
    try {
      if (typeof a.playUi === 'function') a.playUi(id, gain);
      else if (typeof a.play === 'function') a.play(id, { gain });
      else if (typeof a.sfx === 'function') a.sfx(id, gain);
    } catch {
      /* audio is optional feedback — never let it break the HUD */
    }
  }

  /* ------------------------------------------------------ game loop glue -- */

  _resetRunState() {
    const s = this.state;
    s.wave = 1;
    s.score = 0;
    s.mult = 1;
    s.waveThreat = 'HOLD THE LEDGER';
  }

  /** Job card clicked on the attract screen → deploy into the run. */
  _startRun(job) {
    this.attract.hide();
    this.death.hide();
    this.over.hide();
    this._resetRunState();
    this.state.job = job ?? 'fraud-analyst';
    const w = {
      'fraud-analyst': 'RULES ENGINE MK4',
      'payments-engineer': 'VELOCITY-9',
      'compliance-officer': 'SIDECAR',
    }[this.state.job];
    if (w) this.state.weaponName = w;
    this.ctx.events.emit('ui:startRun', { job: this.state.job });
    // Hand off to the game's click-to-lock flow (this call is inside the gesture).
    this.ctx.input?.requestPointerLock?.();
  }

  /** Reflect `game:state` transitions onto the meta-screens. */
  _setGameState(state) {
    switch (state) {
      case 'attract':
        this.death.hide();
        this.over.hide();
        this.hideBoards();
        this._resetRunState();
        this._lastSubmit = null;
        this._runData = null;
        this.attract.show();
        break;
      case 'play':
        this.attract.hide();
        this.death.hide();
        this.over.hide();
        this.hideBoards();
        break;
      case 'down':
        this.attract.hide();
        this.over.hide();
        this.hideBoards();
        if (!this.death.open) this.death.show({ canContinue: false });
        break;
      case 'over':
        this.attract.hide();
        this.death.hide();
        if (!this.over.open) this.over.show();
        break;
      default:
        break;
    }
    this.cabinet?.setGameState(state);
  }

  /* ================================================================== */
  /* leaderboard · share · boards · cabinet                             */
  /* ================================================================== */

  /**
   * The Supabase client, owned by src/game. Reached at runtime so this
   * subsystem never imports another's module (ARCHITECTURE.md rule 2), and so
   * the HUD still works with no `game` subsystem registered at all.
   */
  _leaderboard() {
    const lb = this.ctx.peek('game')?.leaderboard;
    return lb?.enabled ? lb : null;
  }

  /** game:over → put the initials selector in front of the player. */
  _armSubmit(d) {
    const lb = this._leaderboard();
    this._lastSubmit = null;
    this._runData = {
      job: d.job ?? this.state.job ?? 'fraud-analyst',
      score: Math.max(0, Math.round(d.score ?? 0)),
      wave: Math.max(1, Math.round(d.wave ?? 1)),
      kills: Math.max(0, Math.round(d.kills ?? 0)),
      accuracy: d.accuracy ?? null,
      duration_s: Math.max(0, Math.round(d.durationS ?? 0)),
      continued: d.continued === true,
    };
    if (!lb) {
      this.over.disableEntry();
      return;
    }
    this.over.armEntry(lb.lastInitials?.() ?? null);
  }

  async _submitScore(initials) {
    const lb = this._leaderboard();
    if (!lb || !this._runData) return;
    this.over.setSubmitting();

    const res = await lb.submit({ ...this._runData, initials });

    if (res.ok) {
      this._lastSubmit = res;
      this.over.setFiled({ rank: res.rank, total: res.total });
      this.sfx('wave_clear', 0.6);
      return;
    }
    if (res.queued) {
      this._lastSubmit = { id: null, queued: true };
      this.over.setQueued();
      return;
    }
    this.over.setRejected(SUBMIT_ERRORS[res.error] ?? res.detail ?? 'THE BOARD REFUSED IT. TRY AGAIN.');
  }

  async _shareRun() {
    if (!this._runData) return;
    const lb = this._leaderboard();
    const id = this._lastSubmit?.id;
    const url = id && lb ? lb.shareUrl(id) : 'https://nerd-of-duty.vercel.app';
    const initials = lb?.lastInitials?.() ?? 'AAA';
    const result = await shareRun({ ...this._runData, initials }, url);
    lb?.beacon('share', { job: this._runData.job, wave: this._runData.wave, score: this._runData.score });
    this.over.setShareStatus(
      { shared: 'SHARED.', downloaded: 'CARD SAVED TO YOUR DOWNLOADS.', cancelled: '', failed: 'COULD NOT BUILD THE CARD.' }[
        result
      ] ?? ''
    );
  }

  async _copyShareLink() {
    const lb = this._leaderboard();
    const id = this._lastSubmit?.id;
    if (!id || !lb) return;
    const ok = await copyLink(lb.shareUrl(id));
    lb.beacon('share', { job: this._runData?.job, wave: this._runData?.wave, score: this._runData?.score });
    this.over.setShareStatus(ok ? 'LINK COPIED.' : 'COPY BLOCKED — SELECT THE URL BY HAND.');
  }

  _fetchBoard(opts) {
    const lb = this._leaderboard();
    if (!lb) return Promise.resolve({ ok: false, error: 'offline' });
    return lb.board(opts);
  }

  /** Open THE BOARD. TODAY is the featured board on a cabinet. */
  showBoards(tab) {
    if (this.boards.open) return;
    this._boardsFrom = this.attract.open ? 'attract' : this.over.open ? 'over' : null;
    this.attract.hide();
    this.over.hide();
    this.boards.show({
      tab: tab ?? (this.cabinet?.active ? 'today' : 'global'),
      highlightId: this._lastSubmit?.id ?? null,
    });
  }

  hideBoards() {
    if (!this.boards.open) return;
    this.boards.hide();
    if (this._boardsFrom === 'attract') this.attract.show();
    else if (this._boardsFrom === 'over') this.over.show();
    this._boardsFrom = null;
  }

  /** Cabinet attract loop page change: title card ↔ the two featured boards. */
  _cabinetPage(page) {
    if (page === 'title') {
      this.boards.hide();
      this._boardsFrom = null;
      this.attract.show();
      return;
    }
    this.attract.hide();
    this.over.hide();
    this._boardsFrom = 'attract';
    this.boards.show({ tab: page, highlightId: null });
  }

  _cabinetIdleReset() {
    this.boards.hide();
    this.over.hide();
    this.death.hide();
    this.menu.close();
    this._boardsFrom = null;
    this.ctx.events.emit('ui:attract', {});
  }

  /* ---------------------------------------------------------------- api --- */

  hitmarker(kind = 'hit') {
    this.hit.spawn(kind);
    this.crosshair.onHit();
    this.sfx(
      kind === 'kill' ? 'hit_kill' : kind === 'head' ? 'hit_head' : kind === 'armour' ? 'hit_armour' : 'hit_flesh',
      kind === 'kill' ? 1 : 0.7
    );
  }

  damageNumber(worldPos, amount, kind = 'hit') {
    this.markers.spawnDamage(worldPos, amount, kind);
  }

  /** Incoming damage: arc toward the source, screen flash, reticle flinch. */
  hurt(amount = 10, dirX = 0, dirZ = 1) {
    const i = clamp01(amount / 40);
    this.arcs.spawn(dirX, dirZ, 0.45 + i * 0.55);
    this.health.onDamage(i);
    this.crosshair.onFlinch(0.5 + i);
    this._regenTimer = 0;
    this.state.regen = false;
    this.sfx('player_hurt', 0.6 + i * 0.4);
  }

  setPrompt(p) {
    this.prompt.set(p);
  }

  clearPrompt() {
    this.prompt.clear();
  }

  setObjectives(list) {
    this._objectives = list ?? [];
  }

  addObjective(o) {
    this._objectives.push(o);
  }

  removeObjective(id) {
    const i = this._objectives.findIndex((o) => o.id === id);
    if (i >= 0) this._objectives.splice(i, 1);
  }

  /** Copies into a preallocated array — the caller's array is not retained. */
  setBlips(list) {
    const n = Math.min(list?.length ?? 0, MAX_BLIPS);
    for (let i = 0; i < n; i++) {
      const src = list[i];
      const dst = this._blips[i];
      dst.x = src.x ?? src.position?.x ?? 0;
      dst.z = src.z ?? src.position?.z ?? 0;
      dst.kind = src.kind ?? (src.friendly ? 'friend' : 'enemy');
      dst.heading = src.heading ?? 0;
    }
    this._blipCount = n;
  }

  spawnGrenade(worldPos, fuse = 2.4) {
    this.markers.spawnGrenade(worldPos, fuse);
    this.sfx('grenade_warn', 0.6);
  }

  setMatch(m) {
    Object.assign(this.state, m);
  }

  setHudVisible(v) {
    this.hudTarget = v ? 1 : 0;
  }

  pause() {
    this.menu.show();
  }

  resume() {
    this.menu.close();
  }

  /* --------------------------------------------------------------- debug -- */

  /**
   * Populate a representative state for screenshots / critics.
   * 'combat' runs the scripted firefight timeline in demo.js.
   */
  debugState(name = 'combat') {
    // Any debug state means "not on the attract/end screens" — clear them so
    // the capture harness frames the HUD, never a menu.
    this.attract.hide();
    this.death.hide();
    this.over.hide();
    this.boards.hide();
    if (name === 'clean') {
      this.demo?.stop(this);
      this.demo = null;
      this.state.simulate = false;
      this.killfeed.clear();
      this.arcs.clear();
      this.hit.clear();
      this.markers.clear();
      this.clearPrompt();
      return { state: 'clean' };
    }
    if (name === 'menu') {
      this.debugState('combat');
      this.menu.show();
      return { state: 'menu' };
    }
    if (!this.demo) this.demo = new CombatDemo();
    this.demo.start(this);
    return { state: 'combat', frames: 'timeline keyed to frame 90' };
  }

  /* -------------------------------------------------------------- frame --- */

  lateUpdate(dt, ctx) {
    const t = ctx.time;
    const rawDt = clamp(t.raw - this._lastRaw, 0, 0.1);
    this._lastRaw = t.raw;
    const s = this.state;
    s.time = t.elapsed;

    // ---- pause -----------------------------------------------------------
    if (ctx.input.enabled && !ctx.input.frozen) {
      if (ctx.input.actionPressed('pause')) this.menu.toggle();
      // Losing pointer lock mid-match is the same intent as pressing Escape.
      if (ctx.input.pointerLocked) this._hadPointerLock = true;
      else if (this._hadPointerLock && !this.menu.open) {
        this._hadPointerLock = false;
        this.menu.show();
      }
    }
    this.menu.update(rawDt);

    // ---- external state --------------------------------------------------
    // `simulate` means a scripted debug timeline owns the HUD numbers; letting
    // the live weapon/player state through would fight it every frame.
    const ws = s.simulate ? null : this._weaponState();
    if (ws) {
      if (ws.name) s.weaponName = ws.name;
      if (ws.mode) s.fireMode = ws.mode;
      if (ws.ammo !== undefined) s.ammo = ws.ammo;
      if (ws.reserve !== undefined) s.reserve = ws.reserve;
      if (ws.magSize !== undefined) s.magSize = ws.magSize;
      if (ws.reloading !== undefined) s.reloading = !!ws.reloading;
      if (ws.reloadProgress !== undefined) s.reloadProgress = ws.reloadProgress;
      if (ws.ads !== undefined) s.ads = !!ws.ads;
      if (ws.spread !== undefined) s.baseSpread = 4 + ws.spread * 40;
      if (ws.lethalCount !== undefined) s.lethalCount = ws.lethalCount;
      if (ws.tacticalCount !== undefined) s.tacticalCount = ws.tacticalCount;
    }

    const ps = s.simulate ? null : this._playerState();
    const player = ctx.peek('player');
    if (ps) {
      if (ps.health !== undefined) s.health = ps.health;
      if (ps.maxHealth !== undefined) s.maxHealth = ps.maxHealth;
      if (ps.armour !== undefined) s.armour = ps.armour;
      else if (ps.armor !== undefined) s.armour = ps.armor;
      if (ps.regen !== undefined) s.regen = !!ps.regen;
      if (ps.move !== undefined) s.move = ps.move;
      if (ps.sprint !== undefined) s.sprint = !!ps.sprint;
      if (ps.crouch !== undefined) s.crouch = !!ps.crouch;
      if (ps.ads !== undefined) s.ads = !!ps.ads;
      if (ps.airborne !== undefined) s.airborne = !!ps.airborne;
    } else if (player && typeof player.health === 'number') {
      s.health = player.health;
    }

    // ---- movement-derived reticle bloom (works with any player system) ----
    const pos = this._playerPos();
    if (!ps && !s.simulate) {
      this._dir.copy(pos).sub(this._prevPos);
      this._dir.y = 0;
      const speed = dt > 0 ? this._dir.length() / dt : 0;
      s.move = damp(s.move, clamp01(speed / 6.2), 12, Math.max(rawDt, 1e-3));
      if (!this._weaponState()) s.ads = ctx.input.ads && ctx.input.enabled;
    }
    this._prevPos.copy(pos);

    // ---- health regeneration when nobody else owns health ----------------
    if (!ps && !s.simulate && s.health < s.maxHealth) {
      this._regenTimer += dt;
      if (this._regenTimer > 4.5) {
        if (!s.regen) {
          s.regen = true;
          this.health.onRegenStart();
          this.sfx('regen', 0.4);
        }
        s.health = Math.min(s.maxHealth, s.health + dt * 24);
      }
    }

    // ---- demo timeline ---------------------------------------------------
    if (this.demo?.active) this.demo.update(this, dt);

    // ---- ai blips --------------------------------------------------------
    this._collectBlips();

    // ---- camera basis ----------------------------------------------------
    const m = ctx.camera.matrixWorld.elements;
    let rx = m[0];
    let rz = m[2];
    let fx = -m[8];
    let fz = -m[10];
    const rl = Math.hypot(rx, rz) || 1;
    const fl = Math.hypot(fx, fz) || 1;
    rx /= rl;
    rz /= rl;
    fx /= fl;
    fz /= fl;
    const heading = (Math.atan2(fx, -fz) * 180) / Math.PI;

    // ---- widgets ---------------------------------------------------------
    // The attract screen is a translucent SCRIM now (so the dusk plaza reads
    // through it), which means it no longer hides the gameplay chrome behind
    // it: minimap, compass, vitals and the ammo panel were all showing through
    // the title card. They are match furniture and have no business on the
    // title, so the HUD is faded out for the whole time a title-class screen is
    // up. The death/game-over cards keep the old behaviour — they are modal
    // cards over a run in progress and the HUD reading through them is correct.
    const titleScreen = this.attract.open || this.boards.open;
    const hudGoal = this.hudTarget * (this.menu.open ? 0.15 : 1) * (titleScreen ? 0 : 1);
    this.hudVisible = damp(this.hudVisible, hudGoal, 10, rawDt);
    setStyle(this.chromeLayer, 'opacity', this.hudVisible.toFixed(3));
    setStyle(this.worldLayer, 'opacity', this.hudVisible.toFixed(3));
    setStyle(this.centreLayer, 'opacity', this.hudVisible.toFixed(3));

    this.crosshair.update(dt, s);
    this.hit.update(dt);
    this.arcs.update(dt, rx, rz, fx, fz);
    this.health.update(dt, s);
    this.ammo.update(dt, s);
    this.killfeed.update(dt);
    this.runBar.update(dt, s);
    this.prompt.update(dt);
    this.banner.update(dt);

    // Meta-screens fade on UNSCALED time so they still animate while paused/dead.
    this.attract.update(rawDt);
    this.death.update(rawDt);
    this.over.update(rawDt);
    this.boards.update(rawDt);
    this.cabinet.update(rawDt);

    this._buildCompassObjectives(pos);
    this.compass.update(heading, this._compassObjs);

    this.markers.updateObjectives(this._objectives, ctx.camera, this.vw, this.vh, this.k);
    this.markers.updateGrenades(dt, ctx.camera, this.vw, this.vh, this.k);
    this.markers.updateDamage(dt, ctx.camera, this.vw, this.vh, this.k);

    // ---- minimap ---------------------------------------------------------
    if (!this.minimap.bakeDone && ++this._bakeFrame > 6 && this._bakeFrame % 20 === 0) {
      this.minimap.tryBake(ctx);
    }
    this._blipView.length = this._blipCount;
    for (let i = 0; i < this._blipCount; i++) this._blipView[i] = this._blips[i];
    this._mmState = this._mmState ?? { x: 0, z: 0, heading: 0, fov: 80, blips: null, objectives: null };
    this._mmState.x = pos.x;
    this._mmState.z = pos.z;
    this._mmState.heading = heading;
    this._mmState.fov = ctx.camera.fov;
    this._mmState.blips = this._blipView;
    this._mmState.objectives = this._mmObjs ?? (this._mmObjs = []);
    this._mmObjs.length = 0;
    for (const o of this._objectives) {
      if (!o.position) continue;
      this._mmObjs.push(o._mm ?? (o._mm = { x: 0, z: 0, label: o.label }));
      const last = this._mmObjs[this._mmObjs.length - 1];
      last.x = o.position.x;
      last.z = o.position.z;
      last.label = o.label;
    }
    this.minimap.draw(this._mmState);
  }

  /**
   * Contacts for the minimap.
   *
   * READ-ONLY view of `ai.agents` — the live Agent array. The two accessors
   * this used to try, `ai.getHudActors()` and `ai.actors`, have never existed
   * on AiSystem, so `Array.isArray(list)` was false on every frame and the
   * minimap has been showing zero contacts outside demo mode since the fork.
   * Nothing here mutates an agent: it copies four numbers per contact into the
   * preallocated blip ring.
   */
  _collectBlips() {
    if (this.demo?.active) return; // demo drives its own contacts
    const list = this.ctx.peek('ai')?.agents;
    if (!Array.isArray(list)) return;
    let n = 0;
    for (let i = 0; i < list.length && n < MAX_BLIPS; i++) {
      const a = list[i];
      if (!a || a.alive !== true) continue; // dead bodies linger in the array
      const p = a.position;
      if (!p) continue;
      const b = this._blips[n++];
      b.x = p.x;
      b.z = p.z;
      b.kind = a.friendly ? 'friend' : 'enemy';
      // Agent yaw is radians about +Y with forward = (sin y, 0, cos y). The map
      // wants the same north-up degrees the player arrow uses, which is
      // atan2(forwardX, -forwardZ) — so run the agent's forward through the
      // identical expression rather than trusting a raw radian-to-degree cast.
      const y = a.yaw ?? 0;
      b.heading = (Math.atan2(Math.sin(y), -Math.cos(y)) * 180) / Math.PI;
    }
    this._blipCount = n;
  }

  _buildCompassObjectives(pos) {
    const out = this._compassObjs;
    out.length = 0;
    for (const o of this._objectives) {
      if (!o.position) continue;
      const dx = o.position.x - pos.x;
      const dz = o.position.z - pos.z;
      const bearing = (Math.atan2(dx, -dz) * 180) / Math.PI;
      out.push(o._cmp ?? (o._cmp = { bearing: 0, label: o.label, color: o.color }));
      const last = out[out.length - 1];
      last.bearing = bearing;
      last.label = o.label;
      last.color = o.color;
    }
    return out;
  }

  resize(w, h, ctx) {
    this.vw = w;
    this.vh = h;
    this.k = clamp(h / 1080, 0.62, 2.4);
    this.root.style.setProperty('--k', this.k.toFixed(4));
    this.crosshair.setScale(this.k);
    this.compass.setScale(this.k);
    this.minimap.resize(this.k);
  }

  dispose() {
    for (const off of this._unsubs) off();
    this._unsubs.length = 0;
    this.crosshair.dispose();
    this.hit.dispose();
    this.arcs.dispose();
    this.health.dispose();
    this.ammo.dispose();
    this.killfeed.dispose();
    this.compass.dispose();
    this.runBar.dispose();
    this.minimap.dispose();
    this.markers.dispose();
    this.prompt.dispose();
    this.banner.dispose();
    this.attract.dispose();
    this.death.dispose();
    this.over.dispose();
    this.boards.dispose();
    this.cabinet.dispose();
    this.menu.dispose();
    this.root.remove();
    removeStyles();
  }
}
