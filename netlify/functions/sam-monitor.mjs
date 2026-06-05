// ============================================================================
//  Apropos Group LLC — SAM.gov Opportunity Monitor
//  Netlify Scheduled Function (runs daily)
//
//  Flow:  SAM.gov Get Opportunities API  ->  dedupe vs Supabase  ->  Resend digest
//  Deps:  none (uses built-in fetch / URL / Response on Netlify's Node 18+ runtime)
//
//  All secrets are read from Netlify environment variables. Never commit them.
// ============================================================================

const SAM_SEARCH_URL = "https://api.sam.gov/opportunities/v2/search";

// Target NAICS codes (override via env NAICS_CODES, comma-separated)
const NAICS_CODES = (process.env.NAICS_CODES ||
  "541512,541519,541511,518210,561421,561499")
  .split(",").map((s) => s.trim()).filter(Boolean);

// How many days back to scan each run. 2 covers weekends / a missed run.
const LOOKBACK_DAYS = parseInt(process.env.LOOKBACK_DAYS || "2", 10);

// Max records per page (API ceiling is 1000).
const PAGE_LIMIT = 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mmddyyyy(d) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function oppLink(o) {
  return o.uiLink || `https://sam.gov/opp/${o.noticeId}/view`;
}

// Map a SAM opportunity record to a Supabase row.
function toRow(o) {
  return {
    notice_id: o.noticeId,
    title: o.title || null,
    solicitation_number: o.solicitationNumber || null,
    agency: o.fullParentPathName || null,
    notice_type: o.type || null,
    naics_code: o.naicsCode || null,
    set_aside: o.typeOfSetAsideDescription || o.setAside || null,
    posted_date: o.postedDate || null,
    response_deadline: o.responseDeadLine || null,
    ui_link: oppLink(o),
    raw: o,
  };
}

// ---------------------------------------------------------------------------
// SAM.gov — one call per NAICS code, paginated if needed
// ---------------------------------------------------------------------------

async function fetchOppsForNaics(naics, postedFrom, postedTo) {
  const out = [];
  let offset = 0;
  while (true) {
    const url = new URL(SAM_SEARCH_URL);
    url.searchParams.set("api_key", process.env.SAM_API_KEY);
    url.searchParams.set("postedFrom", postedFrom);
    url.searchParams.set("postedTo", postedTo);
    url.searchParams.set("ncode", naics);
    url.searchParams.set("limit", String(PAGE_LIMIT));
    url.searchParams.set("offset", String(offset));

    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`SAM ${res.status} (NAICS ${naics}): ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const batch = data.opportunitiesData || [];
    out.push(...batch);

    const total = data.totalRecords || 0;
    offset += batch.length;
    if (batch.length === 0 || offset >= total) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Supabase (PostgREST) — dedupe + insert via service-role key
// ---------------------------------------------------------------------------

function sbHeaders(extra = {}) {
  return {
    apikey: process.env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    ...extra,
  };
}

async function existingNoticeIds(noticeIds) {
  if (noticeIds.length === 0) return new Set();
  const found = new Set();
  // Chunk to keep the URL length sane.
  for (let i = 0; i < noticeIds.length; i += 150) {
    const chunk = noticeIds.slice(i, i + 150);
    const url = new URL(`${process.env.SUPABASE_URL}/rest/v1/sam_opportunities`);
    url.searchParams.set("select", "notice_id");
    url.searchParams.set("notice_id", `in.(${chunk.join(",")})`);
    const res = await fetch(url, { headers: sbHeaders() });
    if (!res.ok) throw new Error(`Supabase query ${res.status}: ${await res.text()}`);
    for (const r of await res.json()) found.add(r.notice_id);
  }
  return found;
}

async function insertOpps(rows) {
  if (rows.length === 0) return;
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/sam_opportunities`, {
    method: "POST",
    headers: sbHeaders({
      "Content-Type": "application/json",
      // Unique constraint on notice_id makes this idempotent across overlapping runs.
      Prefer: "return=minimal,resolution=ignore-duplicates",
    }),
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Supabase insert ${res.status}: ${await res.text()}`);
}

// ---------------------------------------------------------------------------
// Resend — email digest
// ---------------------------------------------------------------------------

async function sendDigest(opps) {
  const cards = opps.map((o) => {
    const link = oppLink(o);
    return `
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid #e3e8f0;">
          <a href="${esc(link)}" style="font-size:15px;font-weight:700;color:#0A1A3A;text-decoration:none;">${esc(o.title)}</a>
          <div style="margin-top:6px;font-size:12px;color:#51607a;line-height:1.6;">
            <b>Agency:</b> ${esc(o.fullParentPathName || "—")}<br>
            <b>Type:</b> ${esc(o.type || "—")} &nbsp;·&nbsp;
            <b>NAICS:</b> ${esc(o.naicsCode || "—")} &nbsp;·&nbsp;
            <b>Set-Aside:</b> ${esc(o.typeOfSetAsideDescription || o.setAside || "None / Unrestricted")}<br>
            <b>Posted:</b> ${esc(o.postedDate || "—")} &nbsp;·&nbsp;
            <b>Response due:</b> ${esc(o.responseDeadLine || "—")}
          </div>
        </td>
      </tr>`;
  }).join("");

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;">
    <div style="background:#0A1A3A;color:#fff;padding:16px 18px;border-radius:6px 6px 0 0;">
      <div style="font-size:17px;font-weight:700;">Apropos Group LLC — SAM.gov Monitor</div>
      <div style="font-size:12px;color:#c9d2e3;margin-top:3px;">
        ${opps.length} new opportunit${opps.length === 1 ? "y" : "ies"} matching your NAICS codes
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e3e8f0;border-top:none;">
      ${cards}
    </table>
    <div style="font-size:11px;color:#8a94a8;padding:10px 4px;">
      NAICS watched: ${esc(NAICS_CODES.join(", "))} · Window: last ${LOOKBACK_DAYS} day(s).
      Links open the live notice on SAM.gov.
    </div>
  </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.ALERT_EMAIL_FROM,
      to: process.env.ALERT_EMAIL_TO.split(",").map((s) => s.trim()),
      subject: `SAM.gov: ${opps.length} new opportunit${opps.length === 1 ? "y" : "ies"} — ${mmddyyyy(new Date())}`,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async () => {
  const required = ["SAM_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_KEY",
    "RESEND_API_KEY", "ALERT_EMAIL_TO", "ALERT_EMAIL_FROM"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error("Missing env vars:", missing.join(", "));
    return new Response(`Missing env: ${missing.join(", ")}`, { status: 500 });
  }

  const now = new Date();
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - LOOKBACK_DAYS);
  const postedFrom = mmddyyyy(fromDate);
  const postedTo = mmddyyyy(now);

  // 1) Gather across NAICS codes, de-duplicating by noticeId within this run.
  const seen = new Map();
  for (const naics of NAICS_CODES) {
    try {
      for (const o of await fetchOppsForNaics(naics, postedFrom, postedTo)) {
        if (o.noticeId) seen.set(o.noticeId, o);
      }
    } catch (e) {
      console.error(e.message); // one bad NAICS shouldn't abort the run
    }
  }
  const fetched = [...seen.values()];
  if (fetched.length === 0) {
    console.log("No opportunities in window.");
    return new Response("ok: none fetched");
  }

  // 2) Filter to genuinely new notices.
  const existing = await existingNoticeIds(fetched.map((o) => o.noticeId));
  const fresh = fetched.filter((o) => !existing.has(o.noticeId));
  if (fresh.length === 0) {
    console.log(`Scanned ${fetched.length}; nothing new.`);
    return new Response("ok: no new");
  }

  // 3) Persist, then notify.
  await insertOpps(fresh.map(toRow));
  await sendDigest(fresh);

  console.log(`Inserted + emailed ${fresh.length} new opportunities.`);
  return new Response(`ok: ${fresh.length} new`);
};

// Daily at 13:00 UTC (~ early morning US). Adjust cron as you like.
export const config = { schedule: "0 13 * * *" };
