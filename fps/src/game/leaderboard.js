/**
 * ===========================================================================
 * LEADERBOARD CLIENT — the network half of HOLD THE LEDGER
 * ===========================================================================
 *
 * Plain `fetch` against Supabase REST + three edge functions. No client
 * library: the game bundle stays three.js-only, and everything here is 3 URLs
 * and a JSON body.
 *
 *   POST functions/v1/issue-token   run start, fire-and-forget -> {token, ts}
 *   POST functions/v1/submit-score  run end, validated server-side -> {id, rank, total}
 *   POST functions/v1/beacon        launch telemetry, 204, never awaited
 *   GET  rest/v1/leaderboard        the public board view (anon key)
 *   GET  rest/v1/leaderboard_today  same, filtered to the LA calendar day
 *
 * THREE RULES THIS FILE EXISTS TO KEEP
 *  1. Nothing blocks the run. `requestToken()` is not awaited by the loop; a
 *     run with no token is played normally and simply cannot be ranked.
 *  2. Conference wifi is hostile. A submit that fails for a NETWORK reason is
 *     queued in localStorage and retried with backoff on the next load or run
 *     start. A submit that fails VALIDATION (4xx) is never queued — retrying a
 *     rejected score forever is how a queue becomes a bug.
 *  3. Capture is offline. `enabled:false` (set from ctx.config.deterministic)
 *     turns every method into a no-op so the screenshot harness never touches
 *     the network.
 *
 * The anon key below is public by design — it is the browser's identity and is
 * useless without the RLS policies (SELECT on non-hidden rows only, no write
 * grant at all). Writes require the service role, which only the edge
 * functions hold.
 */

export const SUPABASE_URL = 'https://eqvgexqrojvjedjkibsj.supabase.co';
export const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxdmdleHFyb2p2amVkamtpYnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNzk4MzksImV4cCI6MjEwMDY1NTgzOX0.9Hyo_yKFu3NsRfmP6fmCzEt4aGjiTLyJro1-L6i1v6E';

const FN = `${SUPABASE_URL}/functions/v1`;
const REST = `${SUPABASE_URL}/rest/v1`;

const QUEUE_KEY = 'nod.queue';
const INITIALS_KEY = 'nod.initials';
const MAX_QUEUE = 12;
const MAX_ATTEMPTS = 8;
/** Backoff between retries of one queued submit, in ms, by attempt count. */
const BACKOFF_MS = [5e3, 20e3, 60e3, 3e5, 9e5, 18e5, 36e5, 72e5];
const QUEUE_TTL_MS = 7 * 24 * 3600 * 1000;

/* --------------------------------------------------------------- storage -- */
/* Every localStorage touch is wrapped: Safari private mode throws on read. */

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* full / disabled — the queue is best-effort by definition */
  }
}

function rememberInitials(initials) {
  try {
    if (/^[A-Z]{3}$/.test(initials)) localStorage.setItem(INITIALS_KEY, initials);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ util -- */

/** UUID without Math.random — crypto everywhere it exists, timestamp if not. */
function uid() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(8);
    crypto.getRandomValues(b);
    return [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
  } catch {
    return `t${Date.now().toString(36)}`;
  }
}

/** fetch with a hard deadline — a hung socket must not hold a screen open. */
async function timed(url, init = {}, ms = 8000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ================================================================ client == */

export class Leaderboard {
  /** @param {{enabled?:boolean, cabinet?:boolean}} opts */
  constructor({ enabled = true, cabinet = false } = {}) {
    this.enabled = !!enabled;
    this.cabinet = !!cabinet;
    this.session = uid();
    this._token = null;
    this._tokenAt = 0;
    this._tokenInflight = null;
    this._draining = false;
    /** Set by drain()/submit() so the UI can say "N QUEUED". */
    this.queued = this._queue().length;
  }

  /* ------------------------------------------------------------- tokens -- */

  /**
   * Mint a run token. NEVER awaited by the game loop — call it and walk away.
   * Returns the promise anyway so submit() can join an in-flight request.
   */
  requestToken() {
    if (!this.enabled) return Promise.resolve(null);
    if (this._tokenInflight) return this._tokenInflight;
    this._tokenInflight = timed(`${FN}/issue-token`, { method: 'POST' }, 8000)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        this._token = j?.token ?? null;
        this._tokenAt = Date.now();
        return this._token;
      })
      .catch(() => null)
      .finally(() => {
        this._tokenInflight = null;
      });
    return this._tokenInflight;
  }

  /** A token older than 25 min is treated as gone (the server expires at 30). */
  async _freshToken() {
    if (this._token && Date.now() - this._tokenAt < 25 * 60 * 1000) return this._token;
    this._token = null;
    return this.requestToken();
  }

  /* ------------------------------------------------------------- submit -- */

  /**
   * @param {{initials,job,score,wave,kills,accuracy,duration_s,continued}} run
   * @returns {Promise<{ok:true,id:string,rank:number,total:number}
   *                  | {ok:false,queued:true}
   *                  | {ok:false,error:string,detail?:string}>}
   */
  async submit(run) {
    if (!this.enabled) return { ok: false, error: 'disabled' };
    rememberInitials(run.initials);

    const token = await this._freshToken();
    if (!token) {
      this._enqueue(run);
      return { ok: false, queued: true };
    }

    let res;
    try {
      res = await timed(
        `${FN}/submit-score`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...run, token }),
        },
        12000
      );
    } catch {
      // Network reason — the score is good, the wifi is not. Queue it.
      this._enqueue(run);
      return { ok: false, queued: true };
    }

    // The token is single-use whatever happened; force a new one next time.
    this._token = null;

    if (res.ok) {
      const j = await res.json().catch(() => ({}));
      this.beacon('score_submit', { job: run.job, wave: run.wave, score: run.score });
      return { ok: true, id: j.id ?? null, rank: j.rank ?? null, total: j.total ?? null };
    }

    if (res.status >= 500) {
      this._enqueue(run);
      return { ok: false, queued: true };
    }

    const j = await res.json().catch(() => ({}));
    return { ok: false, error: j.error ?? `http_${res.status}`, detail: j.detail ?? null };
  }

  /* -------------------------------------------------------------- queue -- */

  _queue() {
    const q = readJson(QUEUE_KEY, []);
    return Array.isArray(q) ? q : [];
  }

  _saveQueue(q) {
    writeJson(QUEUE_KEY, q);
    this.queued = q.length;
  }

  _enqueue(run) {
    const q = this._queue();
    q.push({ id: uid(), run, attempts: 0, nextAt: Date.now() + BACKOFF_MS[0], at: Date.now() });
    // Oldest out first: a conference machine that has been offline all day
    // should still upload the last twelve runs, not the first twelve.
    this._saveQueue(q.slice(-MAX_QUEUE));
  }

  /**
   * Try every due queued submit once. Safe to call on boot and at every run
   * start; re-entrant calls are dropped. Each entry gets a FRESH token — the
   * one from its original run is long expired, and drain only runs when the
   * network is back anyway.
   */
  async drain() {
    if (!this.enabled || this._draining) return 0;
    const q = this._queue();
    if (!q.length) return 0;

    this._draining = true;
    let sent = 0;
    const now = Date.now();
    const keep = [];

    try {
      for (const item of q) {
        if (now - item.at > QUEUE_TTL_MS || item.attempts >= MAX_ATTEMPTS) continue; // expire
        if (item.nextAt > now) {
          keep.push(item);
          continue;
        }
        let token = null;
        try {
          const r = await timed(`${FN}/issue-token`, { method: 'POST' }, 8000);
          token = r.ok ? (await r.json())?.token : null;
        } catch {
          token = null;
        }
        if (!token) {
          keep.push(this._retry(item));
          continue;
        }
        try {
          const res = await timed(
            `${FN}/submit-score`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...item.run, token }),
            },
            12000
          );
          if (res.ok) {
            sent += 1;
            continue; // dropped from the queue
          }
          if (res.status < 500) continue; // rejected on merit — stop retrying
          keep.push(this._retry(item));
        } catch {
          keep.push(this._retry(item));
        }
      }
    } finally {
      this._saveQueue(keep);
      this._draining = false;
    }
    if (sent) console.info(`[leaderboard] drained ${sent} queued run(s)`);
    return sent;
  }

  _retry(item) {
    const attempts = item.attempts + 1;
    return { ...item, attempts, nextAt: Date.now() + (BACKOFF_MS[attempts] ?? BACKOFF_MS.at(-1)) };
  }

  /* ------------------------------------------------------------- boards -- */

  /**
   * @param {{scope?:'global'|'today', job?:string|null, limit?:number}} opts
   * @returns {Promise<{ok:true, rows:Array}|{ok:false, error:string}>}
   */
  async board({ scope = 'global', job = null, limit = 100 } = {}) {
    if (!this.enabled) return { ok: false, error: 'offline' };
    const view = scope === 'today' ? 'leaderboard_today' : 'leaderboard';
    const q = new URLSearchParams({
      select: 'id,initials,job,score,wave,kills,accuracy,created_at',
      order: 'score.desc,created_at.asc',
      limit: String(Math.min(200, Math.max(1, limit))),
    });
    if (job) q.set('job', `eq.${job}`);
    try {
      const res = await timed(
        `${REST}/${view}?${q}`,
        { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } },
        10000
      );
      if (!res.ok) return { ok: false, error: `http_${res.status}` };
      const rows = await res.json();
      return { ok: true, rows: Array.isArray(rows) ? rows : [] };
    } catch {
      return { ok: false, error: 'offline' };
    }
  }

  /* ------------------------------------------------------------ beacons -- */

  /**
   * Fire-and-forget launch telemetry. sendBeacon survives an unload; fetch
   * with keepalive is the fallback. Never awaited, never throws, never checked.
   */
  beacon(kind, data = {}) {
    if (!this.enabled) return;
    const body = JSON.stringify({ kind, session: this.session, cabinet: this.cabinet, ...data });
    try {
      if (navigator.sendBeacon) {
        // text/plain is CORS-safelisted, so this skips the preflight entirely —
        // one request instead of two, which matters on conference wifi. The
        // function parses the body with req.json() regardless of the type.
        navigator.sendBeacon(`${FN}/beacon`, new Blob([body], { type: 'text/plain' }));
        return;
      }
    } catch {
      /* fall through to fetch */
    }
    try {
      fetch(`${FN}/beacon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* telemetry is never allowed to matter */
    }
  }

  /**
   * The last initials this browser filed, so the selector opens on them
   * instead of AAA. Null on a fresh machine or with storage disabled.
   */
  lastInitials() {
    try {
      const v = localStorage.getItem(INITIALS_KEY);
      return /^[A-Z]{3}$/.test(v ?? '') ? v : null;
    } catch {
      return null;
    }
  }

  /** Public share URL for a submitted run. */
  shareUrl(id) {
    const origin = typeof location !== 'undefined' ? location.origin : 'https://nerd-of-duty.vercel.app';
    return `${origin}/s/${id}`;
  }
}
