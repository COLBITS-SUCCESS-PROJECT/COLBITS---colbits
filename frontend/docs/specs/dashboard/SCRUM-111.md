---
feature: dashboard
story: SCRUM-111
title: 'US13 - Last refresh time and stale map warning'
status: IN_PROGRESS
owner: Paola
last_updated: 2026-11-03
---

# SCRUM-111 — US13 · Last refresh time and stale map warning

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-111>
Requirements: F-31, F-32 (subtasks SCRUM-224, SCRUM-223)
Feature: [FEATURE.md](./FEATURE.md)

## 1. User story
> As a **consultation user**, I want **to see when the map was last refreshed and get a warning when it stops updating**, so that **I never mistake a frozen map for a stable network**.

| Requirement | The system shall… | Subtask | Owner |
|---|---|---|---|
| F-32 | Show on the map view the time of the last successful refresh | SCRUM-223 | Paola |
| F-31 | If an automatic refresh attempt fails, show a visible warning that the map is no longer updating | SCRUM-224 | Paola |

### How it works (F-32)
- The map asks `GET /nodes` every 15 s ([SCRUM-110](./SCRUM-110.md)). Each successful answer sets the "last update" time; a failed one leaves it as it was.
- The time follows the map's own request, not the fault list (`GET /faults`). If only the node request fails, the map is not refreshed and the time stays; if only the fault request fails, the map was refreshed and the time moves on.
- From 1024 px (`lg`) the time is in the top bar, next to the *Live* / *Stale* dot (Figma: Top Bar). Below 1024 px the top bar only has room for the dot and the refresh button, so the time is shown on the map, at its top-left corner.
- The time includes seconds, so every 15 s refresh visibly changes it.

### Out of scope
| What | Where |
|---|---|
| Visible warning when an automatic refresh fails (M10 banner) | F-31 · SCRUM-224 (this story, separate PR) |
| After how long the dot turns *Stale* (5 min meanwhile) | [FEATURE.md](./FEATURE.md) Q3 |

## 2. Acceptance criteria
AC1 and AC2 are the F-32 criterion of the Requirements Specification v2.1 (*"Given the map is open, when a refresh succeeds, then the displayed time updates; after the API is cut, the time stays at the last successful refresh"*). AC3 and AC4 make "refresh" and "map view" precise.

| ID | Criterion (Given / When / Then) | Test type | Test |
|---|---|---|---|
| AC1 | **Given** the map is open, **when** an automatic refresh succeeds, **then** the shown time changes to the time of that refresh. *(F-32)* | Automated + manual | `pages/LiveMonitoringPage.lastRefresh.acceptance.test.tsx` · Section 8 |
| AC2 | **Given** the map is open, **when** the API is cut, **then** the time stays at the last successful refresh while the refreshes fail, and moves on at the first refresh that succeeds again. *(F-32)* | Automated + manual | Same file · Section 8 |
| AC3 | **Given** the map is open, **when** the node request fails but the fault list still refreshes, **then** the time does not move: it is the time of the map's last refresh. *(F-32)* | Automated | Same file |
| AC4 | **Given** a screen narrower than 1024 px (down to 360 px), **when** the map is open, **then** the time of the last successful refresh is visible on the map view. *(F-32)* | Manual | Section 8 |
| AC5 | **Given** the map is open, **when** the API becomes unreachable, **then** a warning appears at the next failed refresh (CU-01, flow 6a). *(F-31)* | Pending | SCRUM-224 |

## 3. Design (Figma)

| Frame / component | Link |
|---|---|
| Top Bar (live and stale variants) | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=5-196> |
| M10 · Stale data + min-duration filter | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=8-4449> |

Figma has desktop frames only. The time on the map below 1024 px has no frame (Q1).

## 4. Screens and states

| State | What the user sees |
|---|---|
| Loading | No time until the first answer: the top bar hides the pill and the map shows its loading state |
| Populated | "Última actualización: 03 nov 2026 · 22:35:31" in the top bar (≥ 1024 px), or "Última actualización: 22:35:31" on the map (< 1024 px). It changes at every successful refresh |
| Empty | A user with no nodes in scope still gets a successful answer: the time is shown and moves on |
| Error | The time stays at the last successful refresh, also over the map's error state (SCRUM-110). The warning comes with F-31 |

## 5. User flow
1. The user opens **Monitoreo en vivo** (`/dashboard`); when the nodes arrive, the time of that answer appears.
2. Every 15 s the map refreshes in the background; each successful refresh replaces the time.
3. If the API stops answering, the time stays where it was; when the API answers again, the time moves on.

## 6. Data and endpoints
No new endpoint. The time is `dataUpdatedAt` of the `GET /nodes` query (`useNodesQuery`): when the browser received the last successful answer, by the browser's clock. It is kept in `stores/dataFreshness.store.ts` (`lastSyncedAt`), which the top bar (`AppShell`) and the map (`MapRefreshTime`) read.

## 7. Open questions

| ID | Question | Owner | Blocking | Answer |
|---|---|---|---|---|
| Q1 | Below 1024 px the top bar hides the time. Where should it go? | Paola (PO) | No | Proposed in this PR: on the map, top-left corner, until there is a mobile design |
| Q2 | Is a successful refresh the map request only, or the map and the fault list together? | Paola (PO) | No | Proposed in this PR: the map request (F-32 rationale: "how current the map is"). The fault panel shows its own error state |

## 8. Acceptance test results
Fill in after testing. Every FAIL needs an action taken.

| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| 2026-11-03 | AC1–AC3 | PASS | Automated (`pnpm test:coverage`) | — |
| 2026-11-03 | AC1, AC2 | PASS | End-to-end: local PostgreSQL + API + built frontend in Chromium | — |
| 2026-11-03 | AC4 | PASS | Manual check: mocked API (MSW) in Chromium at 360, 390, 768, 1024 and 1440 px | — |

**How the end-to-end check was run:** the API and the frontend were built from this branch and run on one machine with the local database, logged in as `admin@colbits.com`, map open at 1280 px. First load: 23:00:51; the next refresh showed 23:01:06. The API process was then stopped for 50 s: the time stayed at 23:01:06 in the top bar and, at 360 px, on the map over its error state. After the API was started again, the next refresh showed 23:02:10.

**Seen during the check (for F-31):** while the API was down, the top bar dot stayed green (*Datos en vivo*) and the fault panel said "0 activas" next to its error message. The F-31 warning should cover both.

**How to run the automated tests:** `pnpm exec vitest run src/features/dashboard/pages/LiveMonitoringPage.lastRefresh.acceptance.test.tsx`. The suite also runs in CI on every push.

## 9. Implementation notes
- `useNodesQuery` records the time: `markSynced(dataUpdatedAt)` when the query succeeds. TanStack Query keeps `dataUpdatedAt` when a refetch fails, so a failed refresh cannot move the time.
- `useLiveMonitoringQuery` (`GET /faults`) no longer records it. Until now the time followed the fault list ([SCRUM-108](./SCRUM-108.md)), so a map whose node request failed could still show a new time.
- The top bar text is unchanged (`formatDateTime`, long variant, already with seconds). The map uses `formatTime` ("22:35:31") so it fits at 360 px next to the zoom buttons.
- `MapCanvas` has a new optional `topOverlay` slot (top-left corner). It stays over the map's error state, so the last time is still readable while the API is down. F-31's banner (M10, top of the map) can use the same slot; on narrow screens it should stack with the time.
