import { BaseTransport, NetError, ROOM_RE } from './transport.js';

/**
 * ClaudeRoomTransport — the real room: the claude.ai artifact viewer injects
 * `window.claude`; `await claude.use('room')` resolves the room namespace (or
 * null: then online play is unavailable on this view and the game stays
 * single-player); `room.join(code)` is the party's own named room.
 *
 * It maps the platform's frozen Peer snapshots onto the transport interface
 * (transport.js) exactly as LocalTransport does:
 *   - `peer` is the id; `isMe && sameTab` is this page (selfId)
 *   - presence is set by merged patch, the platform coalesces (~30 Hz)
 *   - the platform echoes my own emits back (`sameTab`): dropped here, so
 *     handlers never see their own moments (LocalTransport never sends them)
 *   - agent peers (`kind: 'agent'`) are ignored: never players
 * Terminal errors (not_granted, revoked, capability_*) mark it closed.
 */

let _roomPromise = null;

/** Probe: the room namespace, or null when this view cannot use it. Memoised. */
export function claudeRoom() {
  if (_roomPromise) return _roomPromise;
  _roomPromise = (async () => {
    try {
      const c = globalThis.claude;
      if (!c || typeof c.use !== 'function') return null;
      const room = await c.use('room');
      return room && typeof room.join === 'function' ? room : null;
    } catch {
      return null;
    }
  })();
  return _roomPromise;
}

let _userPromise = null;
/** The `user` capability (for display names), or null. Memoised. */
export function claudeUser() {
  if (_userPromise) return _userPromise;
  _userPromise = (async () => {
    try {
      const c = globalThis.claude;
      if (!c || typeof c.use !== 'function') return null;
      return (await c.use('user')) ?? null;
    } catch {
      return null;
    }
  })();
  return _userPromise;
}

const TERMINAL = new Set(['not_granted', 'revoked', 'capability_disabled', 'capability_removed', 'transform_error']);

export class ClaudeRoomTransport extends BaseTransport {
  constructor() {
    super('claude');
    this.room = null;
    this.named = null;
    this._offs = [];
    this._wired = new Set();
    this.error = null;
  }

  async open(code) {
    if (!ROOM_RE.test(code)) throw new NetError('invalid_argument', `bad room name ${code}`);
    const room = await claudeRoom();
    if (!room) throw new NetError('not_granted', 'room capability unavailable');
    this.room = room;
    let named;
    try {
      named = await room.join(code);
    } catch (err) {
      throw new NetError(err?.code ?? 'upstream_error', err?.message ?? String(err));
    }
    this.named = named;
    this.code = code;
    const onErr = (e) => this._fail(e);
    this._offs.push(named.onPeers((change) => this._onPeers(change), onErr));
    this._offs.push(
      named.onConnection(() => {
        /* reconnects re-join by themselves; nothing to resend */
      }, onErr)
    );
    // Topics registered before open() was called.
    for (const topic of this._topicFns.keys()) this._wire(topic);
    // Re-assert any presence set before the join resolved.
    if (Object.keys(this._presence).length) named.presence(this._presence).catch((e) => this._warn(e));
  }

  on(topic, fn) {
    const off = super.on(topic, fn);
    if (this.named) this._wire(topic);
    return off;
  }

  connected() {
    return !!this.named && !this._closed && this.named.connected();
  }

  setPresence(patch) {
    if (this._closed) return Promise.resolve();
    try {
      this._merge(patch);
    } catch (err) {
      return Promise.reject(err);
    }
    if (this.selfId && this._peers.has(this.selfId)) {
      this._peerSet(this.selfId, this._peers.get(this.selfId).by, Object.freeze({ ...this._presence }), true);
      queueMicrotask(() => this._flushPeers());
    }
    if (!this.named) return Promise.resolve();
    return this.named.presence(patch).catch((e) => this._warn(e));
  }

  emit(topic, data) {
    if (this._closed || !this.named) return Promise.resolve();
    try {
      this._checkEmit(topic, data);
    } catch (err) {
      return Promise.reject(err);
    }
    return this.named.emit(topic, data ?? null).catch((e) => this._warn(e));
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    for (const off of this._offs) {
      try {
        off();
      } catch {
        /* ignore */
      }
    }
    this._offs.length = 0;
    this.named?.leave?.().catch(() => {});
    this.named = null;
  }

  /* ------------------------------------------------------------ internals */

  _wire(topic) {
    if (this._wired.has(topic) || !this.named) return;
    this._wired.add(topic);
    this._offs.push(
      this.named.on(
        topic,
        (msg) => {
          if (!msg || msg.sameTab || msg.kind === 'agent') return; // my own echo
          if (typeof msg.peer !== 'string') return;
          this._deliver(topic, msg.data, msg.peer);
        },
        (e) => this._fail(e)
      )
    );
  }

  _onPeers(change) {
    const keep = (p) => p && p.kind !== 'agent' && typeof p.peer === 'string';
    for (const p of change.joined ?? []) {
      if (!keep(p)) continue;
      if (p.isMe && p.sameTab) this.selfId = p.peer;
      // My own presence is the local merged copy (applied at once), like LocalTransport.
      const pres = p.isMe && p.sameTab ? Object.freeze({ ...this._presence }) : p.presence;
      this._peerSet(p.peer, p.by, pres, p.isMe && p.sameTab);
    }
    for (const p of change.updated ?? []) {
      if (!keep(p) || (p.isMe && p.sameTab)) continue;
      this._peerSet(p.peer, p.by, p.presence, false);
    }
    for (const p of change.left ?? []) {
      if (!keep(p) || (p.isMe && p.sameTab)) continue;
      this._peerGone(p.peer);
    }
    this._flushPeers();
  }

  _fail(e) {
    if (TERMINAL.has(e?.code)) {
      this.error = e.code;
      this._closed = true;
      console.warn(`[net] room closed: ${e.code}`);
    } else if (e?.code) {
      // A named room lost after a reconnect (upstream_error / limit_reached):
      // treat as closed; NetSystem shows it and the player can rejoin.
      this.error = e.code;
      this._closed = true;
    }
  }

  _warn(e) {
    if (!this._warned) {
      this._warned = true;
      console.warn('[net] room call rejected:', e?.code ?? e, e?.message ?? '');
    }
  }
}
