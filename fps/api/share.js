/**
 * /s/:id  (rewritten to /api/share?id=…) — the share landing page.
 *
 * Serves a minimal HTML document whose only job is to carry the Open Graph and
 * Twitter card tags that point at /api/og?id=…, then send a human straight
 * into the game. Crawlers stop at the <head>; people get redirected in ~1.2s,
 * with a link for anyone whose JS is off.
 *
 * The score row is fetched with the public anon key so the title/description
 * carry the actual run. Unknown or hidden ids degrade to the generic card.
 */
export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://eqvgexqrojvjedjkibsj.supabase.co';
const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxdmdleHFyb2p2amVkamtpYnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNzk4MzksImV4cCI6MjEwMDY1NTgzOX0.9Hyo_yKFu3NsRfmP6fmCzEt4aGjiTLyJro1-L6i1v6E';

const JOB_LABELS = {
  'fraud-analyst': 'FRAUD ANALYST',
  'payments-engineer': 'PAYMENTS ENGINEER',
  'compliance-officer': 'COMPLIANCE OFFICER',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default async function handler(req) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? '';
  const origin = url.origin;

  let row = null;
  if (UUID.test(id)) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/leaderboard?select=initials,job,score,wave&id=eq.${id}&limit=1`,
        { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
      );
      if (res.ok) {
        const rows = await res.json();
        row = Array.isArray(rows) && rows.length ? rows[0] : null;
      }
    } catch {
      row = null;
    }
  }

  const title = row
    ? `NERD OF DUTY · ${row.initials} · ${JOB_LABELS[row.job] ?? ''} · WAVE ${row.wave} · ${Number(
        row.score
      ).toLocaleString('en-US')} PTS`
    : 'NERD OF DUTY — A Fintech NerdCon Game';

  const description = row
    ? `${row.initials} held the ledger to wave ${row.wave}. Beat it. Fintech NerdCon · Nov 19–20 · San Diego.`
    : 'Hold the ledger against Legacy Core Security. Fintech NerdCon · Nov 19–20 · San Diego.';

  const image = `${origin}/api/og${UUID.test(id) ? `?id=${encodeURIComponent(id)}` : ''}`;
  const play = `${origin}/`;

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="NERD OF DUTY">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(origin)}/s/${esc(id)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="2;url=${esc(play)}">
<style>
  html,body{height:100%;margin:0;background:#050505;color:#F0F0F0;
    font:14px/1.7 "JetBrains Mono","SF Mono",ui-monospace,Menlo,monospace;
    display:flex;align-items:center;justify-content:center;text-align:center;
    letter-spacing:.18em;text-transform:uppercase}
  a{color:#00E5FF;text-decoration:none;border-bottom:1px solid rgba(0,229,255,.4)}
  .g{color:#FFD700}
</style>
</head><body>
<div>
  <div class="g">NERD OF DUTY</div>
  <div>${esc(title)}</div>
  <p><a href="${esc(play)}">DEPLOY ▸</a></p>
</div>
<script>setTimeout(function(){location.replace(${JSON.stringify(play)})},1200)</script>
</body></html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=600, stale-while-revalidate=86400',
    },
  });
}
