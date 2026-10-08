# COLBITS Frontend — Agent Guide

> **This file is the single source of truth for every AI session and every developer working on this frontend.**
> Read §0 to §4 before touching any code. Read the feature and story specs in `docs/specs/<feature>/` before touching that feature.

---

## §0 Purpose and scope

This document governs the COLBITS frontend: a React SPA that displays real-time IoT sensor data for electrical networks. It is read by both human developers and AI coding assistants in every session. Follow every rule here without exception; open a discussion in the team channel before proposing a change.

**What this frontend does:**
- Real-time monitoring dashboard for electrical network sensors
- Device and network management
- Alert / alarm management with configurable thresholds
- Historical data visualization and reports
- User authentication and role-based access

**What it does NOT do:**
- No business logic (lives in the backend)
- No direct device communication (through API only)
- No LLM calls (backend concern)

**Frontend team:** Sofia (SM/FE) · Monica (FE) · Paola (PO/FE)

---

## §1 Tech stack

| Concern | Tool | Version |
|---|---|---|
| Bundler + dev server | Vite | ^6.x |
| UI framework | React | ^19.x |
| Language | TypeScript | ^5.x (strict mode) |
| Styling | Tailwind CSS v4 + CSS tokens | ^4.x |
| Server state | TanStack Query | ^5.x |
| Client state | Zustand | ^5.x |
| Form validation | Zod | ^3.x |
| i18n | i18next + react-i18next | ^24.x |
| Charts | Recharts | ^2.x |
| HTTP | Custom fetch wrapper (`httpClient.ts`) | — |
| Testing | Vitest + Testing Library + MSW | latest |
| Package manager | pnpm | ^9.x |
| Linter | ESLint (flat config) + eslint-plugin-boundaries | latest |
| Formatter | Prettier | latest |

**No axios.** See `docs/adr/ADR-0003.md`.
**No tailwind.config.js.** Tailwind v4 uses `@theme` blocks in CSS. See §9.
**Recharts only** for data visualization — do not add a second chart library.

---

## §2 Folder structure

```
frontend/
├── src/
│   ├── app/                     # Bootstrap and cross-cutting concerns
│   │   ├── providers/           # QueryClientProvider, I18nextProvider, AuthProvider
│   │   └── router/
│   │       ├── index.tsx        # RouterProvider
│   │       ├── routes.ts        # ROUTES and ROUTE_PATTERNS constants (typed catalog)
│   │       └── guards/          # RequireAuth, RedirectIfAuthenticated, RequireRole
│   │
│   ├── design-system/           # Atomic design — zero domain knowledge here
│   │   ├── atoms/               # §4.1 — primitive UI building blocks
│   │   ├── molecules/           # §4.2 — composed from atoms
│   │   ├── organisms/           # §4.3 — complex sections, no API calls
│   │   └── tokens/              # Design token definitions (CSS vars, Tailwind @theme)
│   │
│   ├── features/                # Vertical slices — one per product feature (Figma sections)
│   │   ├── auth/                #   Login
│   │   ├── dashboard/           #   Live Monitoring (map, faults, node detail)
│   │   ├── analysis/            #   Historical Analysis (charts, rankings)
│   │   ├── reports/             #   Reports (XLSX / CSV / PDF export)
│   │   ├── users/               #   User Management (admin)
│   │   └── chatbot/             #   Floating assistant
│   │
│   ├── layouts/                 # Page shell layouts (AppShell, AuthLayout, FullscreenLayout)
│   ├── services/                # httpClient, queryClient, websocketClient
│   ├── stores/                  # Zustand stores (auth, uiPreferences, unsavedChanges)
│   ├── hooks/                   # Shared hooks (used by ≥2 features)
│   ├── utils/                   # Pure functions, no React, no API
│   ├── i18n/                    # Locale files and i18n config
│   │   └── locales/
│   │       ├── es-CO/           # Primary language — source of all copy
│   │       └── en/              # Secondary — translation, not editorially reviewed
│   ├── mocks/                   # MSW handlers for tests
│   │   └── handlers/
│   ├── config/
│   │   ├── env.ts               # Validates env vars at import time (app won't start if missing)
│   │   └── features.ts          # Feature flags — all false until the story enters the sprint
│   └── styles/
│       ├── primitives.css       # Raw color/size values
│       ├── semantic.css         # Semantic tokens mapped from primitives
│       └── index.css            # @theme block, global resets
│
├── docs/
│   ├── specs/                   # Feature + story specs, acceptance test results (§6, docs/specs/README.md)
│   │   ├── INDEX.md             # Status of every feature and story
│   │   ├── _templates/          # FEATURE.md and STORY.md templates
│   │   └── <feature>/           # FEATURE.md + one SCRUM-XX.md per story
│   ├── adr/                     # Architecture Decision Records (numbered, immutable)
│   ├── sdd/                     # Software Design Document sections (§13)
│   ├── decisions/               # PO decisions outside the backlog (created with the first one)
│   └── GLOSSARY.md              # Domain term ↔ code name ↔ i18n key ↔ enum
│
├── .github/
│   ├── workflows/ci.yml         # CI: typecheck · lint · tests (§19)
│   └── pull_request_template.md # Pre-filled PR description + checklist
├── Dockerfile, docker-compose.yml  # Optional dev container: `docker compose up` → :5173 (see README)
├── AGENT.md                     # ← you are here
├── CONTRIBUTING.md              # Step-by-step workflow: story → spec → branch → PR → review → merge
└── README.md                    # Setup, scripts, project overview
```

**Hard rules about this structure:**
- `design-system/` has zero imports from `features/`, `stores/`, or `services/`.
- A feature has zero imports from any other feature. Shared code climbs to `design-system/`, `hooks/`, or `utils/`.
- `services/` and `stores/` have zero imports from `i18n/`.
- Only `app/router/routes.ts` may be imported from `app/` — nothing else.
- These boundaries are enforced by `eslint-plugin-boundaries`. A boundary violation = broken build.

---

## §3 Code quality rules

These rules apply to every file in `src/`. No exceptions.

### 3.1 File size

| File type | Hard limit | Action when exceeded |
|---|---|---|
| React component (`.tsx`) | 250 lines | Split into sub-components |
| Hook (`.ts`) | 150 lines | Extract pure logic to utils/ |
| Store (`.ts`) | 100 lines | Split into separate stores |
| Utility (`.ts`) | 200 lines | Split by concern |
| Page (`.tsx`) | 100 lines | Delegate to organisms |

If a file approaches its limit, **split before it exceeds it**. A page that grows past 100 lines is importing too much direct logic.

### 3.2 No dead code

- No unused imports (ESLint enforces this).
- No `TODO` without a Jira ticket number: `// TODO SCRUM-42: description`.
- No `console.log` in committed code.

### 3.3 One file = one responsibility

- One component per `.tsx` file (helper sub-components that live only in that file are the exception, and they count toward the line limit).
- One hook per `.ts` file in `hooks/`.
- Never put a component and a hook in the same file if the hook is reused elsewhere.

### 3.4 TypeScript rules

- `strict: true` — no `any`, no non-null assertions (`!`) without a comment explaining why.
- All props interfaces explicitly typed. No inline object types on function parameters.
- All `useQuery` / `useMutation` return types explicitly annotated when non-obvious.
- TSDoc comment on the first line of **every** file in `src/`:
  ```ts
  /** Brief description of what this file exports or does. */
  ```

### 3.5 No hardcoded values

- No color literals — see §9.
- No visible text strings — see §10.
- No magic numbers — extract to a named constant in the relevant `*.constants.ts`.
- No hardcoded API URLs — use `env.ts`.

---

## §4 Atomic design layers

### 4.1 Atoms — `src/design-system/atoms/`

Primitive, single-purpose UI elements. An atom renders itself and nothing else.

**Rules:**
- No API calls. No business logic. No i18n (`useTranslation` is banned here).
- All text enters through required props — the atom just renders the string it receives.
- Each atom is a single `.tsx` + optional `.test.tsx`. No sub-folders.
- Exports through `src/design-system/atoms/index.ts` (barrel).

**Catalog of what already exists:** [`src/design-system/README.md`](./src/design-system/README.md) — every component with its Figma frame, purpose and props. **Search it before creating a component.**

### 4.2 Molecules — `src/design-system/molecules/`

Compose 2–5 atoms into a named, reusable UI pattern. May have internal state, but no API calls and no domain knowledge.

**Rules:**
- May import only atoms and other molecules (no features, no hooks, no stores).
- All text through props.
- Each molecule has a `<Name>/index.ts` that re-exports the component.

**Catalog of what already exists:** [`src/design-system/README.md`](./src/design-system/README.md) — every component with its Figma frame, purpose and props. **Search it before creating a component.**

### 4.3 Organisms — `src/design-system/organisms/`

Complex, self-contained UI sections. May use hooks for **UI state only** (not API data). Domain-agnostic where possible, but may reference domain types if they are in `model/` of a feature — export the domain-specific ones from the feature, not from design-system/.

**Rules:**
- No API calls directly in organisms inside `design-system/`. Feature-specific organisms that DO call the API live in `src/features/<name>/components/`.
- An organism in `design-system/` is shared by ≥2 features.
- When an organism is first built for one feature and then needed by another, move it to `design-system/organisms/`.

**Shared organisms:** [`src/design-system/README.md`](./src/design-system/README.md) — every component with its Figma frame, purpose and props. **Search it before creating a component.**

**Feature-owned components (stay in `features/`):** listed in §6 of each `docs/specs/<feature>/FEATURE.md`.
Example — `dashboard`: `MapMarker`, `PhaseChips`, `FaultListItem` (molecules) and `MapToolbar`, `MapCanvas`, `MapLegend`, `FaultPanel` (organisms).

**Layouts / templates** (`src/layouts/`): `AppShell` = Figma *Template / App Shell* (navy sidebar + top bar + content slot).

---

## §5 State management

### 5.1 Server state → TanStack Query

All data that comes from or goes to the API is managed by TanStack Query.

```ts
// ✅ correct
const { data: devices } = useQuery({ queryKey: ['devices'], queryFn: fetchDevices })

// ❌ wrong — don't store API responses in Zustand
const { devices } = useDevicesStore()
```

Query key conventions: `['resource']` for collections, `['resource', id]` for one item, `['resource', id, 'sub-resource']` for nested.

Default query config (`src/services/queryClient.ts`):
- `staleTime: 30_000` (30 s)
- `refetchOnWindowFocus: false`
- `retry: 1` (0 for 4xx errors)
- Real-time sensor data uses a shorter `staleTime` or WebSocket subscription — see `docs/adr/ADR-0005.md`

### 5.2 Client state → Zustand

Only state that does not come from the server and does not need to be persisted to the database.

| Store | Persists | Purpose |
|---|---|---|
| `auth.store.ts` | No | `user`, `role`, `isAuthenticated`, `isLoading` |
| `uiPreferences.store.ts` | `localStorage` | Language, theme, sidebar collapsed state |
| `unsavedChanges.store.ts` | No | Boolean: warn before navigation if changes exist |
| `toast.store.ts` | No | Queue of pending toasts |

**Never** store an API response in a Zustand store. If you catch yourself doing this, use TanStack Query instead.

### 5.3 Form state → React Hook Form + Zod

Use `react-hook-form` with a Zod resolver for all forms. The Zod schema is the single definition of form validation — do not duplicate validation logic in the component.

---

## §6 Feature anatomy

Every product feature lives in `src/features/<name>/`. Only create the subfolders the current story needs — an empty folder is technical debt. Its specs live in `docs/specs/<name>/` (see *Specs* below).

```
src/features/<name>/
├── index.ts          # Public surface: exports ONLY the route array
├── routes.tsx        # RouteObject[] for this feature
├── api/
│   ├── <name>.api.ts     # fetch calls — one function per endpoint
│   ├── <name>.dto.ts     # Raw shapes from the backend (mark PROVISIONAL until confirmed with OpenAPI)
│   └── <name>.mapper.ts  # DTO → model transformation. This is the firewall.
├── model/
│   ├── <name>.types.ts   # Domain types used throughout the feature
│   └── <name>.constants.ts
├── schemas/
│   └── <name>.schema.ts  # Zod schemas for forms
├── hooks/
│   └── use<Name>Query.ts  # One file per query or mutation
├── components/           # Feature-specific molecules and organisms
│   └── <ComponentName>/
│       ├── <ComponentName>.tsx
│       └── <ComponentName>.test.tsx
└── pages/
    └── <PageName>.tsx
```

### Build order for a new feature

1. `model/` — domain types from the backlog and customer docs
2. `schemas/` — Zod validation from business rules
3. `components/` — UI with props (use mocked data)
4. `pages/` — wire components into layouts
5. `api/` + `hooks/` — real API integration last

This order prevents the most volatile thing (the API contract) from blocking the least volatile (UI shapes and business rules).

### Specs

All specs live in `docs/specs/` — full guide in [`docs/specs/README.md`](./docs/specs/README.md).

| File | Content |
|---|---|
| `docs/specs/<feature>/FEATURE.md` | Feature overview: purpose, scope, Figma frames, routes, components, open questions, list of stories |
| `docs/specs/<feature>/SCRUM-XX.md` | One Jira story: user story, acceptance criteria, states, data, **acceptance test results** |
| `docs/specs/INDEX.md` | Status of every feature and story |
| `docs/specs/_templates/` | `FEATURE.md` and `STORY.md` to copy |

- Specs are written in **English**.
- Status values: `PLANNED` · `IN_PROGRESS` · `IN_REVIEW` · `DONE`.
- The story spec (acceptance criteria) is written **before** the code.
- If your PR changes behavior described in a spec, the spec update is part of the same PR. No exceptions.

---

## §7 Naming conventions

### Files and folders

| What | Convention | Example |
|---|---|---|
| Component file | PascalCase | `SensorChart.tsx` |
| Hook file | camelCase with `use` prefix | `useSensorQuery.ts` |
| Utility file | camelCase | `formatSensorValue.ts` |
| Type file | camelCase with `.types` suffix | `sensor.types.ts` |
| API file | camelCase with `.api` suffix | `sensor.api.ts` |
| DTO file | camelCase with `.dto` suffix | `sensor.dto.ts` |
| Mapper file | camelCase with `.mapper` suffix | `sensor.mapper.ts` |
| Test file | same name + `.test` | `SensorChart.test.tsx` |
| Schema file | camelCase with `.schema` suffix | `alert.schema.ts` |
| Folder | kebab-case | `professional-profile/` |

### Variables and types

| What | Convention | Example |
|---|---|---|
| React component | PascalCase | `SensorChart` |
| TypeScript interface | PascalCase | `Sensor`, `AlertThreshold` |
| TypeScript enum value | UPPER_SNAKE_CASE | `AlertLevel.CRITICAL` |
| i18n key | camelCase | `devices:status.online` |
| i18n key for domain code | UPPER_SNAKE_CASE | `alerts:level.CRITICAL` |
| CSS token | kebab-case with semantic prefix | `--color-status-critical` |
| Constants | UPPER_SNAKE_CASE | `MAX_CHART_POINTS = 200` |
| Feature flag | UPPER_SNAKE_CASE | `REALTIME_UPDATES` |

### Branch strategy

```
main        ← releases only (Alpha, Beta, Final). No direct commits.
develop     ← integration. Every PR targets develop.
SCRUM-XX-*  ← story branches, created from develop.
```

**Workflow** (step by step in [CONTRIBUTING.md](./CONTRIBUTING.md)):
1. `git checkout develop && git pull origin develop`
2. `git checkout -b SCRUM-61-login-page`
3. Commits → `git pull origin develop` → push → PR to `develop`
4. Green CI + **1 approval** → merge to `develop`
5. At a milestone (Alpha / Beta / Final): PR `develop → main`

**Branch protection (GitHub → Settings → Branches):**
- `main`: require PR + green CI + 1 approval, no direct push
- `develop`: require PR + green CI + 1 approval, no direct push

### Branch prefixes

| Situation | Prefix | Example |
|---|---|---|
| Jira story | `SCRUM-<n>-` | `SCRUM-61-login-page` |
| Tooling / setup without a ticket | `chore/` | `chore/docker-dev` |
| CI or build fix | `ci/` | `ci/fix-coverage-threshold` |
| Documentation only | `docs/` | `docs/specs-structure` |
| Urgent fix | `hotfix/` | `hotfix/login-redirect-loop` |

### Commits and PRs

- Commit: Conventional Commits — `feat(dashboard): add fault list item`. No Jira key in the commit.
- Types: `feat`, `fix`, `test`, `docs`, `refactor`, `style`, `build`, `ci`, `chore`
- PR title: `SCRUM-<n> | type(scope): result` for stories, `type(scope): result` for branches without a ticket. Append ` [AI-ASSISTED]` if AI generated significant code.
- PR description: fill in `.github/pull_request_template.md` (GitHub pre-fills it).

---

## §8 Routing

All routes are defined in a single typed catalog:

```ts
// src/app/router/routes.ts
export const ROUTES = {
  home: '/',
  login: '/login',
  dashboard: '/dashboard',
  analysis: '/analysis',
  reports: '/reports',
  // ...
} as const
```

**Never write a route string by hand** anywhere in the codebase. Always import from `ROUTES`.

Route tree (target — guards arrive with SCRUM-61):
```
├── /                         → redirect to /dashboard
├── RedirectIfAuthenticated    (has session → /dashboard)
│   └── /login                auth
├── RequireAuth                (no session → /login)
│   └── AppShell               navy sidebar + <Outlet />   ← implemented
│       ├── /dashboard        Live Monitoring
│       ├── /analysis         Historical Analysis           (ComingSoonPage for now)
│       ├── /reports          Reports                       (ComingSoonPage for now)
│       └── /users            User Management — RequireRole(ADMIN)
└── *                         NotFoundPage
```

To plug a feature in, replace its `loadComingSoon` entry in `src/app/router/index.tsx` with the feature's lazy import.

---

## §9 Styling and design tokens

**No color literals anywhere.** Not in Tailwind classes, not in inline styles, not in JS.

### Token hierarchy

```
styles/primitives.css    # --color-teal-500: #0d9488
styles/semantic.css      # --color-status-online: var(--color-teal-500)
styles/index.css         # @theme { --color-*: ... }  → Tailwind utility classes
```

### Semantic token naming

```css
/* Status colors (for sensors, devices, alerts) */
--color-status-online      /* device connected */
--color-status-offline     /* device disconnected */
--color-status-warning     /* threshold approaching */
--color-status-critical    /* threshold exceeded */
--color-status-unknown     /* no recent data */

/* Action colors */
--color-action-primary     /* primary buttons, active links */
--color-action-secondary   /* secondary buttons */
--color-action-danger      /* destructive actions */

/* Background */
--color-bg-surface         /* card, panel backgrounds */
--color-bg-page            /* page background */
--color-bg-overlay         /* modal backdrop */

/* Text */
--color-text-primary       /* main content */
--color-text-secondary     /* labels, metadata */
--color-text-muted         /* disabled, placeholder */
--color-text-inverse       /* on dark backgrounds */

/* Border */
--color-border-default
--color-border-subtle
--color-border-focus
```

Use these as Tailwind classes: `bg-[--color-bg-surface]`, `text-[--color-text-primary]`, or register them in `@theme` for `bg-surface`, `text-primary`.

### Icons

Use `<Icon name="..." />` only. Never import directly from `lucide-react` except in `design-system/atoms/iconRegistry.ts` (keys = Figma icon names).

---

## §10 Internationalization

- **Zero visible strings in `.tsx` files.** Every word, placeholder, aria-label, button label, tooltip, and error message goes through `t('namespace:key')`.
- **El idioma del frontend es español.** Toda la UI, etiquetas, mensajes de error y notificaciones deben estar en español (es-CO). El código (nombres de variables, funciones, tipos) va en inglés.
- Primary language: `es-CO`. English (`en`) is secondary and not editorially reviewed.
- `fallbackLng: 'es-CO'` — missing `en` keys fall back gracefully.

### Namespace assignment

| Namespace | Contains |
|---|---|
| `common` | Shared: buttons, errors, dates, pagination |
| `auth` | Login, register, logout |
| `dashboard` | Dashboard titles, chart labels |
| `devices` | Device names, status labels |
| `alerts` | Alert levels, messages, actions |
| `reports` | Report types, export formats |
| `settings` | Settings labels |
| `errors` | API error messages (never show raw `title`/`detail`) |

### Key conventions

```ts
t('devices:status.ONLINE')     // UPPER_SNAKE_CASE for domain codes
t('common:button.save')        // camelCase for UI copy
t('alerts:level.CRITICAL')     // enum codes → labels
```

Dates, numbers, and durations always with `Intl.DateTimeFormat`, `Intl.NumberFormat`, never `.toLocaleDateString()`.

---

## §11 API and data flow

```
Backend JSON → <x>.dto.ts → <x>.mapper.ts → model/ → hooks → components / pages
```

The mapper is the firewall. A field rename in the backend stays in the mapper and never reaches a component.

### httpClient (`src/services/http/httpClient.ts`)

- Attaches `Authorization: Bearer <token>` on every authenticated request
- Sends `Accept-Language` with the active locale
- 10-second timeout
- On 401: clears auth store, redirects to `/login`
- On missing `VITE_API_BASE_URL`: throws `BackendNotConfiguredError` with a clear message

### Error handling

Backend responds with RFC 7807 `ProblemDetail`: `title`, `detail`, `status`, and extension `errors: [{field, message}]`.

- **Never show `title` or `detail` raw to the user.**
- Discriminate by `httpStatus` + `errors[].field` and translate to an i18n key.
- `errorMap.ts` converts the response into `ApiError` with helpers: `isUnauthorized()`, `isConflict()`, `isNotFound()`.

### DTOs

Mark all DTOs with `// PROVISIONAL — pending OpenAPI confirmation` until the backend publishes a versioned OpenAPI spec.

---

## §12 Testing

The course (GDSD) requires three types of testing, all documented in the final report.

- Test file lives beside the source file: `SensorChart.test.tsx` next to `SensorChart.tsx`. No `__tests__` folders.
- Every screen covers: **happy path + error state + empty state**.
- No snapshots. Test observable behavior.
- Minimum 80% coverage (lines, statements, functions, branches). `pnpm test:coverage` fails below this.

### 12.1 Unit tests

Test individual functions or components in isolation. Follow **Arrange – Act – Assert**.

- Cover normal cases, boundary cases, and at least one failing case per function.
- Run automatically with a single command: `pnpm test:run`.
- Must pass in CI.

### 12.2 Integration tests

Test that two or more real components work correctly together. Verify data flows end-to-end.

- Use MSW handlers to mock the network — never hit a real API.
- File naming: `<name>.integration.test.tsx`.
- At least one integration test per feature before that feature is considered done.
- Must be reproducible (same result every run, no flakiness).

Example scope: a feature hook (`useDevicesQuery`) + `httpClient` + the component that renders the data.

### 12.3 Acceptance tests

Verify the feature meets the acceptance criteria defined in its User Story.

- Criteria are written in `docs/specs/<feature>/SCRUM-XX.md` **before** writing any code.
- Each criterion maps to one acceptance test (manual or automated).
- Results (pass / fail) are recorded in section 8 of the story spec after each run.
- Can be manual (documented) or automated with Cypress — decided per story during sprint planning.
- Every failed acceptance test must have a recorded action taken.

### MSW handlers

- One handler file per feature area: `src/mocks/handlers/devices.handlers.ts`
- Register all handlers in `src/mocks/handlers/index.ts`
- For a new endpoint, add a handler before writing the test — never hit a real API in tests.

### Naming

```ts
describe('SensorChart')                       // component name
it('renders the current sensor value')        // behavior in English, present tense
it('renders empty state when there is no data')
it('renders error state when request fails')
```

### What to test in each layer

| Layer | What to test |
|---|---|
| Atom | Renders with all variants; meets a11y requirements (axe) |
| Molecule | Composition correct; user interactions fire correct callbacks |
| Organism | State transitions; empty / error / loading states |
| Hook | Return values for all states (loading, success, error) via MSW |
| Page | Route rendering; guard redirects; full user flow (smoke) |

---

## §13 Software Design Document (SDD)

The SDD lives in `docs/sdd/` and is split into sections. Each section is a separate Markdown file.

```
docs/sdd/
├── 01_overview.md          # System purpose, goals, stakeholders
├── 02_architecture.md      # Frontend architecture, layer diagram, tech choices
├── 03_data_model.md        # Domain types, DTO shapes, API contracts
├── 04_ui_flows.md          # User flows, route transitions, screen states
├── 05_design_tokens.md     # Token catalog with values and usage examples
├── 06_state_management.md  # Store map, Query key catalog, real-time strategy
├── 07_api_integration.md   # Endpoint catalog, auth, error handling patterns
└── 08_testing_strategy.md  # Coverage targets, MSW strategy, E2E scope
```

**Who updates each section:**
- `01`, `02`: Technical lead (Sofia) after major architectural decisions
- `03`: Updated alongside feature DTO files
- `04`: Updated when a new feature spec (`docs/specs/<feature>/FEATURE.md`) is finalized
- `05`: Updated when a new semantic token is added to `semantic.css`
- `06`, `07`: Updated when a new store or endpoint is introduced
- `08`: Updated when coverage targets or test scope changes

The SDD is **not a waterfall document** — it evolves with the code. Each PR that adds a new API endpoint or new domain type must update the relevant SDD section.

---

## §14 Architecture Decision Records (ADRs)

ADRs live in `docs/adr/`. An ADR documents why a structural decision was made. They are **immutable once merged** — to change a decision, write a new ADR that supersedes the old one.

Format: `docs/adr/ADR-XXXX-title-in-kebab-case.md`

```markdown
# ADR-XXXX: Title

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Superseded by ADR-YYYY
**Deciders:** [names]

## Context
What forced this decision.

## Decision
What we decided.

## Consequences
What changes, what gets harder, what gets easier.
```

**Planned ADRs:**
- `ADR-0001`: Use Atomic Design for component organization
- `ADR-0002`: Vite + React 19 + TypeScript over Next.js
- `ADR-0003`: Custom fetch wrapper over axios
- `ADR-0004`: TanStack Query for server state, Zustand for client state
- `ADR-0005`: WebSocket strategy for real-time sensor data

---

## §15 Feature flags

All flags live in `src/config/features.ts`. Every flag is `false` by default and is only flipped to `true` when its corresponding Jira story enters the current sprint.

```ts
export const FEATURES = {
  REALTIME_UPDATES: false,      // SCRUM-XX: live WebSocket sensor data
  ALERT_SOUNDS: false,          // SCRUM-XX: audio alert notifications
  EXPORT_PDF: false,            // SCRUM-XX: PDF report export
  DARK_MODE: false,             // SCRUM-XX: dark theme toggle
} as const
```

Never ship UI behind a flag that's been `true` for more than one sprint without the story being done.

---

## §16 Accessibility checklist

Before marking any story as done, verify:

- [ ] Every interactive element has an accessible name (`aria-label`, `aria-labelledby`, or visible label)
- [ ] Every form error is linked with `aria-describedby`
- [ ] Focus ring is never removed or hidden
- [ ] Minimum 44×44 px touch target for all buttons and interactive elements
- [ ] Color is never the only means of conveying status (always pair with text or icon)
- [ ] Keyboard navigation works for all interactive elements (Tab, Enter, Escape, arrow keys where applicable)
- [ ] All images have meaningful `alt` text (or `alt=""` if decorative)
- [ ] Chart data is accessible in a table or text summary for screen readers

---

## §17 Definition of Done (Frontend)

A frontend story is done when:

1. Code complete, pushed to `develop`, and PR merged
2. TypeCheck passes: `pnpm typecheck`
3. Lint passes: `pnpm lint`
4. Tests pass with ≥80% coverage: `pnpm test:coverage`
5. Happy path, error state, and empty state covered by tests
6. No dead code, no `console.log`, no hardcoded strings or colors
7. Story spec in `docs/specs/` updated (acceptance test results) and `docs/specs/INDEX.md` status set
8. Relevant SDD section updated if API / state / domain model changed
9. Peer-reviewed by at least one other frontend team member
10. Matches the design in Figma (if a mockup exists for the story)
11. Accessibility checklist from §16 completed

---

## §18 Working with AI (Claude Code)

When using Claude Code in this repository:

1. **Always read this file first.** If a session starts fresh, point the AI here: `Read AGENT.md`.
2. **Reference the relevant specs.** Before touching a feature: `Read docs/specs/<name>/FEATURE.md` and the story spec `docs/specs/<name>/SCRUM-XX.md`.
3. **Mark AI-assisted PRs.** Append ` [AI-ASSISTED]` to the PR title.
4. **Verify all generated code against §3.** AI output often introduces: hardcoded colors, missing i18n, `any` types, oversized files, or boundary violations.
5. **Never accept a component that imports from `lucide-react` directly** (use `<Icon name="..." />`).
6. **Never accept a visible string literal** in a `.tsx` file (all text through `t()`).
7. AI generates `TODO SCRUM-?` comments for any behavior it cannot implement yet — these are always resolved before merging.
8. **AI never commits.** Claude Code must not run `git commit` or `git push`. Always stage, review, and commit manually. Each commit is the developer's responsibility.

---

## §19 GitHub Actions — CI

The CI pipeline lives in `.github/workflows/ci.yml` and runs on every push and pull request targeting `main` or `develop`.

### What it enforces

| Step | Command | Fails on |
|---|---|---|
| Type check | `pnpm typecheck` | Any TypeScript error |
| Lint | `pnpm lint` | Any ESLint warning or boundary violation |
| Tests + coverage | `pnpm test:coverage` | Test failure or coverage < 80% |

**A PR cannot be merged if CI is red.** This is the only automated gate — no manual approval from CI is needed once it goes green.

### Adding a new check

1. Add the command to the `quality` job in `ci.yml`
2. Make sure it exits with code `0` on success and non-zero on failure
3. Document it in this table

### Workflow file

See `.github/workflows/ci.yml`. Do not edit it without discussing with the team — a broken CI blocks everyone.

---

## §20 Open questions and known gaps

| ID | Question | Owner | Blocking |
|---|---|---|---|
| OQ-01 | What authentication method does the COLBITS backend use? JWT? Firebase? | Yeison/Javier | Auth feature |
| OQ-02 | Is there a confirmed OpenAPI spec from the backend? | Backend team | All DTOs are PROVISIONAL |
| OQ-03 | Real-time data: WebSocket or polling? | Javier/Mahmoud | Dashboard feature |
| OQ-04 | ~~Figma link for COLBITS UI mockups~~ **Answered:** [COLBITS Mockups v3](https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3) | Paola | — |
| OQ-05 | Supported browsers and minimum screen sizes | Paola/customer | Responsive design |
| OQ-06 | Does the app need offline/low-connectivity support? | Customer | Service Worker decision |

Update this table as answers arrive. Link to the `docs/decisions/` file where each answer was recorded.
