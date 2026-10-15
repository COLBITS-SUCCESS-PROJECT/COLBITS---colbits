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
| SCRUM-61 | `auth` | [F-01] Log in with username and password; protect every page behind login | [SCRUM-61.md](./auth/SCRUM-61.md) | IN_PROGRESS | Paola |
| SCRUM-128 | `dashboard` | Base Live Monitoring screen (M1) with sample data | [FEATURE.md](./dashboard/FEATURE.md) | DONE | Sofia |
| SCRUM-77 | `dashboard` | [F-12] Node markers on map at recorded coordinates (US4) | [SCRUM-77.md](./dashboard/SCRUM-77.md) | DONE | Sofia |

## Shared foundation (no feature spec)
Design system and app shell work, tracked in Jira under SCRUM-128.

| Work | PR | Status |
|---|---|---|
| Design tokens aligned with Figma + 12 base atoms | #4 | DONE |
| `Logo`, `NavItem`, `NavSidebar`, `AppShell` | #6 | DONE |
| Docker dev container | #5 | DONE |
| Atoms `ToggleChip`, `Tooltip`; molecules `Select`, `SearchField`, `Tabs`, `LegendItem`, `RefreshTimestamp`, `CounterCard`, `DataField`, `UserSummary`; organism `TopBar`; `AppShell` with top bar | this PR | IN_REVIEW |
| CI fixes (typecheck, lint, Vitest 3) | #3 | DONE |
