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
No login screen in Figma yet — ask Paola (PO) before starting. Only the white logo exists; a login page on a light background needs a coloured logo.

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
| Q3 | Login screen design? | Paola (PO) | OPEN | — |
