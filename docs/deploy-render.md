# Deploy to Render (public link)

The whole stack runs on [Render](https://render.com) free plan, from [`render.yaml`](../render.yaml), in two environments that share one database server:

| Environment | Branch | Frontend (link to share) | Backend | Database |
|---|---|---|---|---|
| **Production**: course deliveries (Alpha, Beta, Final) | `main` | `https://colbits-web.onrender.com` | `https://colbits-api.onrender.com` | `colbits` |
| **Staging**: the team tries its changes | `develop` | `https://colbits-web-dev.onrender.com` | `https://colbits-api-dev.onrender.com` | `colbits_dev` |

- **Production** only changes with a release (`develop → main`, see `CONTRIBUTING.md`), so a delivery stays exactly as it was until it is presented.
- **Staging** redeploys with every merge into `develop`. It has its own database, so it never touches production data.
- The free plan allows one database server: staging's database lives inside it and is created automatically on its first start.
- The Blueprint reads `render.yaml` from `main`, so a change to `render.yaml` (for example, a new service) only takes effect after the next release.

## The database prepares itself
Before the API starts, [`backend/scripts/prepare-db.mjs`](../backend/scripts/prepare-db.mjs) runs:

1. **Empty database** → runs `backend/database/01`, `02` and `03` (tables, sample rows and the test users), the same files Docker runs locally.
2. **Data older than `DATA_REFRESH_HOURS`** (1 h) → runs the generator ending "now", so the map does not turn gray just because the data is old.

The free backend sleeps after 15 minutes without visits and starts again on the next visit, so **anyone who opens the link gets fresh data**, with no manual steps. Test users: see the root `README.md`.

## Free plan limits
- **The first visit after a pause takes about 1 minute** (the backend wakes up and refreshes the data). Open the link a few minutes before a demo.
- **The free database expires** 30 days after it is created (Render sends an email before). Create a new one and redeploy: the backend fills it again by itself.

## Create the services (once)
1. Sign in to Render with the GitHub account that has access to `COLBITS-SUCCESS-PROJECT/COLBITS---colbits`.
2. **New → Blueprint**, pick the repository and the `main` branch. Render reads `render.yaml`.
3. Render asks for four values (two per environment). The URLs are `https://<service-name>.onrender.com`; if a name is taken, Render adds a suffix, so check the real URL on each service page and correct the value afterwards if needed:
   - `CORS_ORIGIN` (backend) = the frontend URL, e.g. `https://colbits-web.onrender.com`
   - `VITE_API_BASE_URL` (frontend) = the backend URL, e.g. `https://colbits-api.onrender.com`
   - Staging: the same two with the `-dev` URLs (`colbits-api-dev`, `colbits-web-dev`)
4. **Apply.** The first deploy takes about 5–10 minutes.

If you change `VITE_API_BASE_URL` later, run **Manual Deploy** on `colbits-web`: Vite writes it into the build.

## Check
1. Open the frontend URL → login page.
2. Log in as `admin@colbits.com` → 50 nodes on the map. Log out and log in as `client@colbits.com` → 10 nodes.
3. If something looks wrong, the `colbits-api` **Logs** show the `[prepare-db]` lines of the last start.

## Demo scenarios (staging only)
The scenario panel (US31) writes synthetic telemetry, so the backend refuses every scenario (`POST /scenarios` answers 403 and writes nothing) unless all three hold, and `GET /scenarios` reports `enabled: false` otherwise:

| Condition | Where it comes from |
|---|---|
| `DEMO_SCENARIOS_ENABLED=true` | `render.yaml`: `true` on `colbits-api-dev`, `false` on production |
| `DEMO_SCENARIOS_DATABASE` names the database the API is connected to (`current_database()`) | `render.yaml`: `colbits_dev` on `colbits-api-dev`; **not set** on production |
| A row in `public.synthetic_dataset` naming that same database | Written only by the synthetic loaders: `backend/database/02_dummy_inserts.sql` on an empty database, and the generator on every successful data refresh. A failed refresh leaves no marker. |

- The inactivity scenarios (`SILENCE_FALCON` / `SILENCE_SMAC`) also record each silence in `public.demo_silenced_devices`, which the same synthetic loaders create (empty) and the generator empties on every run. Until that table exists, SILENCE is refused and nothing is written.
- **Before relying on it (prerequisite):** confirm on Render that the staging database is really called `colbits_dev` (the `DB_NAME` of `colbits-api-dev`, or `SELECT current_database();` in a shell on it). If it differs, `DEMO_SCENARIOS_DATABASE` must be changed to match.
- `render.yaml` is read from `main`, so the new setting reaches staging only after a release, or if it is added by hand on the service. Until then, and until the generator has refreshed the data once, staging refuses scenarios: the safe default.
- What it does not do: it does not prove that a database holds only synthetic data. Someone who inserts the marker by hand, or restores real data into a marked database, defeats it. Real data always goes into a new database. The platform's database account is not read-only (NF-03); that is outside SCRUM-253.

## Run the preparation locally
Same script against any database (with `MAINTENANCE_DB_NAME` set to an existing database, it also creates `DB_NAME` when missing): `cd backend && node scripts/prepare-db.mjs` with `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` and `DB_NAME` set (`npm ci --prefix ../generator` first). `PREPARE_DB=false` skips it.
