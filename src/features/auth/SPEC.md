---
feature: auth
backlog: v1
status: PLACEHOLDER
last_updated: 2026-10-07
stories: []
---

# Feature: auth

## 1. Purpose
Allow users to log in to the COLBITS platform using their credentials, maintain an authenticated session, and log out securely.

## 2. Scope

### In scope
- Login form (email + password)
- Session persistence (token refresh)
- Logout
- Route guard: redirect unauthenticated users to `/login`

### Out of scope
- User registration (admin-managed accounts)
- Password reset (deferred)
- Multi-factor authentication (deferred)

## 3. User stories

| ID | Summary | Status |
|---|---|---|
| SCRUM-? | As a user I can log in with my credentials | Not started |
| SCRUM-? | As a user I can log out | Not started |

## 4. Routes

| Route | Component | Guard |
|---|---|---|
| `/login` | `LoginPage` | RedirectIfAuthenticated |

## 5. Screen states

### LoginPage
- **Default** — email field, password field, submit button
- **Loading** — button disabled, spinner shown
- **Error (wrong credentials)** — inline error under form
- **Error (network)** — inline error, retry option

## 6. API contract (PROVISIONAL)

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/api/v1/auth/login` | `{ email, password }` | `{ accessToken, refreshToken, user }` |
| POST | `/api/v1/auth/logout` | — (auth header) | 200 |

> **OQ-01:** Authentication method (JWT self-managed vs Firebase vs other) is unconfirmed. See agent.md §19.

## 7. Decisions and open questions

| ID | Question | Answer | Date |
|---|---|---|---|
| Q1 | JWT or Firebase Auth? | OPEN — waiting on backend team | — |
| Q2 | Token refresh strategy? | OPEN | — |
