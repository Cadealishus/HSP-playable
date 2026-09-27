/**
 * issue-token — called by the client the moment a run starts.
 *
 * Returns an HMAC-signed `{ token, ts }`. `submit-score` will only accept a
 * score accompanied by a token it signed, that is under 30 minutes old, and
 * that has not been spent. Fire-and-forget on the client: a run NEVER waits on
 * this request, and a run that has no token is still played, just not ranked.
 */
import { issue } from '../_shared/hmac.ts';
import { json, preflight } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;

  const origin = req.headers.get('origin');
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'method_not_allowed' }, 405, origin);
  }

  try {
    const { token, ts } = await issue();
    return json({ token, ts }, 200, origin);
  } catch (err) {
    console.error('[issue-token]', err);
    return json({ error: 'server_error' }, 500, origin);
  }
});
