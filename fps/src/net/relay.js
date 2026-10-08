import { BaseTransport, NetError, ROOM_RE } from './transport.js';

/**
 * RelayTransport — ported from the user's multiplayer build (FLOP-OPS-Latest.zip).
 * The party room over the game server's HTTP relay (POST /multiplayer/sync in
 * game-worker.mjs / server.mjs), polled about every 50 ms, plus direct WebRTC
 * data channels between peers when the network allows:
 *   'movement'  unordered, no retransmits: presence snapshots (seq-numbered)
 *   'actions'   ordered: game events, de-duplicated by per-sender nonce
 * The relay stays the fallback and the signalling channel (topic 'rtc').
 * Same peers()/presence/emit semantics as the other transports.
 */
function label() {
  const b = new Uint8Array(8);
  try {
    crypto.getRandomValues(b);
  } catch {
    for (let i = 0; i < 8; i++) b[i] = (performance.now() * (i + 7)) & 255;
  }
  let s = '';
  for (const x of b) s += x.toString(36).padStart(2, '0').slice(-2);
  return s.slice(0, 16);
}

const SYNC_URL = '/multiplayer/sync';

export class RelayTransport extends BaseTransport {
  constructor() {
    super('local');
    this.selfId = label();
    this._seen = new Map();
    this._pendingEvents = [];
    this._nonce = 0;
    this._cursor = null;
    this._secret = crypto.randomUUID();
    this._failedAt = 0;
    this._up = false;
    this._rtc = new Map();
    this._snapshotSeq = 0;
    this._seenEvents = new Map();
  }

  static available() {
    return typeof fetch === 'function' && /^https?:$/.test(location.protocol);
  }

  async open(code) {
    if (!ROOM_RE.test(code)) throw new NetError('invalid_argument', 'INVALID PARTY CODE');
    this.code = code;
    try {
      await this._sync();
    } catch (error) {
      this.close();
      throw new NetError('upstream_error', error.message || 'CANNOT CONNECT TO GAME SERVER');
    }
    this._up = true;
    this._peerSet(this.selfId, null, Object.freeze({ ...this._presence }), true);
    this._flushPeers();
    this._onHide = () => this.close();
    addEventListener('pagehide', this._onHide);
    this._schedule();
  }

  connected() {
    return this._up && !this._closed;
  }

  setPresence(patch) {
    if (this._closed) return Promise.resolve();
    try {
      this._merge(patch);
    } catch (error) {
      return Promise.reject(error);
    }
    this._peerSet(this.selfId, null, Object.freeze({ ...this._presence }), true);
    this._sendDirectPresence();
    queueMicrotask(() => this._flushPeers());
    return Promise.resolve();
  }

  emit(topic, data) {
    if (this._closed) return Promise.resolve();
    try {
      this._checkEmit(topic, data);
    } catch (error) {
      return Promise.reject(error);
    }
    if (this._pendingEvents.length >= 256) {
      this.error = 'GAME CONNECTION OVERLOADED — REJOIN';
      this.close();
      return Promise.resolve();
    }
    const event = { n: ++this._nonce, topic, data: data ?? null };
    this._pendingEvents.push(event);
    this._sendDirectEvent(event);
    return Promise.resolve();
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    this._up = false;
    clearTimeout(this._timer);
    removeEventListener('pagehide', this._onHide);
    this._abort?.abort();
    for (const r of this._rtc.values()) r.pc.close();
    this._rtc.clear();
    fetch(SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: this.code, id: this.selfId, secret: this._secret, leave: true }),
      keepalive: true,
    }).catch(() => {});
  }

  _schedule() {
    if (this._closed) return;
    const delay = this._failedAt ? 500 : Math.max(0, 50 - (performance.now() - (this._syncStarted ?? performance.now())));
    this._timer = setTimeout(async () => {
      try {
        await this._sync();
        this._failedAt = 0;
      } catch {
        this._failedAt ||= performance.now();
        if (performance.now() - this._failedAt > 10000) {
          this.error = 'GAME SERVER DISCONNECTED — REJOIN THE PARTY';
          this.close();
          for (const id of this._seen.keys()) this._peerGone(id);
          this._seen.clear();
          this._flushPeers();
        }
      }
      this._schedule();
    }, delay);
  }

  async _sync() {
    this._syncStarted = performance.now();
    const outgoing = this._pendingEvents.slice(0, 64);
    this._abort = new AbortController();
    const timeout = setTimeout(() => this._abort.abort(), 8000);
    let response;
    try {
      response = await fetch(SYNC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: this.code, id: this.selfId, secret: this._secret, pres: this._presence, events: outgoing, cursor: this._cursor }),
        signal: this._abort.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'GAME SERVER UNAVAILABLE');
    if (this._closed) return;
    this._pendingEvents.splice(0, outgoing.length);
    this._cursor = result.cursor;
    const active = new Set();
    for (const p of result.peers) {
      if (p.id === this.selfId) continue;
      active.add(p.id);
      this._ensureRTC(p.id);
      this._seen.set(p.id, performance.now());
      const encoded = JSON.stringify(p.pres);
      // a fresh direct snapshot beats the relay copy
      if (!(this._rtc.get(p.id)?.lastDirect > performance.now() - 500) && this._presKeys?.get(p.id) !== encoded) {
        this._presKeys ??= new Map();
        this._presKeys.set(p.id, encoded);
        this._peerSet(p.id, null, Object.freeze(p.pres), false);
      }
    }
    for (const id of this._seen.keys()) {
      if (active.has(id)) continue;
      this._seen.delete(id);
      this._presKeys?.delete(id);
      this._rtc.get(id)?.pc.close();
      this._rtc.delete(id);
      this._seenEvents.delete(id);
      this._peerGone(id);
    }
    this._flushPeers();
    for (const event of result.events) {
      if (event.from === this.selfId) continue;
      if (event.topic === 'rtc') await this._rtcSignal(event.from, event.data);
      else this._acceptGameEvent(event.from, event);
    }
  }

  // ------------------------------------------------------------ WebRTC --
  _queueSignal(peer, data) {
    if (!this._closed && this._pendingEvents.length < 256) this._pendingEvents.push({ n: ++this._nonce, topic: 'rtc', data: { to: peer, ...data } });
  }

  _ensureRTC(peer) {
    if (this._closed || typeof RTCPeerConnection !== 'function' || this._rtc.has(peer)) return;
    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      const r = { pc, ch: null, lastDirect: -Infinity, seq: -1, candidates: [], actions: null };
      this._rtc.set(peer, r);
      pc.onicecandidate = (e) => {
        if (e.candidate) this._queueSignal(peer, { ice: e.candidate.toJSON() });
      };
      pc.ondatachannel = (e) => this._wireDirect(peer, r, e.channel);
      // the lower id offers
      if (this.selfId < peer) {
        this._wireDirect(peer, r, pc.createDataChannel('movement', { ordered: false, maxRetransmits: 0 }));
        this._wireDirect(peer, r, pc.createDataChannel('actions', { ordered: true }));
        (async () => {
          await pc.setLocalDescription(await pc.createOffer());
          this._queueSignal(peer, { sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
        })().catch(() => {});
      }
    } catch {}
  }

  _wireDirect(peer, r, ch) {
    if (ch.label === 'actions') {
      r.actions = ch;
      ch.onopen = () => {
        for (const event of this._pendingEvents) {
          if (event.topic !== 'rtc') try { ch.send(JSON.stringify(event)); } catch {}
        }
      };
      ch.onmessage = (e) => {
        if (typeof e.data === 'string' && e.data.length < 8192) try { this._acceptGameEvent(peer, JSON.parse(e.data)); } catch {}
      };
      return;
    }
    if (ch.label !== 'movement') {
      ch.close();
      return;
    }
    r.ch = ch;
    ch.onopen = () => this._sendDirectPresence();
    ch.onmessage = (e) => {
      if (this._closed || typeof e.data !== 'string' || e.data.length > 8192) return;
      try {
        const packet = JSON.parse(e.data);
        if (!Number.isSafeInteger(packet.seq) || packet.seq <= r.seq || !packet.pres || typeof packet.pres !== 'object' || Array.isArray(packet.pres)) return;
        r.seq = packet.seq;
        r.lastDirect = performance.now();
        this._presKeys ??= new Map();
        this._presKeys.set(peer, JSON.stringify(packet.pres));
        this._peerSet(peer, null, Object.freeze(packet.pres), false);
        this._flushPeers();
      } catch {}
    };
  }

  _sendDirectEvent(event) {
    const message = JSON.stringify(event);
    for (const r of this._rtc.values()) {
      if (r.actions?.readyState === 'open' && r.actions.bufferedAmount < 65536) try { r.actions.send(message); } catch {}
    }
  }

  _acceptGameEvent(peer, event) {
    if (this._closed || peer === this.selfId || !this._seen.has(peer) || !event || typeof event.topic !== 'string' || event.topic === 'rtc') return;
    if (Number.isSafeInteger(event.n)) {
      let seen = this._seenEvents.get(peer);
      if (!seen) this._seenEvents.set(peer, (seen = new Set()));
      if (seen.has(event.n)) return; // arrived both direct and via the relay
      seen.add(event.n);
      if (seen.size > 4096) seen.delete(seen.values().next().value);
    }
    this._deliver(event.topic, event.data, peer);
  }

  _sendDirectPresence() {
    const packet = JSON.stringify({ seq: ++this._snapshotSeq, pres: this._presence });
    for (const r of this._rtc.values()) {
      if (r.ch?.readyState === 'open' && r.ch.bufferedAmount < 32768) try { r.ch.send(packet); } catch {}
    }
  }

  async _rtcSignal(peer, data) {
    if (!data || data.to !== this.selfId || !this._seen.has(peer)) return;
    this._ensureRTC(peer);
    const r = this._rtc.get(peer);
    if (!r) return;
    try {
      if (data.sdp && (data.sdp.type === 'offer' || data.sdp.type === 'answer') && typeof data.sdp.sdp === 'string' && data.sdp.sdp.length < 8000) {
        if (data.sdp.type === 'offer' && this.selfId < peer) return;
        await r.pc.setRemoteDescription(data.sdp);
        for (const candidate of r.candidates) await r.pc.addIceCandidate(candidate);
        r.candidates = [];
        if (data.sdp.type === 'offer') {
          await r.pc.setLocalDescription(await r.pc.createAnswer());
          this._queueSignal(peer, { sdp: { type: r.pc.localDescription.type, sdp: r.pc.localDescription.sdp } });
        }
      } else if (data.ice) {
        if (r.pc.remoteDescription) await r.pc.addIceCandidate(data.ice);
        else if (r.candidates.length < 64) r.candidates.push(data.ice);
      }
    } catch {}
  }
}
