/**
 * Stateless run tokens.
 *
 * A token is `<ts>.<nonce>.<sig>` where sig = HMAC-SHA256(HMAC_SECRET, "ts.nonce")
 * base64url-encoded. `issue-token` mints one when a run starts; `submit-score`
 * verifies the signature, checks the timestamp is inside MAX_AGE_MS, and burns
 * the `ts.nonce` pair (the jti) in public.token_uses so it cannot be replayed.
 *
 * This is a speed bump, not a fortress — see docs/leaderboard-admin.md.
 */

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let keyPromise: Promise<CryptoKey> | null = null;
function key(): Promise<CryptoKey> {
  if (!keyPromise) {
    const secret = Deno.env.get('HMAC_SECRET');
    if (!secret) throw new Error('HMAC_SECRET is not set on the project');
    keyPromise = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
    ]);
  }
  return keyPromise;
}

export async function sign(message: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await key(), enc.encode(message));
  return b64url(new Uint8Array(sig));
}

/** Non-constant-time compare is fine for a 256-bit tag over a public network. */
function eq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function issue(): Promise<{ token: string; ts: number }> {
  const ts = Date.now();
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(12)));
  const body = `${ts}.${nonce}`;
  return { token: `${body}.${await sign(body)}`, ts };
}

export const MAX_AGE_MS = 30 * 60 * 1000;

export type TokenCheck =
  | { ok: true; jti: string; ts: number }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

export async function verify(token: unknown): Promise<TokenCheck> {
  if (typeof token !== 'string') return { ok: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [tsRaw, nonce, sig] = parts;
  const ts = Number(tsRaw);
  if (!Number.isFinite(ts) || !nonce || !sig) return { ok: false, reason: 'malformed' };

  const expect = await sign(`${tsRaw}.${nonce}`);
  if (!eq(expect, sig)) return { ok: false, reason: 'bad_signature' };

  const age = Date.now() - ts;
  // A little tolerance for clock skew in the negative direction.
  if (age > MAX_AGE_MS || age < -60_000) return { ok: false, reason: 'expired' };

  return { ok: true, jti: `${tsRaw}.${nonce}`, ts };
}

/** Stable, non-reversible IP bucket for rate limiting. Never stores the IP. */
export async function hashIp(ip: string): Promise<string> {
  return (await sign(`ip:${ip}`)).slice(0, 32);
}

/** The client IP as seen through Supabase's edge proxy. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') ?? '';
  return fwd.split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'unknown';
}
