/**
 * submit-score — the only way a row reaches public.scores.
 *
 * Gates, in order (first failure wins, nothing is written):
 *   1. token          signed by us, < 30 min old, and not already spent
 *   2. initials       /^[A-Z]{3}$/ and not on the blocklist            -> 422
 *   3. shape          job in the three jobs, numbers finite and in range
 *   4. plausibility   score/kills under the wave ceiling, duration over the
 *                     floor (see _shared/plausible.ts)                 -> 422
 *   5. rate limit     12 accepted submissions per IP bucket per hour   -> 429
 *
 * Writes with the service role over PostgREST — no client library, so the
 * function has zero third-party imports and a cold start measured in ms.
 * Returns `{ id, rank, total }`; `id` is what the share link points at.
 */
import { json, preflight } from '../_shared/cors.ts';
import { verify, hashIp, clientIp } from '../_shared/hmac.ts';
import { JOBS, checkRun, initialsOk } from '../_shared/plausible.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** Accepted submissions per IP bucket per hour. Raise in the admin runbook. */
const RATE_LIMIT = 12;
const RATE_WINDOW_MS = 60 * 60 * 1000;

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

/** PostgREST returns the exact count in `Content-Range: 0-0/123`. */
function countOf(res: Response): number {
  const range = res.headers.get('content-range') ?? '';
  const n = Number(range.split('/')[1]);
  return Number.isFinite(n) ? n : 0;
}

const int = (v: unknown, fallback = 0) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
};

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;

  const origin = req.headers.get('origin');
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_json' }, 400, origin);
  }

  // ---- 1. token ----------------------------------------------------------
  const token = await verify(body.token);
  if (!token.ok) {
    return json({ error: 'bad_token', reason: token.reason }, 401, origin);
  }

  // ---- 2. initials -------------------------------------------------------
  const initials = typeof body.initials === 'string' ? body.initials.trim().toUpperCase() : '';
  if (!/^[A-Z]{3}$/.test(initials)) {
    return json({ error: 'bad_initials', detail: 'THREE LETTERS A–Z' }, 422, origin);
  }
  if (!initialsOk(initials)) {
    return json({ error: 'blocked_initials', detail: 'PICK ANOTHER THREE' }, 422, origin);
  }

  // ---- 3. shape ----------------------------------------------------------
  const job = String(body.job ?? '');
  if (!(JOBS as readonly string[]).includes(job)) {
    return json({ error: 'bad_job' }, 422, origin);
  }
  const run = {
    score: int(body.score),
    wave: Math.max(1, int(body.wave, 1)),
    kills: int(body.kills),
    duration_s: int(body.duration_s),
    continued: body.continued === true,
  };
  if (run.score < 0 || run.wave > 500 || run.kills < 0 || run.duration_s < 0 || run.duration_s > 86400) {
    return json({ error: 'out_of_range' }, 422, origin);
  }
  let accuracy: number | null = null;
  if (body.accuracy !== null && body.accuracy !== undefined) {
    const a = Number(body.accuracy);
    if (Number.isFinite(a) && a >= 0 && a <= 1) accuracy = Math.round(a * 10000) / 10000;
  }

  // ---- 4. plausibility ---------------------------------------------------
  const verdict = checkRun(run);
  if (!verdict.ok) {
    console.warn('[submit-score] implausible', verdict);
    return json({ error: 'implausible', field: verdict.field, detail: verdict.detail }, 422, origin);
  }

  const ip_hash = await hashIp(clientIp(req));

  try {
    // ---- 5. rate limit ---------------------------------------------------
    const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const recent = await rest(
      `scores?select=id&ip_hash=eq.${encodeURIComponent(ip_hash)}&created_at=gte.${encodeURIComponent(since)}`,
      { method: 'GET', headers: { Prefer: 'count=exact', Range: '0-0' } }
    );
    if (recent.ok && countOf(recent) >= RATE_LIMIT) {
      return json({ error: 'rate_limited', detail: `${RATE_LIMIT} RUNS PER HOUR` }, 429, origin);
    }

    // ---- burn the token (replay guard) -----------------------------------
    const burn = await rest('token_uses', { method: 'POST', body: JSON.stringify({ jti: token.jti }) });
    if (burn.status === 409) {
      return json({ error: 'token_spent' }, 409, origin);
    }
    if (!burn.ok && burn.status !== 201 && burn.status !== 200) {
      console.error('[submit-score] token burn failed', burn.status, await burn.text());
      return json({ error: 'server_error' }, 500, origin);
    }

    // ---- insert ----------------------------------------------------------
    const ins = await rest('scores', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ initials, job, ...run, accuracy, ip_hash }),
    });
    if (!ins.ok) {
      console.error('[submit-score] insert failed', ins.status, await ins.text());
      return json({ error: 'insert_failed' }, 500, origin);
    }
    const rows = await ins.json();
    const row = Array.isArray(rows) ? rows[0] : rows;

    // ---- rank ------------------------------------------------------------
    const better = await rest(`scores?select=id&hidden=eq.false&score=gt.${run.score}`, {
      method: 'GET',
      headers: { Prefer: 'count=exact', Range: '0-0' },
    });
    const total = await rest('scores?select=id&hidden=eq.false', {
      method: 'GET',
      headers: { Prefer: 'count=exact', Range: '0-0' },
    });

    return json(
      {
        id: row?.id ?? null,
        rank: (better.ok ? countOf(better) : 0) + 1,
        total: total.ok ? countOf(total) : 0,
      },
      200,
      origin
    );
  } catch (err) {
    console.error('[submit-score]', err);
    return json({ error: 'server_error' }, 500, origin);
  }
});
