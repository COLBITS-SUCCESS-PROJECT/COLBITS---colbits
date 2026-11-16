---
feature: dashboard
story: SCRUM-111
title: 'US13 - Last refresh time and stale map warning'
status: IN_REVIEW
owner: Paola
last_updated: 2026-11-11
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

### How it works (F-31)
- A refresh of the map (`GET /nodes`) that fails again after its retry, or that cannot start because the browser is offline, interrupts the live updates. Until a refresh succeeds:
  - a red banner at the top of the map says *"Actualización en vivo interrumpida: el mapa dejó de actualizarse."*, with **Reintentar** to ask again at once (Figma M10);
  - the top bar dot turns red and reads *Actualización interrumpida*, without waiting for the 5 min of the *Stale* state;
  - the map keeps the node states of its last successful refresh, and the time of that refresh stays visible (in the top bar from 1024 px, on the map below). This is CU-01 flow 6a: *"the system indicates it along with the time of the last refresh"*.
- The first refresh that succeeds removes the banner and turns the dot back to *Datos en vivo*.
- A first load that fails is not an interruption: the map has nothing yet that could pass for current data, so it shows its error state with **Reintentar** ([SCRUM-110](./SCRUM-110.md)).
- Like the time, the warning follows the map's request only (Q2). The fault panel shows its own error state.

### Out of scope
| What | Where |
|---|---|
| After how long the dot turns *Stale* (5 min meanwhile) | [FEATURE.md](./FEATURE.md) Q3 |
| Banner kinds *Filter active* and *Info* | With the screens that use them (`src/design-system/README.md`) |

## 2. Acceptance criteria
AC1 and AC2 are the F-32 criterion of the Requirements Specification v2.1 (*"Given the map is open, when a refresh succeeds, then the displayed time updates; after the API is cut, the time stays at the last successful refresh"*). AC3 and AC4 make "refresh" and "map view" precise. AC5 is the F-31 criterion (*"Given the map is open, when the API becomes unreachable, then a warning appears at the next failed refresh"*); AC6 to AC9 make "warning" and "unreachable" precise.

| ID | Criterion (Given / When / Then) | Test type | Test |
|---|---|---|---|
| AC1 | **Given** the map is open, **when** an automatic refresh succeeds, **then** the shown time changes to the time of that refresh. *(F-32)* | Automated + manual | `pages/LiveMonitoringPage.lastRefresh.acceptance.test.tsx` · Section 8 |
| AC2 | **Given** the map is open, **when** the API is cut, **then** the time stays at the last successful refresh while the refreshes fail, and moves on at the first refresh that succeeds again. *(F-32)* | Automated + manual | Same file · Section 8 |
| AC3 | **Given** the map is open, **when** the node request fails but the fault list still refreshes, **then** the time does not move: it is the time of the map's last refresh. *(F-32)* | Automated | Same file |
| AC4 | **Given** a screen narrower than 1024 px (down to 360 px), **when** the map is open, **then** the time of the last successful refresh is visible on the map view. *(F-32)* | Manual | Section 8 |
| AC5 | **Given** the map is open, **when** the API becomes unreachable, **then** a warning appears at the next failed refresh (CU-01, flow 6a). *(F-31)* | Automated + manual | `pages/LiveMonitoringPage.refreshWarning.acceptance.test.tsx` · Section 8 |
| AC6 | **Given** the warning is shown, **when** a refresh succeeds again, **then** the warning goes away and the time moves on. **Reintentar** asks again at once, without waiting for the next refresh. *(F-31)* | Automated + manual | Same file · Section 8 |
| AC7 | **Given** the map shows its nodes, **when** a refresh fails, **then** the map keeps the node states of its last successful refresh under the warning. A first load that fails shows the map's error state instead. *(F-31; SCRUM-110 Q2)* | Automated + manual | Same file · Section 8 |
| AC8 | **Given** the warning is shown, **then** the top bar dot is red and reads *Actualización interrumpida* instead of *Datos en vivo*, until a refresh succeeds. *(F-31)* | Automated + manual | Same file · Section 8 |
| AC9 | **Given** the map is open, **when** the browser loses its connection, **then** the same warning appears at the next refresh, and goes away when the connection is back. *(F-31)* | Automated + manual | Same file · Section 8 |

## 3. Design (Figma)

| Frame / component | Link |
|---|---|
| Top Bar (live and stale variants) | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=5-196> |
| M10 · Stale data + min-duration filter | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=8-4449> |
| Banner · Kind=Stale (page *1 Design System*) | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=3-270> |

Figma has desktop frames only. Below 1024 px neither the time on the map (Q1) nor the banner (Q4) has a frame.

## 4. Screens and states

| State | What the user sees |
|---|---|
| Loading | No time until the first answer: the top bar hides the pill and the map shows its loading state |
| Populated | "Última actualización: 03 nov 2026 · 22:35:31" in the top bar (≥ 1024 px), or "Última actualización: 22:35:31" on the map (< 1024 px). It changes at every successful refresh |
| Empty | A user with no nodes in scope still gets a successful answer: the time is shown and moves on |
| Error, first load | The map shows its error state with **Reintentar** ([SCRUM-110](./SCRUM-110.md)). No time and no banner yet |
| Interrupted (a refresh fails) | The markers stay as they were. Red banner at the top of the map with **Reintentar**; red dot *Actualización interrumpida* in the top bar; the time stays at the last successful refresh. From 1024 px the banner is centered; below, it is under the time, left of the zoom buttons, and its text wraps |

## 5. User flow
1. The user opens **Monitoreo en vivo** (`/dashboard`); when the nodes arrive, the time of that answer appears.
2. Every 15 s the map refreshes in the background; each successful refresh replaces the time.
3. If the API stops answering or the connection drops, the next refresh fails: the banner appears, the dot turns red and the time stays where it was.
4. The user can select **Reintentar** or wait: the first refresh that succeeds removes the banner, turns the dot back to *Datos en vivo* and moves the time on.

## 6. Data and endpoints
No new endpoint. The time is `dataUpdatedAt` of the `GET /nodes` query (`useNodesQuery`): when the browser received the last successful answer, by the browser's clock. It is kept in `stores/dataFreshness.store.ts` (`lastSyncedAt`), which the top bar (`AppShell`) and the map (`MapRefreshTime`) read.

The same store keeps `isInterrupted` (F-31), set by `useNodesQuery`: true while the query has nodes but its last refresh failed after the retry (`isRefetchError`) or waits for the network (`isPaused`). The top bar and the map (`MapRefreshStatus`) read it. Logging out resets both values.

## 7. Open questions

| ID | Question | Owner | Blocking | Answer |
|---|---|---|---|---|
| Q1 | Below 1024 px the top bar hides the time. Where should it go? | Paola (PO) | No | Proposed with F-32: on the map, top-left corner, until there is a mobile design |
| Q2 | Is a successful refresh the map request only, or the map and the fault list together? | Paola (PO) | No | Proposed with F-32: the map request (F-32 rationale: "how current the map is"). The F-31 warning follows the same request; the fault panel shows its own error state |
| Q3 | When a refresh fails, keep the last known node states under the warning, or hide them behind the error state? ([SCRUM-110](./SCRUM-110.md) Q2) | Paola (PO) | No | Proposed with F-31: keep them, as Figma M10 shows. The banner and the red dot say they are not current |
| Q4 | There is no frame for the banner below 1024 px. Where should it go? | Paola (PO) | No | Proposed with F-31: on the map, under the time, left of the zoom buttons; the text wraps (checked down to 360 px) |
| Q5 | With a node's detail open, the panel covers the right part of the map, and with it the end of the banner and **Reintentar**. Is that acceptable? | Paola (PO) | No | Proposed with F-31: yes. The start of the banner stays visible, the top bar dot stays red, and closing the panel shows the whole banner |

## 8. Acceptance test results
Fill in after testing. Every FAIL needs an action taken.

| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| 2026-11-03 | AC1–AC3 | PASS | Automated (`pnpm test:coverage`) | — |
| 2026-11-03 | AC1, AC2 | PASS | End-to-end: local PostgreSQL + API + built frontend in Chromium | — |
| 2026-11-03 | AC4 | PASS | Manual check: mocked API (MSW) in Chromium at 360, 390, 768, 1024 and 1440 px | — |
| 2026-11-11 | AC5–AC9 | PASS | Automated (`pnpm test:coverage`) | — |
| 2026-11-11 | AC5–AC9 | PASS | End-to-end: local PostgreSQL + API + built frontend in Chromium | — |
| 2026-11-11 | Banner layout (Q4) | PASS | Same run, API stopped, at 360, 390, 768, 1024, 1280 and 1440 px | — |

**How the end-to-end check was run (F-32):** the API and the frontend were built from this branch and run on one machine with the local database, logged in as `admin@colbits.com`, map open at 1280 px. First load: 23:00:51; the next refresh showed 23:01:06. The API process was then stopped for 50 s: the time stayed at 23:01:06 in the top bar and, at 360 px, on the map over its error state. After the API was started again, the next refresh showed 23:02:10.

**Seen during the check (for F-31):** while the API was down, the top bar dot stayed green (*Datos en vivo*) and the fault panel said "0 activas" next to its error message. The F-31 warning should cover both.

**How the end-to-end check was run (F-31):** same setup, map open at 1440 px with 3 markers, 15:57:12. The API process was stopped right after a refresh: the banner appeared 16.0 s later (the next refresh at 15 s and its retry 1 s after), the dot turned red (*Actualización interrumpida*), the 3 markers stayed, there was no error state and the time stayed at 15:57:12. **Reintentar** with the API still down kept the banner. With the API started again, **Reintentar** removed the banner within 0.3 s, the dot went back to *Datos en vivo* and the time moved on (15:57:36). A second outage showed the banner again, and the next automatic refresh after the restart removed it. With the browser set offline the banner and the red dot appeared at the next refresh (15.0 s) and went away 25 ms after going back online. The fault panel's "0 activas" was the real count: the local data has no open faults in the last day.

**How to run the automated tests:** `pnpm exec vitest run src/features/dashboard/pages/LiveMonitoringPage.lastRefresh.acceptance.test.tsx src/features/dashboard/pages/LiveMonitoringPage.refreshWarning.acceptance.test.tsx`. Both suites also run in CI on every push.

## 9. Implementation notes
- `useNodesQuery` records the time: `markSynced(dataUpdatedAt)` when the query succeeds. TanStack Query keeps `dataUpdatedAt` when a refetch fails, so a failed refresh cannot move the time.
- `useLiveMonitoringQuery` (`GET /faults`) no longer records it. Until now the time followed the fault list ([SCRUM-108](./SCRUM-108.md)), so a map whose node request failed could still show a new time.
- The top bar text is unchanged (`formatDateTime`, long variant, already with seconds). The map uses `formatTime` ("22:35:31") so it fits at 360 px next to the zoom buttons.
- `MapCanvas` has an optional `topOverlay` slot along its top edge, left of the zoom buttons. It stacks its children from the top-left corner and only they take clicks, so the map can still be dragged around them. The loading, empty and error states of the map are drawn over it.
- F-31: `useNodesQuery` sets `isInterrupted` = `isRefetchError || (isPaused && isSuccess)`. With the app's retry policy (`services/queryClient.ts`: one retry for network and server errors) the banner appears about 1 s after the failed refresh, long before the next one.
- F-31: `LiveMonitoringPage` gives `MapCanvas` `isLoadingError` instead of `isError`, so only a first load that fails hides the markers.
- F-31: `MapRefreshStatus` (feature component, in the `topOverlay` slot) shows `MapRefreshTime` and, while interrupted, the new design-system molecule `Banner` (Figma *Banner*, Kind=Stale), centered from `lg`. New color token `feedback-danger-border` (`red-200`, `#f4b4ae`, the border of the Figma banner).
- F-31: the banner has `role="alert"`, so screen readers announce it when it appears. **Reintentar** is a text button with a 44 px touch target and a visible focus ring. Color is not the only signal: the banner has text and an icon, the dot has its own accessible name.
