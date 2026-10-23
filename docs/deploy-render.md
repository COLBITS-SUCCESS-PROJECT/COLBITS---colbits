# Deploy to Render (public link)

The whole stack runs on [Render](https://render.com) free plan, from [`render.yaml`](../render.yaml):

| Render service | What | URL (example) |
|---|---|---|
| `colbits-db` | PostgreSQL 15 | internal only |
| `colbits-api` | NestJS backend | `https://colbits-api.onrender.com` |
| `colbits-web` | React frontend (the link to share) | `https://colbits-web.onrender.com` |

Every push to `develop` redeploys the backend and the frontend automatically.

## Free plan limits
- **The backend sleeps** after 15 minutes without visits. The first request after that takes about 1 minute; open the link a few minutes before a demo.
- **The free database expires** 30 days after it is created (Render sends an email before). To keep it, upgrade it or create a new one and load the data again.
- **Data gets old.** The generated telemetry ends when the generator runs, so after 9 hours every node turns gray (inactive). Run step 4 again before each demo.

## 1. Create the services (once)
1. Sign in to Render with the GitHub account that has access to `COLBITS-SUCCESS-PROJECT/COLBITS---colbits`.
2. **New → Blueprint**, pick the repository and the `develop` branch. Render reads `render.yaml`.
3. Render asks for two values. The URLs are `https://<service-name>.onrender.com`; if a name is taken, Render adds a suffix, so check the real URL on each service page and correct the value afterwards if needed:
   - `CORS_ORIGIN` (backend) = the frontend URL, e.g. `https://colbits-web.onrender.com`
   - `VITE_API_BASE_URL` (frontend) = the backend URL, e.g. `https://colbits-api.onrender.com`
4. **Apply.** The first deploy takes about 5–10 minutes.

If you change `VITE_API_BASE_URL` later, run **Manual Deploy** on `colbits-web`: Vite writes it into the build.

## 2. Get the database URL
On the `colbits-db` page → **Connections** → copy the **External Database URL**. It contains the password: do not commit it or paste it in chats. In PowerShell, from the repo root:

```powershell
$env:RENDER_DB_URL = "<paste the External Database URL here>?sslmode=require"
```

## 3. Create the tables and the users (once)
Docker Desktop must be running.

```powershell
docker run --rm -v "${PWD}/backend/database:/sql" postgres:15 sh -c "psql '$env:RENDER_DB_URL' -f /sql/01_create_tables.sql && psql '$env:RENDER_DB_URL' -f /sql/02_dummy_inserts.sql && psql '$env:RENDER_DB_URL' -f /sql/03_security_schema.sql"
```

This creates the test users `admin@colbits.com` and `client@colbits.com` (password in the root `README.md`).

## 4. Load fresh data (before each demo)

```powershell
cd generator
$end = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"); docker run --rm -v "${PWD}:/gen:ro" node:24-slim sh -c "mkdir /work && cd /gen && tar --exclude=node_modules -cf - . | tar -xf - -C /work && cd /work && npm ci --silent && npm run -s generate -- --db '$env:RENDER_DB_URL' --reset --end $end --silent-devices 6"
```

It must end with `Done in ... s`. Same seed as local development, so the node IDs are the same.

## 5. Check
1. Open the frontend URL → login page.
2. Log in as `admin@colbits.com` → 50 nodes on the map. Log out and log in as `client@colbits.com` → 10 nodes.
