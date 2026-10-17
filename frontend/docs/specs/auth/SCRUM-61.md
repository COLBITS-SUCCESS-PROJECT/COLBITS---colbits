---
feature: auth
story: SCRUM-61
title: '[F-01] Log in with username and password'
status: IN_REVIEW
owner: Paola
last_updated: 2026-10-15
---

# SCRUM-61 — [F-01] Log in with username and password

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-61>
Parent story: **US2 — Login with two roles and token-protected services** (F-01, F-02, F-03)
Feature: [FEATURE.md](./FEATURE.md)

## 1. User story
> As **Colbits**, I want **users to log in with a username and password under one of the two roles, and every API service to require a token**, so that **nobody reaches the data without an account**.

This story covers the **frontend part of F-01**:

| Task | What |
|---|---|
| Login view | Username and password form with an error message for invalid credentials |
| Routing | Protect every page behind login and open the map after a successful login |

**Requirement F-01** (Requirements Specification v1.0, §1.1): *When a user submits a valid username and password, the system shall authenticate the user and issue an access token.*

### Out of scope (other owners / later)
| Requirement | What | Owner |
|---|---|---|
| F-01, F-02, F-03 (API) | `POST /auth/login`, token check on every service, two roles | Backend (Mahmoud) — in the backend repo |
| F-11 (frontend part) | Call `POST /auth/logout` and clear cached data on logout | Sofia — [SCRUM-146](./SCRUM-146.md) |
| NF-05, NF-06 | Account lock after 5 failed logins, 15-minute idle expiry | Backend |
| *Remember session*, *Forgot your password?* | In the Figma mockup but in no requirement | Left out — PO decision 2026-10-14 ([FEATURE.md](./FEATURE.md) Q4) |

## 2. Acceptance criteria

| ID | Criterion (Given / When / Then) | Test type | Test |
|---|---|---|---|
| AC1 | **Given** an active account, **when** the user submits the correct username and password, **then** the session starts and the map (`/dashboard`) opens. *(F-01 acceptance criterion)* | Automated | `features/auth/pages/LoginPage.integration.test.tsx` |
| AC2 | **Given** the login page, **when** the user submits a wrong username or password, **then** a message says the credentials are invalid and the user stays on the login page. | Automated | `features/auth/pages/LoginPage.integration.test.tsx` |
| AC3 | **Given** the login page, **when** the user submits with an empty username or password, **then** each empty field shows its own message and no request is sent. | Automated | `features/auth/components/LoginForm/LoginForm.test.tsx` |
| AC4 | **Given** the server cannot be reached, **when** the user submits the form, **then** a message asks to try again and the user stays on the login page. | Automated | `features/auth/pages/LoginPage.integration.test.tsx` |
| AC5 | **Given** a visitor without a session, **when** they open any page of the app (e.g. `/dashboard`, `/reports`), **then** they are sent to the login page. | Automated | `app/router/appRoutes.test.tsx`, `app/router/guards/RequireAuth.test.tsx` |
| AC6 | **Given** a signed-in user, **when** they open `/login`, **then** they are sent to the map. | Automated | `app/router/guards/RedirectIfAuthenticated.test.tsx` |
| AC7 | **Given** the login page, **when** it is compared with the Figma frame *Login / Default*, **then** layout, colors and texts match — in Spanish, asking for a username, without *Remember session* and *Forgot your password?*. | Manual | Section 8 |

## 3. Design (Figma)

| Frame / component | Link |
|---|---|
| Login / Default | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=8-100> |

Decided differences with the mockup:
- The first field asks for a **username** (the API logs in by username, not email).
- *Remember session* and *Forgot your password?* are left out.
- Inputs and button are 44 px tall (design-system touch target); the mockup draws them at 38 px and 36 px.
- Title 30 px (`text-3xl`) and brand texts 16 px (`text-base`); the mockup uses 28 px and 15 px, which are not in the type scale.
- The form is centred vertically; in the mockup it sits about 50 px higher.

## 4. Screens and states

| State | What the user sees |
|---|---|
| Default | Navy brand panel on the left (logo, tagline, red line, description); on the right the title, subtitle, *Usuario*, *Contraseña* and *Ingresar* |
| Validation error | A message under each empty field, and the field outlined in red |
| Submitting | The button shows a spinner and is disabled |
| Invalid credentials | Red message above the button: *Usuario o contraseña incorrectos* |
| Server unreachable | Red message: *No pudimos conectar con el servidor. Intenta de nuevo.* |
| Other server error | Red message: *No pudimos iniciar sesión. Intenta de nuevo.* |
| Success | The map opens |

There is no empty state: this is a form, not a list.

## 5. User flow
1. The user opens any page of the app without a session → the app sends them to `/login`.
2. The user types the username and password and presses **Ingresar**.
3. The app calls `POST /auth/login`.
4. On success, the app reads the user's name and role from the access token, starts the session and opens the map (`/dashboard`).
5. On failure, the app shows the matching message and keeps what the user typed.

## 6. Data and endpoints (PROVISIONAL)

```ts
// PROVISIONAL — pending OpenAPI confirmation (AGENT.md §20, OQ-02). Matches the backend repo (commit 51f87ea).
interface LoginRequestDto { username: string; password: string }
interface LoginResponseDto { access_token: string } // JWT, expires after 15 minutes
interface AccessTokenPayloadDto { sub: number | string; username: string; role: string; iat?: number; exp?: number }
```

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/login` | 200 `{ access_token }` · 401 when the username or password is wrong |

Roles in the token → frontend roles (`features/auth/api/auth.mapper.ts`):

| Backend `role` | Frontend `role` | Label |
|---|---|---|
| `Colbits administrator` | `ADMIN` | Administrador |
| `consultation user` | `VIEWER` | Consulta |
| anything else | `VIEWER` | Consulta (least privilege) |

**Local development.** The mock API (MSW, `VITE_ENABLE_MSW=true`) answers `POST /auth/login` for the same two users as the backend seed: `admin@colbits.com` / `adminpassword` (whole network) and `client@colbits.com` / `adminpassword` (north scope) — see [SCRUM-144.md](./SCRUM-144.md) §6. To go through the login page, set `VITE_DEV_MOCK_SESSION=false` in your `.env`; with `true` (the default) a fake user is signed in automatically.

## 7. Open questions

| ID | Question | Owner | Blocking | Answer |
|---|---|---|---|---|
| Q1 | Exact role values returned by the API | Backend (Mahmoud) | No | Taken from the backend code: `Colbits administrator`, `consultation user`. Unknown values fall back to `VIEWER` |
| Q2 | The API does not accept calls from the frontend origin yet (CORS) and listens on port 3000 | Backend (Mahmoud) | Yes, to test against the real API | Solved in [SCRUM-144](./SCRUM-144.md) (`CORS_ORIGIN`, `PORT` from `.env`) |
| Q3 | The `users` and `token_blacklist` tables are missing from `create_tables.sql` | Backend (Mahmoud) | Yes, to test against the real API | Solved — `backend/database/03_security_schema.sql` |
| Q4 | Keep the session after a page reload? | Paola (PO) | No | Not for now: the auth store lives in memory (`AGENT.md §5.2`) and the token expires after 15 minutes |

## 8. Acceptance test results
Fill in after testing. Every FAIL needs an action taken.

| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| 2026-10-14 | AC1 | PASS | Automated (local run, `pnpm test:coverage`) | — |
| 2026-10-14 | AC2 | PASS | Automated (local run, `pnpm test:coverage`) | — |
| 2026-10-14 | AC3 | PASS | Automated (local run, `pnpm test:coverage`) | — |
| 2026-10-14 | AC4 | PASS | Automated (local run, `pnpm test:coverage`) | — |
| 2026-10-14 | AC5 | PASS | Automated (local run, `pnpm test:coverage`) | — |
| 2026-10-14 | AC6 | PASS | Automated (local run, `pnpm test:coverage`) | — |
| 2026-10-15 | AC7 | PASS | Paola (manual, against Figma) | Differences in §3 accepted |

**How to run:** `pnpm exec vitest run src/features/auth src/app/router src/layouts/AuthLayout.test.tsx`. The suite also runs in CI on every push.

**Browser check (2026-10-15):** AC1–AC6 also checked by hand in the browser against the mock API (AI-assisted run on Paola's machine).

**Limits of this evidence:** the login service is mocked (MSW) because the real API cannot be called from the browser yet (Q2, Q3). AC1, AC2 and AC4 were re-run against the real API on 2026-10-17 — results in [SCRUM-144.md](./SCRUM-144.md) §8.

## 9. Implementation notes
- `httpClient` sends any 401 to `/login` with a full page reload. The login call passes `skipAuthRedirect: true`, so a wrong password shows the message instead of reloading the page.
- The access token is decoded on the client only to read the name and role; the API still validates it on every request.
- Guards live in `src/app/router/guards/` (`RequireAuth`, `RedirectIfAuthenticated`) and the route tree in `src/app/router/appRoutes.tsx`. `RequireRole` is left for the user-management feature.
- The fake dev session stays (PO decision 2026-10-14): `VITE_DEV_MOCK_SESSION=true` signs in a fake user; set it to `false` to go through the login page.
- New shared pieces: the `FormField` molecule (label + input + error message) and a `size` option on the `Logo` atom. The split screen is `layouts/AuthLayout`.
- Known issue outside this story: `--font-sans` names Inter, but the app never loads the font (no `@font-face`, Google Fonts link or `@fontsource` package). On a computer without Inter installed, every screen shows the system font.
