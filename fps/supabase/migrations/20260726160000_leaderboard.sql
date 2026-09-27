-- ============================================================================
-- NERD OF DUTY — HOLD THE LEDGER leaderboard + launch beacons
-- ============================================================================
-- Security model
--   scores        RLS ON. anon/authenticated get SELECT only, only on
--                 non-hidden rows, and only on the public columns (ip_hash is
--                 never granted). There is no INSERT/UPDATE/DELETE grant at
--                 all, so a client cannot write even if a policy were added by
--                 accident — every write goes through the `submit-score` edge
--                 function using the service role.
--   leaderboard   security_invoker view over the public columns. The client
--                 reads this (select=*), so column drift can never leak
--                 ip_hash.
--   token_uses    single-use ledger for the HMAC run tokens (replay guard).
--                 No grants: service role only.
--   beacons       insert-only launch telemetry. No grants: written by the
--                 `beacon` edge function with the service role, read in the
--                 dashboard.
-- ============================================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ scores --
create table if not exists public.scores (
  id          uuid primary key default gen_random_uuid(),
  initials    text        not null check (initials ~ '^[A-Z]{3}$'),
  job         text        not null check (job in ('fraud-analyst', 'payments-engineer', 'compliance-officer')),
  score       integer     not null check (score >= 0 and score <= 100000000),
  wave        integer     not null check (wave >= 1 and wave <= 500),
  kills       integer     not null default 0 check (kills >= 0 and kills <= 100000),
  accuracy    numeric(5,4)         check (accuracy is null or (accuracy >= 0 and accuracy <= 1)),
  duration_s  integer     not null default 0 check (duration_s >= 0 and duration_s <= 86400),
  continued   boolean     not null default false,
  ip_hash     text,
  hidden      boolean     not null default false,
  created_at  timestamptz not null default now()
);

-- The board query: `where hidden = false order by score desc`.
create index if not exists scores_board_idx    on public.scores (hidden, score desc);
-- TODAY board + moderation sweeps.
create index if not exists scores_created_idx  on public.scores (created_at desc);
-- Per-job boards.
create index if not exists scores_job_idx      on public.scores (job, hidden, score desc);
-- Per-IP rate limit lookup in submit-score.
create index if not exists scores_ip_idx       on public.scores (ip_hash, created_at desc);

alter table public.scores enable row level security;

drop policy if exists "public boards are readable" on public.scores;
create policy "public boards are readable"
  on public.scores for select
  to anon, authenticated
  using (hidden = false);

revoke all on public.scores from anon, authenticated;
grant select (id, initials, job, score, wave, kills, accuracy, duration_s, continued, created_at)
  on public.scores to anon, authenticated;

-- ------------------------------------------------------------- board views --
create or replace view public.leaderboard
with (security_invoker = true) as
  select id, initials, job, score, wave, kills, accuracy, duration_s, continued, created_at
  from public.scores
  where hidden = false;

-- TODAY = the current calendar day in America/Los_Angeles (San Diego). Doing
-- this server-side keeps the client free of timezone arithmetic and makes the
-- cabinet's featured board correct no matter what the machine's clock says.
create or replace view public.leaderboard_today
with (security_invoker = true) as
  select id, initials, job, score, wave, kills, accuracy, duration_s, continued, created_at
  from public.scores
  where hidden = false
    and (created_at at time zone 'America/Los_Angeles')::date
      = (now() at time zone 'America/Los_Angeles')::date;

grant select on public.leaderboard        to anon, authenticated;
grant select on public.leaderboard_today  to anon, authenticated;

-- -------------------------------------------------------------- token_uses --
-- One row per spent run token. The submit function inserts the token's jti
-- before writing the score, so a captured token cannot be replayed inside its
-- 30-minute freshness window.
create table if not exists public.token_uses (
  jti        text primary key,
  created_at timestamptz not null default now()
);
alter table public.token_uses enable row level security;
revoke all on public.token_uses from anon, authenticated;

-- ----------------------------------------------------------------- beacons --
create table if not exists public.beacons (
  id         bigint generated always as identity primary key,
  kind       text        not null check (kind in ('run_start', 'run_end', 'score_submit', 'share')),
  job        text,
  wave       integer,
  score      integer,
  session    text,
  cabinet    boolean     not null default false,
  ip_hash    text,
  created_at timestamptz not null default now()
);
create index if not exists beacons_kind_idx on public.beacons (kind, created_at desc);

alter table public.beacons enable row level security;
revoke all on public.beacons from anon, authenticated;

-- ------------------------------------------------------------- moderation ---
-- Convenience for the admin runbook (docs/leaderboard-admin.md): the newest 200
-- entries with everything a human needs to judge them, ip_hash included. Not
-- granted to anon — dashboard/service-role only.
create or replace view public.scores_admin
with (security_invoker = true) as
  select id, initials, job, score, wave, kills, accuracy, duration_s, continued,
         hidden, ip_hash, created_at
  from public.scores
  order by created_at desc;
revoke all on public.scores_admin from anon, authenticated;
