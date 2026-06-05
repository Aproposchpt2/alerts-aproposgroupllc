// netlify/functions/generate.mjs
// Secure server step. The Anthropic key is read from an environment variable
// you set in Netlify (Site settings -> Environment variables). It is NEVER
// sent to the browser — the visitor's page calls THIS function, and this
// function calls Anthropic.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

const DISPLAY_FONTS = ["Fraunces","Bodoni Moda","Cormorant","Sora","Instrument Serif","Newsreader","Jost"];
const BODY_FONTS    = ["Newsreader","Jost","Sora","Cormorant"];
const MONO_FONTS     = ["Spline Sans Mono","IBM Plex Mono"];
const LAYOUTS  = ["centered","editorial","cards"];
const SURFACES = ["glass","bordered","paper"];
const TEXTURES = ["aurora","grain","none"];
const SHAPES   = ["pill","square","underline"];

const SCHEMA_PROMPT =
  "Return ONLY a JSON object (no markdown, no prose) shaped exactly as: "
  + '{"content":{"brand":string,"category":string(2-3 words),"eyebrow":string(2-4 words),'
  + '"headline":string(<=10 words),"standfirst":string(1-2 sentences),"stats":[3 short strings],'
  + '"sections":[4 {"title":string(<=6 words),"blurb":string(1 sentence),"points":[3 short strings]}],'
  + '"closeHeadline":string(<=8 words),"closeText":string(1 sentence),"cta":string(2-4 words)},'
  + '"design":{"mood":string,"theme":"dark"|"light",'
  + '"palette":{"bg":hex,"surface":hex,"ink":hex,"inkSoft":hex,"accent":hex,"accent2":hex},'
  + '"fonts":{"display":one of ' + JSON.stringify(DISPLAY_FONTS) + ',"body":one of ' + JSON.stringify(BODY_FONTS) + ',"mono":one of ' + JSON.stringify(MONO_FONTS) + '},'
  + '"layout":one of ' + JSON.stringify(LAYOUTS) + ',"surfaceStyle":one of ' + JSON.stringify(SURFACES) + ',"texture":one of ' + JSON.stringify(TEXTURES) + ','
  + '"radius":int 0-26,"displayWeight":int 300-800,"accentShape":one of ' + JSON.stringify(SHAPES) + '}}. '
  + "Invent a fresh, cohesive, tasteful palette and an unexpected but harmonious font pairing. Make the design feel specifically right for THIS business and noticeably different each time. Copy must be concrete and confident, with no clichés.";

function parseJSON(text) {
  const c = text.replace(/```json|```/g, "").trim();
  const s = c.indexOf("{"), e = c.lastIndexOf("}");
  return JSON.parse(c.slice(s, e >= 0 ? e + 1 : undefined));
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json({ error: "Server missing ANTHROPIC_API_KEY env var" }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const a = body.answers || {};
  const mode = body.mode === "design" ? "design" : "full";

  const ctx = `Business name: ${a.name || ""}\nWhat it does: ${a.what || ""}\nIdeal customers: ${a.who || ""}\nDifferentiator: ${a.diff || ""}\nAlso: ${a.else || ""}`;
  const ask = (mode === "design"
    ? "Keep the wording implied by the business but design a brand-new, distinct look. "
    : "") + SCHEMA_PROMPT;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1600,
        messages: [{ role: "user", content: ask + "\n\n" + ctx }]
      })
    });
    if (!r.ok) {
      const t = await r.text();
      return json({ error: "anthropic " + r.status, detail: t.slice(0, 400) }, 502);
    }
    const data = await r.json();
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const obj = parseJSON(text);
    // attach contact passthrough so the renderer can show it
    obj.content = obj.content || {};
    obj.content.contact = { site: a.site || "", email: a.email || "", addr: a.addr || "" };
    return json(obj, 200);
  } catch (err) {
    return json({ error: "generation failed", detail: String(err).slice(0, 300) }, 500);
  }
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
