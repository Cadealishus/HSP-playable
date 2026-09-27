/**
 * beacon — fire-and-forget launch telemetry.
 *
 * One insert into public.beacons per event (run_start, run_end, score_submit,
 * share). Exists so launch traffic is measurable; it is not analytics. No auth
 * header is required (deployed --no-verify-jwt) precisely so the client can use
 * navigator.sendBeacon, which cannot set headers. Always answers 204: the game
 * must never see, wait on, or react to this endpoint.
 */
import { corsHeaders } from '../_shared/cors.ts';
import { hashIp, clientIp } from '../_shared/hmac.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const KINDS = new Set(['run_start', 'run_end', 'score_submit', 'share']);

const int = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : null;
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const headers = corsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  const done = () => new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return done();

  try {
    const body = await req.json();
    if (!KINDS.has(body?.kind)) return done();

    await fetch(`${SUPABASE_URL}/rest/v1/beacons`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        kind: body.kind,
        job: typeof body.job === 'string' ? body.job.slice(0, 40) : null,
        wave: int(body.wave),
        score: int(body.score),
        session: typeof body.session === 'string' ? body.session.slice(0, 40) : null,
        cabinet: body.cabinet === true,
        ip_hash: await hashIp(clientIp(req)),
      }),
    });
  } catch (err) {
    console.warn('[beacon] dropped', err);
  }
  return done();
});
