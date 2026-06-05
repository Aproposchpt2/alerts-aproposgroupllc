-- Apropos Group LLC — lock the opportunities table for the private dashboard.
-- Run AFTER schema.sql. The scheduled function uses the service_role key, which
-- bypasses RLS, so it keeps writing normally. The dashboard uses the anon key,
-- which these policies restrict to signed-in users only.

alter table public.sam_opportunities enable row level security;

-- Signed-in users may read. (No insert/update/delete policy = the dashboard
-- can only read; only the service-role function can write.)
drop policy if exists "authenticated read" on public.sam_opportunities;
create policy "authenticated read"
  on public.sam_opportunities
  for select
  to authenticated
  using (true);

-- ----------------------------------------------------------------------------
-- MAKE IT PRIVATE (do this in the Supabase dashboard, not SQL):
--
-- 1. Authentication → Providers → Email: keep "Email" enabled (magic link).
-- 2. Authentication → Sign In / Providers (or Settings):
--       turn OFF "Allow new users to sign up".
--    => With sign-ups disabled, a magic link only works for users you have
--       already added — so the dashboard is invite-only.
-- 3. Authentication → Users → Add user → add jmitchell@aproposgroupllc.com
--       (and any teammate you want to grant access).
-- 4. Authentication → URL Configuration: set Site URL to your deployed
--       dashboard URL (e.g. https://pipeline.aproposgroupllc.com) and add it
--       to the redirect allow-list, so the sign-in link returns to the app.
-- ----------------------------------------------------------------------------
