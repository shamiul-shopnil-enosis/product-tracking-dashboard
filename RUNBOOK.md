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

## Common problems
| Symptom | Cause and fix |
|---|---|
| Clarity day missing | Server was off at 00:05 UTC. On restart before 12:00 UTC a catch-up fills it, marked approximate. Otherwise it is a permanent gap. |
| Clarity sync "429" / paused | Its 10 calls per rolling 24 hours are used up. The app waits an hour and retries. Do not run manual probes repeatedly. |
| GA4 sync fails with auth | Key file missing or service account removed from the GA4 property (needs Viewer). Check `secrets/ga4.json`, then `docker compose up -d --force-recreate api`. |
| "Too many failed sign-in attempts" | 5 wrong passwords for one email in 15 minutes. Wait, or restart the api to clear. |
| Locked out as admin | Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env` only works on an empty database; reset the password by an admin user, or via mongosh on the `users` collection (bcrypt hash). |

## Rotating secrets
- Clarity token: Clarity → Settings → Data Export → new token → `.env` `CLARITY_API_TOKEN` → recreate api.
- GA4 key: Google Cloud → service account → new key → replace `secrets/ga4.json` → recreate api, delete the old key.
- `JWT_SECRET`: change in `.env` and recreate api; everyone must sign in again.

## Retention
Metric snapshots (the history) are kept forever. Sync run logs older than `RETENTION_RUN_DAYS` (default 180, minimum 30) are deleted nightly.

## Update
```bash
docker compose build && docker compose up -d
```
