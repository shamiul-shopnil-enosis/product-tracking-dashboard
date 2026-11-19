# Product Analytics dashboard: implementation plan (v2)

Goal: a Mixpanel-style dashboard that shows how users respond to the product, built from GA4 and Microsoft Clarity data fetched automatically through their APIs. Source plan: `/Users/shamiul.shopnil/Desktop/work/eos-brain/plans/product-tracking-dashboard.md`.

Why v2: v1 of this plan built a findings log and left out live numbers, so it could not show how the product is doing. The foundation (Docker, NestJS, Next.js, MongoDB, login and roles) carries over. Findings stays as a secondary tab.

## Decisions

| Topic | Decision |
|---|---|
| Stack | NestJS (api), Next.js (web), MongoDB, one repo with `apps/api` and `apps/web` |
| Main product | Analytics dashboard. Findings is a secondary tab |
| Depth | Trends and totals first. Funnels and retention (GA4 BigQuery export) are out of scope until we see real data |
| Build | Custom: scheduled pulls from the GA4 and Clarity APIs into MongoDB, charts in Next.js |
| Sources, in order | 1. Clarity (token available now). 2. GA4 (access later). No other sources for now |
| Bots | Charts show human traffic by default, with a toggle for all traffic. Bot share is its own metric |
| First views | Overview with change vs the previous period, Traffic and sources, Pages and landing performance, Friction (Clarity) |
| Auth | Email and password, roles viewer, editor, admin (already built) |
| Hosting | Docker Compose on own server |
| Secrets | API tokens and Google key live only on the server (`.env` and a mounted secrets folder). Never in the browser, the repo or chat |

## What the APIs allow (checked in the official Clarity docs on 2026-11-17)

**Clarity Data Export API**
- `GET https://www.clarity.ms/export-data/api/v1/project-live-insights` with `Authorization: Bearer <token>`. A project admin creates the token under Settings, Data Export.
- Parameters: `numOfDays` (1, 2 or 3) and up to three dimensions: Browser, Device, Country/Region, OS, Source, Medium, Campaign, Channel, URL.
- Metrics: traffic (sessions, bot sessions, users, pages per session), scroll depth, engagement time, popular pages, dead clicks, rage clicks, excessive scroll, quick backs, script errors, error clicks.
- Limits: 10 requests per project per day, only the last 1 to 3 days, 1,000 rows per response with no paging.
- Consequences:
  - There is **no history**. We must fetch every day and store it, so charts only start from the first day we run. This is why Clarity ingestion comes first.
  - `numOfDays=1` is a rolling 24 hours ending at the call time. We call at a fixed time (00:05 UTC) so each stored snapshot is one clean day.
  - The 10-call budget is about 7 nightly calls (no breakdown, URL, Channel, Source, Device, Country, OS/Browser) and 3 spare for manual refreshes.
  - The docs show only part of the response ("additional metrics may be included"). We store the raw response and normalise when reading, after inspecting one real response.

**GA4** (to confirm when access arrives): Google Analytics Data API (`runReport`) with a Google Cloud service account added as Viewer on the GA4 property, using the `@google-analytics/data` client. GA4 can return history for past dates, so a backfill is possible. It reports aggregates, not raw events.

## Data model (MongoDB)

- `users`, `findings`, `counters` (existing)
- `metricSnapshots`: provider (clarity or ga4), date (UTC day), breakdown (none, url, channel, ...), rows, rawPayload, fetchedAt. Unique on provider, date, breakdown
- `syncRuns`: provider, startedAt, finishedAt, status, callsUsed, error. Doubles as the daily Clarity call counter
- `annotations`: date, label, kind (release, campaign, incident), createdBy

## Phases

Done: Phase 0 (foundation), Phase 1 (auth and users), Phase 2 (findings with uploads). Verified in Docker and the browser.

### Phase 3: Clarity ingestion (about 3 days)
- Config: `CLARITY_API_TOKEN` in `.env`, optional `CLARITY_SYNC_ENABLED`.
- Clarity client with typed errors for 401, 403, 429 and timeouts.
- Probe: an admin-only endpoint or script that saves one real response, to confirm the response shape before normalising.
- Nightly scheduled sync at 00:05 UTC for numOfDays=1 across the planned breakdowns, with a per-day call counter that stops at 10 and keeps 3 in reserve.
- Admin "sync now" button, rate-limited, with the sync status and last error visible.
- First run also stores one 72-hour baseline window labelled as such.
- Done when: after two nights, `metricSnapshots` has one row per breakdown per day, and the status shows success.

### Phase 4: Dashboard: Overview and Friction (about 5 days)
- Dashboard API: totals, daily series, and top lists for a date range, with comparison to the previous period of equal length, and a human or all traffic toggle.
- Overview page: tiles (human sessions, new users share, pages per session, engagement time, scroll depth, bot share) with change vs the previous period, plus trend lines.
- Friction page: rage clicks, dead clicks, quick backs, script errors, ranked by page, with trends.
- Charts library (Recharts), date range picker, empty states for "not enough days yet", number definitions on every tile.
- Done when: the Overview and Friction pages show real stored Clarity data and the change vs previous period.

### Phase 5: Traffic, sources and pages (about 4 days) - DONE 2026-11-18
- Traffic and sources: channel, source, medium, campaign, country, device, browser, OS.
- Pages and landing performance: popular pages, scroll depth and engagement time per URL, quick backs per URL.
- Click-through from a chart row to a filtered view.
- Done when: every first view named in the decisions table is live.

### Phase 6: GA4 ingestion and merged views (about 5 days) - DONE 2026-11-18, connected to the real GA4
- Service account setup guide, `GA4_PROPERTY_ID` and a mounted key file (`./secrets/ga4.json`), never committed.
- GA4 client, daily sync with backfill, stored in the same snapshot collection.
- Add GA4 sessions, users, engagement rate, key events and landing pages beside Clarity, with each metric labelled by source.
- Done when: the Overview shows GA4 and Clarity side by side with a note on where numbers differ and why.

### Phase 7: Annotations, alerts and Findings link (about 3 days) - DONE 2026-11-18
- Annotations for releases (for example PMD 4.0.0) shown as markers on charts.
- Simple alerts: a metric that moves more than a set percent vs the previous period is flagged on the Overview.
- Link a finding to a page or metric, and show findings on the matching page.
- Done when: a release marker and a flagged metric both appear on the Overview.

### Phase 8: Design (my estimate: 5 to 7 days) - DONE 2026-11-18
Goal: the dashboard must be very well designed, and answer "is the product improving?" at a glance. Decisions (2026-11-18): neutral clean style (no brand assets), inspired by Plausible (calm, few big numbers), with the depth of PostHog or Mixpanel and the polish of Linear or Vercel. Must support dark mode and phone width. Reviewed as browser mockups before any app code changes.

1. **Direction first, with your sign-off. DONE 2026-11-18: you chose mockup B (Dense), no changes.** Sidebar with grouped navigation (Analytics, Work, Admin), sticky filter bar, headline sentence card, metrics grouped into Audience, Engagement and Friction with trend lines, an info control for definitions, a side panel with alerts, markers and data health, and a source and coverage chip row. The mockups are in `design/` (open `design/index.html`; they use fake trends but your real current numbers), and `design/shared.css` and `design/shared.js` hold the tokens, formatting and chart code to port.
2. **A headline answer at the top of the Overview.** One plain-language sentence built from the tiles and alerts, for example "Last 14 days: human sessions up 12%, friction about the same, scroll depth down." This is the question the dashboard exists to answer.
3. **Fewer, grouped tiles.** Ten tiles in a row is too many. Group them into Audience, Engagement and Friction, with a sparkline in each tile. Definitions open from an info control that works on touch (the current hover tooltip does not).
4. **Design system.** Tokens for colour, type scale, spacing, radius and surfaces in light and dark; chart colours re-checked with the palette validator in dark mode; status colours always with an icon and a label; reusable KPI tile, chart card, table, filter bar and banner. Decide here whether to adopt Tailwind with shadcn/ui or keep plain CSS.
5. **Navigation and state.** Group the menu into Analytics (Overview, Traffic, Pages, Friction), Work (Findings) and Admin (Data, Users). A sticky filter bar for range and traffic, with the state kept in the address so a view can be shared and survives switching pages.
6. **Trust cues.** One consistent treatment for coverage ("n of m days"), approximate days and a source label (Clarity now, GA4 later), so GA4 slots in without a redesign.
7. **Every data state designed:** loading skeletons, empty, partial, error and "not enough data".
8. **Copy and a "How to read this" page** (the source plan asks for it as ticket 10): plain wording on every tile and chart.
9. **Phone width.** Stacked tiles, charts that fit, tables that scroll sideways or collapse into cards.
10. **Verification.** Screenshots in light, dark and phone width for every page; the design-critique and accessibility-review skills; keyboard, focus and contrast checks.
- Done when: you have approved the direction, every page is migrated, and screenshots in light, dark and phone width show no layout, contrast or keyboard problems.
- Built: design tokens in plain CSS (light and dark, no Tailwind: the app is small enough that a framework would add more than it saves), sidebar with grouped navigation, sticky filter bar with range, traffic, compare and alert threshold kept in the address, a server-written headline sentence, grouped tiles with trend lines and a keyboard-operable info control, dashed previous-period line, loading skeletons and error states on the analytics pages, a "How to read this" page, phone layout with a scrollable menu, and theme toggle with no flash.
- A design critique changed the Overview order to headline, then evidence chart, then tiles; removed repeated coverage text; moved the findings summary to the side panel; and fixed an orphaned tile row.
- Checked: every page at phone width with no sideways overflow; contrast measured in light and dark (muted text 4.96 and 6.54, everything else above 5); labels on all inputs; one h1 and an ordered heading outline; focus ring and Enter on the info control by keyboard.
- Not done: the Findings, Users and Data pages are restyled through the shared styles, not re-laid-out; they have no loading skeletons; no screen reader testing.

### Phase 9: Hardening and deploy (about 3 days) — built 2026-11-18; deploy to the real server still to do
- Login rate limiting, data retention policy, backups of MongoDB and the secrets folder, sync failure notifications.
- Health endpoint shows the last successful sync per provider.
- Tests for clients (mocked), normalisation and period comparison; short runbook.

### Phase 10: Simplify for stakeholders (from the review call with Raiyan, 2026-11-19)
**What was said.** The Overview is the landing page for busy decision makers (Raiyan, Saiful, Zishan, Tanvir). They will not read it all; it must be straightforward, simple and self-explanatory from the charts. The PMD dashboard is the reference: clean blocks, very little text per block. The explanations should be tooltips (an "i" icon), like analytics tools, not paragraphs. The summary should give insight, not just describe. A follow-up call after lunch decides exactly what to show; until then build what is already agreed.

**What changes in the design**
1. Two layers. The Overview becomes the at-a-glance layer for everyone; the existing pages (Traffic, Pages, Friction, Data sources) stay as the deep layer for the product and analytics team. Cards that answer "is it getting better?" move to the top; anything analytical moves down or to its own page.
2. Replace the always-visible hint paragraphs (added in Phase 9) with short tooltips on an "i" icon, plus one-line page subtitles at most. Keep the column guides only behind a collapsed "What the columns mean". Reason: Raiyan found the Overview too text-heavy. This partly reverses the "hint everywhere" request, so it needs the user's confirmation (see questions below).
3. Overview top row, in this order: Human sessions per day (with 7/14/30 day trend), Active users (GA4; "now" if real time is wanted), Engagement rate (GA4), Key events per day. Each tile: big number, arrow change, small trend line, tooltip.
4. Key events breakdown: a "Key events by event" block showing how many times each key event happened (top 3 or 5, "see all" opens the full list). Needs a new GA4 report by event name (eventName, eventCount, for key events only) stored per day.
5. Summary sentence: keep, but make it say what to do or look at (insight), not only list changes. Use 7, 14 and 30 day comparisons side by side as the user described.
6. Pages and Findings summary on the Overview: top 3 pages by visits and top 3 findings or friction pages, each with "See all" to the full page.
7. Remove from the Overview: "how often per day visitors did something" style definitions text, the GA4 vs Clarity explainer card, Data health detail (collapse to one small status dot), markers panel (move to its own place).
8. Pages screen gets the per-page visits table up front (already there); Traffic stays as is.
9. Real users right now: GA4 Realtime API (active users in the last 30 minutes). Needs a decision, because realtime is a separate call and permission check.

**Build order (about 3 to 4 days)**
- Day 1: Tooltip component, strip text from Overview and other pages, regroup Overview into the new top row and blocks.
- Day 2: GA4 key events by event name (API report, storage, endpoint, block) with tests.
- Day 3: Insight-style summary, 7/14/30 day view, top 3 pages and findings blocks, mobile and dark mode pass.
- Day 4 (optional): realtime active users; review with Raiyan and Saiful; adjust.

**Open decisions for the follow-up call**
- Exact tiles on the Overview, and which are hidden for non-analysts.
- Tooltips only, or tooltips plus a short subtitle.
- Is "active users right now" wanted, or active users per day enough.
- Which key events to list, and whether event names should be renamed to plain words.
- Whether the Overview should hide Clarity friction details from stakeholders.

### Later (not scheduled)
- Weekly review notes and hypotheses (from v1 Phase 3), PMD database metrics, Search Console, GA4 BigQuery export for funnels and retention.

## What I need from you
1. Phase 3: generate the Clarity API token (Settings, Data Export). Put it only in the server `.env` as `CLARITY_API_TOKEN=...`. Do not paste it in chat.
2. Phase 6: a Google Cloud service account JSON key added as Viewer on the GA4 property, and the GA4 property id.
3. A decision, before Phase 4, on which Clarity project and site the data covers, as in the source plan's open question.

## Findings during build (2026-11-18)
- The nightly job missed its first run because the Docker containers were not running at 00:05 UTC. After a restart the api now runs a catch-up for the missed day: only the totals and the pages, stored flagged approximate (a rolling 24 hours ending at restart, labelled with the UTC day that holds most of it, only before 12:00 UTC). The next nightly run replaces an approximate day; an exact day is never replaced.
- Clarity's "10 requests per day" behaves like a rolling 24 hours, not a reset at midnight UTC (a call was refused at 08:02 UTC after 8 calls the afternoon before and 2 that morning). The app now counts a rolling 24 hours (less a 10 minute margin) and pauses an hour after a refusal. This is inferred from one refusal, not documented.
- Clarity cannot say which page a session started on, so the Pages view shows sessions that viewed each page. Real landing pages need GA4 (Phase 6).
- Clicking a traffic row to filter pages would need two-dimension calls (source by page) that the call budget cannot afford, so it is not built.

- Phase 7 fixes found while testing: affected sessions were rounded per day, which turned tiny rates into false "rage clicks down 54%" alerts (now unrounded, plus a minimum of 10 sessions before a rate can raise an alert); pages had no explicit background, so they became unreadable in a dark browser (set a white background as a stopgap; real dark mode is in the design phase); rejected finding creates used up finding numbers (now numbered only after validation).

- Phase 6 built without credentials, tested on mocked GA4 responses and mock stored data (102 api tests). Not yet run against the real GA4 API: the report definitions in `ga4.constants.ts` (dimension and metric names such as `landingPage`, `sessionDefaultChannelGroup`, `keyEvents`) follow the Data API schema from memory and will be proven by the first real sync. Key events are requested separately so a wrong name cannot break the rest. To connect: put the service account key at `secrets/ga4.json`, set `GA4_PROPERTY_ID` in `.env`, add the service account email as Viewer on the property, then `docker compose up -d --force-recreate api`. The first start reads 90 days of history; each night at 03:15 UTC the last 3 days are read again (GA4 revises recent days, which are flagged approximate).
- Built: GA4 tiles (sessions, active users, engagement rate, key events) labelled GA4 on the Overview, an All sessions (GA4) line beside Clarity's human sessions, a GA4 and Clarity explanation card, GA4 landing pages table on the Pages screen, GA4 status in the sidebar and an admin panel with manual sync. The headline sentence stays Clarity-only. 

- GA4 connected 2026-11-18 (service account product-analytics-reader in Cloud project leafy-flash-508313-b3, property 490022412, Viewer role; GA4 needed several minutes before accepting the new service account email). The first real sync stored 90 days. Real data found three bugs the mock data could not: (1) GA4 leaves out days with zero key events, so a missing day now means 0; (2) the landing page report hit the 100,000 row limit and silently dropped the newest 4 days, so reports are now fetched page by page and checked (landing totals within 0.1% of GA4's day totals); (3) landing traffic spread over thousands of pages made the top-50 table cover only 15% of sessions, so each day keeps an "(other pages)" row. Alerts are now judged per source, and the headline falls back to GA4 when Clarity has no history.
- The Traffic screen has a Clarity / GA4 switch; the GA4 view shows sessions per day by channel (top 4), and a table with share, change and engagement rate.
- Real signal: in the 14 days to 2026-11-17, GA4 sessions per day rose about 190% (922 to 2,692) while engagement fell from 12% to 9%. Direct traffic tripled (11.9K to 36.7K sessions, 8% engaged) while organic search stayed flat (about 640 sessions, 65% engaged); the extra traffic lands on /auth/sign-in, /auth/sign-up and thousands of other pages. This looks like automated traffic that GA4 does not recognise as bots, consistent with Clarity's 86% bot share. It is an inference, not proven.

## Risks
| Risk | Effect | Mitigation |
|---|---|---|
| No history from Clarity | Charts start from the first stored day | Start Phase 3 immediately; show "N days of data" |
| 10 calls per day | A failed night loses a day | Reserve calls, retry once, show gaps honestly |
| Response shape differs from the docs | Wrong numbers | Store raw responses, inspect one real response first |
| Human session definition unclear | Misleading headline numbers | Check against the Clarity dashboard on the same day |
| GA4 and Clarity numbers differ | Confusion | Label the source on every metric and document the definitions |
| Token leaks | Data exposed | Server-only config, secrets not in git, rotate tokens when people leave |

- Phase 9 built: login rate limiting (5 failed tries per email and 30 per address in 15 minutes, in memory), `/api/health/sync` per-provider freshness (stale after 36 hours), daily 06:00 UTC check with optional `ALERT_WEBHOOK_URL`, run-log retention (`RETENTION_RUN_DAYS`), `scripts/backup.sh` and `restore-mongo.sh` (backup tested; restore not yet exercised), api port bound to localhost, `RUNBOOK.md`. 129 api tests pass.
- Readability pass: every section has an always-visible hint, every tile shows its definition, every table has a "What the columns mean" guide (`lib/glossary.ts` keeps the wording in one place), Help page extended with the GA4 terms.

- Phase 10 started 2026-11-19 (agreed parts only). Built: "i" tooltips (`components/Tip.tsx`) on the Overview instead of paragraphs (other pages keep hints and column guides); Overview now shows summary, "What it means" insight sentence, four key tiles (human sessions, active users, engagement rate, key events), chart, Key events by name, Top pages, Fix first (top findings), a 7/14/30 day table, and everything else under "More detail for the product team". GA4 key events by event name added (new report `event`, 90 day history read once after the update; the property currently has one key event, `start_project_click`). 134 api tests pass.
- Still open for the follow-up call with Raiyan: exact tile list, active users "right now" (GA4 Realtime), plain-word event names, whether to hide friction detail from stakeholders. Note: the 7/14/30 table shows the same human sessions for all spans until Clarity has more stored days.
- Realtime active users built 2026-11-19: GA4 Realtime API (last 30 minutes), cached 60 seconds on the server, endpoint `/dashboard/ga4-realtime`, "Active right now" tile first on the Overview, refreshes every minute while the tab is visible, hides itself if GA4 cannot answer. 137 api tests pass.
