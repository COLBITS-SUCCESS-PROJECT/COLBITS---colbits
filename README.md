# COLBITS

> Smart monitoring platform for electrical IoT networks — Colbits SAS · GDSD 2026/27

| Folder | What it is | Stack | Start here |
|---|---|---|---|
| [`frontend/`](./frontend) | Web app (dashboard, map, alerts) | Vite · React 19 · TypeScript · pnpm | [frontend/README.md](./frontend/README.md) |
| [`backend/`](./backend) | REST API and database | NestJS · TypeORM · PostgreSQL · npm | [backend/README.md](./backend/README.md) |
| [`.github/`](./.github) | CI, PR checks and PR template | GitHub Actions | [CONTRIBUTING.md](./CONTRIBUTING.md) |

**How we work (branches, PR titles, reviews):** [CONTRIBUTING.md](./CONTRIBUTING.md)

## Getting started

```bash
git clone https://github.com/COLBITS-SUCCESS-PROJECT/COLBITS---colbits.git
cd COLBITS---colbits
git checkout develop
```

### Option A — everything with Docker (recommended)

Requires only [Docker Desktop](https://www.docker.com/products/docker-desktop/) running.

```bash
cp .env.example .env      # once; never commit .env
docker compose up
```

| Service | URL |
|---|---|
| Frontend | `http://localhost:47173` |
| Backend | `http://localhost:3000` |
| pgAdmin | `http://localhost:8888` |
| PostgreSQL | `localhost:5432` |

Stop with `docker compose down`. Reset the database (re-runs `backend/database/*.sql`): `docker compose down -v`.

### Option B — each app on your machine

**Frontend** — `http://localhost:47173`

```bash
cd frontend
pnpm install
cp .env.example .env
pnpm dev
```

**Backend** — `http://localhost:3000` (database: PostgreSQL on 5432, pgAdmin on `http://localhost:8888`)

```bash
cd backend
cp .env.example .env
docker compose up -d      # PostgreSQL + pgAdmin, tables created from backend/database/
npm install
npm run start:dev
```

## Branches

| Branch | Purpose | Who merges |
|---|---|---|
| `develop` | Integration branch: every PR goes here | Any teammate, after 1 approval and green `ci-ok` + `pr-standards` |
| `main` | Course deliveries only (Alpha, Beta, Final), tagged `v0.x.0` | PR from `develop`, 1 approval |

## Team

Frontend: Sofia (Scrum Master) · Paola (Product Owner) · Monica — Backend: Yeison · Javier · Mahmoud
