# COLBITS Frontend

> Visualization, Alerting, and Intelligent Time-Series Data Query Platform for IoT Electrical Networks

Real-time web dashboard for monitoring electrical IoT networks — built with Vite, React 19, and TypeScript.

**Course:** GDSD 2026/27 | **Client:** Colbits SAS (Colombia)
**Frontend team:** Sofia · Monica · Paola

---

## Table of contents

1. [Prerequisites](#prerequisites)
2. [Getting started](#getting-started)
3. [Environment variables](#environment-variables)
4. [Available scripts](#available-scripts)
5. [Folder structure](#folder-structure)
6. [How to contribute](#how-to-contribute)
7. [Branch and commit conventions](#branch-and-commit-conventions)
8. [Pull request workflow](#pull-request-workflow)
9. [Code quality rules](#code-quality-rules)
10. [Team](#team)

---

## Prerequisites

| Tool | Minimum version | Check |
|---|---|---|
| Node.js | 20 LTS | `node -v` |
| pnpm | 9.x | `pnpm -v` |
| Git | 2.40+ | `git --version` |

Install pnpm if you don't have it:
```bash
npm install -g pnpm
```

> Docker is **not** needed for frontend development — it is handled by the backend team.

---

## Getting started

```bash
# 1. Clone
git clone https://github.com/MonicaBebesita/COLBITS---colbits-frontend.git
cd COLBITS---colbits-frontend

# 2. Install dependencies
pnpm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with the values shared by the team (never commit .env)

# 4. Start the development server
pnpm dev
```

The app will be available at `http://localhost:5173`.

---

## Environment variables

Copy `.env.example` to `.env` and fill in the values. **Never commit `.env`** — it is in `.gitignore`.

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | ✅ | Base URL of the COLBITS API Gateway |
| `VITE_APP_ENV` | ✅ | `development` \| `production` |
| `VITE_ENABLE_MSW` | — | `true` to enable mock API in browser (dev only, not wired yet) |

If a required variable is missing, the app will throw `BackendNotConfiguredError` at startup and tell you which variable is absent.

---

## Available scripts

```bash
pnpm dev           # Start Vite dev server (hot reload)
pnpm build         # Production build → dist/
pnpm preview       # Preview production build locally
pnpm typecheck     # TypeScript type check (no emit)
pnpm lint          # ESLint — run before every PR
pnpm lint:fix      # ESLint with auto-fix
pnpm format        # Prettier check
pnpm format:fix    # Prettier auto-format
pnpm test          # Vitest in watch mode
pnpm test:run      # Vitest single run (CI)
pnpm test:coverage # Coverage report — must stay ≥ 80%
```

Run before opening any PR:
```bash
pnpm typecheck && pnpm lint && pnpm test:run
```

---

## Folder structure

```
src/
├── app/                   # App bootstrap: providers, router, guards
│   ├── providers/
│   └── router/
│       ├── routes.ts      # Typed route catalog — always use ROUTES.x, never raw strings
│       └── guards/
│
├── design-system/         # Atomic Design — zero domain knowledge here
│   ├── atoms/             # Button, Input, Icon, Badge, Spinner, Skeleton …
│   ├── molecules/         # FormField, AlertInline, StatCard, Modal …
│   └── organisms/         # NavSidebar, AppHeader, DataTable …
│
├── features/              # One folder per product feature
│   ├── auth/
│   ├── dashboard/
│   ├── devices/
│   ├── alerts/
│   ├── reports/
│   └── settings/
│       └── specs/         # One subfolder per Jira story (SCRUM-XX/)
│
├── layouts/               # AppShell, AuthLayout, FullscreenLayout
├── services/              # httpClient, queryClient, websocketClient
├── stores/                # Zustand: auth, uiPreferences, unsavedChanges, toast
├── hooks/                 # Shared hooks (used by ≥ 2 features)
├── utils/                 # Pure functions, no React
├── i18n/locales/          # es-CO (primary) + en (secondary)
├── mocks/handlers/        # MSW API handlers for tests
├── config/
│   ├── env.ts             # Validates env vars at startup
│   └── features.ts        # Feature flags — all false until the story enters the sprint
└── styles/
    ├── primitives.css
    ├── semantic.css
    └── index.css

docs/
├── adr/                   # Architecture Decision Records (immutable once merged)
├── sdd/                   # Software Design Document sections
├── decisions/             # PO answers and decisions outside the backlog
├── GLOSSARY.md            # Domain terms ↔ code names ↔ i18n keys
└── _feature-template/     # Copy this to start a new feature
```

> **Full architecture rules, atomic design layers, naming conventions, and code quality limits are in [`AGENT.md`](./AGENT.md).** Read it before writing any code.

---

## How to contribute

### First time in this repo

1. Read [`AGENT.md`](./AGENT.md) — the contract for all developers and AI sessions.
2. Read the `specs/SCRUM-XX/SPEC.md` inside the feature you are working on.
3. Check the open questions table in `AGENT.md §20` — it may affect your feature.

### Feature flags

Every new feature starts behind a flag in `src/config/features.ts`. The flag is `false` until the Jira story enters the sprint. Don't ship UI that's always hidden behind a flag for more than one sprint.

### Adding a new feature

1. Copy `docs/_feature-template/` to `src/features/<name>/`
2. Create `specs/SCRUM-XX/SPEC.md` for the story you are working on
3. Only create the subfolders the current story needs — an empty folder is technical debt
4. Fill in `SPEC.md` before writing any code

### Adding a new component

- **Atom / Molecule / Organism for one feature** → `src/features/<name>/components/`
- **Shared by ≥ 2 features** → `src/design-system/<layer>/`
- Check that the component doesn't already exist before creating it

---

## Branch and commit conventions

### Branch naming

```
SCRUM-<number>-<short-description-in-kebab-case>
```

Examples:
```
SCRUM-42-add-sensor-chart
SCRUM-17-login-page
SCRUM-88-alert-feed-component
```

- Always branch from `develop`
- Keep branches short-lived (1–3 days)
- Rebase on `develop` before opening a PR: `git rebase develop`

### Commit messages — Conventional Commits

```
<type>(<scope>): <short description in imperative>
```

| Type | When to use |
|---|---|
| `feat` | New feature or component |
| `fix` | Bug fix |
| `test` | Adding or updating tests |
| `docs` | Documentation changes |
| `refactor` | Code restructuring, no behavior change |
| `style` | Formatting, no logic change |
| `build` | Build config, dependencies |
| `chore` | Maintenance tasks |

Examples:
```
feat(dashboard): add SensorChart component
fix(auth): correct redirect after logout
test(devices): add empty state test for DeviceTable
docs(agent): update open questions table
refactor(alerts): extract threshold logic to utility
```

No Jira ticket in the commit body — it's already in the branch name and PR title.

---

## Pull request workflow

### PR title format

```
SCRUM-<n> | type(scope): result
```

Append ` [AI-ASSISTED]` if any AI tool generated significant code:
```
SCRUM-42 | feat(dashboard): add SensorChart component [AI-ASSISTED]
```

### PR checklist — verify before requesting review

- [ ] Branch name follows `SCRUM-<n>-<description>` format
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes (no new warnings)
- [ ] `pnpm test:coverage` passes (≥ 80%)
- [ ] No `console.log`, no `TODO` without a Jira ticket
- [ ] No hardcoded color literals, no visible text strings in `.tsx` files
- [ ] `specs/SCRUM-XX/SPEC.md` updated if the PR changes feature behavior
- [ ] SDD section updated if the PR adds/changes an API endpoint or domain model
- [ ] At least one other frontend teammate has reviewed the code
- [ ] CI pipeline is green (GitHub Actions)

### Branch protection

`main` and `develop` are protected. All changes go through PRs — no direct pushes.

Target of all PRs: **`develop`**
`develop` → `main` happens only at release milestones.

---

## Code quality rules (summary)

Full rules with rationale are in [`AGENT.md §3`](./AGENT.md).

| Rule | Limit |
|---|---|
| Component file (`.tsx`) | Max 250 lines |
| Hook file (`.ts`) | Max 150 lines |
| Page file (`.tsx`) | Max 100 lines |
| Store file (`.ts`) | Max 100 lines |
| One file, one responsibility | Always |
| No dead/commented code | Always |
| No color literals | Use CSS tokens only |
| No visible strings in `.tsx` | Use `t('namespace:key')` — en español |
| No `any` type | Use explicit types |
| No direct `lucide-react` imports | Use `<Icon name="..." />` |
| No cross-feature imports | Shared code goes to `design-system/` or `hooks/` |

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
