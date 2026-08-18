# Apropos Group LLC — SAM.gov Opportunity Monitor

Two layers of coverage for federal contract opportunities under your NAICS codes:

- **Layer 1 (no-code, set up today):** SAM.gov saved search + email follows.
- **Layer 2 (automated):** a Netlify scheduled function that pulls the SAM.gov API
  daily, dedupes into Supabase, and emails you a digest via Resend.

Named search profile **Apropos Group LLC** watches: **541511, 541512, 541519, 541611, 541614, 541618**

---

## Layer 1 — SAM.gov saved search (do this now, no deploy required)

1. Sign in at **sam.gov** → **Contract Opportunities** → **Search**.
2. Set filters:
   - **NAICS / PSC:** add all six codes above.
   - **Notice Type:** Combined Synopsis/Solicitation, Solicitation, Sources Sought,
     Presolicitation. (Sources Sought is pre-RFP market research — responding gets
     you on the contracting officer's radar early.)
   - **Set-Aside:** leave broad — include Total Small Business *and* unrestricted, so
     you see work you can sub on, not just set-asides.
   - **Status:** Active.
3. **Save the search**, then enable notifications. You already have *Contract
   Opportunity Following* set to **Immediate** in your SAM email settings, so saved
   searches will alert you.
4. Bonus: on **USASpending.gov**, look up who is currently winning awards under these
   NAICS codes — that's your target list of primes to sub under.

This layer runs entirely inside SAM.gov and needs nothing below. Layer 2 adds your own
searchable database + custom digest on top.

---

## Layer 2 — Automated monitor (Netlify + Supabase + Resend)

### What it does
Once a day it queries the **SAM.gov Get Opportunities API** (one call per NAICS code,
last 2 days), drops anything already seen, stores new notices in Supabase, and emails a
formatted digest with direct links to each notice. ~6 API calls/day — far under any
rate limit.

### Prerequisites
- A GitHub repo (Ruflo) connected to a **Netlify** site.
- A **Supabase** project.
- A **Resend** account with **aproposgroupllc.com verified** as a sending domain.
- A **SAM.gov public API key** — SAM.gov → **Account Details** → enter your password to
  reveal/generate it. (You already have a public API key provisioned on your account.)

### Setup
1. **Database:** open Supabase → SQL editor → run `supabase/schema.sql`.
2. **Repo:** commit this folder. Netlify auto-detects `netlify/functions/`.
3. **Environment variables:** in Netlify → Site settings → Environment variables, add
   everything from `.env.example` with real values.
4. **Deploy.** The function registers itself on a daily schedule (13:00 UTC) via the
   `config.schedule` export — no extra wiring.
5. **Test immediately:** Netlify → Functions → `sam-monitor` → **Run / trigger**. Check
   the logs (it returns `ok: N new`) and your inbox.

### Tuning
- Change the named profile codes or scan depth via `APROPOS_GROUP_NAICS_CODES` /
  `LOOKBACK_DAYS` environment variables — no code change needed.
- Change timing by editing the cron in `export const config = { schedule: "0 13 * * *" }`.
- Want only set-asides? Add `url.searchParams.set("typeOfSetAside", "SBA")` (etc.) in
  `fetchOppsForNaics`, or filter `notice_type` before emailing.

### Notes & gotchas
- **Resend `from`** must be on a verified domain. Until aproposgroupllc.com is verified
  in Resend, sends will fail — verify the domain first.
- **SAM API key** is tied to your account and can be rotated/expire. If calls start
  returning 401/403, regenerate it on the Account Details page and update the Netlify env var.
- **Service role key** is a powerful secret. It lives only in Netlify env vars and is
  used server-side by the function. Never ship it to a browser/dashboard.
- The function is **idempotent** — overlapping runs won't create duplicates thanks to the
  unique `notice_id` constraint.

### Natural next step
The Supabase table is dashboard-ready. A small read-only web view (filter by NAICS, set-aside,
deadline) turns this into a live pipeline board — a clean addition for Ruflo on Netlify.

---

## Layer 3 — Private pipeline dashboard (`dashboard/index.html`)

A login-gated, read-only web view over the same Supabase table: search + filter using the complete official 2022 six-digit NAICS catalog or the named **Apropos Group LLC** profile,
notice type, set-aside, and response deadline, with color-coded urgency and direct links to
each live SAM.gov notice. Single static file — no build step.

### Why it's private
It uses Supabase **magic-link** auth and is **invite-only**: only email addresses you add in
Supabase can sign in. Your opportunity pipeline is competitive intel, so it should never be
public or indexable.

### Setup
1. **Policies:** run `supabase/dashboard-policies.sql` in the Supabase SQL editor (after
   `schema.sql`). This enables Row Level Security and grants read access to signed-in users only.
2. **Lock sign-ups (in the Supabase dashboard, not SQL):**
   - Authentication → turn **OFF** "Allow new users to sign up".
   - Authentication → Users → **Add user** → `jmitchell@aproposgroupllc.com` (+ any teammate).
   - Authentication → URL Configuration → set **Site URL** to the deployed dashboard URL and
     add it to the redirect allow-list.
3. **Configure the file:** open `dashboard/index.html` and fill the two values in the CONFIG
   block near the bottom:
   - `SUPABASE_URL` — your project URL
   - `SUPABASE_ANON_KEY` — the **anon/public** key (Project Settings → API)
   Both are public-safe and meant for the browser. **Never** put the service_role key here —
   RLS is what protects the data.
4. **Deploy:** publish `dashboard/index.html` on Netlify (its own site, or a path/subdomain of
   the main site — e.g. `pipeline.aproposgroupllc.com`).
5. **Sign in:** enter your email, click the magic link, and the board loads.

### Notes
- Magic-link emails use Supabase's built-in auth mailer by default (fine for one user). For
  branded, higher-volume reliability you can later point Supabase Auth SMTP at Resend.
- The dashboard can only **read** — there is no write policy for the anon key, so a browser
  can never modify or delete captured opportunities.
