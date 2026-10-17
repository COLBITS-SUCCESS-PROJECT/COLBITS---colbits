---
feature: auth
story: SCRUM-146
title: '[F-11] Logout: call the logout endpoint, delete the token and return to the login page'
status: IN_REVIEW
owner: Sofia
last_updated: 2026-10-17
---

# SCRUM-146 — [F-11] Logout

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-146>
Parent story: **US2 — Authentication & JWT** ([SCRUM-61](https://colbits-success.atlassian.net/browse/SCRUM-61)) · Backend part: SCRUM-147 (done)
Feature: [FEATURE.md](./FEATURE.md)

## 1. User story
> As **a user**, I want **to log out** so that **nobody else can use my session on this computer**.

**F-11:** *When a user selects the logout option, the system shall invalidate the authentication token and return to the login page.*
**SRS acceptance criterion:** after logging out, pressing "back" in the browser shows no data and stays on the login page.

## 2. Acceptance criteria

| ID | Criterion (Given / When / Then) | Test type | Test |
|---|---|---|---|
| AC1 | **Given** a signed-in user, **when** they select **Cerrar sesión**, **then** the app calls `POST /auth/logout` with the token, forgets the token and every cached response, and shows the login page | Automated + manual (real API) | `session.acceptance.test.tsx`, `useLogout.test.tsx`, `AppShell.test.tsx` · §8 |
| AC2 | **Given** the user logged out, **when** they press "back", **then** no data is shown and the login page stays | Automated + manual (real API) | `session.acceptance.test.tsx` · §8 |
| AC3 | **Given** the user logged out, **when** anyone uses the old token, **then** the API rejects it | Automated + manual (real API) | `session.acceptance.test.tsx`, `auth.guard.spec.ts` · §8 |
| AC4 | **Given** the API cannot be reached, **when** the user logs out, **then** the session still closes on this computer | Automated | `useLogout.test.tsx` |

## 3. Design (Figma)
Logout button in the sidebar footer (*Sidebar → User*), already built (`UserSummary` molecule).

## 4. Screens and states

| State | What the user sees |
|---|---|
| Logging out | The button ignores repeated clicks until the call ends |
| Done (or API unreachable) | Login page |

## 5. User flow
1. The user clicks **Cerrar sesión** in the sidebar.
2. `useLogout` calls `POST /auth/logout`; the backend blacklists the token.
3. Whatever the answer: `clearAuth()`, `queryClient.clear()`, freshness reset.
4. `navigate('/login', { replace: true })`. "Back" leads to a protected page, and `RequireAuth` sends it back to login.

## 6. Data and endpoints

| Method | Path | Header | Answer |
|---|---|---|---|
| POST | `/auth/logout` | `Authorization: Bearer <token>` | 200 `{ message }` · 401 if the token is missing or already invalid |

## 7. Open questions

| ID | Question | Owner | Blocking | Answer |
|---|---|---|---|---|
| Q1 | F-11 is `Proposed` and was in no story (FEATURE.md Q5) | Paola (PO) | Was blocking | Added to US2 as SCRUM-146 / SCRUM-147 |
| Q2 | Ask for confirmation before logging out? (`auth:logout.confirm` exists) | Paola (PO) | No | Not in F-11 or Figma → not added |

## 8. Acceptance test results

| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| 2026-10-17 | AC1 | PASS | Automated + manual, real API in Docker (AI-assisted run on Sofia's machine) | `POST /auth/logout` 200; token stored in `token_blacklist`; login page shown |
| 2026-10-17 | AC2 | PASS | Automated + manual, real API | "Back" and opening `/dashboard` again both stay on `/login` |
| 2026-10-17 | AC3 | PASS | Automated + manual, real API | Old token → 401 *Token has been invalidated (Logged out)* |
| 2026-10-17 | AC4 | PASS | Automated | — |

## 9. Implementation notes
- Before this task the button only cleared the local session: the token stayed valid on the server for up to 15 minutes, and the cached map data stayed in memory.
- The logout call lives in `services/session/` and the hook in `hooks/useLogout.ts`, because the button is in the `AppShell` layout and layouts cannot import features (`AGENT.md §4`).
- The mock API (MSW) blacklists the token too (`mocks/data/revokedTokens.ts`), so the node service rejects it after logout, like the real API.
