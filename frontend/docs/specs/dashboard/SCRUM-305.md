---
feature: dashboard
story: SCRUM-305
title: 'A cluster shows the color of its most severe node'
status: IN_REVIEW
owner: Paola
last_updated: 2026-11-20
---

# SCRUM-305 — A cluster shows the color of its most severe node

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-305> (frontend subtask [SCRUM-306](https://colbits-success.atlassian.net/browse/SCRUM-306))
Requested by **Colbits** in the client meeting of 2026-11-20. It answers Q1 of [SCRUM-63](./SCRUM-63.md).
Feature: [FEATURE.md](./FEATURE.md)

## 1. User story
> As a **consultation user**, I want **each cluster on the map to show the color of its most severe node**, so that **I do not miss a fault when the map is zoomed out**.

**Requirement F-101** (Requirements Specification v2.4): *While two or more nodes are grouped in a cluster marker, the system shall show the cluster in the color of the most severe state among its nodes on the layers shown: red, then yellow, then gray, then green.*

### How it works
- A cluster takes the most severe state of the nodes it groups, in the order the node rules already use (F-15 to F-22): red before yellow, yellow before gray, and gray before green. One red node makes the whole cluster red, and the cluster is green only when every node in it is green.
- Only the layers shown count. With both layers on, each node counts with its fuse state and its transformer state, so a node with two transformer phases down makes the cluster red even when every fuse is closed.
- The color follows the map: when a node changes, its cluster changes with the next refresh (15 s, NF-01).
- Screen readers get the same information: *10 nodos agrupados, el más grave en rojo*, or *todos en verde*.
- The count is white on red and dark on yellow, gray and green, so it stays readable on every color.

### Out of scope

| What | Where |
|---|---|
| How many nodes of each color a cluster holds | Not requested |
| A legend entry that explains the cluster colors | Q1 |

## 2. Acceptance criteria

| ID | Criterion (Given / When / Then) | Test type | Test |
|---|---|---|---|
| AC1 | **Given** a cluster where one node has an open fuse and the others are green, **when** the map is shown zoomed out, **then** the cluster is red, and its description says that the most severe node is red | Automated | `pages/LiveMonitoringPage.clusterColor.acceptance.test.tsx` and `MapCanvas/clusterMarkers.test.ts` |
| AC2 | **Given** a cluster with no red node, **when** the map is shown, **then** the cluster takes the next most severe color: yellow over gray and gray over green; it is green only when every node is green | Automated | Same files and `model/stateSeverity.rules.test.ts` |
| AC3 | **Given** both layers shown and a grouped node whose transformer is red while every fuse is green, **when** the map is shown, **then** the cluster is red; **when** the transformer layer is hidden, **then** the cluster follows the fuse layer only | Automated | `pages/LiveMonitoringPage.clusterColor.acceptance.test.tsx` and `MapCanvas/MapCanvas.test.tsx` |
| AC4 | **Given** a red cluster, **when** its red node returns to normal, **then** the cluster turns green with the next refresh, within 20 s (NF-01) | Automated (simulated time) | `pages/LiveMonitoringPage.clusterColor.acceptance.test.tsx` |
| AC5 | **Given** the running app with generated data, **when** a fuse opens in one group of nodes and the voltage drops in another, **then** those clusters turn red and yellow, groups with an inactive node stay gray and the rest stay green | End-to-end | Section 8 |

The SCRUM-63 acceptance tests must keep passing: clusters still form, split and zoom in the same way.

## 3. Design (Figma)

| Frame / component | Link |
|---|---|
| Map Marker (cluster variant) | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=3-267> |

The Figma cluster variant is still the dark circle. It needs one variant per state: red, yellow, gray and green, with the white border, and the count in white on red and in dark text on the others.

## 4. Screens and states

| State | What the user sees |
|---|---|
| At least one red node | Red circle with the count in white |
| No red node, at least one yellow | Yellow circle with the count in dark text |
| No red or yellow node, at least one gray (inactive or no data) | Gray circle with the count in dark text |
| Every node green | Green circle with the count in dark text |

## 5. User flow
1. The user opens **Monitoreo en vivo** zoomed out; nodes whose markers overlap are grouped (SCRUM-63).
2. A red cluster shows at once that a node in that area has an open fuse (fuse layer) or two or more phases down (transformer layer).
3. The user clicks the cluster; the map zooms in until its nodes separate (SCRUM-63 AC5) and the red node shows.

## 6. Data and endpoints
No new data. The color comes from the node states the map already receives (`GET /nodes`, every 15 s).

## 7. Open questions

| ID | Question | Owner | Blocking | Answer |
|---|---|---|---|---|
| Q1 | Should the map legend explain that a cluster takes the color of its most severe node? | Paola (PO) / Colbits | No | OPEN |

## 8. Acceptance test results
Fill in after testing. Every FAIL needs an action taken.

| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| 2026-11-20 | AC1–AC4 | PASS | Automated (`pnpm test:coverage`) | — |
| 2026-11-20 | AC5 | PASS | End-to-end, see below | — |

**End-to-end check (2026-11-20):** develop `00adda2` with this change, the API in demo mode, generated data (50 nodes in 5 groups of 10, 6 silent devices) and the production build in Chromium. A fuse was opened on `0000100003` and the voltage was cut on `0000300004` with the demo scenarios. Zoomed out, the five groups were red (the group of `0000100003`), yellow (the group of `0000300004`), gray twice (groups with an inactive Falcon) and green. At the widest zoom, the 40-node cluster turned from gray to red with the refresh after the fuse opened.

**How to run:** `pnpm exec vitest run src/features/dashboard/pages/LiveMonitoringPage.clusterColor.acceptance.test.tsx src/features/dashboard/components/MapCanvas src/features/dashboard/components/MapMarker src/features/dashboard/model/stateSeverity.rules.test.ts`. They also run in CI on every push.

## 9. Implementation notes
- `model/stateSeverity.rules.ts`: `STATES_BY_SEVERITY` (`CRITICAL`, `WARNING`, `INACTIVE`, `UNKNOWN`, `NORMAL`) and `mostSevereState()`. `UNKNOWN` (*Sin dato*) ranks below `INACTIVE` and above `NORMAL`; both are gray.
- `components/MapCanvas/clusterMarkers.ts` gives each cluster a `state`: the most severe of the states its markers show, which is both states for a fuse + transformer marker.
- The `MapMarker` cluster variant takes that `state`. The background comes from `STATE_BG_CLASS`, and the count color from the new `STATE_TEXT_CLASS` (`components/networkStateStyles.ts`).
- Label: `dashboard:map.cluster` (*{{count}} nodos agrupados, {{state}}*) with `map.clusterState.<STATE>`.
