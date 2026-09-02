# API integration guide

Which APIs each of the eight tools needs to run on real data, what they cost, and
exactly which file to change.

**Version note:** Google ships ~3 Google Ads API versions a year and sunsets old
ones, so endpoints below use `{version}` rather than a pinned number. Check the
Google Ads API release notes before you wire it. Pricing tiers for third-party
SEO vendors move too — treat the cost column as "which order of magnitude", not a
quote.

---

## Summary

| Tool | API needed | Auth | Cost | Status here |
|---|---|---|---|---|
| Meta Tag Generator | **none** | — | free | ✅ fully live |
| Schema Markup Generator | **none** | — | free | ✅ fully live |
| SEO Score Checker | PageSpeed Insights v5 | API key | **free** | ⚙️ implemented, needs key |
| XML Sitemap | Search Console API | OAuth 2.0 | **free** | ⚙️ implemented, needs token |
| Backlink Tracker | Moz / DataForSEO / Ahrefs / Semrush | key or Basic | **paid** | 🔌 adapter stub |
| Keyword Monitoring | Search Console *or* SE Ranking / DataForSEO | OAuth / key | free → paid | 🔌 adapter stub |
| Google Ads Performance | Google Ads API | OAuth + dev token | free API, needs Ads account | ⚙️ implemented, needs credentials |
| Budget Alerts | Google Ads API + a webhook | OAuth + URL | free | ⚙️ engine real, needs same Ads credentials |

Cheapest path to "mostly live", in order of effort:

1. **PageSpeed Insights key** — 5 minutes, free, no OAuth. Turns the score checker complete.
2. **Slack/n8n webhook URL** — 2 minutes. Budget alerts start actually delivering.
3. **Search Console OAuth** — ~1 hour. Unlocks sitemap submission *and* free real keyword data.
4. **Google Ads API** — the long one; a developer token needs Google's approval.
5. **A paid backlink index** — the only unavoidable spend.

---

## 1. Meta Tag Generator — no API

Fetches the page over plain HTTP and parses it with cheerio. Nothing to wire.

**Optional upgrade — pick the target keyword automatically.** Today the user
types the primary keyword. Search Console's Search Analytics API can supply the
queries the page *already* ranks for, so the generator optimises for real demand
instead of a guess:

```
POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query
{ "startDate":"2026-05-01", "endDate":"2026-08-01",
  "dimensions":["query"], "dimensionFilterGroups":[{"filters":[
    {"dimension":"page","operator":"equals","expression":"https://example.com/x"}]}],
  "rowLimit": 25 }
```

Files: `src/lib/seo/meta.ts`, `src/app/api/tools/meta-tags/route.ts`

---

## 2. Schema Markup Generator — no API

Detection, validation and generation are all local.

**Optional — confirm Google actually sees your markup.** The Rich Results Test
has no public API, but URL Inspection reports the rich results Google detected:

```
POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect
{ "inspectionUrl": "https://example.com/page", "siteUrl": "sc-domain:example.com" }
```

Response includes `inspectionResult.richResultsResult.detectedItems` — that is the
programmatic equivalent of the Rich Results Test.

Scope: `https://www.googleapis.com/auth/webmasters.readonly`
Files: `src/lib/seo/schema.ts`

---

## 3. SEO Score Checker — one free key

### PageSpeed Insights API v5 — already implemented

```
GET https://www.googleapis.com/pagespeedonline/v5/runPagespeed
    ?url={url}&strategy=mobile&category=performance&category=seo&key={KEY}
```

- **Free.** API key only — no OAuth, no billing account needed.
- Quota is generous (tens of thousands of queries/day) but rate-limited per
  100 seconds, so don't fan out hard.
- Returns Lighthouse *lab* scores **and** CrUX *field* data in
  `loadingExperience` when the URL has enough real traffic.

Get the key: Google Cloud Console → APIs & Services → enable **PageSpeed
Insights API** → Credentials → Create API key. Then:

```env
PAGESPEED_API_KEY=AIza...
```

That is the whole integration — `src/lib/seo/pagespeed.ts` already maps the
response. Without the key the tool reports on-page checks only and says so.

### Optional additions

| API | Adds | Auth |
|---|---|---|
| **CrUX API** `chromeuxreport.googleapis.com/v1/records:queryRecord` | 28-day p75 field CWV, origin-level even when a URL is too sparse | API key, free |
| **Search Analytics** (above) | real clicks/impressions/CTR/position for the URL | OAuth |

---

## 4. XML Sitemap Automation — Search Console

Crawling, diffing, spot-checking and XML regeneration are already live. Only
*submission* needs an API.

### Search Console Sitemaps API — already implemented

```
PUT https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}
GET https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/sitemaps
```

- Scope: `https://www.googleapis.com/auth/webmasters` (write) —
  `webmasters.readonly` is not enough to submit.
- `siteUrl` is the property **exactly** as registered: `https://example.com/`
  for a URL-prefix property, `sc-domain:example.com` for a domain property.
- Both `siteUrl` and `feedpath` must be URL-encoded in the path.

**Auth for unattended use.** The code currently accepts a raw
`GSC_ACCESS_TOKEN`, which expires in about an hour — deliberate, so you can
verify the real submission path in a minute without building an OAuth flow. For
anything ongoing, use a **service account**: create one in Google Cloud, then in
Search Console → Settings → Users and permissions, add the service account's
`...iam.gserviceaccount.com` email as an **Owner**. Service accounts work fine
for Search Console; you do *not* need domain-wide delegation. Swap the token read
in `src/lib/providers/gsc.ts` for a JWT you sign per request.

```env
GSC_ACCESS_TOKEN=ya29...
GSC_SITE_URL=sc-domain:example.com
```

### Optional

- **Indexing API v3** — `POST https://indexing.googleapis.com/v3/urlNotifications:publish`.
  Officially supported **only** for `JobPosting` and `BroadcastEvent` pages.
  Don't build a general "instant indexing" promise on it.
- **Bing Webmaster Tools API** — far easier than GSC: a single API key, no OAuth.
  `POST https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch?apikey={KEY}`
  Worth adding — the effort-to-value ratio is the best of any API here.

---

## 5. Backlink Tracker — paid index required, and the metric names matter

**Read this before picking a vendor.** The dashboard currently shows **DA**,
**PA** and **Spam Score**. Those are **Moz-proprietary metrics** — no other vendor
can return them. Every provider has its own equivalent:

| Provider | Its authority metrics | Endpoint | Auth | Cost shape |
|---|---|---|---|---|
| **Moz Links API v2** | **Domain Authority, Page Authority, Spam Score** | `https://lsapi.seomoz.com/v2/url_metrics`, `/links`, `/anchor_text` | token / Basic | free tier, then per-row plans |
| **DataForSEO Backlinks** | `rank`, `backlink_spam_score` | `https://api.dataforseo.com/v3/backlinks/summary/live` | Basic auth | pay-as-you-go, cheapest at volume |
| **Ahrefs API v3** | DR, UR | `https://api.ahrefs.com/v3/site-explorer/...` | Bearer | enterprise-tier add-on |
| **Semrush Analytics** | Authority Score | `https://api.semrush.com/analytics/v1/` | key + credit units | mid |
| **Majestic** | Trust Flow, Citation Flow | `https://api.majestic.com/api/json` | key | low-mid |
| **Crawly** | own score | — | key | free tier |

So there are two honest options:

1. **Use Moz** if the client specifically wants DA/PA on the report — it is the
   only real source, and it also gives Spam Score, which the toxic-link column uses.
2. **Use DataForSEO/Ahrefs/Majestic** and **rename the columns** to that vendor's
   metric (DR/UR, Authority Score, TF/CF). Showing another vendor's number under a
   "DA" heading is wrong, and per your earlier note the DM team already rejected
   scraped DA/PA.

What the adapter must return: `BacklinkReport` in
`src/lib/providers/backlinks.ts` — `summary`, `trend` (weekly points), `flow`
(monthly gained/lost), `authorityBuckets`, `topAnchors`, `backlinks[]`. Most
vendors give you the raw link rows plus a summary; the trend and flow series come
from **your own stored snapshots**, so plan on persisting a daily/weekly
aggregate (that is what `src/lib/store.ts` is for) — no vendor hands you
"new vs lost this month" for free at a useful granularity.

```env
BACKLINK_PROVIDER=moz        # or dataforseo | ahrefs | crawly
CRAWLY_API_KEY=...
```

---

## 6. Keyword Monitoring — free option exists

### Cheapest: Google Search Console Search Analytics (free)

```
POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query
{ "startDate":"...", "endDate":"...", "dimensions":["query","page","device"],
  "rowLimit":25000, "startRow":0 }
```

Real clicks, impressions, CTR and **average position** for your own site, free,
16-month history. Limits worth knowing:

- **Average** position over the period, not a daily rank — it moves differently
  from a rank tracker and cannot be compared to one.
- **Your site only.** No competitor tracking.
- Data lags ~2–3 days; paginate with `startRow`.

That covers "how are we doing". It cannot do "where do we rank today vs
competitor X" — for that you need a tracker.

### True rank tracking

| Option | Gives | Auth | Cost |
|---|---|---|---|
| **SE Ranking API** | daily ranks, competitors, SERP features, volume/difficulty | API key | plan-based |
| **DataForSEO SERP API** | on-demand exact SERP position | Basic auth | fractions of a cent per SERP |
| Semrush / Ahrefs position tracking | ranks + visibility index | key | plan-based |
| **Google Ads Keyword Planner** (via Google Ads API) | **search volume, CPC, competition — free** with an Ads account | OAuth + dev token | free |

`SERANKING_API_KEY` is already declared, and SE Ranking exposes both a Data API
and a Project API (rank tracking projects, keyword groups). Note: the SE Ranking
**MCP server in this workspace is not authorised yet** — see the note at the end.

Volume/CPC in the seeded data maps to Keyword Planner (free); *difficulty* is
proprietary and differs per vendor.

Return `KeywordReport` from `src/lib/providers/keywords.ts` — note `history` is
12 weekly positions per keyword, so you need stored snapshots again unless the
vendor returns history.

---

## 7. Google Ads Performance — Google Ads API

**Implemented** in `src/lib/providers/googleAdsClient.ts` (auth + REST client) and
`src/lib/providers/ads.ts` (`fetchLiveAdsReport`, the GAQL → `AdsReport` mapper).
The only thing missing is your credentials — the most involved part, because of
the developer-token approval step.

### What you need

1. **Developer token** — from a Google Ads **manager (MCC)** account:
   Tools & Settings → Setup → API Center. It starts at **Test access**, which
   only works against *test* accounts. Apply for **Basic access** (thousands of
   operations/day, enough for a dashboard); **Standard** is for larger volume.
   Approval is a form and a wait, so start it early.
2. **OAuth 2.0 client** — Google Cloud Console → Credentials → OAuth client ID
   (Desktop app is simplest). Scope: `https://www.googleapis.com/auth/adwords`.
   Do the consent flow once to mint a **refresh token**.
3. **Customer ID** — the 10-digit account id, digits only, no dashes.
4. **`login-customer-id` header** — set to the MCC id when reading a client
   account through a manager account. Omitting it is the most common 400.

```env
ADS_PROVIDER=google
GOOGLE_ADS_DEVELOPER_TOKEN=...
GOOGLE_ADS_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_ADS_CLIENT_SECRET=...
GOOGLE_ADS_REFRESH_TOKEN=1//...
GOOGLE_ADS_CUSTOMER_ID=5233556446
# Only if the account above sits under a manager (MCC) account:
GOOGLE_ADS_LOGIN_CUSTOMER_ID=1234567890
```

All five (or six, with an MCC) must be present — `adsProviderStatus()` in
`src/lib/env.ts` only reports `live` once every one of them is set, and a live
fetch that throws for any reason (bad token, developer token not yet approved,
wrong customer id) falls back to seeded data with the error message surfaced
in the mode banner rather than crashing the page.

### The queries

```
POST https://googleads.googleapis.com/{version}/customers/{customerId}/googleAds:searchStream
```

Campaign rollup — fills `AdsReport.campaigns`:

```sql
SELECT campaign.id, campaign.name, campaign.status,
       campaign.advertising_channel_type, campaign_budget.amount_micros,
       metrics.cost_micros, metrics.impressions, metrics.clicks,
       metrics.conversions, metrics.conversions_value,
       metrics.ctr, metrics.average_cpc, metrics.search_impression_share
FROM campaign
WHERE segments.date DURING LAST_30_DAYS
```

Daily series — fills `AdsReport.daily`:

```sql
SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.conversions
FROM customer
WHERE segments.date DURING LAST_30_DAYS
ORDER BY segments.date
```

Search terms — fills `AdsReport.searchTerms`:

```sql
SELECT search_term_view.search_term, metrics.clicks,
       metrics.cost_micros, metrics.conversions
FROM search_term_view
WHERE segments.date DURING LAST_30_DAYS
ORDER BY metrics.cost_micros DESC
LIMIT 25
```

Device split — `FROM customer` with `segments.device`.

### Gotchas

- **Money is in micros** (`cost_micros`, `amount_micros`, `average_cpc`) — divide
  by 1,000,000. Forgetting this is the classic "why is spend $4,786,000,000".
  **`metrics.conversions_value` is the exception** — it's already in account
  currency, not micros. Mixing these two up understates ROAS by 1,000,000×.
- `metrics.ctr` and `search_impression_share` come back as **fractions** (0.0499),
  not percentages — the UI expects percent, so ×100.
- **GAQL is snake_case, the JSON response is camelCase.** You `SELECT
  metrics.cost_micros` but read `row.metrics.costMicros` back. This is the
  single most common reason a mapper silently reads `undefined` everywhere.
- `searchStream` returns either one JSON array of chunk objects or true
  newline-delimited JSON depending on how the runtime buffers it —
  `parseSearchStreamBody` in `googleAdsClient.ts` handles both.
- **"Limited by budget" isn't a status field.** It's inferred from
  `metrics.search_budget_lost_impression_share` crossing a small threshold —
  the same signal Google's own UI uses for that badge.
- Considered the npm **`google-ads-api`** package (handles auth refresh,
  streaming and micros more pleasantly than raw REST) but skipped it — this
  app has no other SDK dependency, and its gRPC/native bindings are an awkward
  fit for serverless portability. Plain `fetch` instead.

Implemented in `src/lib/providers/googleAdsClient.ts` (client) and
`fetchLiveAdsReport` in `src/lib/providers/ads.ts` (mapper).

---

## 8. Budget Alert System — Ads API + a webhook

The threshold engine, pacing maths, projection and disk persistence are already
real. Two things to connect:

**Spend** — same Google Ads API. Month-to-date:

```sql
SELECT campaign.id, campaign.name, campaign_budget.amount_micros, metrics.cost_micros
FROM campaign
WHERE segments.date DURING THIS_MONTH
```

`campaign_budget.amount_micros` is a **daily** budget — multiply by the days in
the month for a monthly cap, which is what `budgetMonthly` in the report means.

**Delivery** — the payload already posts as JSON:

| Channel | Setup | Cost |
|---|---|---|
| **Slack** | Incoming Webhook URL → `ALERT_WEBHOOK_URL` | free |
| **n8n** | Webhook node URL — you already run n8n | free |
| Google Chat / Teams | incoming webhook, same payload | free |
| **Email** | Resend / SendGrid / SES / Postmark — needs a small adapter in `dispatchAlerts` | free tiers exist |

Email is currently reported as unwired rather than silently dropped.

**Optional — act, not just notify.** `CampaignBudgetService.mutate` can lower a
budget and `CampaignService.mutate` can pause a campaign. Both need Standard
access and are destructive, so put them behind an explicit confirmation.

---

## Not needed by any tool

Worth saying plainly: **no LLM/AI API is required.** Meta and schema generation
are deterministic, which is why they are reproducible and auditable. If you later
want AI-written copy variants, that is an addition, not a dependency.

---

## Workspace note

The **SE Ranking MCP server in this workspace is not authorised**, so its tools
cannot be called yet. Authorise it via `claude mcp` or `/mcp` in an interactive
session — it is separate from the `SERANKING_API_KEY` this app uses, which you can
set without touching MCP.
