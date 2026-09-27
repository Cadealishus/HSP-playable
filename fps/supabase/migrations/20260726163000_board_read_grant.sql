-- The public board views are security_invoker, so their bodies execute as the
-- caller. `where hidden = false` therefore needs a column privilege on `hidden`
-- as well — without it anon gets "permission denied for table scores" on every
-- board read. `hidden` is a moderation flag, not user data; granting it costs
-- nothing and keeps ip_hash the only column anon can never touch.
grant select (hidden) on public.scores to anon, authenticated;
