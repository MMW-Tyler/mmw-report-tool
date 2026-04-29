# MMW Reporting Engine — Context for Claude Code

This document is the primary context handoff for Claude Code to continue building this tool. Read this first before making any architectural decisions.

---

## What this is

Internal reporting tool for Medical Marketing Whiz (MMW), a digital marketing agency serving medical practices (med spas, gyn, psychiatry, functional medicine, chiropractic, aesthetics). Pulls data from GA4, Google Search Console, and GoHighLevel; uses Claude to translate raw analytics into:

1. AE-facing dashboards with coaching, objection prep, and internal notes
2. Client-facing DOCX exports with polished narrative and prioritized recommendations

This is the most stateful and most-used tool in MMW's internal suite. Treat it as a long-lived production system, not a prototype.

---

## Why this exists (the actual problem)

MMW's account executives are not all SEO professionals. Many of their clients have SEO and marketing services bundled in, but AEs struggle to:

- Make sense of GA4's complex data model
- Translate raw numbers into client value
- Anticipate and rebut common client pushback ("SEO is too slow", "I'm not getting leads")
- Identify real wins and surface them on calls
- Recommend specific, prioritized next steps

This tool is fundamentally an **AE coaching tool that uses analytics as input**. Most reporting dashboards just visualize data prettier. This one tells the AE *how to have the conversation*. The data layer is table stakes — the value lives in the narrative + coaching layers.

---

## The four-layer model (memorize this)

Every report section answers four questions in order:

1. **What happened?** → `raw_data` (JSONB pull from API)
2. **What does it mean?** → `claude_findings` (Pass 1: structured wins/concerns/opportunities/anomalies)
3. **What should the client hear?** → `claude_narrative` + `ae_override` (Pass 2: prose for client doc)
4. **What's the next move?** → `ae_coaching` + recommendations section (internal-only AE prep)

The two-pass Claude pipeline is deliberate:
- Pass 1 produces structured findings reusable across multiple render targets
- Pass 2 produces prose, which is opinionated by render target (client-facing vs AE-facing)

Never collapse these into one Claude call. The separation is what lets AEs edit the narrative without losing the structured findings beneath it.

---

## Architecture

### Stack
- **Runtime:** Node.js 20+, Express
- **Database:** Supabase (Postgres). All access via service role key server-side. RLS enabled defense-in-depth.
- **AI:** Anthropic Claude (`claude-opus-4-7` default; configurable via env)
- **Frontend:** Server-rendered single-file HTML pages, MMW brand. No SPA framework. Same pattern as Content Engine and Marketing Analysis tool.
- **Document generation:** `docx` npm package server-side. **Use native `floating` ImageRun for images. Do NOT attempt JSZip post-processing — it has been tried twice and abandoned.**
- **Hosting:** Render. Auto-deploy on push to `main`.
- **Scheduling:** `node-cron` in-process for monthly auto-generation. (If we hit Render dyno restart issues, migrate to Render Cron Jobs.)

### Auth model

#### Internal team auth (dashboard login)
- **Internal-only for v1.** AEs and admins log in. Clients consume exported documents.
- Session-based auth, bcrypt password hashes in `team_users` table.
- Two roles: `admin` (full CRUD on clients, integrations, team users, OAuth accounts) and `ae` (CRUD on assigned clients' reports, read-only on clients/integrations).
- Phase 2 may add a client portal — schema is forward-compatible (RLS already enabled).

#### External data source auth — IMPORTANT, READ CAREFULLY

This tool uses a **shared OAuth account model** for Google services, not per-client OAuth.

**Background:** MMW already has the `medicalmarketingwhiz@gmail.com` Google account, which has been granted Read access to dozens of client GA4 properties and GSC sites. This consolidation predates the tool. The tool leverages it.

**The model:**
- One row in `oauth_accounts` holds the encrypted OAuth credentials for `medicalmarketingwhiz@gmail.com`.
- That single token covers GA4, GSC, and (Phase 2) GBP via the corresponding scopes.
- Per-client `integrations` rows store `oauth_account_id` (FK to the shared row) plus `resource_id` (the specific GA4 property ID or GSC site URL).
- When pulling data for a client, decrypt credentials from `oauth_accounts`, hit the API filtered by the client's `resource_id`.

**Why this model and not per-client OAuth:**
- MMW already has the consolidated account; per-client OAuth would be re-doing work that's already done in Google's admin console.
- Adding a new client = pick a property from a dropdown, no auth flow.
- Token refresh happens once per shared account, not N times per N clients.
- The `oauth_accounts` table is designed to hold multiple rows in case MMW ever adds a second master account (different brand, backup, etc.) — but expect 1 row in practice.

**Per-provider auth specifics:**

| Provider | Auth | How creds are stored |
|---|---|---|
| GA4 | Shared OAuth (Google) | `oauth_accounts` row, referenced by `integrations.oauth_account_id` |
| GSC | Shared OAuth (Google) | `oauth_accounts` row, referenced by `integrations.oauth_account_id` |
| GBP (Performance API) | Shared OAuth (Google) | `oauth_accounts` row, referenced by `integrations.oauth_account_id` |
| GHL | Private Integration Token (per client) | Encrypted inline in `integrations.credentials_encrypted` |

The `integrations` table has a CHECK constraint enforcing this: `shared_oauth` rows must reference an `oauth_account_id` and have null inline creds; `pit` rows must have inline creds and null `oauth_account_id`.

**OAuth app status:** The Google Cloud OAuth app is published to "In production" without verification. The "unverified app" warning is acceptable because only Tyler ever clicks through the consent flow, signing in as `medicalmarketingwhiz@gmail.com`, once. Refresh tokens last indefinitely in this configuration.

**Important on GHL:** Tyler is on the Freelancer plan, which uses location-level Private Integration Tokens. Same endpoints as Agency Pro, just different auth and single-location scope. Email campaign endpoint availability at the PIT level needs verification — Tyler will confirm before that section is wired up. Don't preemptively scaffold anything that requires agency-level OAuth.

**Important on Advice Local:** Tyler explicitly excluded it from this tool. Their post-deletion data behavior is unreliable for ongoing reporting. Use the existing Marketing Analysis Report Generator for one-shot prospect citation audits; this tool does not re-pull citation data monthly.

**Important on GBP (Business Profile Performance API):** Tyler enabled the Business Profile Performance API in Google Cloud. This is the **read-only metrics API** — distinct from the main "My Business Business Information API" and from the "Reviews API." It does NOT require Google's allowlist application; it works as soon as the API is enabled and the OAuth scope `https://www.googleapis.com/auth/business.manage` is granted.

What it provides:
- Profile views (search vs maps breakdown)
- Searches (direct, discovery, branded)
- Customer actions (calls, direction requests, website clicks, message clicks, booking clicks)
- Photo views

For medical practices these are arguably the highest-value local SEO metrics in the entire tool. "47 calls and 89 direction requests from your Google Business Profile this month" is more concrete client value than anything in GA4 alone.

**GBP rate limit gotcha:** The Performance API enforces ~1 query per second per project. The monthly cron job MUST throttle GBP requests sequentially per location and per metric. Do NOT fan out parallel requests for all clients at once — Google will return 429s. Process clients serially with `setTimeout` or a queue, or use a small concurrency limit (e.g. 1 concurrent request) for GBP specifically. Per monthly run for ~250 clients x 5 metrics = ~21 minutes of pulling, which is fine.

Reviews, Q&A, and Posts APIs remain Phase 2+ and require Google's allowlist application — Tyler is separately working on this. Do not scaffold against those APIs yet.

---

## Schema (canonical reference)

See `docs/schema.sql` for the full DDL. Key tables:

- `team_users` — internal MMW staff (AEs + admins)
- `oauth_accounts` — shared OAuth credentials (typically 1 row: `medicalmarketingwhiz@gmail.com`)
- `clients` — MMW's client roster, assigned to an AE
- `integrations` — per-client x per-provider connection; references `oauth_accounts` for Google services, holds inline encrypted creds for GHL
- `reports` — one per client per period (typically calendar month)
- `report_sections` — one row per section_type per report; holds raw data, findings, narrative, AE override, AE notes, coaching
- `objection_library` — curated, grows over time; coaching layer
- `benchmarks` — industry comparison data for "your CTR is in the top quartile for med spas"
- `audit_log` — sensitive action tracking

**The most important field in the entire schema is `report_sections.ae_override`.** This is what gets exported to the client. Claude's output is the default; the AE can edit. If override is non-null, it wins. This is how AEs feel ownership over what the client sees.

Internal-only fields (NEVER exported to client):
- `report_sections.ae_internal_notes`
- `report_sections.ae_coaching`
- Anything in the dashboard view marked "Internal" / "Coaching" / "Don't say this"

---

## Phase 1 — what to build, in order

The order matters. Each step depends on the previous and produces something demonstrable.

1. **Express bootstrap** — already scaffolded; verify boot, add the auth middleware skeleton in `lib/auth-middleware.js`.
2. **Internal auth** — login route, session, bcrypt password verification, admin-seed script. Build a simple `public/login.html` styled in MMW brand.
3. **Admin layout shell** — `public/dashboard.html` with nav (Clients, Reports, Settings, Logout), client list table, MMW brand. No data yet.
4. **Client CRUD** — `routes/clients.js`, simple add/edit/list/archive, served from the dashboard.
5. **OAuth account connect flow** — `routes/auth.js` Google OAuth flow that lands creds in `oauth_accounts`. Settings page: "Connect Google Account" button. Tyler signs in as `medicalmarketingwhiz@gmail.com` once. Token refresh logic in `lib/google-oauth.js` runs before every API call against the shared row.
6. **GA4 service** — `services/ga4.js`. Methods: `listProperties(oauthAccountId)`, `pullTraffic(propertyId, dateRange)`, `pullConversions(...)`, `pullEngagement(...)`. Use `googleapis` package.
7. **GSC service** — `services/gsc.js`. Methods: `listSites(oauthAccountId)`, `pullPerformance(siteUrl, dateRange, dimensions)`. Use `googleapis` package.
8. **GBP Performance service** — `services/gbp.js`. Methods: `listLocations(oauthAccountId)`, `pullPerformance(locationName, dateRange, metrics)`. **Throttle to 1 request/sec — no parallel fan-out.** Use `googleapis` package (`mybusinessbusinessinformation` for location listing, `businessprofileperformance` for metrics).
9. **Per-client integration UI** — On the client detail page, "Add GA4 Integration" calls `listProperties()` and shows a dropdown; same for GSC and GBP.
10. **GHL service** — `services/ghl.js` using PIT auth. Tyler verifies email endpoints first. Once green-lit, methods: `pullEmailCampaigns(locationId, dateRange)`, `pullContacts(...)`.
11. **Claude pipeline** — `services/claude.js` with two methods: `generateFindings(rawData, sectionType)` and `generateNarrative(findings, sectionType, clientContext)`. Plus `generateAECoaching(findings, sectionType, clientContext, objectionLibrary)`.
12. **Prompts** — isolated in `prompts/findings.js`, `prompts/narrative.js`, `prompts/ae-coaching.js`, `prompts/recommendations.js`. Tyler iterates on these without touching server code.
13. **Report generation flow** — `routes/reports.js` POST `/generate` triggers a full report build for a client and period. Calls services in parallel where possible (BUT serially for GBP), persists to `reports` + `report_sections`.
14. **Report view** — `public/report.html` with all sections, AE override editing, AE notes editing, regenerate-section button.
15. **Client doc DOCX exporter** — `services/docx-exporter.js`. Exports use `ae_override` if present, else `claude_narrative`. Internal fields are NEVER included.
16. **Monthly cron** — `jobs/monthly-report.js` triggered by `node-cron` on the 1st of each month, generates a draft report for every active client, status `draft`, awaiting AE review. Process clients serially when GBP data is involved to respect rate limits.

### Phase 2 — Enhancements (not before Phase 1 ships)
- GBP Reviews API (pending Google's allowlist approval) — review responses, sentiment tracking
- GBP Posts API (pending allowlist) — post scheduling and performance tracking
- GBP Q&A API (pending allowlist) — Q&A monitoring
- Objection library UI (CRUD + auto-matching to report sections)
- Benchmarks lookup integrated into findings
- Email notifications (Resend) when monthly reports are ready
- Month-over-month and year-over-year comparison views
- Blog performance correlation (cross-reference Blog Writer output with GSC)

### Phase 3 — Maybe
- Client portal (read-only client login)
- Slack/email digests for AEs ("Your 12 reports are ready")
- Auto-generated executive summaries across all clients (for Lori)

---

## Prompts (the highest-leverage code in the repo)

Following the Content Engine pattern, all Claude prompts live in `prompts/` — isolated from server logic so they can be iterated on without touching plumbing. This is deliberate and important.

Prompt files:
- `prompts/findings.js` — Pass 1, data to structured findings
- `prompts/narrative.js` — Pass 2, findings to client-facing prose
- `prompts/ae-coaching.js` — Internal AE talking points, objection prep, "do not say" list
- `prompts/recommendations.js` — Prioritized next-step actions

### Style rules for client-facing narrative (Pass 2)
Mirror the Content Engine and Marketing Analysis tool conventions:
- Prose first, bullets only when genuinely list-shaped
- **No em dashes** (Tyler-mandated)
- No filler ("In conclusion", "It is worth noting that")
- Concrete numbers over vague comparisons ("organic clicks rose 34% to 1,247" not "organic clicks improved")
- Lead with the win, then the context
- Always frame next steps as "what we recommend" not "what you should do"

### Style rules for AE coaching (separate prompt)
- Direct, tactical, no fluff
- Includes "say this" / "don't say this" pairs
- Anticipates pushback explicitly
- References the objection_library where matches are found

---

## Conventions (match Tyler's existing tools)

- **Express + single-file HTML frontends**, no SPA framework
- **Prompts isolated in their own files** (Content Engine pattern)
- **MMW brand**: `#28AB83`, `#323547`, `#FFFFFF`, `#E5F5F0` / `#F7FAF9` backgrounds; Poppins (headings), Barlow (UI), Lato (body)
- **DOCX over Word**: clients view in Google Docs primarily; design DOCX accordingly
- **PT Sans Narrow + Arial** in DOCX exports (matches Marketing Analysis tool)
- **No em dashes, ever** (in user-facing copy or Claude prompts that produce user-facing copy)
- **Deploy flow:** `git add . && git commit -m "..." && git push origin main` then Render auto-deploys
- **Test locally before pushing**
- **Environment variable naming consistency** is critical on Render (a prior tool broke because of `GOOGLE_PLACES_API_KEY` vs `GOOGLE_API_KEY` mismatch)
- **Never commit credentials.** Prior `git filter-branch` incident on another repo. Use `.env.example` as the schema-of-record for env vars.

---

## Gotchas + lessons from prior tools

- **JSZip post-processing for DOCX images doesn't work.** Use `docx` library's native `floating` ImageRun. Don't try the other way; it's been tried twice.
- **Google Places legacy `Autocomplete` API is more reliable than `PlaceAutocompleteElement`** (used in Marketing Analysis tool). Not directly relevant here, but if you ever add a place picker, use legacy.
- **Render env var names must match exactly between code and dashboard.** Prefer `process.env.FOO` references in a single config module to catch typos.
- **Supabase service role key bypasses RLS.** Treat it like a root password. Server-side only. Never expose to frontend.
- **Encrypted credentials in `oauth_accounts.credentials_encrypted` and `integrations.credentials_encrypted`** must use `lib/encryption.js`. Algorithm: AES-256-GCM. Key from `ENCRYPTION_KEY` env var. Don't roll your own crypto.
- **OAuth refresh logic must update both `oauth_accounts.credentials_encrypted` AND `oauth_accounts.last_refresh_at`** on every successful refresh. The `googleapis` library handles refresh automatically if you give it the refresh token, but make sure to write the new access_token + expires_at back to the DB after each refresh — otherwise every Express process refresh-thrashes independently.

---

## Open decisions (Tyler will weigh in as build progresses)

- Email notification system (Resend scaffolded, needs API key + sending domain)
- Whether to add a "client-facing PDF" alongside DOCX (probably yes; DOCX may render inconsistently in some email clients)
- Whether to surface Blog Writer output directly or just cross-reference via GSC URL matching
- GBP API approval timeline (waiting on Google)

---

## Contact

- Tyler — primary builder
