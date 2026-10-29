# Specs index

Every feature and story of the frontend with its current status.
**Update this file in the same PR that changes a spec's status.** How specs work: [README.md](./README.md).

Status values: `PLANNED` · `IN_PROGRESS` · `IN_REVIEW` · `DONE`

## Features

| Feature | Sidebar entry / route | Spec | Status | Owner |
|---|---|---|---|---|
| `auth` | `/login` | [FEATURE.md](./auth/FEATURE.md) | IN_PROGRESS | Paola |
| `dashboard` | Live Monitoring · `/dashboard` | [FEATURE.md](./dashboard/FEATURE.md) | IN_PROGRESS | Sofia |
| `analysis` | Historical Analysis · `/analysis` | [FEATURE.md](./analysis/FEATURE.md) | PLANNED | TBD |
| `reports` | Reports · `/reports` | [FEATURE.md](./reports/FEATURE.md) | PLANNED | TBD |
| `users` | User Management · `/users` (admin) | [FEATURE.md](./users/FEATURE.md) | PLANNED | TBD |
| `chatbot` | Floating assistant (every page) | [FEATURE.md](./chatbot/FEATURE.md) | PLANNED | TBD |

## Stories

| Story | Feature | Summary | Spec | Status | Owner |
|---|---|---|---|---|---|
| SCRUM-61 | `auth` | [F-01] Log in with username and password; protect every page behind login | [SCRUM-61.md](./auth/SCRUM-61.md) | IN_REVIEW | Paola |
| SCRUM-144 | `auth` | [F-01] Login connected to the real API; token and role stored | [SCRUM-144.md](./auth/SCRUM-144.md) | DONE | Sofia |
| SCRUM-145 | `auth` | [F-02] Token on every request; back to login on 401 | [SCRUM-145.md](./auth/SCRUM-145.md) | DONE | Sofia |
| SCRUM-146 | `auth` | [F-11] Logout: invalidate the token, clear data, return to login | [SCRUM-146.md](./auth/SCRUM-146.md) | DONE | Sofia |
| SCRUM-158 | shared (`i18n`) | Language switch: Spanish ⇄ English on every page | [SCRUM-158.md](./i18n/SCRUM-158.md) | DONE | Sofia |
| SCRUM-128 | `dashboard` | Base Live Monitoring screen (M1) with sample data | [FEATURE.md](./dashboard/FEATURE.md) | DONE | Sofia |
| SCRUM-77 | `dashboard` | [F-12] Node markers on map at recorded coordinates (US4) | [SCRUM-77.md](./dashboard/SCRUM-77.md) | DONE | Sofia |
| SCRUM-65 | `dashboard` | US6 · Fuse layer node colors (F-15 to F-18) | [SCRUM-65.md](./dashboard/SCRUM-65.md) | DONE | Sofia |
| SCRUM-106 | `dashboard` | US8 · Layer toggles and dual-state nodes (F-14, F-24) | [SCRUM-106.md](./dashboard/SCRUM-106.md) | IN_REVIEW | Sofia |
| SCRUM-109 | `dashboard` | US11 · Node detail with fuse sets (F-27, F-29) | [SCRUM-109.md](./dashboard/SCRUM-109.md) | IN_PROGRESS | Sofia |
| SCRUM-63 | `dashboard` | [F-13] Group overlapping node markers into one cluster (US4) | [SCRUM-63.md](./dashboard/SCRUM-63.md) | IN_REVIEW | Paola |
| SCRUM-110 | `dashboard` | US12 · Live node state updates: the map refreshes every 15 s (F-30, NF-01) | [SCRUM-110.md](./dashboard/SCRUM-110.md) | IN_REVIEW | Paola |

## Shared foundation (no feature spec)
Design system and app shell work, tracked in Jira under SCRUM-128.

| Work | PR | Status |
|---|---|---|
| Design tokens aligned with Figma + 12 base atoms | #4 | DONE |
| `Logo`, `NavItem`, `NavSidebar`, `AppShell` | #6 | DONE |
| Docker dev container | #5 | DONE |
| Atoms `ToggleChip`, `Tooltip`; molecules `Select`, `SearchField`, `Tabs`, `LegendItem`, `RefreshTimestamp`, `CounterCard`, `DataField`, `UserSummary`; organism `TopBar`; `AppShell` with top bar | #9 | DONE |
| CI fixes (typecheck, lint, Vitest 3) | #3 | DONE |
