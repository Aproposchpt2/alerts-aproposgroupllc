// Secure SAM.gov document proxy for the authenticated alerts dashboard.
const PUBLIC_SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6Imp1ZGlzbGZrbm1ob2ZjZ3p5b3pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMDI3ODAsImV4cCI6MjA5Mjc3ODc4MH0.Kxpe0kJt0k7ZchYu70BOwm4KdT0C5aSsyeR1ov6NlQ0";
const MAX_DOCUMENT_BYTES = 19 * 1024 * 1024;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function safeFilename(value, fallback) {
  return String(value || fallback || "sam-document")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "sam-document";
}

function resourceUrl(item) {
  if (typeof item === "string") return item;
  return item?.url || item?.href || item?.resourceLink || "";
}

function filenameFrom(item, url, index) {
  if (item && typeof item === "object") {
    const supplied = item.name || item.fileName || item.filename || item.title;
    if (supplied) return safeFilename(supplied);
  }
  try {
    const pathname = new URL(url).pathname;
    const last = decodeURIComponent(pathname.split("/").filter(Boolean).pop() || "");
    if (last && last.includes(".")) return safeFilename(last);
  } catch {}
  return `sam-document-${index + 1}`;
}

async function authenticatedUser(request, supabaseUrl, anonKey) {
  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/i.test(authorization)) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization },
  });
  if (!response.ok) return null;
  return { user: await response.json(), authorization };
}

async function opportunityRow(noticeId, supabaseUrl, anonKey, authorization) {
  const url = new URL(`${supabaseUrl}/rest/v1/sam_opportunities`);
  url.searchParams.set("select", "notice_id,title,raw");
  url.searchParams.set("notice_id", `eq.${noticeId}`);
  url.searchParams.set("limit", "1");
  const response = await fetch(url, {
    headers: { apikey: anonKey, Authorization: authorization, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Opportunity lookup failed: ${response.status}`);
  return (await response.json())[0] || null;
}

function allowedSamResource(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" &&
      (parsed.hostname === "sam.gov" || parsed.hostname.endsWith(".sam.gov"));
  } catch {
    return false;
  }
}

export default async function handler(request) {
  if (request.method !== "GET") return json(405, { error: "Method not allowed" });

  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const anonKey = Netlify.env.get("SUPABASE_ANON_KEY") || PUBLIC_SUPABASE_KEY;
  const samApiKey = Netlify.env.get("SAM_API_KEY");
  if (!supabaseUrl || !samApiKey) {
    return json(500, { error: "Document service is not configured." });
  }

  const auth = await authenticatedUser(request, supabaseUrl, anonKey);
  if (!auth) return json(401, { error: "Authenticated dashboard session required." });

  const requestUrl = new URL(request.url);
  const noticeId = String(requestUrl.searchParams.get("notice_id") || "").trim();
  const index = Number(requestUrl.searchParams.get("index"));
  if (!noticeId || !Number.isInteger(index) || index < 0) {
    return json(400, { error: "notice_id and a valid document index are required." });
  }

  let row;
  try {
    row = await opportunityRow(noticeId, supabaseUrl, anonKey, auth.authorization);
  } catch (error) {
    return json(502, { error: error.message });
  }
  if (!row) return json(404, { error: "Opportunity not found." });

  const resources = Array.isArray(row.raw?.resourceLinks) ? row.raw.resourceLinks : [];
  if (index >= resources.length) return json(404, { error: "Document not found." });
  const item = resources[index];
  const originalUrl = resourceUrl(item);
  if (!allowedSamResource(originalUrl)) {
    return json(400, { error: "Unsupported document source." });
  }

  const upstreamUrl = new URL(originalUrl);
  if (!upstreamUrl.searchParams.has("api_key")) upstreamUrl.searchParams.set("api_key", samApiKey);
  const upstream = await fetch(upstreamUrl, { headers: { Accept: "*/*" } });
  if (!upstream.ok) {
    return json(upstream.status === 404 ? 404 : 502, {
      error: `SAM.gov document request failed: ${upstream.status}`,
    });
  }

  const contentLength = Number(upstream.headers.get("content-length") || 0);
  if (contentLength > MAX_DOCUMENT_BYTES) {
    return json(413, {
      error: "This document exceeds the secure in-browser download limit. Use Open on SAM.gov for this file.",
    });
  }

  const filename = filenameFrom(item, originalUrl, index);
  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
    "Cache-Control": "private, no-store",
    "X-Document-Filename": filename,
  });
  if (contentLength) headers.set("Content-Length", String(contentLength));
  return new Response(upstream.body, { status: 200, headers });
}
