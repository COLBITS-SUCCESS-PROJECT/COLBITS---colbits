---
feature: dashboard
story: SCRUM-110
title: 'US12 - Live node state updates'
status: IN_REVIEW
owner: Paola
last_updated: 2026-10-27
---

# SCRUM-110 — US12 · Live node state updates

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-110>
Requirements: F-25, F-26, F-30, NF-01 (subtasks SCRUM-181 to SCRUM-184)
Feature: [FEATURE.md](./FEATURE.md)

## 1. User story
> As a **consultation user**, I want **node colors to change on their own within 20 seconds of new data, and also when a device stops reporting**, so that **the map shows the current network without reloading**.

| Requirement | The system shall… | Owner |
|---|---|---|
| F-25 | Recompute the state of a node when a new record is stored for one of its devices | Mahmoud |
| F-26 | Recompute the state of a node when a device's inactivity period elapses, without waiting for new data | Mahmoud |
| F-30 | Update the node's marker on the open map when its state changes, without the user reloading the page | Paola |
| NF-01 | Show a node state change on the map no more than 20 seconds after the record that causes it is in the database | Paola |

### How it works
**The map asks `GET /nodes` every 15 seconds** (decision OQ-03, 2026-10-27: [live-updates.md](../../decisions/live-updates.md)).
The backend computes each node's state on every request, from the last record of each device and the current time. So:
- a new record changes the state on the next request (F-25);
- a device that passes its inactivity limit changes state on the next request, with no new data (F-26);
- the map redraws the markers whose state changed and leaves everything else as it was (F-30);
- a change reaches the screen at most 15 s plus the request time after the record (NF-01).

### Out of scope
| What | Where |
|---|---|
| "Last update" time and the warning when the map is out of date | US13 (Sprint 5) |
| Fault panel with real faults | US10 · SCRUM-108 |
| Transformer layer colors | US7 · SCRUM-105 |

## 2. Acceptance criteria

| ID | Criterion (Given / When / Then) | Test type | Test |
|---|---|---|---|
| AC1 | **Given** the map is open and a node shows an open fuse, **when** a record that closes the fuse is stored, **then** its marker turns green on the same page, without reloading. *(F-30, F-25)* | Automated + end-to-end | `pages/LiveMonitoringPage.liveUpdates.acceptance.test.tsx` · Section 8 |
| AC2 | **Given** a green node, **when** its Falcon passes the inactivity limit with no new record, **then** its marker turns gray without reloading. *(F-30, F-26)* | Automated | Same file |
| AC3 | **Given** the map is open, **when** state-changing records are inserted at random moments, **then** every change appears on the map within 20 s of the database commit. *(NF-01; method: 20 records)* | Automated (simulated time) + end-to-end | Same file · Section 8 |
| AC4 | **Given** the user has moved or zoomed the map, **when** the map refreshes, **then** the user's view is kept: the map frames the nodes only on the first load. | Automated | Same file + `MapCanvas/MapCanvas.test.tsx` |

## 3. Design (Figma)

| Frame / component | Link |
|---|---|
| Map Marker | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=3-267> |
| M1 · Monitor / Fuses layer | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=8-133> |

No new screens: markers change color in place.

## 4. Screens and states

| State | What the user sees |
|---|---|
| Loading | Only on the first load (same as SCRUM-77); refreshes run in the background with no spinner |
| Populated | Markers change color on their own when a refresh brings a new state |
| Empty | Same as SCRUM-77 |
| Error | If a refresh fails again after its retry, the map shows the error state with its retry button until a refresh succeeds (Q2) |

## 5. User flow
1. The user opens **Monitoreo en vivo** (`/dashboard`); the map loads the nodes and frames them once.
2. Every 15 s the page requests `GET /nodes` in the background.
3. When a node changed state (new record or inactive device), its marker changes color; the rest of the map stays where the user left it.

## 6. Data and endpoints
No new endpoint: the same `GET /nodes` as [SCRUM-65](./SCRUM-65.md), requested every 15 s while the page is open (`LIVE_REFETCH_INTERVAL_MS` in `model/liveMonitoring.constants.ts`).
While the browser tab is hidden the requests pause; the next one runs at most 15 s after the user comes back.

## 7. Open questions

| ID | Question | Owner | Blocking | Answer |
|---|---|---|---|---|
| Q1 | WebSocket or polling for live data? (OQ-03) | Mahmoud / Javier | Yes | **Polling every 15 s** (Mahmoud, 2026-10-27) — [decision](../../decisions/live-updates.md) |
| Q2 | When a refresh fails, should the map keep the last known states (with the US13 warning) instead of the error state? | Paola (PO) | No | OPEN — decide with US13 |

## 8. Acceptance test results

| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| 2026-10-27 | AC1–AC4 | PASS | Automated (`pnpm test:coverage`) | — |
| 2026-10-27 | AC1, AC3 | PASS | End-to-end measurement: local PostgreSQL + API + built frontend in Chromium | — |

**How the end-to-end measurement was run:** NF-01's method from the Requirements Specification v2.0. The database was loaded with `backend/database/*.sql` and the generator (50 nodes, data ending at the time of the test); the API and the frontend were built from this branch, with the real login as `admin@colbits.com`. With the map open, 20 Falcon records were inserted into `falcon_values` at random moments (1 to 12 s apart), opening and closing a fuse on nodes 0000300001 and 0000400010. For each record, the time from the database commit to the marker change in the browser was measured.

**Results:** 20 of 20 changes appeared within 20 s. Fastest 3.3 s, slowest 13.6 s, average 7.6 s.

**Limits of this evidence:** everything ran on one machine, so there is no network time between browser, API and database. On Render, the request time over the internet adds to these numbers.

**How to run the automated tests:** `pnpm exec vitest run src/features/dashboard/pages/LiveMonitoringPage.liveUpdates.acceptance.test.tsx`. The suite also runs in CI on every push.

## 9. Implementation notes
- The only code change is `LIVE_REFETCH_INTERVAL_MS`: 60 s → 15 s. The map already redrew a marker when its state changed (react-leaflet updates the icon of a marker whose state changes; markers are keyed by node ID, so nothing is remounted) and framed the nodes only once per node set (SCRUM-77), so the user's pan and zoom survive every refresh.
- Why 15 s: in the worst case a change waits 15 s for the next request, plus the request and the redraw, which stays under NF-01's 20 s. 10 s would double the requests for little gain.
- The same constant drives the fault panel query (`useLiveMonitoringQuery`), which still uses sample data until US10.
- F-25 and F-26 need no new backend code: `backend/src/nodes/nodes.service.ts` computes the state in SQL on each request (`FUSE_SUMMARY_SQL` and `SMAC_INACTIVITY_SQL`, compared with `now()`). Mahmoud's subtasks (SCRUM-181, SCRUM-182) cover their backend tests.
- The acceptance tests simulate time with Vitest fake timers, so the 20 s are measured without waiting for them; with the old 60 s interval, AC1 to AC3 fail.
