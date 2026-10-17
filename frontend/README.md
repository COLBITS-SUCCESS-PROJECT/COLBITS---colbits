# COLBITS Frontend

> Visualization, alerting and intelligent time-series query platform for IoT electrical networks

Real-time web app for monitoring medium-voltage electrical networks (fuses and transformers) — built with Vite, React 19 and TypeScript.

**Course:** GDSD 2026/27 · **Client:** Colbits SAS (Colombia) · **Frontend team:** Sofia · Monica · Paola

| | |
|---|---|
| 🧭 **How we work** (branches, commits, PRs, reviews) | [CONTRIBUTING.md](./CONTRIBUTING.md) |
| 📐 **Architecture and code rules** | [AGENT.md](./AGENT.md) |
| 📝 **Specs** (features, stories, acceptance tests) | [docs/specs/](./docs/specs/README.md) |
| 🧩 **Components that already exist** (search before creating one) | [src/design-system/README.md](./src/design-system/README.md) |
| 🎨 **Design** | [Figma — COLBITS Mockups v3](https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=4-97) · page 1 = Design System, page 2 = screens |
| 📋 **Backlog** | [Jira — SCRUM board](https://colbits-success.atlassian.net/jira/software/projects/SCRUM/boards/1/backlog) |

> **New to the repo?** 1) Run the app with *Getting started* below → 2) read [CONTRIBUTING.md](./CONTRIBUTING.md) → 3) read [AGENT.md](./AGENT.md). Questions → Sofia.

---

## Table of contents

1. [Getting started](#getting-started)
2. [Environment variables](#environment-variables)
3. [Available scripts](#available-scripts)
4. [Project structure](#project-structure)
5. [What is already built](#what-is-already-built)
6. [Testing](#testing)
7. [Code rules (summary)](#code-rules-summary)
8. [Team](#team)

---

## Getting started

### Option A — Docker (nothing to install)

Requires only [Docker Desktop](https://www.docker.com/products/docker-desktop/) running.

```bash
git clone https://github.com/COLBITS-SUCCESS-PROJECT/COLBITS---colbits.git
cd COLBITS---colbits/frontend
git checkout develop
docker compose up
```

Open `http://localhost:47173`. Saving a file reloads the browser automatically.

| Task | Command |
|---|---|
| Start in the background | `docker compose up -d` |
| See the logs | `docker compose logs -f` |
| Stop | `docker compose down` |
| Run tests / lint inside the container | `docker compose exec frontend pnpm test:run` · `docker compose exec frontend pnpm lint` |
| Reset dependencies (after weird errors) | `docker compose down -v && docker compose up --build` |

- The first start takes ~1 min (downloads the image and dependencies); later starts take a few seconds.
- Environment variables are read from your `.env` if it exists; otherwise safe defaults from `docker-compose.yml` are used.
- **Git hooks and editor autocomplete** (TypeScript, ESLint) still need `pnpm install` on your machine. To only run the app, Docker is enough.

### Option B — Local Node + pnpm

| Tool | Version | Check |
|---|---|---|
| Node.js | 20 LTS | `node -v` |
| pnpm | 9.x | `pnpm -v` (install: `npm install -g pnpm@9`) |
| Git | 2.40+ | `git --version` |

```bash
git clone https://github.com/COLBITS-SUCCESS-PROJECT/COLBITS---colbits.git
cd COLBITS---colbits/frontend
git checkout develop
pnpm install            # also activates the git hooks
cp .env.example .env    # never commit .env
pnpm dev
```

Open `http://localhost:47173`.

> **Git hooks** are activated by `pnpm install` (husky). Every `git commit` then runs ESLint + Prettier on the staged files. If the hook blocks your commit, fix the errors and commit again.

---

## Environment variables

Copy `.env.example` to `.env`. **Never commit `.env`** — it is in `.gitignore`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_BASE_URL` | ✅ | — | Base URL of the COLBITS API Gateway |
| `VITE_APP_ENV` | — | `development` | `development` \| `production` |
| `VITE_ENABLE_MSW` | — | `true` in `.env.example` | Mock API in the browser (MSW, dev only). Keep `true` until the backend services exist; `false` calls the real API |
| `VITE_MAP_TILE_URL` | — | OpenStreetMap | Map tile source (see ADR-0006) |
| `VITE_DEV_MOCK_SESSION` | — | `true` | Dev only: signs in a fake user so you can work without the backend. Set `false` to go through the login page — with the mock API, log in as `admin` / `admin123` or `consulta` / `consulta123` ([SCRUM-61](./docs/specs/auth/SCRUM-61.md)) |

If `VITE_API_BASE_URL` is missing, the app stops at startup with `[COLBITS] Required environment variable not configured: VITE_API_BASE_URL`.

---

## Available scripts

```bash
pnpm dev            # Dev server with hot reload → http://localhost:47173
pnpm build          # Production build → dist/
pnpm preview        # Preview the production build
pnpm typecheck      # TypeScript check
pnpm lint           # ESLint (0 warnings allowed)
pnpm lint:fix       # ESLint with auto-fix
pnpm format         # Prettier check
pnpm format:fix     # Prettier auto-format
pnpm test           # Vitest in watch mode
pnpm test:run       # Vitest single run
pnpm test:coverage  # Tests + coverage report (must stay ≥ 80%)
```

**CI** (GitHub Actions) runs `typecheck`, `lint` and `test:coverage` on every PR. A red CI blocks the merge.

---

## Project structure

```
src/
├── app/                 # Bootstrap: providers, router (routes.ts = typed route catalog)
├── design-system/       # Atomic design — shared UI, zero domain knowledge
│   ├── atoms/           #   Button, Input, Icon, Badge, Logo …
│   ├── molecules/       #   NavItem …
│   └── organisms/       #   NavSidebar …
├── features/            # One folder per product feature (vertical slices)
│   ├── auth/            #   Login
│   └── dashboard/       #   Live Monitoring
├── layouts/             # AppShell (sidebar + page), ComingSoonPage, NotFoundPage
├── services/            # httpClient, queryClient
├── stores/              # Zustand: auth, uiPreferences, toast
├── i18n/locales/        # es-CO (primary) + en
├── config/              # env.ts, feature flags
├── styles/              # Design tokens: primitives → semantic → Tailwind @theme
└── utils/               # Pure functions

docs/
├── specs/               # Feature and story specs + acceptance test results ← start here for any story
├── adr/                 # Architecture Decision Records
├── sdd/                 # Software Design Document
└── GLOSSARY.md          # Domain terms ↔ code names ↔ i18n keys
```

Where does new code go?

| You are building… | Put it in |
|---|---|
| A component used by **one** feature | `src/features/<name>/components/` |
| A component used by **two or more** features | `src/design-system/<atoms\|molecules\|organisms>/` |
| A page for a sidebar section | `src/features/<name>/pages/` + route in `src/app/router/appRoutes.tsx` |
| A spec | `docs/specs/<feature>/` |

Full rules: [AGENT.md §2–§6](./AGENT.md).

---

## What is already built

| Area | Status |
|---|---|
| Design tokens aligned with Figma (colors, Inter font family, `touch-target` utility) | ✅ |
| **15 atoms · 10 molecules · 2 shared organisms** — full list in the [component catalog](./src/design-system/README.md) | ✅ |
| `AppShell` = Figma *App Shell*: navy sidebar (with user) + top bar (title, last update, avatar) | ✅ |
| **Live Monitoring** (`/dashboard`, Figma M1–M3): map toolbar, map with markers & legend, fault panel — with PROVISIONAL sample data | ✅ |
| Docker dev container | ✅ |
| **Login** (`/login`, Figma *Login / Default*): username + password, every page behind login, map after a successful login — SCRUM-61, against the mock API until the backend accepts browser calls | ✅ |
| Node detail, Historical Analysis, Reports, User Management, chatbot | 🔲 see [docs/specs/INDEX.md](./docs/specs/INDEX.md) and Jira SCRUM-128 |

**Adding your page:** sections without a feature show `ComingSoonPage`. In `src/app/router/appRoutes.tsx`, replace `loadComingSoon` for your route with your feature's lazy import — the sidebar is already there.

---

## Testing

Three levels, as required by the GDSD course (full rules: [AGENT.md §12](./AGENT.md)):

| Level | Tool | Where |
|---|---|---|
| **Unit** | Vitest + Testing Library | `X.test.tsx` next to `X.tsx` |
| **Integration** | Vitest + MSW (mocked network) | `X.integration.test.tsx` |
| **Acceptance** | Manual or automated, per acceptance criterion | Results recorded in `docs/specs/<feature>/SCRUM-XX.md` §8 |

Every component covers **happy path + empty state + error state**, following **Arrange – Act – Assert**. No snapshots.

---

## Code rules (summary)

| Rule | |
|---|---|
| No color literals | Use CSS tokens (`bg-action-primary`, `text-text-secondary` …) |
| No visible text in `.tsx` | Use `t('namespace:key')` — UI in Spanish (es-CO) |
| Code, comments, tests and specs | In English |
| No `any` | Explicit types |
| Icons | `<Icon name="..." />` only — never import `lucide-react` directly |
| No cross-feature imports | Shared code goes to `design-system/`, `hooks/` or `utils/` |
| File size | Component 250 lines · page 100 · hook 150 · store 100 |

Full rules with rationale: [AGENT.md §3](./AGENT.md).

---

## Team

| Name | Role | Contact |
|---|---|---|
| Ana Sofia Arango Yanza (Sofia) | Scrum Master · Frontend | anaarangowt@unicauca.edu.co |
| Monica A. Castellanos Mendez | Developer · Frontend | monicacastellanos@unicauca.edu.co |
| Paola Ran | Product Owner · Frontend | paola.ran@utp.ac.pa |
| Yeison Estiven Delgado | Developer · Backend | yeisondelgado@unicauca.edu.co |
| Javier Diaz | Developer · Backend | javier.diaz2@utp.ac.pa |
| Mahmoud FK | Developer · Backend | mahmoudfk1971@gmail.com |

**Supervisors:** Erwin Meza Vega (Colombia) · Leo Hatvani (Sweden)

---

## License

Academic project — GDSD 2026/27, Universidad del Cauca / Mälardalen University.
