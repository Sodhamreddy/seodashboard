# SitePilot — full flow

Everything from a clean checkout to a client report, in the order you actually
do it. Written against the `version-2` branch.

- [1. Run it locally](#1-run-it-locally)
- [2. Sign in](#2-sign-in)
- [3. Add your clients](#3-add-your-clients)
- [4. Connect Google once](#4-connect-google-once)
- [5. Give each client its own accounts](#5-give-each-client-its-own-accounts)
- [6. Optional keys](#6-optional-keys)
- [7. What each screen does](#7-what-each-screen-does)
- [8. Reporting to the client](#8-reporting-to-the-client)
- [9. Where data is stored](#9-where-data-is-stored)
- [10. Deploying](#10-deploying)
- [11. Troubleshooting](#11-troubleshooting)

---

## 1. Run it locally

```bash
npm install
cp .env.example .env.local     # optional for a first run
npm run dev                    # http://localhost:3001
```

The app boots with **no configuration**. Every panel that needs a provider says
so in place rather than showing invented numbers.

Dev and production builds write to **separate** directories (`.next` and
`.next-prod`), so `npm run build` while `npm run dev` is running will not pull
the chunks out from under it.

> **If a change does not appear, restart `npm run dev`.** The file watcher can
> go stale after a long session; the symptom is edits landing in the build but
> not in the browser.

---

## 2. Sign in

Default credentials are `admin` / `seo-dashboard`, and the login screen says so
until you set real ones. Before anyone else can reach it:

```env
DASHBOARD_USERNAME=you
DASHBOARD_PASSWORD=a-long-password
AUTH_SECRET=32-plus-random-characters
```

In production these are **required** — with them unset the login endpoint
refuses every attempt rather than falling back to the defaults.

---

## 3. Add your clients

A client is a saved **name + domain**. The domain is what every panel is scoped
to, so it must match the property in Search Console: bare host, no protocol, no
trailing slash (`example.com`, not `https://example.com/`).

There are two places to add one, and they write to the same roster:

**Settings → Client integrations → Add client**
The natural place when you are setting one up, because the provider-id fields
for the new client appear on the row it creates.

**The client chip in the top bar → Add client**
Faster when you are mid-flow. It also switches to the new client immediately.

Re-adding a domain that already exists is treated as a **rename**, not a
duplicate — useful when a client rebrands.

### Switching between clients

The chip in the top bar, at every screen width. Switching sets a cookie every
panel reads, and the page does a full reload so nothing from the previous
client can survive in a cache. The name shown is the roster name; the domain
underneath it is what is actually being queried.

### Removing a client

Open the switcher and use the trash icon on the row. That removes the roster
entry and its provider ids; it does not touch anything at Google.

---

## 4. Connect Google once

**Settings → Google account → Connect.** One OAuth connection covers Search
Console, Analytics and (optionally) Business Profile for every client on the
roster — you do not connect per client.

Requires in `.env.local`:

```env
GOOGLE_ADS_CLIENT_ID=...          # the OAuth client, shared with the Ads API
GOOGLE_ADS_CLIENT_SECRET=...
```

The redirect URI must be registered **verbatim** in Google Cloud. Settings
prints the exact value it will send, which is the one thing worth copying
rather than typing — behind a proxy it is easy to end up with the internal
address, and Google's error for a mismatch says nothing useful.

Behind nginx or any TLS-terminating proxy, also set:

```env
APP_ORIGIN=https://dashboard.example.com
GOOGLE_OAUTH_REDIRECT_URI=https://dashboard.example.com/api/auth/google/callback
```

---

## 5. Give each client its own accounts

**Settings → Client integrations.** Each client row has three fields:

| Field | Where to find it | What goes blank without it |
|---|---|---|
| **GA4 property ID** | Analytics → Admin → Property details. Numeric, not `G-XXXX`. Picked from a list of the properties your connected account can see. | Website Traffic |
| **Google Ads customer ID** | The 10-digit account id, dashes optional. | Google Ads Performance, Budget Alerts |
| **Business Profile location ID** | Only needed when the account manages several locations. | GMB reviews (currently unlinked) |

**Press Save on the card.** The badge counts the *inputs*, not what is stored —
the card shows **"unsaved changes"** and a filled Save button until you do.

Search Console is deliberately absent: it is resolved from the domain, so there
is nothing to keep in sync.

> **The one rule worth knowing.** With **one** client on the roster, the
> environment variables `GA4_PROPERTY_ID` and `GOOGLE_ADS_CUSTOMER_ID` fill in
> for blank fields. With **two or more**, they are ignored entirely and each
> client shows a provider's data only if its own id is set. A global id cannot
> belong to two businesses, and one client's spend appearing under another's
> name is the most expensive bug this app could have.

---

## 6. Optional keys

Everything here is additive — the app runs without all of it.

```env
# Google Ads (spend, campaigns, budget alerts)
ADS_PROVIDER=google
GOOGLE_ADS_DEVELOPER_TOKEN=...
GOOGLE_ADS_REFRESH_TOKEN=...          # or rely on the connected account
GOOGLE_ADS_LOGIN_CUSTOMER_ID=...      # the manager account, if you use one

# Backlinks (referring domains, toxic flags)
BACKLINK_PROVIDER=crawly
CRAWLY_API_KEY=...                    # free tier ~100 requests/day

# Page speed / Core Web Vitals
PAGESPEED_API_KEY=...

# AI Overview — answer-engine visibility
GEMINI_API_KEY=...                    # Google AI Studio
GEMINI_MODEL=                         # optional, defaults to gemini-2.5-flash
OPENAI_API_KEY=                       # ChatGPT adapter to come
ANTHROPIC_API_KEY=                    # Claude adapter to come

# Budget alert delivery
ALERT_WEBHOOK_URL=...                 # Slack, n8n, or an email relay
ALERT_EMAIL_TO=...

# Automation run reporting (the one machine-callable route)
AUTOMATION_INGEST_TOKEN=...
```

---

## 7. What each screen does

### Overview

Opens with **account health** — a composite of the live pillars only, so the
headline can never be part fiction — then the four numbers that move
(sessions, search visibility, referring domains, ad spend) with their deltas,
and a strip saying which sources are live and which are seeded.

Below that: the on-page tools, then a panel per provider.

The **window picker** (top right) covers 7 / 30 / 60 / 90 days, last month, 6
and 12 months, or a custom range. "Last month" is a real calendar month, not a
rolling 30 days. The window lives in the URL, so a link carries it.

### On-page tools

Run against any URL you type — no provider keys needed:

- **SEO Score Checker** — 30 weighted checks with a prioritised fix list
- **Meta Tag Generator** — titles, descriptions, Open Graph
- **Schema Markup Generator** — JSON-LD, validated
- **XML Sitemap Automation** — diffs against the last snapshot
- **robots.txt** — scans the live file, flags SEO issues, generates a fix
- **Broken Link Checker**
- **llms.txt** — the AI-crawler map

### Off-page

- **Backlink Tracker** — referring domains, authority, toxic flags. The index
  has no history of its own, so new / lost / live counts come from **this
  dashboard's daily snapshots**: the first visit records a baseline and the
  second earns a comparison. Anchor text and the dofollow split are not in this
  source and are left empty rather than estimated.
- **Keyword Monitoring** — positions, visibility and movers from Search Console.

### Website Traffic

GA4 sessions, users, channel mix and landing pages, plus **Search Console
clicks, impressions, CTR and average position per page** — the two integrations
fail independently, so search data still shows if GA4 is not connected.

### AI Overview

Whether **ChatGPT, Gemini and Claude** cite the site when asked the questions it
already ranks for on Google. There is no position ten in an answer — a site is
cited as a source or it is not — so what is recorded per keyword is: cited or
not, the rank among the distinct domains cited, whether the brand was named in
the prose without being cited, and the full source list.

Gemini is the wired adapter and is called **with Google Search grounding on**;
only sources the answer actually retrieved are scored. It runs **on a button**,
not on page load, because five grounded calls cost seconds and quota. The run
is stored per client and shown with its timestamp until you run it again.

A compact three-engine summary also appears inside the Website Traffic panel on
the Overview and on the Website Traffic page, reading from the same stored run.

### Paid media

- **Google Ads Performance** — campaigns, CTR, conversions, ROAS, with a
  window picker and a "limited by budget" filter
- **Budget Alert System** — month-to-date spend against a budget **you set**.
  It is deliberately not the sum of the campaign daily budgets: those are caps
  Google lets a campaign overshoot day to day and rarely add up to what the
  account is managed against. Campaign budgets cover only the days of the month
  a campaign can actually be charged for, and paused or finished campaigns are
  excluded.

### Report Builder

Drag-and-drop client dashboards from any metric in the catalogue, in live or
sample mode, bound to a client from the roster.

### Automations (unlinked from the rail, still at `/automations`)

The registry of every agent, workflow and tool the team runs, with status,
cadence and client counts. Runs are **pushed in** by whatever executes them:

```bash
curl -X POST https://your-dashboard/api/automations/runs \
  -H "authorization: Bearer $AUTOMATION_INGEST_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"id":"serp-agent","ok":true,"durationMs":42000,"note":"124 keywords"}'
```

---

## 8. Reporting to the client

**Export report** on the Overview opens the printable client report for the
current window — verdict first, then the window and sources, then the sections.
Export is the browser's own "Save as PDF", which keeps vector text, real links
and selectable tables.

For something bespoke, the **Report Builder** composes a dashboard from any
metric and binds it to a client.

---

## 9. Where data is stored

Everything the app persists is JSON under `.data/`, which is git-ignored:

| Path | What |
|---|---|
| `clients.json` | The roster and each client's provider ids |
| `alerts/rules.json` | Budget thresholds |
| `backlinks/<domain>.json` | Daily backlink snapshots (90 kept) |
| `ai-visibility/<domain>.json` | Last AI Overview run per engine |
| `automations/` | The registry and reported runs |
| `sitemaps/<domain>.json` | Sitemap baselines |
| `google/` | The connected Google account's tokens |

**Back up `.data/` before a redeploy that replaces the directory.** Swapping
this for Postgres means reimplementing `readJson` / `writeJson` in
`src/lib/store.ts`; nothing else in the app touches the filesystem.

---

## 10. Deploying

```bash
git pull origin main          # or version-2
npm ci                        # only when package-lock.json changed
npm run build                 # writes .next-prod
# then restart:
pm2 restart <app>             # or: systemctl restart <unit>
                              # or: docker compose up -d --build
```

The restart is **mandatory** — `npm start` serves the prebuilt directory, so a
running process keeps serving old chunks no matter how many times the browser
reloads. Build before restarting, so downtime is just the restart.

`.env.local` is untracked and `git pull` will not touch it.

---

## 11. Troubleshooting

**A panel is empty for one client but fine for another.**
That client is missing its provider id. Settings → Client integrations → fill it
in → **Save**. With two or more clients the environment defaults are ignored by
design.

**I saved an id and the panel is still empty.**
It should apply immediately — saving ids clears that domain's cached reports. If
it persists, the id is wrong or the account is not reachable from the manager
account behind `GOOGLE_ADS_LOGIN_CUSTOMER_ID`.

**Switching client shows the previous client's numbers.**
Fixed — switching now does a full reload. If you see it, you are on an old
build; restart the server.

**Budget alerts fire against a budget nobody set.**
The account budget starts empty on purpose. Enter it on Budget Alerts and save;
the row shows "no budget set" until you do, and rules with no budget are skipped
rather than measured against zero.

**Backlinks shows no new / lost counts.**
That needs two snapshots. The first visit records a baseline; the comparison
appears on the next day's.

**AI Overview says "needs GEMINI_API_KEY".**
Add the key and restart. ChatGPT and Claude read their keys already but have no
adapter yet, so they will keep saying "adapter to come".

**`/api/automations/runs` returns 503.**
`AUTOMATION_INGEST_TOKEN` is not set. Unset, that endpoint refuses everything
rather than accepting anonymous writes.

**Sign-in says it is not configured.**
In production `DASHBOARD_USERNAME`, `DASHBOARD_PASSWORD` and `AUTH_SECRET` are
required — it refuses rather than falling back to the defaults.
