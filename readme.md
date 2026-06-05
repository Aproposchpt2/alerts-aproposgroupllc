# Promo Site Engine (generative)

Customer answers 5 questions → an AI agent writes the copy **and** invents a
one-of-a-kind design (palette, fonts, layout, texture) → a parametric renderer
turns that recipe into a live promotional site. No fixed template pool, so no
two outputs are alike.

## How it's wired

```
Browser (index.html)
   │  POST /.netlify/functions/generate  { answers, mode }
   ▼
Netlify Function (generate.mjs)   ← holds ANTHROPIC_API_KEY (env var, server-side)
   │  calls Anthropic Messages API
   ▼
returns { content, design }  →  renderer builds the site in an <iframe>
```

The API key lives only in Netlify's environment variables. It is never sent to
the browser and never appears in the repo.

## Deploy (GitHub → Netlify)

1. Push this folder to a GitHub repo.
2. In Netlify: **Add new site → Import from Git**, pick the repo. Build command
   can be empty; publish directory is `.` (already set in `netlify.toml`).
3. **Site settings → Environment variables → Add a variable:**
   - Key: `ANTHROPIC_API_KEY`  Value: *your Anthropic key*
   - (optional) `ANTHROPIC_MODEL` to pin a model; defaults to a Sonnet build.
4. Deploy. Visit the site, fill the five fields, hit **Generate site**.

## Local preview

```
npm i -g netlify-cli
netlify env:set ANTHROPIC_API_KEY sk-ant-...    # or set in the dashboard
netlify dev
```

Opening `index.html` directly (without the function) still works — it falls
back to a built-in writer + random design so you can see the flow offline.

## Files

- `index.html` — front-end UI + parametric renderer (the design "engine")
- `netlify/functions/generate.mjs` — secure server step (the agent)
- `netlify.toml` — config + `/api/generate` alias

## Notes & next steps

- **Quality rails:** the agent invents the palette and picks fonts from a
  curated list the renderer guarantees to load, and chooses among known layouts —
  so output is endlessly varied but can't render broken.
- **Add a "download HTML" button** so customers can take their generated site.
- **Persist sites** (e.g. Supabase) if you want shareable URLs per customer.
- **"Wild mode"** (agent writes full HTML/CSS itself) can be added as a second
  function path with a validate-and-repair step.
