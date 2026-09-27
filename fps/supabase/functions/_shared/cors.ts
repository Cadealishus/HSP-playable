/**
 * CORS for the NERD OF DUTY game origins.
 *
 * Allow-list rather than `*` because these endpoints take writes. The regexes
 * cover the production deploy, every Vercel preview of this project, the
 * candidate custom domains, and local dev on any port.
 */
const ALLOWED = [
  /^https:\/\/nerd-of-duty[a-z0-9-]*\.vercel\.app$/,
  /^https:\/\/([a-z0-9-]+\.)?nerdofduty\.com$/,
  /^https:\/\/([a-z0-9-]+\.)?fintechnerdcon\.com$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

export function corsHeaders(origin: string | null): Record<string, string> {
  const ok = !!origin && ALLOWED.some((re) => re.test(origin));
  return {
    'Access-Control-Allow-Origin': ok ? origin! : 'https://nerd-of-duty.vercel.app',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // navigator.sendBeacon always sends credentials mode 'include', so the
    // browser rejects the response (and the preflight) unless this is present
    // alongside a concrete origin. Nothing here authenticates with cookies —
    // this exists purely so the beacon does not log a CORS error on every run.
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

export function preflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response('ok', { headers: corsHeaders(req.headers.get('origin')) });
}
