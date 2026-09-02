# SitePilot

A single premium dashboard behind one login, housing eight SEO and paid-media tools plus a
drag-and-drop client **Report Builder**.

```bash
npm install
cp .env.example .env.local     # optional for a first run
npm run dev
```

Next prints the URL it actually bound to. If port 3000 is already taken by another project it moves
to **3001** — read the terminal rather than assuming 3000, or every route will 404 against the wrong
app.

`next dev` and `next build` write to **separate** directories (`.next` and `.next-prod`, keyed off
`NODE_ENV` in `next.config.js`), so a production build never pulls the chunks out from under a running
dev server.

The app boots with **no configuration**. Default credentials are `admin` / `seo-dashboard`, and the
login screen says so until you set real ones. Set these before anyone else can reach it:

```env
DASHBOARD_USERNAME=you
DASHBOARD_PASSWORD=a-long-password
AUTH_SECRET=32-plus-random-characters
```

---

## What is real and what is seeded

This matters more than any feature list, so the app states it on every screen — in the sidebar (an
amber dot), in the top bar (a mode badge), and as a banner on each seeded panel.

| Tool | Status | What actually happens |
|---|---|---|
| **SEO Score Checker** | **Live** | Fetches the URL, parses it with cheerio, runs 30 weighted checks across 5 categories, probes `robots.txt` and the sitemap, and optionally pulls real Lighthouse + CrUX data from PageSpeed Insights. |
| **Meta Tag Generator** | **Live** | Reads the page's existing head, scores each tag against Google's truncation limits, and generates a replacement title/description/OG/Twitter block plus a Next.js `metadata` export. |
| **Schema Markup Generator** | **Live** | Detects and validates every JSON-LD block on the page, recommends missing types from real page signals (URL depth, word count, question headings), and generates validated markup for 8 schema types. |
| **XML Sitemap Automation** | **Live crawl, gated submit** | Discovers sitemaps via `robots.txt`, walks sitemap indexes, spot-checks entries with live HEAD requests, diffs against a saved baseline, and regenerates normalised XML. Search Console submission is real when `GSC_ACCESS_TOKEN` is set and clearly labelled *simulated* when it is not. |
| **Backlink Tracker** | **Seeded** | Full report shape — new/lost/unique domains, DA/PA, spam score, anchor distribution, growth trend — from a deterministic generator behind a provider adapter. |
| **Keyword Monitoring** | **Seeded** | Positions, 12-week history, volume-weighted visibility, movers and distribution, behind a provider adapter. |
| **Google Ads Performance** | **Seeded** | Campaigns, CTR, CPC, CPA, ROAS, impression share, device split, search terms, behind a provider adapter. |
| **Budget Alert System** | **Real engine, seeded spend** | Thresholds, pacing maths, projection and webhook delivery are all real and persist to disk. They evaluate against seeded spend until the Ads adapter is wired. |
| **Report Builder** | **Real editor, mixed data** | The editor, layout engine, undo history and persistence are real. Widgets read the same providers as the rest of the app in **Live Data** mode; the two integrations with no adapter (GA4 traffic, Search Console performance) render an explicit "not connected" state rather than substituting numbers. |

Seeded data is **deterministic** — the same domain always produces the same numbers, so server render
and client hydration agree and a refresh never invents a new trend.

---

## Wiring a real provider

Every seeded panel reads from one module with a marked hook. Nothing in the UI knows where data came
from, so wiring a provider is a single-file change.

| Panel | Module | Env |
|---|---|---|
| Backlinks | `src/lib/providers/backlinks.ts` | `BACKLINK_PROVIDER`, `CRAWLY_API_KEY` |
| Keywords | `src/lib/providers/keywords.ts` | `RANK_PROVIDER`, `SERANKING_API_KEY` |
| Google Ads | `src/lib/providers/ads.ts` | `ADS_PROVIDER`, `GOOGLE_ADS_*` |
| Search Console | `src/lib/providers/gsc.ts` | `GSC_ACCESS_TOKEN`, `GSC_SITE_URL` |
| PageSpeed | `src/lib/seo/pagespeed.ts` | `PAGESPEED_API_KEY` |

To go live in, say, `ads.ts`: at the marked `REAL PROVIDER HOOK`, branch on
`adsProviderStatus().mode === 'live'`, run your GAQL query, and map the response into the exported
`AdsReport` type. If the shape type-checks, every chart, table and tile already works.

`PAGESPEED_API_KEY` and `GSC_ACCESS_TOKEN` are the two cheapest wins — both are free Google APIs and
turn two "partial" tools fully live.

### Note on Search Console

`GSC_ACCESS_TOKEN` takes a raw OAuth access token, which expires in an hour. That is deliberate: it
lets you verify the real submission path immediately without standing up an OAuth flow. For anything
ongoing, replace `resolveSiteUrl`/`submitSitemapToSearchConsole` in `src/lib/providers/gsc.ts` with a
service-account JWT or a stored refresh token.

---

## Architecture

```
src/
  middleware.ts              Edge gate — everything except /login needs a valid session
  app/
    login/                   Split-panel login (server page + client form)
    (dash)/                  Authenticated shell: sidebar + top bar + 9 routes
    builder/                 Report Builder — full-screen, outside the (dash) shell
    api/
      auth/                  HMAC cookie session issue + clear
      domain/                Active-domain switcher (cookie)
      tools/                 seo-score · meta-tags · schema · sitemap
      alerts/                Save rules · test dispatch
      builder/live/          Provider values mapped onto builder metric ids
  lib/
    auth.ts                  Web Crypto HMAC-SHA256 signed cookie (edge + node)
    fetch-page.ts            Timeout, size cap, charset decode, SSRF host blocklist
    seo/                     extract · meta · score · schema · sitemap · pagespeed
    providers/               ads · backlinks · keywords · alerts · gsc · seed
    builder/                 types · catalog · data · templates · persist
    store.ts                 JSON file store under .data/ (swap for a DB here)
  components/
    charts/Charts.tsx        Recharts wrappers + chart/table toggle
    builder/                 store · topbar · rails · canvas · widget shell + bodies
    ui/                      Icon · primitives · data · CodeBlock
    panels/ tools/ shell/    Feature components
```

**Auth.** A stateless HMAC-SHA256 signed cookie, `httpOnly`, `secure` in production, expiring on
`SESSION_HOURS`. The same `verifySessionToken` runs in the edge middleware and in node route handlers
because it is Web Crypto only. Rotating `AUTH_SECRET` invalidates every session.

**SSRF.** `fetch-page.ts` refuses non-http(s) schemes, loopback, RFC-1918, link-local, `.local`,
`.internal` and metadata hostnames, caps responses at 5 MB and times out at 20 s. The URL-analysis
tools are user-supplied-URL fetchers, so this is load-bearing.

**State.** The active domain is a cookie so server components can read it. Sitemap baselines and
alert rules are JSON files under `.data/` (gitignored). Replace `readJson`/`writeJson` in
`src/lib/store.ts` to move to Postgres or Supabase — nothing else touches the filesystem.

---

## Report Builder

`/builder` is a full-screen editor for client-facing dashboards: drag metrics in from the right rail,
resize on a snapping grid, group them into titled sections, and preview or print the result.

**Document model.** One JSON document (`src/lib/builder/types.ts`) holds pages → sections → widgets.
Layout is a *flow* grid rather than free positioning: widgets are an ordered list and each carries a
column span and a row height, so reordering is an array move and resizing is two integers. Sections
nest a second 12-column grid inside their own page span, which is what lets three narrow metric groups
sit side by side. Every mutation returns a new document, so undo/redo is two arrays of references and
export/import/autosave/revision-history are all the same serialisation.

**Where numbers come from.** `src/lib/builder/data.ts` resolves a metric id to a value.

- **Sample Data** — deterministic: a pure function of (metric, range). The editor re-renders on every
  keystroke, so a metric whose trend changed each time would be unusable.
- **Live Data** — `GET /api/builder/live?range=…` maps the existing keyword, backlink and Ads adapters
  onto builder metric ids. The two integrations with no adapter (GA4 traffic, Search Console
  performance) come back as `unavailable` with a reason the widget prints. **The builder never
  substitutes sample values for live ones** — a blank card with an explanation is the honest answer.

Add a live source by filling its ids in that route; add a metric by appending to `METRICS` in
`src/lib/builder/catalog.ts` (id, integration, shape, format, allowed widget kinds).

**Custom metrics** are infix formulas over metric ids (`ads_cost / ads_conversions`), evaluated by a
shunting-yard parser — deliberately not `eval`/`new Function`, since the expression is persisted and
re-run on every load.

**Persistence** is `localStorage`: a debounced autosave plus a ring of 20 revisions behind the history
button, with JSON export/import. Nothing is written server-side, so the builder works unchanged on
serverless — unlike the `.data/` features above.

**Build with AI** is a local, deterministic template matcher over the preset library. It does not call
a model, and it cannot invent a metric the catalog does not have; the panel says so.

---

## Design tokens

Colours come from a validated data-visualization palette, defined once as CSS custom properties in
`src/app/globals.css` and exposed to Tailwind in `tailwind.config.ts`. Both themes are hand-stepped,
not an automatic inversion.

### Light and dark

**Light is the default.** The top bar has an explicit **Light / Dark / System** control:

| Choice | Behaviour |
|---|---|
| Light | Always light, regardless of the OS setting (the default on a first visit) |
| Dark | Always dark |
| System | Follows `prefers-color-scheme`, and keeps following it live if the OS flips while the page is open |

The choice persists in `localStorage` under `seodash-theme` and is applied by a small inline script in
`src/app/layout.tsx` **before first paint**, so there is no flash of the wrong theme. An explicit
Light or Dark choice is never overridden by the OS — only `System` consults it.

The UI accent (violet) is a **different token** from the chart series colours (`--accent` vs
`--series-1`). That separation is deliberate: violet fails CVD separation against the series blue, so
it is used for chrome — nav, buttons, links, tool tiles — and never as a data colour.

Charts follow a few rules deliberately:

- **Categorical series are capped at three** and assigned in fixed order, never cycled. The three
  slots pass the lightness band, chroma floor, CVD separation, normal-vision and contrast checks in
  both light and dark mode.
- **No dual-axis charts.** Where two measures of different scale matter (ads spend vs conversions),
  they are stacked as two charts sharing an x axis rather than given two y scales.
- **Magnitude uses one hue** (the sequential blue ramp), **gained/lost uses the diverging pair**
  around a zero baseline, and **status colours are reserved** — never reused as a series colour, and
  always paired with an icon and a text label so colour is never the only channel.
- **Every chart has a table view** via the Chart/Table toggle, which is also the accessibility relief
  for the one light-mode series colour that sits below 3:1 against the surface.

Adding a fourth series to a chart is not a matter of picking another colour — fold the tail into
"Other" or facet into a second chart.

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |

## Deploying

Works as-is on any Node host. On Vercel, set every env var from `.env.example` in project settings —
note that `.data/` is not writable on serverless, so sitemap baselines and alert rules need the
`src/lib/store.ts` swap described above before those two features persist in production.
# seodashboard
