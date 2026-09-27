# NERD OF DUTY — leaderboard admin

Everything you need to keep a junk entry off a conference screen in under a
minute, plus every knob the validator has.

**Project:** `eqvgexqrojvjedjkibsj` (us-west-1, "nerd-of-duty")
**SQL editor:** https://supabase.com/dashboard/project/eqvgexqrojvjedjkibsj/sql/new
**Function logs:** https://supabase.com/dashboard/project/eqvgexqrojvjedjkibsj/functions

---

## 1. Hide an entry (the 30-second path)

Hiding is the default action. It keeps the row for forensics and drops it out of
every board immediately — the boards read a view filtered on `hidden = false`,
and nothing is cached longer than the player's next tab click.

Paste into the SQL editor, change the initials, run:

```sql
-- Hide every entry with these initials from the last 6 hours.
update public.scores
set hidden = true
where initials = 'XXX'
  and created_at > now() - interval '6 hours';
```

By exact row (the id is in the share link, `…/s/<id>`):

```sql
update public.scores set hidden = true where id = '00000000-0000-0000-0000-000000000000';
```

Nuclear, if something is spraying the board:

```sql
-- Hide everything from one submitter bucket in the last hour.
update public.scores
set hidden = true
where ip_hash = (select ip_hash from public.scores where id = '<the-bad-row-id>')
  and created_at > now() - interval '1 hour';
```

Undo any of the above by setting `hidden = false` with the same `where`.

## 2. Actually delete

Only when the content itself must not exist (a slur that got past the
blocklist). Hiding is otherwise better — it preserves the rate-limit history.

```sql
delete from public.scores where id = '<row-id>';
```

## 3. Look before you act

```sql
-- Newest 50 entries, with the moderation columns.
select id, initials, job, score, wave, kills, duration_s, continued, hidden,
       ip_hash, created_at
from public.scores_admin
limit 50;

-- Suspiciously good runs that still passed the validator.
select * from public.scores_admin where score > 200000 order by score desc limit 20;

-- Everything from one submitter bucket.
select * from public.scores_admin where ip_hash = '<hash>' order by created_at desc;
```

`scores_admin` is service-role/dashboard only — `anon` cannot read it, and
cannot read `ip_hash` from anywhere.

## 4. Wipe the board (pre-launch / after a test event)

```sql
truncate public.scores;          -- boards go back to "THE LEDGER IS BLANK"
truncate public.token_uses;      -- optional: clears the replay ledger
```

---

## 5. Validation knobs

All server-side, in `supabase/functions/`. Edit, then redeploy:

```bash
env -u HTTPS_PROXY -u HTTP_PROXY -u https_proxy -u http_proxy -u NODE_EXTRA_CA_CERTS \
  supabase functions deploy submit-score --project-ref eqvgexqrojvjedjkibsj --no-verify-jwt
```

| Knob | File | Default | What it does |
|---|---|---|---|
| `RATE_LIMIT` | `submit-score/index.ts` | `12` | Accepted submissions per IP bucket per hour → `429`. Raise it for a cabinet on shared conference wifi (everyone behind one NAT shares a bucket). |
| `RATE_WINDOW_MS` | `submit-score/index.ts` | `3600000` | The rate-limit window. |
| `SLACK` | `_shared/plausible.ts` | `1.15` | Headroom on the max-score ceiling. Raise if a scoring change starts rejecting honest runs. |
| `minDuration()` | `_shared/plausible.ts` | `0.25s/kill + 2s/wave` | Wall-clock floor for a run. |
| `BLOCKED` | `_shared/plausible.ts` | ~56 combos | Initials blocklist → `422 blocked_initials`. Add a combo, redeploy, done. |
| `MAX_AGE_MS` | `_shared/hmac.ts` | 30 min | How long a run token stays valid. |

**The ceiling formula** (derived from NERDCON_CONTRACT.md): a run that reached
wave *n* cannot beat `9 × (150 × maxKills + Σ 250k) × 1.15`, where `maxKills` is
`Σ min(3+ceil(k*1.5), 14)` over every wave plus one replayed wave if the player
used their continue. It assumes every kill was a headshot at the ×9 cap — which
is impossible, since the multiplier has to be earned. It is a paste-detector,
not a skill ceiling.

**Anti-cheat is a speed bump, not a fortress.** A determined person with the
devtools console can post a plausible score. That is an accepted trade: per
DESIGN.md the day-2 stage crowning counts **cabinet runs only**, staff-witnessed
on a controlled machine. The online board is for fun.

## 6. What each layer guards

| Layer | Result |
|---|---|
| HMAC run token, ≤ 30 min, single-use (`token_uses`) | `401 bad_token` / `409 token_spent` |
| Initials regex + blocklist | `422 bad_initials` / `422 blocked_initials` |
| Job in the three jobs, numbers in range | `422 bad_job` / `422 out_of_range` |
| Score / kills / duration plausibility | `422 implausible` (with the offending field) |
| Per-IP-bucket rate limit | `429 rate_limited` |

The client queues a submit ONLY on network failure or 5xx. A 4xx is final and is
shown to the player — a rejected score never sits in a retry loop.

## 7. Security model (why the anon key in the bundle is fine)

- `public.scores` — RLS on. `anon` has SELECT only, only on `hidden = false`
  rows, and only via **column grants** that exclude `ip_hash`. There is no
  INSERT/UPDATE/DELETE grant at all, so a client cannot write even if a policy
  were added by mistake.
- `public.leaderboard` / `public.leaderboard_today` — `security_invoker` views
  over the public columns. `leaderboard_today` filters on the current calendar
  day in `America/Los_Angeles`, so the cabinet's featured board is correct
  regardless of the machine's clock.
- `public.token_uses`, `public.beacons`, `public.scores_admin` — no grants.
  Service role (edge functions) and the dashboard only.

## 8. Beacons (launch measurement)

Four kinds: `run_start`, `run_end`, `score_submit`, `share`. Written by the
`beacon` edge function, never readable by the client.

```sql
-- Funnel for the last 24h.
select kind, count(*) from public.beacons
where created_at > now() - interval '24 hours' group by kind order by 2 desc;

-- Job pick rate.
select job, count(*) from public.beacons
where kind = 'run_start' and job is not null group by job order by 2 desc;

-- Cabinet vs web.
select cabinet, count(*) from public.beacons where kind = 'run_start' group by cabinet;

-- How far people actually get.
select wave, count(*) from public.beacons where kind = 'run_end' group by wave order by wave;
```

## 9. Client-side state

localStorage keys, all read/written inside try/catch:

| Key | Contents |
|---|---|
| `nod.best` / `nod.bestWave` | Local best score / wave (pre-existing) |
| `nod.initials` | Last initials used, so the selector opens on them |
| `nod.queue` | Submits waiting on the network. Max 12, dropped after 8 attempts or 7 days. Drains on boot and at every run start with 5s → 2h backoff. |

## 10. Events added beyond NERDCON_CONTRACT.md

| Event | Direction | Meaning |
|---|---|---|
| `ui:attract` | UI → game | Abandon the current screen and return to the attract state. Only caller is cabinet mode's 60-second idle reset; it never fires during `play`. |

`game:over` also gained three additive fields — `job`, `durationS`, `continued`
— which are exactly what `submit-score` needs to validate a run. The canonical
fields are unchanged.

`window.NOD` gained `attract()`, `lastRun` and `leaderboard` for verification.

## 11. Cabinet mode

`?cabinet=1` on any deploy URL.

- Fullscreen on the first input (browsers refuse it before a gesture).
- Attract loop: title card 11s → GLOBAL 9s → TODAY 13s, "PRESS ANY BUTTON" over
  the board pages. Any input jumps straight back to the title, which is also the
  job select.
- 60s idle → back to attract. Armed on the game-over card, the death card, the
  pause menu and the boards. **Never during a wave.**
- TODAY is the featured board in cabinet mode, including from the game-over card.

If the machine wanders off the attract loop, reloading the URL is the whole
health-check.
