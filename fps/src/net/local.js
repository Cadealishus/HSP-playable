import { BaseTransport, NetError, ROOM_RE } from './transport.js';

/**
 * LocalTransport — the room over a BroadcastChannel, for two or more pages of
 * one browser profile (`?net=local`). Mirrors ClaudeRoomTransport exactly:
 * the same peers()/onPeers()/presence/emit semantics, presence coalesced to
 * ~30 Hz and sent whole, emits never echoed to the sender, 4 KiB limits.
 *
 * Wire: { k, from, … } on channel `flopops-net:<code>`
 *   hello {pres}      I joined; everyone answers with `here`
 *   here  {pres, to}  my presence, for a newcomer
 *   pres  {pres}      my (whole, merged) presence changed
 *   ev    {topic, data}
 *   hb                heartbeat (a page that stops beating is dropped)
 *   bye               I left (pagehide / close)
 */
const PRESENCE_MS = 33;
const HEARTBEAT_MS = 1000;
// Generous: under SwiftShader one frame can block the main thread for 2+ s.
const PEER_TIMEOUT_MS = 15000;

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

export class LocalTransport extends BaseTransport {
  constructor() {
    super('local');
    this.selfId = label();
    this._ch = null;
    this._seen = new Map();
    this._presTimer = 0;
    this._presDirty = false;
    this._lastPres = 0;
  }

  static available() {
    return typeof BroadcastChannel === 'function';
  }

  async open(code) {
    if (!ROOM_RE.test(code)) throw new NetError('invalid_argument', `bad room name ${code}`);
    if (!LocalTransport.available()) throw new NetError('not_granted', 'BroadcastChannel unavailable');
    this.code = code;
    this._ch = new BroadcastChannel(`flopops-net:${code}`);
    this._ch.onmessage = (e) => this._onMsg(e.data);
    this._peerSet(this.selfId, null, Object.freeze({}), true);
    this._post({ k: 'hello', pres: this._presence });
    this._hb = setInterval(() => this._beat(), HEARTBEAT_MS);
    this._onHide = () => this.close();
    addEventListener('pagehide', this._onHide);
    // First delivery on a microtask, like the real room.
    queueMicrotask(() => this._flushPeers());
  }

  connected() {
    return !!this._ch && !this._closed;
  }

  setPresence(patch) {
    if (this._closed) return Promise.resolve();
    try {
      this._merge(patch);
    } catch (err) {
      return Promise.reject(err);
    }
    this._peerSet(this.selfId, null, Object.freeze({ ...this._presence }), true);
    this._presDirty = true;
    const wait = Math.max(0, PRESENCE_MS - (performance.now() - this._lastPres));
    if (!this._presTimer) this._presTimer = setTimeout(() => this._sendPresence(), wait);
    queueMicrotask(() => this._flushPeers());
    return Promise.resolve();
  }

  emit(topic, data) {
    if (this._closed || !this._ch) return Promise.resolve();
    try {
      this._checkEmit(topic, data);
    } catch (err) {
      return Promise.reject(err);
    }
    this._post({ k: 'ev', topic, data: data ?? null });
    return Promise.resolve();
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    try {
      this._post({ k: 'bye' });
    } catch {
      /* channel gone */
    }
    clearInterval(this._hb);
    clearTimeout(this._presTimer);
    removeEventListener('pagehide', this._onHide);
    try {
      this._ch?.close();
    } catch {
      /* ignore */
    }
    this._ch = null;
  }

  /* ------------------------------------------------------------ internals */

  _post(msg) {
    msg.from = this.selfId;
    this._ch?.postMessage(msg);
  }

  _sendPresence() {
    this._presTimer = 0;
    if (!this._presDirty || this._closed) return;
    this._presDirty = false;
    this._lastPres = performance.now();
    this._post({ k: 'pres', pres: this._presence });
  }

  _beat() {
    if (this._closed) return;
    this._post({ k: 'hb' });
    const now = performance.now();
    for (const [id, t] of this._seen) {
      if (now - t > PEER_TIMEOUT_MS) {
        this._seen.delete(id);
        this._peerGone(id);
      }
    }
    this._flushPeers();
  }

  _onMsg(m) {
    if (this._closed || !m || typeof m !== 'object') return;
    const from = typeof m.from === 'string' ? m.from.slice(0, 32) : null;
    if (!from || from === this.selfId) return;
    this._seen.set(from, performance.now());
    switch (m.k) {
      case 'hello':
        this._peerSet(from, null, Object.freeze({ ...(m.pres ?? {}) }), false);
        this._post({ k: 'here', to: from, pres: this._presence });
        break;
      case 'here':
      case 'pres':
        this._peerSet(from, null, Object.freeze({ ...(m.pres ?? {}) }), false);
        break;
      case 'hb':
        if (!this._peers.has(from)) this._peerSet(from, null, Object.freeze({}), false);
        break;
      case 'bye':
        this._seen.delete(from);
        this._peerGone(from);
        break;
      case 'ev':
        if (!this._peers.has(from)) this._peerSet(from, null, Object.freeze({}), false);
        this._flushPeers();
        if (typeof m.topic === 'string') this._deliver(m.topic, m.data, from);
        return;
      default:
        return;
    }
    this._flushPeers();
  }
}
