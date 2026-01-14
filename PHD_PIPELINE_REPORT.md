# PHD_PIPELINE_REPORT.md

## Scope
This report documents the **end-to-end lifecycle of a PhD opportunity** in this platform, focusing exclusively on the **PhD ingestion + display path**.

**Primary runtime pipeline covered:**
- `src/app/api/cron/phd-hunt/route.ts` (trigger)
- `lib/services/realtimeFetcher.ts` (fetch → enrich → filter → upsert)
- `src/app/phd/page.tsx` and `src/app/phd/[id]/page.tsx` (UI read/display)

**Important note on other “hunter” code:**
- The repo also contains search-related utilities (e.g. `src/lib/services/searcher.ts`) and standalone scripts (e.g. `scripts/aiHunter.ts`). These are **not invoked by `/api/cron/phd-hunt`**.
- `scripts/hunter.ts` exists but could not be inspected in this environment because the file contains **null bytes** (tooling cannot read it). The runtime PhD pipeline described below is therefore based on the verified `/api/cron/phd-hunt` → `realtimeFetcher` path.

---

## 1) The “Hunter” Workflow (Step-by-Step)

### Step 1 — Trigger: `/api/cron/phd-hunt`
**File:** `src/app/api/cron/phd-hunt/route.ts`

- **Entry point:** `GET(request: Request)`
- **Optional auth:** If `process.env.CRON_SECRET` is set, the route expects header `x-cron-secret` to match.
- **Execution:**
  - Calls:
    - `runRealtimeIngestion({ includeIndustry: false })`
  - Returns JSON:
    - `{ ok: true, results, skipped }` on success
    - `{ ok: false, error }` on failure

**Key implication:** PhD Hunt explicitly runs the ingestion in **PhD-only mode** via `includeIndustry: false`.

### Step 2 — Create server-side Supabase client (service role)
**File:** `lib/services/realtimeFetcher.ts`

- `runRealtimeIngestion()` starts by constructing a Supabase client via `createServerSupabaseClient()`.
- It requires:
  - `SUPABASE_URL` (or fallback `NEXT_PUBLIC_SUPABASE_URL`)
  - `SUPABASE_KEY` (**service role key**, required)

If either is missing, the ingestion **throws**:
- `Missing SUPABASE_URL or SUPABASE_KEY (service role) for ingestion`

**Reason:** ingestion performs DB writes (`upsert`), which often requires bypassing RLS; therefore it must use a server-side privileged key.

### Step 3 — Select sources (“where the search happens”)
The ingestion sources are **RSS feeds**, not a search engine.

- `GLOBAL_PHD_FEEDS` (currently from `jobs.ac.uk`)
- `STEM_FEEDS` (currently empty)
- `REGIONAL_FEEDS` (currently empty)
- `INDUSTRY_FEEDS` (We Work Remotely) is only included when `includeIndustry === true`

When invoked by `/api/cron/phd-hunt`, `includeIndustry` is forced to `false`, so **industry feeds are not included**.

### Step 4 — Fetch and parse RSS → build in-memory feed item list
For each selected feed URL:
- Uses `rss-parser` with a forgiving XML parser setting.
- For each RSS item, creates an in-memory `FeedItem`:
  - `title`
  - `link`
  - `description` (from `contentSnippet`, `content:encoded`, `content`, or `description`)
  - `pubDate` (isoDate/pubDate)
  - `source` (feed URL)
  - `inferredType` (based on which feed list it came from)

**Temporary data storage:**
- Items are stored only in memory in:
  - `feedItems: FeedItem[]`

There is **no staging database table**; the “temporary storage” is purely in-process arrays/maps.

### Step 5 — De-duplication and ranking (in-memory)
After fetching:
- De-duplicate by link using:
  - `uniqueByLink: Map<string, FeedItem>` keyed by `item.link`
- Sort by `pubDate` descending
- Limit to `50` items per run

### Step 6 — Database-level duplicate check (avoid AI work)
Before enriching with AI:
- For each candidate item, it checks Supabase:
  - `.from('JobOpportunity')`
  - `.select('id')`
  - `.eq('applicationLink', item.link)`
  - `.limit(1)`

If a row already exists:
- It is marked as `{ status: 'updated' }` in results **without running AI**.

If the check errors:
- The item is added to `skipped` with reason `existing_check_error`.

New (non-existing) items go into:
- `newItems: FeedItem[]`

### Step 7 — AI enrichment (Gemini) + fallback heuristic
If `process.env.GEMINI_API_KEY` is set:
- Uses `@google/generative-ai` (`GoogleGenerativeAI`) with:
  - model: `gemini-1.5-flash-latest`
  - enforced JSON schema extraction (city/country/isPhD/deadline/requirements/language/summaryEn)

It prompts Gemini to:
- detect language
- produce an English summary if non-English
- extract structured fields
- classify `isPhD`

If Gemini is not configured or fails:
- It uses a **heuristic fallback**:
  - `isPhD = /phd|ph\.d|doctoral|doctorate/` over title+description
  - sets a minimal requirements array

### Step 8 — PhD-only filtering logic (excludes industry jobs)
Type assignment:
- `type = enriched.isPhD ? 'PHD' : item.inferredType`

PhD-only enforcement:
- When `/api/cron/phd-hunt` passes `includeIndustry: false`, the ingestion checks:
  - `if (!includeIndustry && type !== 'PHD')` → skip with `filtered_non_phd`

**This is the main “cleaning gate” that prevents non-PhD opportunities from being written during the PhD Hunt run.**

### Step 9 — Final upsert into Supabase
The ingestion writes to:
- Supabase table: `JobOpportunity`

Payload shape (insert):
- `title`
- `type` (`PHD` or `JOB`)
- `company` (heuristic based on source URL)
- `country`, `city`
- `description` (Gemini English summary or raw snippet)
- `requirements`
- `deadline`
- `postedAt`
- `applicationLink` (**canonical unique key**)
- `source`

Write operation:
- `.upsert(payload, { onConflict: 'applicationLink' })`

If upsert fails:
- record is added to `skipped` with reason `upsert_error`

Return value:
- `{ results, skipped }`

---

## 2) Search Methodology

### What `/api/cron/phd-hunt` uses today
The live PhD pipeline uses:
- **RSS ingestion** via `rss-parser`

Specifically:
- `jobs.ac.uk` location feeds (Europe/London/Scotland)

This is **not** a Google CSE / Serper / scraping-based crawler in the cron route.

### What exists in the repo (but is not used by the cron route)
- **Google Custom Search Engine (CSE) integration**:
  - `src/lib/services/searcher.ts` calls `https://www.googleapis.com/customsearch/v1`
  - controlled by env vars:
    - `GOOGLE_SEARCH_API_KEY`
    - `GOOGLE_SEARCH_CX`
  - This module is currently a utility and is **not wired into `/api/cron/phd-hunt`**.

- **Tavily search script**:
  - `scripts/aiHunter.ts` calls `https://api.tavily.com/search`
  - requires `TAVILY_API_KEY`
  - It upserts results into `JobOpportunity`
  - This is a **manual/standalone script**, not the cron route.

### How `canadaPhdKeywords` and “global keywords” are used
- `lib/searchConfig.ts` defines:
  - `SEARCH_CONFIG.phdKeywords`
  - `SEARCH_CONFIG.canadaPhdKeywords`

In the current codebase:
- These keywords are primarily **surfaced in the UI** (e.g. `src/app/canada/phd/page.tsx`) as informational “keyword chips”.
- The **cron ingestion (`realtimeFetcher.ts`) does not consume `SEARCH_CONFIG`**.

So today:
- `canadaPhdKeywords` are **not driving the cron discovery**.
- Discovery is driven by **RSS feed URLs**.

---

## 3) AI Integration & Logic

### AI usage #1 — Ingestion-time enrichment (Gemini)
**File:** `lib/services/realtimeFetcher.ts`

**AI provider:** Google Gemini (`@google/generative-ai`)

**Why it’s used:**
- Convert semi-structured RSS text (title + snippet/description) into structured DB fields:
  - `city`, `country`, `deadline`, `requirements`
- Language detection + optional English summary (`summaryEn`)
- Classification:
  - `isPhD` boolean, which directly influences `type` and PhD-only filtering

**Outcome:**
- Higher-quality records in `JobOpportunity` with better filtering and user display.

### AI usage #2 — User-facing summarization (Groq)
**Files:**
- `src/app/api/summarize-job/route.ts` (API)
- `src/app/phd/[id]/page.tsx` (client calls API)

**AI provider:** Groq (`groq-sdk`) using:
- model: `llama-3.1-8b-instant`

**Why it’s used:**
- Generate a readable **student-friendly summary** of a specific opportunity *on demand*.

**Important separation:**
- Gemini = ingestion-time extraction + classification
- Groq = display-time summarization for detail pages

---

## 4) Data Processing & APIs

### External APIs called (runtime PhD pipeline)
When `/api/cron/phd-hunt` runs, the platform calls:
- **RSS endpoints** (HTTP GET)
  - e.g. `https://www.jobs.ac.uk/.../?format=rss`
- **Supabase**
  - Reads existing records (`select`)
  - Writes/upserts new records (`upsert`)
- **Google Gemini API** (if `GEMINI_API_KEY` is set)
  - `model.generateContent(...)`

### External APIs called (PhD UI / detail experience)
When a user opens a PhD detail page:
- **Supabase** (client anon key)
  - fetches the row by id
- **Groq API** (server-side from `/api/summarize-job`)
  - creates a summary response

### “Cleaning” phase (dedupe + PhD-only enforcement)
The system prevents duplicates and non-PhD items primarily via:

- **In-memory de-duplication**
  - `Map` keyed by `applicationLink`

- **Database-level pre-check**
  - query existing rows by `applicationLink` before running AI

- **Write-level idempotency**
  - Supabase `.upsert(..., { onConflict: 'applicationLink' })`

- **PhD-only enforcement for the cron run**
  - `/api/cron/phd-hunt` uses `includeIndustry: false`
  - `realtimeFetcher` skips anything where `type !== 'PHD'`

**Note:**
- The ingestion file also contains an industry feed list, but it is **opt-in** and disabled for PhD Hunt.

---

## 5) Final Display Step (DB → UI bridge)

### PhD listing page
**File:** `src/app/phd/page.tsx`

**Client-side Supabase dependency:**
- Uses `src/lib/supabase.ts` which reads:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Query used to show PhD-only items:**
```ts
supabase
  .from('JobOpportunity')
  .select('*')
  .or('type.eq.PHD,isPhd.eq.true')
  .order('postedAt', { ascending: false });
```

**Filtering behavior:**
- Server/DB filter:
  - `type == 'PHD'` OR legacy flag `isPhd == true`
- Client-side filters applied after fetch:
  - text search across title/company/city/country/description
  - country checkbox filtering
  - keyword chips (regex-based topic filtering)

### PhD detail page
**File:** `src/app/phd/[id]/page.tsx`

- Loads one record by id:
```ts
supabase
  .from('JobOpportunity')
  .select('*')
  .eq('id', jobId)
  .single();
```

- Then requests an AI summary:
```ts
fetch(`/api/summarize-job?id=${encodeURIComponent(jobId)}&type=PHD`)
```

### Canada-specific PhD listing (separate UI path)
**File:** `src/app/canada/phd/page.tsx`

This page filters by Canada + PHD:
```ts
supabase
  .from('JobOpportunity')
  .select('*')
  .eq('country', 'Canada')
  .eq('type', 'PHD')
  .order('postedAt', { ascending: false })
  .limit(50);
```

**Important:** this page displays `SEARCH_CONFIG.canadaPhdKeywords` as chips, but the cron ingestion does not currently use these keywords.

---

## Environment Variables (PhD Pipeline)

### Required for `/api/cron/phd-hunt` to write
- `SUPABASE_URL`
- `SUPABASE_KEY` (**service role**)
- Optional hardening:
  - `CRON_SECRET`

### Optional (enables ingestion enrichment)
- `GEMINI_API_KEY`

### Optional (enables detail-page summaries)
- `GROQ_API_KEY`

### Required for PhD UI pages to load data in the browser
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Key Takeaways
- **The current cron-driven PhD pipeline is RSS-based**, not keyword-based web search.
- **AI is used in two distinct places**:
  - Gemini at ingestion-time to structure/classify and optionally translate/summarize content.
  - Groq at view-time to generate a user-facing summary on demand.
- **De-duplication is anchored on `applicationLink`** via pre-check + `upsert` conflict target.
- **PhD-only enforcement** for the cron run is implemented by `includeIndustry: false` plus `type !== 'PHD'` filtering.
