# Deploy to Render (public link)

The whole stack runs on [Render](https://render.com) free plan, from [`render.yaml`](../render.yaml):

| Render service | What | URL (example) |
|---|---|---|
| `colbits-db` | PostgreSQL 15 | internal only |
| `colbits-api` | NestJS backend | `https://colbits-api.onrender.com` |
| `colbits-web` | React frontend (the link to share) | `https://colbits-web.onrender.com` |

Every push to `develop` redeploys the backend and the frontend automatically.

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
2. **New → Blueprint**, pick the repository and the `develop` branch. Render reads `render.yaml`.
3. Render asks for two values. The URLs are `https://<service-name>.onrender.com`; if a name is taken, Render adds a suffix, so check the real URL on each service page and correct the value afterwards if needed:
   - `CORS_ORIGIN` (backend) = the frontend URL, e.g. `https://colbits-web.onrender.com`
   - `VITE_API_BASE_URL` (frontend) = the backend URL, e.g. `https://colbits-api.onrender.com`
4. **Apply.** The first deploy takes about 5–10 minutes.

If you change `VITE_API_BASE_URL` later, run **Manual Deploy** on `colbits-web`: Vite writes it into the build.

## Check
1. Open the frontend URL → login page.
2. Log in as `admin@colbits.com` → 50 nodes on the map. Log out and log in as `client@colbits.com` → 10 nodes.
3. If something looks wrong, the `colbits-api` **Logs** show the `[prepare-db]` lines of the last start.

## Run the preparation locally
Same script against any database: `cd backend && node scripts/prepare-db.mjs` with `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` and `DB_NAME` set (`npm ci --prefix ../generator` first). `PREPARE_DB=false` skips it.
