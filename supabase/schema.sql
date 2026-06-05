-- Apropos Group LLC — SAM.gov opportunity store
-- Run once in the Supabase SQL editor.

create table if not exists public.sam_opportunities (
  id                  bigint generated always as identity primary key,
  notice_id           text unique not null,          -- SAM noticeId (dedupe key)
  title               text,
  solicitation_number text,
  agency              text,                           -- fullParentPathName
  notice_type         text,                           -- Solicitation, Sources Sought, etc.
  naics_code          text,
  set_aside           text,
  posted_date         text,                           -- "YYYY-MM-DD HH:MM:SS" from SAM
  response_deadline   text,
  ui_link             text,                           -- live SAM.gov notice URL
  raw                 jsonb,                          -- full original record
  captured_at         timestamptz not null default now()
);

create index if not exists sam_opps_posted_idx on public.sam_opportunities (posted_date desc);
create index if not exists sam_opps_naics_idx  on public.sam_opportunities (naics_code);
create index if not exists sam_opps_capt_idx   on public.sam_opportunities (captured_at desc);

-- The scheduled function writes with the SERVICE ROLE key, which bypasses RLS.
-- If you later build a dashboard that reads with the ANON key, enable RLS and add
-- a read-only policy, e.g.:
--
-- alter table public.sam_opportunities enable row level security;
-- create policy "read opps" on public.sam_opportunities for select using (true);
