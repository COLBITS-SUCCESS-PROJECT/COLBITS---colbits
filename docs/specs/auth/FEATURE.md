---
feature: auth
title: Authentication
status: PLANNED
owner: TBD
last_updated: 2026-10-07
---

# Feature: Authentication

## 1. Purpose
Allow users to log in to the COLBITS platform with their credentials, keep an authenticated session, and log out securely. Every other page depends on it.

## 2. Scope

### In scope
- Login form (email + password)
- Session persistence (token refresh)
- Logout (button already in the sidebar → clears `auth.store` and goes to `/login`)
- Route guards: `RequireAuth`, `RedirectIfAuthenticated`, `RequireRole`

### Out of scope
- User registration (accounts are created by admins → `users`)
- Password reset (deferred)
- Multi-factor authentication (deferred)

## 3. Stories

| Story | Summary | Owner | Status |
|---|---|---|---|
| SCRUM-61 | As a user I can log in with my credentials | TBD | PLANNED |

## 4. Design (Figma)
Login screen: **Login / Default** on Figma page *2 Templates & Pages* — <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=8-100>. It shows the logo panel, *Sign In*, two inputs, *Remember session*, *Forgot your password?* and the submit button.

*Remember session* and *Forgot your password?* are in the mockup but in no requirement — confirm with the PO before building them (Q4).

## 5. Routes

| Route | Page component | Guard |
|---|---|---|
| `/login` | `LoginPage` | RedirectIfAuthenticated |

## 6. Components

| Component | Layer | Location |
|---|---|---|
| `Logo`, `Button`, `Input`, `Label` | Atom | design-system (done) |
| `FormField` | Molecule | design-system (to do) |
| `LoginForm` | Organism | feature |

## 7. API contract (PROVISIONAL)

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/api/v1/auth/login` | `{ email, password }` | `{ accessToken, refreshToken, user }` |
| POST | `/api/v1/auth/logout` | — (auth header) | 200 |

## 8. Open questions and decisions

| ID | Question | Owner | Answer | Date |
|---|---|---|---|---|
| Q1 | JWT or Firebase Auth? (`AGENT.md §20`, OQ-01) | Yeison / Javier | OPEN | — |
| Q2 | Token refresh strategy? | Backend team | OPEN | — |
| Q3 | Login screen design? | Paola (PO) | Answered — Figma *Login / Default* (`8-100`) | 2026-10-11 |
| Q4 | Are *Remember session* and *Forgot your password?* in scope? | Paola (PO) | OPEN | — |
| Q5 | US2 has only backend tasks (F-01–F-03). Who builds the login page, route guards and logout (F-11, not in any story)? | Paola (PO) / Sofia (SM) | OPEN — raised for Sprint 4 planning | — |
