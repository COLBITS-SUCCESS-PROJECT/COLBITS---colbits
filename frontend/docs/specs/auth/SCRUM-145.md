---
feature: auth
story: SCRUM-145
title: '[F-02] Send the token with every API request and return to the login page when the API answers 401'
status: IN_REVIEW
owner: Sofia
last_updated: 2026-10-17
---

# SCRUM-145 — [F-02] Token on every request, login again on 401

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-145>
Parent story: **US2 — Authentication & JWT** ([SCRUM-61](https://colbits-success.atlassian.net/browse/SCRUM-61))
Feature: [FEATURE.md](./FEATURE.md)

## 1. User story
> As **Colbits**, I want **every API service to require a token** so that **nobody reaches the data without an account**.

**F-02:** *If a request to any API service does not carry a valid access token, then the system shall reject it without returning data.*
**SRS acceptance criterion:** *Given any API endpoint, when a request arrives without a token or with an expired or altered one, then the system rejects it and returns no data.*

The API enforces F-02 (backend `AuthGuard`). The frontend part: send the token on every call, and when the API rejects it, end the session instead of showing an error with stale data.

## 2. Acceptance criteria

| ID | Criterion (Given / When / Then) | Test type | Test |
|---|---|---|---|
| AC1 | **Given** a signed-in user, **when** the app calls any API service, **then** the request carries `Authorization: Bearer <token>`; without a session it carries none | Automated | `httpClient.test.ts`, `session.acceptance.test.tsx` |
| AC2 | **Given** a signed-in user, **when** the API answers 401 (token missing, expired, altered or logged out), **then** the session is cleared and the login page **replaces** the current page | Automated | `httpClient.test.ts`, `session.acceptance.test.tsx` |
| AC3 | **Given** the session ended that way, **when** the login page opens, **then** it says the session ended | Automated | `LoginPage.integration.test.tsx`, `session.acceptance.test.tsx` |
| AC4 | **Given** the API, **when** a protected endpoint gets no token or an altered one, **then** it answers 401 without data | Manual (real API) + automated (backend) | §8, `backend/src/auth/auth.guard.spec.ts` |

## 3. Design (Figma)
No frame for the notice; it uses the info colors of the design system (`feedback-info-*`), like the error message of the form.

## 4. Screens and states

| State | What the user sees |
|---|---|
| Session ended | Login page with *Tu sesión terminó. Inicia sesión de nuevo para continuar.* |
| New attempt fails | Only the login error (the notice hides) |

## 5. User flow
1. Any call goes through `httpClient`, which adds the bearer token.
2. 401 → `clearAuth()` and `window.location.replace('/login?session=expired')`.
3. The reload drops every cached response; `replace` removes the protected page from the history.

## 6. Data and endpoints
All services. The login call passes `skipAuthRedirect: true` (there a 401 means wrong credentials), and so does logout (a 401 means the token was already invalid).

## 7. Open questions

| ID | Question | Owner | Blocking | Answer |
|---|---|---|---|---|
| Q1 | Refresh the token before it expires instead of asking to log in again? | Backend | No | No refresh endpoint yet (FEATURE.md Q2); NF-06 asks for a 15-minute expiry |

## 8. Acceptance test results

| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| 2026-10-17 | AC1 | PASS | Automated (`pnpm test:coverage`) | — |
| 2026-10-17 | AC2 | PASS | Automated | Before: `location.href` kept the protected page in the history → now `replace` |
| 2026-10-17 | AC3 | PASS | Automated | New notice |
| 2026-10-17 | AC4 | PASS | Manual, real API in Docker (AI-assisted run on Sofia's machine) | No token → 401, altered token → 401, valid → 200 |

## 9. Implementation notes
- A full reload is used on purpose: `httpClient` runs outside React, and the reload guarantees no data of the old session stays in memory.
- `LOGIN_PATH` in `httpClient.ts` must stay equal to `ROUTES.login` (services cannot import the router).
