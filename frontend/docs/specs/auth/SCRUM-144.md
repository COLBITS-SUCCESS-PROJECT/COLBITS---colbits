---
feature: auth
story: SCRUM-144
title: '[F-01] Connect the login view to the API: call the login endpoint and store the token and role'
status: IN_REVIEW
owner: Sofia
last_updated: 2026-10-17
---

# SCRUM-144 — [F-01] Connect the login view to the API

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-144>
Parent story: **US2 — Authentication & JWT** ([SCRUM-61](https://colbits-success.atlassian.net/browse/SCRUM-61), F-01, F-02, F-03)
Feature: [FEATURE.md](./FEATURE.md) · Login view and guards: [SCRUM-61.md](./SCRUM-61.md)

## 1. User story
> As **Colbits**, I want **users to log in with username and password under one of the two roles** so that **nobody reaches the data without an account**.

**F-01:** *When a user submits a valid username and password, the system shall authenticate the user and issue an access token.*
**SRS acceptance criterion:** *Given an active account, when the user logs in with the correct username and password, then the system authenticates the user and issues an access token.*

This task connects the login view (built in SCRUM-61) to the **real** backend and makes the backend reachable from the browser.

## 2. Acceptance criteria

| ID | Criterion (Given / When / Then) | Test type | Test |
|---|---|---|---|
| AC1 | **Given** an active account, **when** the user logs in with the correct username and password, **then** the API issues a token, the app stores the token and the role, and opens the map | Automated + manual (real API) | `src/app/router/session.acceptance.test.tsx` · §8 |
| AC2 | **Given** a wrong password, an unknown user or missing fields, **when** the user logs in, **then** no token is issued and the page says the credentials are invalid | Automated + manual (real API) | `session.acceptance.test.tsx`, `backend/src/auth/auth.service.spec.ts` · §8 |
| AC3 | **Given** a deactivated account, **when** it logs in with the right password, **then** it is rejected like a wrong password | Automated + manual (real API) | `auth.service.spec.ts` · §8 |
| AC4 | **Given** the frontend origin, **when** it calls the API, **then** the API accepts it (CORS); other origins get no CORS headers | Manual (real API) | §8 |
| AC5 | **Given** each seed account, **when** it logs in, **then** the role is mapped: `Colbits administrator` → Administrador, `consultation user` → read-only | Automated + manual | `auth.mapper.test.ts`, `LoginPage.integration.test.tsx` · §8 |

## 3. Design (Figma)
No new screen: the login view of SCRUM-61 (*Login / Default*, node `8-100`).

## 4. Screens and states
Same states as SCRUM-61 (submitting, invalid credentials, server unreachable, server error).

## 5. User flow
1. The user enters username and password and presses **Ingresar**.
2. The app calls `POST /auth/login` on `VITE_API_BASE_URL`.
3. 200 → the app reads `sub`, `username` and `role` from the token, stores token + role in `auth.store` and opens `/dashboard`.
4. 401 → the page shows *Usuario o contraseña incorrectos*.

## 6. Data and endpoints

| Method | Path | Body | Answer |
|---|---|---|---|
| POST | `/auth/login` | `{ username, password }` | 200 `{ access_token }` (JWT, 15 min) · 401 `Invalid credentials` |

**Test accounts** (backend seed `backend/database/03_security_schema.sql`, same in the mock API):

| Username | Password | Role |
|---|---|---|
| `admin@colbits.com` | `adminpassword` | Colbits administrator |
| `client@colbits.com` | `adminpassword` | consultation user (scope: node `0000100001`) |

## 7. Open questions

| ID | Question | Owner | Blocking | Answer |
|---|---|---|---|---|
| Q1 | The API rejected browser calls (no CORS) — SCRUM-61 Q2 | Sofia | Was blocking | Solved here: `CORS_ORIGIN` in `backend/src/main.ts` |
| Q2 | `users` and `token_blacklist` tables missing — SCRUM-61 Q3 | Backend | Was blocking | Solved by the backend in `03_security_schema.sql` |
| Q3 | The map calls `/api/v1/nodes`; the backend serves `/nodes` with another shape | Sofia / backend | No (not this task) | OPEN — follow-up of SCRUM-77 |

## 8. Acceptance test results

| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| 2026-10-17 | AC1 | PASS | Automated (`pnpm test:coverage`) + manual, real API in Docker (AI-assisted run on Sofia's machine) | Login → `POST /auth/login` 200 → map opens |
| 2026-10-17 | AC2 | PASS | Automated + manual, real API | Wrong password and missing username → 401 *Invalid credentials* (missing username used to give 500) |
| 2026-10-17 | AC3 | PASS | Automated + manual, real API (account set to `is_active = false`) | Backend did not check `is_active`: fixed in `auth.service.ts` |
| 2026-10-17 | AC4 | PASS | Manual, real API | `Access-Control-Allow-Origin: http://localhost:47173`; no CORS headers for other origins |
| 2026-10-17 | AC5 | PASS | Automated + manual, real API | Token roles: `Colbits administrator`, `consultation user` |

**Limit of this evidence:** after login the map shows *No se pudieron cargar los nodos* against the real API because of Q3 (path and shape of the node service). The login itself is complete.

## 9. Implementation notes
- **Backend changes in this PR** (needed to connect the real API): CORS and port from `.env`; JWT secret from `JWT_SECRET` instead of the code; login rejects inactive accounts and missing or non-string fields before querying the database; real unit tests for `AuthService`, `AuthGuard`, `RolesGuard`, `DeviceService`.
- The mock API (MSW) now has the same users and passwords as the backend seed, so the same login works in both modes.
- The token stays in memory (`auth.store`), not in `localStorage`: a reload asks to log in again (PO decision, SCRUM-61 Q4) and no script can read it from storage.
