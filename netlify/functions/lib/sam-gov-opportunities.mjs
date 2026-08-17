// Authoritative SAM.gov Opportunities v2 request layer for the alerts platform.
const SAM_BASE = "https://api.sam.gov/opportunities/v2/search";
const MAX_WINDOW_DAYS = 365;
const DEFAULT_WINDOW_DAYS = 90;
const MAX_NAICS_CODES = 25;

function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid SAM.gov request date.");
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

function parseDate(value, field) {
  if (!value) return null;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) throw new Error(`${field} must use MM/DD/YYYY format.`);
  const date = new Date(Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2])));
  if (formatDate(date) !== `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}/${match[3]}`) {
    throw new Error(`${field} is not a valid calendar date.`);
  }
  return date;
}

function normalizePostedWindow(postedFrom, postedTo, defaultDays = DEFAULT_WINDOW_DAYS) {
  let from = parseDate(postedFrom, "postedFrom");
  let to = parseDate(postedTo, "postedTo");
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const days = Math.max(1, Math.min(Number(defaultDays) || DEFAULT_WINDOW_DAYS, MAX_WINDOW_DAYS));

  if (!from && !to) {
    to = todayUtc;
    from = new Date(to);
    from.setUTCDate(from.getUTCDate() - days);
  } else if (!from) {
    from = new Date(to);
    from.setUTCDate(from.getUTCDate() - days);
  } else if (!to) {
    to = todayUtc;
  }

  if (from > to) throw new Error("postedFrom must be on or before postedTo.");
  if ((to - from) / 86400000 > MAX_WINDOW_DAYS) {
    throw new Error("SAM.gov postedFrom/postedTo range cannot exceed one year.");
  }
  return { postedFrom: formatDate(from), postedTo: formatDate(to) };
}

function normalizedCodes(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(source.map(code => String(code).trim()).filter(Boolean))]
    .filter(code => /^\d{6}$/.test(code))
    .slice(0, MAX_NAICS_CODES);
}

async function searchSamPage(options = {}) {
  const apiKey = options.apiKey || process.env.SAM_API_KEY;
  if (!apiKey) throw new Error("SAM_API_KEY not configured");
  const window = normalizePostedWindow(options.postedFrom, options.postedTo, options.defaultDays);
  const limit = Math.max(1, Math.min(Number(options.limit) || 1000, 1000));
  const offset = Math.max(0, Number(options.offset) || 0);
  const params = new URLSearchParams({
    api_key: apiKey,
    postedFrom: window.postedFrom,
    postedTo: window.postedTo,
    limit: String(limit),
    offset: String(offset),
  });

  if (options.title) params.set("title", String(options.title).trim());
  if (options.naicsCode) params.set("ncode", String(options.naicsCode).trim());
  if (options.state) params.set("state", String(options.state).trim().toUpperCase());
  if (options.setAsideCode) params.set("typeOfSetAside", String(options.setAsideCode).trim());
  const noticeTypes = Array.isArray(options.noticeTypes)
    ? options.noticeTypes
    : String(options.noticeTypes || "").split(",");
  for (const type of noticeTypes.map(v => String(v).trim().toLowerCase()).filter(Boolean)) {
    params.append("ptype", type);
  }

  const response = await fetch(`${SAM_BASE}?${params.toString()}`, {
    headers: { Accept: "application/json", "User-Agent": "APROPOS-Alerts/1.0" },
  });
  if (response.status === 404) {
    return { rows: [], totalRecords: 0, limit, offset, status: "SUCCESS_EMPTY" };
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400);
    const error = new Error(`SAM.gov ${response.status}: ${detail}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  if (!Array.isArray(data.opportunitiesData)) {
    if (Number(data.totalRecords) === 0) {
      return { rows: [], totalRecords: 0, limit, offset, status: "SUCCESS_EMPTY" };
    }
    throw new Error("SAM.gov returned an invalid opportunity collection.");
  }
  return {
    rows: data.opportunitiesData,
    totalRecords: Number(data.totalRecords) || data.opportunitiesData.length,
    limit: Number(data.limit) || limit,
    offset: Number(data.offset) || offset,
    status: data.opportunitiesData.length ? "SUCCESS_DATA" : "SUCCESS_EMPTY",
  };
}

async function searchSamProfile(options = {}) {
  const naicsCodes = normalizedCodes(options.naicsCodes);
  if (!naicsCodes.length) throw new Error("At least one valid six-digit NAICS code is required.");
  const concurrency = Math.max(1, Math.min(Number(options.concurrency) || 4, 4));
  const paths = [];
  for (const naicsCode of naicsCodes) paths.push({ naicsCode });
  const seen = new Map();
  const execution = [];

  for (let i = 0; i < paths.length; i += concurrency) {
    const group = paths.slice(i, i + concurrency);
    const results = await Promise.all(group.map(async ({ naicsCode }) => {
      const rows = [];
      let offset = 0;
      try {
        while (true) {
          const page = await searchSamPage({ ...options, naicsCode, offset, limit: options.limit || 1000 });
          rows.push(...page.rows);
          offset += page.rows.length;
          if (!page.rows.length || offset >= page.totalRecords) break;
        }
        execution.push({ naicsCode, status: rows.length ? "SUCCESS_DATA" : "SUCCESS_EMPTY", returned: rows.length });
        return rows;
      } catch (error) {
        execution.push({ naicsCode, status: "FAILED", returned: 0, error: error.message, upstreamStatus: error.status || null });
        return [];
      }
    }));
    for (const rows of results) {
      for (const opportunity of rows) {
        if (opportunity?.noticeId) seen.set(opportunity.noticeId, opportunity);
      }
    }
  }

  const successful = execution.filter(path => path.status !== "FAILED");
  if (!successful.length) {
    const detail = execution.map(path => path.error).filter(Boolean).join(" | ");
    throw new Error(detail || "Every SAM.gov NAICS search path failed.");
  }
  const failed = execution.filter(path => path.status === "FAILED");
  const rows = [...seen.values()];
  return {
    rows,
    naicsCodes,
    execution,
    searchStatus: failed.length ? "PARTIAL_SUCCESS" : rows.length ? "SUCCESS_WITH_RESULTS" : "SUCCESS_EMPTY",
    message: rows.length
      ? `${rows.length} active SAM.gov opportunities loaded`
      : "0 active opportunities match current filters",
  };
}

export {
  SAM_BASE,
  MAX_NAICS_CODES,
  normalizePostedWindow,
  normalizedCodes,
  searchSamPage,
  searchSamProfile,
};
