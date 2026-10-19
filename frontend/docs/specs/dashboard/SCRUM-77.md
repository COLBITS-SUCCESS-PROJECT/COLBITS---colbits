---
feature: dashboard
story: SCRUM-77
title: '[F-12] Display node markers on map at recorded coordinates'
status: DONE
owner: Sofia
last_updated: 2026-10-11
---

# SCRUM-77 — [F-12] Display node markers on map at recorded coordinates

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-77>
Parent story: **US4 — Map with node markers and clustering** (F-12, F-13)
Feature: [FEATURE.md](./FEATURE.md)

## 1. User story
> As a **consultation user**, I want to **see the nodes in my scope on a map**, grouped when they overlap, so that **I can see my whole network at a glance**.

This task covers only the first half (**F-12**): each node as a marker at its recorded coordinates.

**Requirement F-12** (Requirements Specification v1.0, §1.2): *The system shall display each node within the user's scope as a marker on the map, at the node's recorded coordinates.*

### Out of scope (other owners)
| Requirement | What | Owner |
|---|---|---|
| F-13 | Group overlapping markers into a cluster | Paola |
| F-15, F-16, F-17 | Red / yellow / gray node state on the fuse layer | Monica |
| F-18 | Green node state on the fuse layer | Paola |
| F-01, F-10 | Login and scope filtering in the API | Backend (US2, US3) |

The marker colors already present in the base screen (SCRUM-128, sample data) are left untouched. The two hand-placed sample clusters are removed: clustering is F-13.

## 2. Acceptance criteria

| ID | Criterion (Given / When / Then) | Test type | Test |
|---|---|---|---|
| AC1 | **Given** a user whose scope contains nodes N1 and N2 but not N3, **when** the user opens the map, **then** N1 and N2 appear as markers and N3 does not appear. *(F-12 acceptance criterion)* | Automated | `pages/LiveMonitoringPage.acceptance.test.tsx` (AC1, two users) |
| AC2 | **Given** a node with recorded latitude and longitude, **when** the map is shown, **then** its marker is placed at exactly those coordinates. | Automated | `pages/LiveMonitoringPage.acceptance.test.tsx` + `MapCanvas.test.tsx` |
| AC3 | **Given** the nodes are still loading, **when** the map is shown, **then** the user sees a loading indication and no markers. | Automated | `MapCanvas` test (step 4) |
| AC4 | **Given** the user's scope has no nodes, **when** the map is shown, **then** the map shows an empty-state message. | Automated | `MapCanvas` test (step 4) |
| AC5 | **Given** the node service fails, **when** the map is shown, **then** the user sees an error message with a retry action. | Automated | `MapCanvas` test (step 4) |
| AC6 | **Given** the map is open, **when** the user compares it with the Figma screen M1, **then** toolbar, legend and fault panel are unchanged and the markers keep the Figma marker style. | Manual | Section 8 |

Scope filtering itself is done by the backend (F-10): the frontend draws exactly the nodes the service returns. AC1 is verified with a mocked service that returns a different node list per user.

## 3. Design (Figma)

| Frame / component | Link |
|---|---|
| M1 · Monitor / Fuses layer | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=8-133> |
| Map Canvas (basemap placeholder) | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=5-322> |
| Map Marker | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=3-267> |

The Figma canvas is explicitly a *basemap placeholder*; this task replaces it with a real map.

## 4. Screens and states

| State | What the user sees |
|---|---|
| Loading | Map area with a loading indication, no markers |
| Populated | Real map centered on the nodes, one marker per node in scope |
| Empty | Map with a message: no nodes in your scope |
| Error | Message that nodes could not be loaded, with a retry button |

## 5. User flow
1. The user opens **Monitoreo en vivo** (`/dashboard`).
2. The system requests the nodes within the user's scope.
3. The map shows one marker per node at its recorded coordinates, framed so all of them are visible.
4. The user can zoom and pan the map.

## 6. Data and endpoints

Contract **as implemented by the backend** (`backend/src/nodes`), verified against the running API on 2026-10-19.

```ts
// GET /nodes — response
interface NodesResponseDto {
  count: number
  nodes: NodeDto[]
}

interface NodeDto {
  name: string               // node ID (primary key of `nodes`), e.g. 0000100001
  latitude: number | null
  longitude: number | null
  // Not sent yet — US6 (SCRUM-65) / US7 (SCRUM-105). Absent = unknown, null = no such device.
  fuse_state?: 'CRITICAL' | 'WARNING' | 'INACTIVE' | 'NORMAL' | null
  transformer_state?: 'CRITICAL' | 'WARNING' | 'INACTIVE' | 'NORMAL' | null
}
```

| Method | Path | Purpose |
|---|---|---|
| GET | `/nodes` | Nodes within the authenticated user's scope (filtered by the backend, F-10). Requires `Authorization: Bearer <token>`. |

- Nodes without coordinates are left out by the mapper.
- While the backend does not send the states, nodes are drawn in gray ("Sin dato") and the legend shows that entry.
- The MSW mock returns the same `{ count, nodes }` shape so mocked and real runs behave the same.

## 7. Open questions

| ID | Question | Owner | Blocking | Answer |
|---|---|---|---|---|
| Q1 | Which map library? | Sofia | No | **Leaflet + OpenStreetMap** (2026-10-10) — recorded in an ADR in step 3 |
| Q2 | Real endpoint path and field names for nodes? | Backend team | No | OPEN — provisional contract above, isolated in the mapper |
| Q3 | Are the state fields part of the node list, or a separate service? | Backend team / Monica | No | OPEN — kept in the node for now so existing colors keep working |

## 8. Acceptance test results
Fill in after testing. Every FAIL needs an action taken.

| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| 2026-10-11 | AC1 | PASS | Automated (CI) | — |
| 2026-10-11 | AC2 | PASS | Automated (CI) + Sofia (manual, Chrome) | — |
| 2026-10-11 | AC3 | PASS | Automated (CI) | — |
| 2026-10-11 | AC4 | PASS | Automated (CI) | — |
| 2026-10-11 | AC5 | PASS | Automated (CI) | — |
| 2026-10-10 | AC6 | PASS | Sofia (manual, Chrome, Docker) | — |

**How to run:** `pnpm exec vitest run src/features/dashboard/pages/LiveMonitoringPage.acceptance.test.tsx`. The suite also runs in CI on every push.

**Issues found while testing (and action taken):**

| Date | Found by | Issue | Action |
|---|---|---|---|
| 2026-10-10 | Manual check | The app stayed blank when the browser blocked the mock service worker | `main.tsx` now starts the app anyway; the map shows its error state (step 4) |
| 2026-10-10 | Sofia, manual check | The map went blank (gray) at maximum zoom | Tiles are enlarged past zoom 18 with `maxNativeZoom` + a test for it (step 4) |

**Limits of this evidence:** the node service is mocked (MSW) because the backend does not exist yet, so scope filtering is verified against the mock, not the real API. F-12's verification method in the Requirements Specification is "Acceptance test on the database copy" — AC1 must be re-run against the real service when US3 (F-10) is delivered.

## 9. Implementation notes
Delivered in five small PRs, one per step:

| Step | Content | Branch |
|---|---|---|
| 1 | This spec | `SCRUM-77-1-spec` |
| 2 | Provisional node contract: types with coordinates, DTO, mapper, API function, MSW handler (two users with different scopes), query hook | `SCRUM-77-2-node-contract` |
| 3 | Add Leaflet + ADR for the map library decision | `SCRUM-77-3-leaflet-adr` |
| 4 | `MapCanvas` on a real map: markers at coordinates, loading / empty / error states | `SCRUM-77-4-map-markers` |
| 5 | Acceptance test for AC1 and results recorded in section 8 | `SCRUM-77-5-acceptance` |
