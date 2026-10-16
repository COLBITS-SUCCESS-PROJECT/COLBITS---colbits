---
feature: dashboard
story: SCRUM-63
title: '[F-13] Group overlapping node markers into a single cluster marker'
status: IN_REVIEW
owner: Paola
last_updated: 2026-10-16
---

# SCRUM-63 — [F-13] Group overlapping node markers into a single cluster marker

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-63>
Parent story: **US4 — Map with node markers and clustering** (F-12, F-13)
Feature: [FEATURE.md](./FEATURE.md)

## 1. User story
> As a **consultation user**, I want to **see the nodes in my scope on a map, grouped when they overlap**, so that **I can see my whole network at a glance**.

This task covers the second half of US4 (**F-13**). The first half, F-12 (one marker per node at its recorded coordinates), is done in [SCRUM-77](./SCRUM-77.md).

**Requirement F-13** (Requirements Specification v1.0, §1.2): *While two or more node markers overlap at the current zoom level, the system shall group them into a single cluster marker.*

### When two markers overlap
Two markers overlap when their drawings touch on screen at the current zoom, using each marker's real size from Figma (*Map Marker*):

| Marker | Size on screen |
|---|---|
| Fuse or transformer | 32 × 32 px |
| Fuse + transformer (both layers shown) | 58 × 32 px |
| Cluster | 40 × 40 px |

- A marker that overlaps any marker of a group joins that group.
- A group is drawn as **one cluster marker** with the number of nodes, at the average position of its nodes.
- If a cluster marker overlaps another marker, they are grouped too, so no two markers on the map overlap.
- No node is ever lost: every node is either its own marker or counted in exactly one cluster.

### Out of scope
| What | Where |
|---|---|
| Node colors by state (F-15 to F-18) | Monica (F-15 to F-17), Paola (F-18) |
| Showing inside a cluster the state of its nodes, e.g. a red cluster when one node is critical | Not in any requirement — Q1 |
| Reaching each node of a group that still overlaps at the deepest zoom | Q2 |

## 2. Acceptance criteria

| ID | Criterion (Given / When / Then) | Test type | Test |
|---|---|---|---|
| AC1 | **Given** two nodes whose markers overlap at the current zoom, **when** the map is shown, **then** they appear as one cluster marker showing 2. *(F-13 acceptance criterion)* | Automated | `pages/LiveMonitoringPage.clustering.acceptance.test.tsx` + `MapCanvas/clusterMarkers.test.ts` |
| AC2 | **Given** that cluster, **when** the user zooms in until the two markers no longer overlap, **then** they appear as two separate markers. *(F-13 acceptance criterion)* | Automated | Same files |
| AC3 | **Given** two nodes whose markers do not overlap, **when** the map is shown, **then** both appear as separate markers. | Automated | `MapCanvas/clusterMarkers.test.ts` |
| AC4 | **Given** the user shows both layers, **when** fuse + transformer markers become wider (58 px), **then** the grouping uses the new size. | Automated | `MapCanvas/clusterMarkers.test.ts` |
| AC5 | **Given** a cluster on the map, **when** the user clicks it or presses Enter on it, **then** the map zooms in on it, to the first zoom where its nodes separate. *(PO decision 2026-10-16)* | Automated | `MapCanvas/MapCanvas.test.tsx` |
| AC6 | **Given** the map with clusters, **when** it is compared with the Figma *Map Marker* component, **then** the cluster marker matches it: dark circle, white border and the node count. | Manual | Section 8 |

The F-12 acceptance tests (SCRUM-77) must keep passing: nodes whose markers do not overlap are still drawn one by one at their coordinates.

## 3. Design (Figma)

| Frame / component | Link |
|---|---|
| Map Marker (cluster variant) | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=3-267> |
| M1 · Monitor / Fuses layer | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=8-133> |

The cluster marker already exists in the `MapMarker` molecule (`kind: 'cluster'`), built in SCRUM-128 from the Figma component.

## 4. Screens and states
Loading, empty and error stay as in SCRUM-77. Clusters only appear when the map shows nodes.

| State | What the user sees |
|---|---|
| Populated, zoomed out | Nodes whose markers overlap appear as one cluster with the number of nodes |
| Populated, zoomed in | Every node as its own marker |

## 5. User flow
1. The user opens **Monitoreo en vivo** (`/dashboard`); the map frames all nodes in scope.
2. Nodes whose markers would overlap at that zoom appear as one cluster with their count.
3. The user zooms in with the buttons, the mouse wheel or by clicking the cluster; the cluster splits when its markers no longer overlap.
4. The user zooms out; nodes group again.

## 6. Data and endpoints
No new data. Grouping is calculated in the browser from the node list of SCRUM-77 (`GET /api/v1/nodes`, provisional).

## 7. Open questions

| ID | Question | Owner | Blocking | Answer |
|---|---|---|---|---|
| Q1 | Should a cluster show the worst state of its nodes (e.g. red when one is critical)? Today it is neutral, as in Figma. | Paola (PO) / Colbits | No | OPEN |
| Q2 | Nodes that still overlap at the deepest zoom (19) stay grouped. How should the user reach each one: a list, or spreading them out on click? | Paola (PO) | No | OPEN — to decide with the node detail story |

## 8. Acceptance test results
Fill in after testing. Every FAIL needs an action taken.

| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| 2026-10-16 | AC1 | PASS | Automated (local run, `pnpm test:coverage`) | — |
| 2026-10-16 | AC2 | PASS | Automated (local run, `pnpm test:coverage`) | — |
| 2026-10-16 | AC3 | PASS | Automated (local run, `pnpm test:coverage`) | — |
| 2026-10-16 | AC4 | PASS | Automated (local run, `pnpm test:coverage`) | — |
| 2026-10-16 | AC5 | PASS | Automated (local run, `pnpm test:coverage`) | — |
| 2026-10-16 | AC6 | PASS | Paola (manual, against Figma) | — |

**How to run:** `pnpm exec vitest run src/features/dashboard/components/MapCanvas src/features/dashboard/pages/LiveMonitoringPage.clustering.acceptance.test.tsx`. The suite also runs in CI on every push.

**Browser check (2026-10-16):** AI-assisted run on Paola's machine against the mock API, fuse layer, all nodes. At zoom 13 and 14 the 9 fuse nodes show one by one; at zoom 12 they form a cluster of 5, a cluster of 3 and one single node; at zoom 11 or less, one cluster of 9. Clicking a cluster, or pressing Enter on it, zoomed in to 13 centered on it, where its nodes show one by one.

**Limits of this evidence:** the node service is mocked (MSW), as in SCRUM-77. Real data may have poles at the same coordinates; those stay grouped at the deepest zoom (Q2).

## 9. Implementation notes
- **No clustering library** (decided 2026-10-16, Paola). Libraries such as supercluster or leaflet.markercluster group points inside one fixed radius, which cannot follow "the drawings touch" when markers have different sizes (32 px and 58 px wide). Our rule is a small pure function instead.
- `components/MapCanvas/clusterMarkers.ts`: projects each marker to screen pixels at the current zoom (Web Mercator, 256 px tiles, same math as Leaflet), groups markers whose boxes touch (a grid with cells as large as the largest marker keeps it fast), and repeats until no cluster touches another marker.
- `expansionZoom()`: first zoom, up to the map's maximum (19), at which the nodes of a cluster no longer form one group. A click on a cluster calls `map.setView(clusterPosition, expansionZoom)`.
- `MapCanvas` reads the current zoom with `useMapZoom` (Leaflet's `zoomend` event) and regroups on every zoom or layer change.
- Marker sizes live in `components/MapMarker/mapMarker.constants.ts`, shared by the Leaflet icon and the grouping.
- Leaflet 1.9 makes markers focusable buttons but only fires `click` with the mouse, so the cluster also listens to `keypress` for Enter and Space.
