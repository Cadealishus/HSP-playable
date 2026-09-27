/**
 * /api/og?id=<score-id> — the unfurl image for a shared run.
 *
 * Renders the same card the in-game canvas renders (src/ui/sharecard.js), in
 * Arcade Terminal, at 1200x630. The row is fetched from the public Supabase
 * board view with the anon key; an unknown or hidden id falls back to a generic
 * NERD OF DUTY card rather than 404ing, because a broken image in a Slack
 * unfurl is worse than a generic one.
 *
 * Edge runtime — @vercel/og is a server-side dependency and is never bundled
 * into the game client.
 */
import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://eqvgexqrojvjedjkibsj.supabase.co';
const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxdmdleHFyb2p2amVkamtpYnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNzk4MzksImV4cCI6MjEwMDY1NTgzOX0.9Hyo_yKFu3NsRfmP6fmCzEt4aGjiTLyJro1-L6i1v6E';

const C = {
  void: '#050505',
  cyan: '#00E5FF',
  gold: '#FFD700',
  white: '#F0F0F0',
  dim: 'rgba(240,240,240,0.55)',
};

const JOB_LABELS = {
  'fraud-analyst': 'FRAUD ANALYST',
  'payments-engineer': 'PAYMENTS ENGINEER',
  'compliance-officer': 'COMPLIANCE OFFICER',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function fetchRow(id) {
  if (!UUID.test(id ?? '')) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/leaderboard?select=initials,job,score,wave,kills&id=eq.${id}&limit=1`,
      { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch {
    return null;
  }
}

/** JetBrains Mono from Google, with a graceful fall back to the built-in face. */
async function loadFont(weight) {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@${weight}&display=swap`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }
    ).then((r) => r.text());
    const url = css.match(/src:\s*url\((https:[^)]+)\)\s*format\('(?:truetype|opentype)'\)/)?.[1];
    if (!url) return null;
    const data = await fetch(url).then((r) => r.arrayBuffer());
    return { name: 'JetBrains Mono', data, weight: Number(weight), style: 'normal' };
  } catch {
    return null;
  }
}

const cell = (label, value, color) => ({
  type: 'div',
  props: {
    style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' },
    children: [
      { type: 'div', props: { style: { fontSize: 15, letterSpacing: 6, color: 'rgba(240,240,240,0.42)' }, children: label } },
      { type: 'div', props: { style: { fontSize: 46, fontWeight: 800, color, letterSpacing: 2 }, children: value } },
    ],
  },
});

export default async function handler(req) {
  const id = new URL(req.url).searchParams.get('id');
  const row = await fetchRow(id);

  const fonts = (await Promise.all([loadFont(400), loadFont(700), loadFont(800)])).filter(Boolean);
  const family = fonts.length ? 'JetBrains Mono' : 'sans-serif';

  const head = [
    { type: 'div', props: { style: { fontSize: 20, letterSpacing: 9, color: C.cyan, fontWeight: 700 }, children: 'HOLD THE LEDGER' } },
    { type: 'div', props: { style: { fontSize: 72, fontWeight: 800, color: C.white, letterSpacing: 8, marginTop: 16 }, children: 'NERD OF DUTY' } },
    { type: 'div', props: { style: { fontSize: 17, letterSpacing: 8, color: C.dim, marginTop: 10 }, children: 'A FINTECH NERDCON GAME' } },
  ];

  // With a row we show the run. Without one (unknown id, hidden entry, a link
  // shared before the score was filed) we show the pitch — never a card of
  // em-dashes, which reads as a broken image in an unfurl.
  const body = row
    ? [
        {
          type: 'div',
          props: {
            style: { fontSize: 84, fontWeight: 800, color: C.gold, letterSpacing: 18, marginTop: 30 },
            children: row.initials,
          },
        },
        {
          type: 'div',
          props: {
            style: { fontSize: 21, fontWeight: 700, letterSpacing: 10, color: C.cyan, marginTop: 8 },
            children: JOB_LABELS[row.job] ?? '',
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              gap: '120px',
              marginTop: 30,
              paddingTop: 26,
              borderTop: '1px solid rgba(240,240,240,0.14)',
            },
            children: [
              cell('WAVE', String(row.wave ?? 1), C.white),
              cell('SCORE', `${Number(row.score ?? 0).toLocaleString('en-US')} PTS`, C.gold),
            ],
          },
        },
      ]
    : [
        {
          type: 'div',
          props: {
            style: { fontSize: 26, fontWeight: 700, letterSpacing: 8, color: C.gold, marginTop: 58 },
            children: 'CREDIT 1 · CLICK TO DEPLOY',
          },
        },
        {
          type: 'div',
          props: {
            style: { fontSize: 18, letterSpacing: 6, color: C.dim, marginTop: 16 },
            children: 'LEGACY CORE SECURITY INBOUND · PICK YOUR JOB',
          },
        },
      ];

  const foot = [
    { type: 'div', props: { style: { fontSize: 19, fontWeight: 700, letterSpacing: 10, color: C.gold, marginTop: 46 }, children: 'FINTECH NERDCON' } },
    { type: 'div', props: { style: { fontSize: 15, letterSpacing: 6, color: C.dim, marginTop: 12 }, children: 'NOV 19–20 · SAN DIEGO · FINTECHNERDCON.COM' } },
  ];

  return new ImageResponse(
    {
      type: 'div',
      props: {
        style: {
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          // Satori has no descender safety margin: without the padding the
          // final line's tails clip on the 630px edge.
          padding: '34px 0 40px',
          background: C.void,
          backgroundImage:
            'radial-gradient(ellipse 90% 60% at 50% 0%, rgba(53,104,255,0.30), rgba(5,5,5,0) 60%),' +
            'radial-gradient(ellipse 80% 60% at 50% 100%, rgba(255,45,120,0.18), rgba(5,5,5,0) 62%)',
          fontFamily: family,
          textTransform: 'uppercase',
          border: '2px solid rgba(0,229,255,0.30)',
        },
        children: [...head, ...body, ...foot],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: fonts.length ? fonts : undefined,
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800' },
    }
  );
}
