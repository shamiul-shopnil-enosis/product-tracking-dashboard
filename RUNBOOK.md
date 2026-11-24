# Runbook

Everything runs with Docker Compose on one server: `mongo`, `api` (port 4000, local only) and `web` (port 3000). Put a reverse proxy with HTTPS in front of `web` and set `COOKIE_SECURE=true`.

## Daily
Nothing. The nightly jobs (UTC): Clarity 00:05, GA4 03:15, run-log trim 04:30, sync check 06:00.
**The server must be running at 00:05 UTC (06:05 Bangladesh)** or that Clarity day is only recoverable approximately.

## Is it healthy?
- `GET /api/health` (container health): `{"status":"ok","db":"up"}`.
- `GET /api/health/sync` (point an uptime monitor at it): `syncOk:false` means a connected source has not succeeded for 36 hours; the providers list says which and the last error.
- Set `ALERT_WEBHOOK_URL` (Slack or Discord incoming webhook) to get a message at 06:00 UTC when a source is stale.
- Admin → Data sources shows every run and its errors.

## Backups
```bash
scripts/backup.sh                                   # MongoDB, .env + secrets, uploads → ./backups (keeps newest 14)
scripts/restore-mongo.sh backups/mongo-<stamp>.archive.gz   # replaces current data
```
Schedule daily and copy `backups/` off the server (the backup holds the keys; keep it private):
`15 5 * * * /path/to/project/scripts/backup.sh >> /path/to/project/backups/backup.log 2>&1`
Clarity history exists only in our database (Clarity keeps 3 days), so a lost database means lost Clarity history.

## Page speed (PageSpeed Insights)
The Speed page keeps one reading per day for each page in its list, on mobile and desktop, because Google does not keep history.
- **Set up once:** in the Google Cloud project that holds the GA4 service account, enable "PageSpeed Insights API", create an API key restricted to that API, and put it in `.env` as `PAGESPEED_API_KEY`, then `docker compose up -d --force-recreate api`. Without a key Google's shared quota is almost always used up and every test is refused. The key is free (25,000 tests a day; this uses a few dozen).
- **Pages:** an admin adds up to 20 pages on the Speed page. A new page gets its first check straight away, so its history starts that day.
- **Schedule:** daily at 12:00 Bangladesh time (06:00 UTC) unless an admin changes it on the Core Web Vitals page ("Daily check time"). The server looks every 5 minutes and starts the check once that time has passed, once per Bangladesh day, so a failed run does not retry and use up the quota. If the server was off then, it catches up after that time on the next start. "Run the daily check now" (admin) runs it on demand. Editors and admins can test any public page (up to 40 manual results a day).
- **What is stored:** a small summary per test (score, lab times, real-user vitals, Core Web Vitals verdict). Recommendations are kept for the latest test only. Real-user figures are Google's rolling 28-day Chrome data, so they change slowly and are missing for pages with little traffic (the site-wide figure is shown then).
- **The day:** days are Bangladesh days. The scheduled run stands for the day; a manual run counts only if the day has none.

## Common problems
| Symptom | Cause and fix |
|---|---|
| Clarity day missing | Server was off at 00:05 UTC. On restart before 12:00 UTC a catch-up fills it, marked approximate. Otherwise it is a permanent gap. |
| Clarity sync "429" / paused | Its 10 calls per rolling 24 hours are used up. The app waits an hour and retries. Do not run manual probes repeatedly. |
| "No PageSpeed API key" or tests refused (429) | Set `PAGESPEED_API_KEY` (see Page speed). A 429 with a key means the day's quota is used up; it resets daily. |
| GA4 sync fails with auth | Key file missing or service account removed from the GA4 property (needs Viewer). Check `secrets/ga4.json`, then `docker compose up -d --force-recreate api`. |
| "Too many failed attempts" | 5 wrong passwords for one email in 15 minutes. Wait, or restart the api to clear. |
| Someone forgot their password | An admin opens Users and clicks "Reset password link", then sends the link. It works once, for 72 hours. |
| Someone says "session ended" | They signed out on another device, changed their password, were deactivated, or were idle for `SESSION_IDLE_HOURS`. Sign in again. |
| Locked out as the only admin | See "Admin recovery link" below. `ADMIN_EMAIL` / `ADMIN_PASSWORD` only work on an empty database. |

## Admin recovery link
Only if no admin can sign in. This makes a one-time link, valid 72 hours, for an existing admin (replace the email and the address):
```
TOKEN=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')
HASH=$(printf %s "$TOKEN" | shasum -a 256 | cut -d' ' -f1)
docker compose exec mongo mongosh product_tracking --quiet --eval "db.users.updateOne({email:'admin@example.com'},{\$set:{linkTokenHash:'$HASH',linkPurpose:'reset',linkExpiresAt:new Date(Date.now()+72*3600e3)}})"
echo "http://localhost:3000/accept-invite#token=$TOKEN"
```
Open the printed address, choose a new password, and you are signed in. Use `sha256sum` instead of `shasum -a 256` on Linux.

## Rotating secrets
- Clarity token: Clarity → Settings → Data Export → new token → `.env` `CLARITY_API_TOKEN` → recreate api.
- GA4 key: Google Cloud → service account → new key → replace `secrets/ga4.json` → recreate api, delete the old key.
- `JWT_SECRET`: change in `.env` and recreate api; everyone must sign in again.
- Sign-out is real: signing out, changing a password or deactivating someone ends their sessions on every device at once.

## Retention
Metric snapshots (the history) are kept forever. Sync run logs older than `RETENTION_RUN_DAYS` (default 180, minimum 30) are deleted nightly.

## Update
```bash
docker compose build && docker compose up -d
```

## Connections and other sites
Admins can set the site name, the Clarity token, the GA4 property and key file, and the PageSpeed key under **Data sources, Connections**, with no `.env` edit or restart. Keys saved there are stored encrypted in MongoDB (AES-256-GCM, key from `SETTINGS_SECRET`, or `JWT_SECRET` if that is empty) and can be replaced but never read back. A saved value wins over `.env`; "Remove saved ..." goes back to `.env`.
- Do not change `SETTINGS_SECRET` or `JWT_SECRET` casually: saved keys become unreadable and are ignored (the log says so) until saved again.
- One dashboard shows one site. To show another site (for example Enosis Solutions), change the name and replace the Clarity token, the GA4 property and its key file. History already stored stays in the database, so use a separate install or database for a second site. The logo image is part of the app and is not set from the screen.

## Google Analytics cards
The Google Analytics page lists every GA4 number the dashboard can work out (about 120 cards in sections: Visitors, Engagement, Traffic sources, Events, Pages, Audience, Search), with a search box. Each card has a + to add it to a person's Overview.
- Besides the daily totals, channel, landing page, key event, organic and audience reports, the GA4 sync now also reads: every event by name (`events_all`), page views per page (`pages_views`), new vs returning users (`visitor_type`), scrolled users and 7/28-day active users (`reach`), source / medium (`source_medium`) and outbound link clicks (`links`, from the custom `link_url` dimension).
- A report with no stored days is read for the last 90 days on the next start, so a new report fills in by itself within a few minutes. Cards for a channel, event, page or site appear for the busiest values in the chosen dates; a card a person added stays available even if it is not among the busiest.
- Not available from this GA4 property: ecommerce and revenue (all zero), age and gender (no data), Search Console figures (not linked).

## Clarity recording links
The Friction and Pages tables have a Recordings column. "Open" opens the project's recordings in Clarity filtered to visits of exactly that page, in Clarity's own address format (built in `apps/web/src/lib/clarity.ts`):
`https://clarity.microsoft.com/projects/view/<project ID>/impressions?date=Last 14 days&URL=2;4;<page address>`
where `URL=2;4;` is Clarity's "Visited URL is exactly" filter. The date window runs back to the first day of the chosen range (at most 30 days, as Clarity keeps recordings for 30 days). Clarity's data feed gives no recording IDs, so this filtered list is the closest possible link.
- The project ID is set under Data sources, Connections, "Clarity recordings" (paste the ID or any Clarity address that holds it). It is not a secret, so every signed-in person can use the links.
- If Clarity changes its address format, change `recordingsUrl` in `apps/web/src/lib/clarity.ts`.
