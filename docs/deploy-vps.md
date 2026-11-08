# Deploy to Colbits' server (VPS)

Colbits SAS lends us a development server that is always on, so the app does not sleep like on Render.

| What | Value |
|---|---|
| Link to share | `https://dev.colbits.com.co` |
| Server | `developer@79.143.177.225` (SSH key only, port 22) |
| Branch deployed | `develop` |
| Folder on the server | `/home/developer/apps/colbits` (code) · `deploy/` (these files) |

## How it works

```
visitor ──HTTPS──▶ Caddy (Colbits) ──▶ app1:80 (nginx, frontend) ──/api──▶ backend:3000 ──▶ db:5432
```

- **Caddy** belongs to Colbits. It handles HTTPS and forwards `dev.colbits.com.co` to the container named `app1`, port 80, on the Docker network `proxy`. We do not touch it.
- **app1** serves the built frontend and passes every `/api/…` request to the backend.
- **backend** and **db** are only on our own Docker network: they are never exposed to the Internet.
- Files: [`deploy/docker-compose.yml`](../deploy/docker-compose.yml), [`deploy/Dockerfile.web`](../deploy/Dockerfile.web), [`deploy/Dockerfile.backend`](../deploy/Dockerfile.backend), [`deploy/nginx.conf`](../deploy/nginx.conf).

## Connect

Your public key must be added to the server by Colbits first (share only the `.pub` file).

```bash
ssh -i ~/.ssh/your_private_key developer@79.143.177.225
```

On Windows, if `ssh` is not found, use `C:\Windows\System32\OpenSSH\ssh.exe`. Type the key passphrase right away: the server closes the connection if you wait too long.

## First deploy (once)

```bash
cd /home/developer/apps
git clone -b develop https://github.com/COLBITS-SUCCESS-PROJECT/COLBITS---colbits.git colbits
cd colbits/deploy
cp .env.example .env
nano .env                      # fill DB_PASSWORD and JWT_SECRET (openssl rand -hex 32)
chmod 600 .env
docker compose up -d --build   # 5–10 minutes the first time
```

`deploy/.env` holds the secrets: it stays on the server and is never committed or shared.

## Update after a merge into `develop`

```bash
cd /home/developer/apps/colbits
git pull
cd deploy
docker compose up -d --build
```

Wait about a minute after it finishes: the backend loads the data before it answers, so the login fails until then. The database is kept between updates.

## Check

```bash
cd /home/developer/apps/colbits/deploy
docker compose ps                      # app1, colbits-backend and colbits-db must be "Up"
docker compose logs --tail=40 backend  # must end with "Nest application successfully started"
```

Then open `https://dev.colbits.com.co` and log in with a test user (root `README.md`).

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "No pudimos conectar con el servidor" on login | The backend is still starting (wait a minute) or the browser has an old version cached (Ctrl + Shift + R). |
| Every node is gray | The test data is only refreshed when the backend starts. Run `docker compose restart backend`. |
| The link does not open at all | Check DNS from the server: `getent hosts dev.colbits.com.co` must show `79.143.177.225`. If not, ask Colbits. |
| A container is not "Up" | `docker compose logs --tail=80 <service>` shows the error. |

Do not run `docker compose down -v`: `-v` deletes the database volume.

## Pending
- **Test passwords:** the test users have known passwords that are written in this public repo. Change them before sharing the link outside the team.
- **Data refresh:** unlike Render, this server never sleeps, so the data is not refreshed by itself and the map turns gray after some hours.
