# DEPLOY — Apropos Group SAM.gov Monitor + Pipeline Dashboard

One repo, one Netlify site, both features. Do the phases **in order** — there are real
dependencies (the database must exist before the function runs or the dashboard reads).
Total time: ~30–45 minutes.

---

## Before you start — gather 3 credentials

1. **SAM API key** — sam.gov → your name → **Account Details** → enter your password →
   copy the **Public API Key**. Copy it the instant it appears; it hides when you leave the page.
2. **Supabase keys** — at supabase.com, create a project if you don't have one. Then
   **Project Settings → API** and copy three things: the **Project URL**, the **anon/public**
   key, and the **service_role** (secret) key.
3. **Resend API key** — resend.com → **API Keys** → copy or create one. (The domain
   aproposgroupllc.com is already verified, so no domain step needed.)

---

## Phase 1 — Database (Supabase)

1. Supabase → **SQL Editor** → New query → paste all of `supabase/schema.sql` → **Run**.
2. New query → paste all of `supabase/dashboard-policies.sql` → **Run**.
3. Still in Supabase → **Authentication**:
   - Providers: keep **Email** enabled (magic link).
   - Turn **OFF** "Allow new users to sign up" (this makes the dashboard invite-only).
   - **Users → Add user →** `jmitchell@aproposgroupllc.com`.
   - (You'll set the Site URL in Phase 3, once the dashboard has a URL.)

---

## Phase 2 — Deploy to Netlify

1. Push this repo to GitHub (Ruflo), then in Netlify **Add new site → Import from Git**
   (or drag-and-drop the folder). Name it something like **apropos-ops** — keep it separate
   from the public marketing site. `netlify.toml` already serves the dashboard and runs the
   function from this one site.
2. **Site configuration → Environment variables** → add all six:

   | Key | Value |
   |---|---|
   | `SAM_API_KEY` | your SAM public key |
   | `SUPABASE_URL` | `https://YOUR-REF.supabase.co` |
   | `SUPABASE_SERVICE_KEY` | the **service_role** key (not anon) |
   | `RESEND_API_KEY` | your Resend key |
   | `ALERT_EMAIL_FROM` | `alerts@aproposgroupllc.com` |
   | `ALERT_EMAIL_TO` | `jmitchell@aproposgroupllc.com` (or your Gmail to start) |

3. **Deploys → Trigger deploy → Deploy site.**

---

## Phase 3 — Configure the dashboard

1. Note your new site URL (e.g. `https://apropos-ops.netlify.app`). Because the publish
   directory is `dashboard`, **that URL is the dashboard**.
2. Supabase → **Authentication → URL Configuration** → set **Site URL** to that URL and add
   it to the **Redirect URLs** list.
3. Edit `dashboard/index.html` → fill the CONFIG block near the bottom:
   - `SUPABASE_URL` = `https://YOUR-REF.supabase.co`
   - `SUPABASE_ANON_KEY` = the **anon/public** key (NEVER the service_role key here)
   Commit/redeploy so it goes live.

---

## Phase 4 — Verify (this proves it works)

A normal run only scans the **last 2 days**, so the very first manual trigger may correctly
find nothing (`ok: none fetched`) — that's not a failure. To see real data and a real email
on the first test:

1. Temporarily set env var `LOOKBACK_DAYS = 30` → redeploy.
2. Netlify → **Functions → sam-monitor → Run/Trigger.** Watch the log for `ok: N new`, and
   check your inbox for the digest.
3. Open the dashboard URL → enter `jmitchell@aproposgroupllc.com` → click the magic-link email
   → the board loads with the backlog, deadlines color-coded.
4. Set `LOOKBACK_DAYS` back to `2` (or delete it) → redeploy. It now runs itself daily.

---

## Phase 5 — Email forward (independent — do anytime)

So `jmitchell@aproposgroupllc.com` can receive replies: set up ImprovMX (free) and add its
MX + SPF records in Netlify DNS. Steps are in the chat / README.

---

## Troubleshooting (send me the exact log line and I'll pinpoint it)

- **SAM 401 / 403** in the function log → bad or expired SAM key. Regenerate, update the env var.
- **Supabase 401 / 403** → wrong key (the function needs **service_role**), or schema not run.
- **Resend 4xx** → `ALERT_EMAIL_FROM` isn't on the verified domain, or the key is wrong.
- **Dashboard "Couldn't load data"** → anon key/URL wrong, or `dashboard-policies.sql` not run.
- **Magic link never arrives / can't sign in** → the user wasn't added in Supabase, or the
  Site URL / Redirect URL isn't set in Authentication → URL Configuration.
