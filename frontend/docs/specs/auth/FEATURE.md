---
feature: auth
title: Authentication
status: IN_PROGRESS
owner: Paola
last_updated: 2026-10-14
---

# Feature: Authentication

## 1. Purpose
Allow users to log in to the COLBITS platform with their credentials, keep an authenticated session, and log out securely. Every other page depends on it.

## 2. Scope

### In scope
- Login form (username + password) — SCRUM-61
- Route guards: `RequireAuth`, `RedirectIfAuthenticated` — SCRUM-61; `RequireRole` with user management
- Logout (F-11): calls `POST /auth/logout`, clears the session and cached data, returns to `/login` — [SCRUM-146](./SCRUM-146.md)
- Session kept in memory for the life of the access token (15 min); no refresh token yet (Q2)

### Out of scope
- User registration (accounts are created by admins → `users`)
- Password reset and *Remember session* (in the mockup, in no requirement — Q4)
- Multi-factor authentication (deferred)

## 3. Stories

| Story | Summary | Owner | Status |
|---|---|---|---|
| [SCRUM-61](./SCRUM-61.md) | [F-01] Log in with username and password; protect every page behind login | Paola | IN_PROGRESS |

## 4. Design (Figma)
Login screen: **Login / Default** on Figma page *2 Templates & Pages* — <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=8-100>. It shows the logo panel, *Sign In*, two inputs, *Remember session*, *Forgot your password?* and the submit button.

The first input asks for a **username** (the API logs in by username), and *Remember session* / *Forgot your password?* are not built (Q4).

## 5. Routes

| Route | Page component | Guard |
|---|---|---|
| `/login` | `LoginPage` (inside `layouts/AuthLayout`) | `RedirectIfAuthenticated` |
| Every page inside `AppShell` (`/dashboard`, `/analysis`, `/reports`…) | — | `RequireAuth` |

## 6. Components

| Component | Layer | Location |
|---|---|---|
| `Logo`, `Button`, `Input`, `Label` | Atom | design-system (done) |
| `FormField` | Molecule | design-system (SCRUM-61) |
| `LoginForm` | Organism | feature |
| `AuthLayout` | Layout | `src/layouts/` (SCRUM-61) |

## 7. API contract (PROVISIONAL)
Taken from the backend repo (commit 51f87ea) until the backend publishes an OpenAPI spec.

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/auth/login` | `{ username, password }` | 200 `{ access_token }` (JWT with `sub`, `username`, `role`; 15 min) · 401 invalid credentials |
| POST | `/auth/logout` | — (auth header) | 200 `{ message }`; the token is blacklisted |

## 8. Open questions and decisions

| ID | Question | Owner | Answer | Date |
|---|---|---|---|---|
| Q1 | JWT or Firebase Auth? (`AGENT.md §20`, OQ-01) | Yeison / Javier | Answered — JWT, issued by the backend's `POST /auth/login` | 2026-10-12 |
| Q2 | Token refresh strategy? | Backend team | OPEN — no refresh endpoint yet; the token lasts 15 minutes | — |
| Q3 | Login screen design? | Paola (PO) | Answered — Figma *Login / Default* (`8-100`) | 2026-10-11 |
| Q4 | Are *Remember session* and *Forgot your password?* in scope? | Paola (PO) | Answered — no, they are left out (in no requirement) | 2026-10-14 |
| Q5 | US2 has only backend tasks (F-01–F-03). Who builds the login page, route guards and logout (F-11, not in any story)? | Paola (PO) / Sofia (SM) | Login page and guards: Paola (SCRUM-61). Frontend part of logout (F-11): Sofia, SCRUM-146 (2026-10-17) | 2026-10-14 |
