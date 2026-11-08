---
feature: dashboard
story: SCRUM-112
title: 'US14 - Map filter and search'
status: IN_PROGRESS
owner: Sofia
last_updated: 2026-11-06
---

# SCRUM-112 — US14 · Map filter and search

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-112>
Requirements: F-33 ([SCRUM-221](https://colbits-success.atlassian.net/browse/SCRUM-221)), F-34 ([SCRUM-222](https://colbits-success.atlassian.net/browse/SCRUM-222)), both Sofia
Feature: [FEATURE.md](./FEATURE.md)

## 1. User story
> As a **consultation user**, I want **to filter the map by zone, substation or circuit and search by node or device identifier**, so that **I can go straight to what I need**.

| Requirement | The system shall… | Acceptance criterion (Requirements Specification v2.1) |
|---|---|---|
| F-33 | When the user filters the map by zone, substation or circuit, show only the nodes that belong to the selected element | Given nodes in circuits C1 and C2, when the user filters by C1, then only C1's nodes remain. The filter offers only elements within the user's scope |
| F-34 | When the user searches for a node or device identifier, center the map on the matching node | Given a node identifier and the identifier of a device installed on another node, when the user searches each one, then the map centers on the corresponding node. An unknown identifier, or one outside the user's scope, shows no results |

### Out of scope
| What | Where |
|---|---|
| Fault panel following the map filter, ordering and counters (F-56, F-57, F-58) | US15 · SCRUM-113. This story keeps the panel consistent with the new filter values (§9) but does not change its rules |
| Inactive-device list following the map filter (F-41) | Its own story |
| Selecting an alarm centers and highlights its node (F-35) | Its own story |

## 2. Acceptance criteria

### Part 1 — backend `GET /nodes` (no Jira subtask existed: added to SCRUM-221 / SCRUM-222)

| ID | Criterion (Given / When / Then) | Test type | Test |
|---|---|---|---|
| AC1 | **Given** nodes in scope, **when** `GET /nodes` is requested, **then** each node carries its `zone`, `substation` and `circuit` (id and name, substation also code) from `nodes → circuits → substations → zones`. *(F-33)* | Automated + manual against the database | `backend/src/nodes/nodes.service.spec.ts` · Section 8 |
| AC2 | **Given** a node with Falcons and a SMAC, **when** `GET /nodes` is requested, **then** it carries `device_ids`: the current device of each fuse and transformer (`current_hw_id`), sorted; empty when it has none. *(F-34)* | Automated + manual | Same |
| AC3 | **Given** a consultation user, **then** only nodes in their scope are returned, so no location or device outside it is ever sent (F-10, unchanged). | Automated (existing) | `backend/test/nodes.e2e-spec.ts` |

### Part 2 — frontend map filter and search

| ID | Criterion (Given / When / Then) | Test type | Test |
|---|---|---|---|
| AC4 | **Given** nodes in circuits C1 and C2, **when** the user filters by C1, **then** only C1's nodes remain on the map; the same for a zone and a substation. *(F-33)* | Automated + manual | `pages/LiveMonitoringPage.filterSearch.acceptance.test.tsx` · Section 8 |
| AC5 | **Given** the user's nodes, **then** the zone, substation and circuit lists offer only the elements of those nodes (the user's scope); choosing a zone narrows the substations and circuits offered, and a substation narrows the circuits. *(F-33)* | Automated | `model/scopeOptions.test.ts` + acceptance test |
| AC6 | **Given** two circuits with the same name in different substations, **then** the circuit list shows them apart (name · substation) and filtering by one shows only its nodes. | Automated | `model/scopeOptions.test.ts` |
| AC7 | **Given** a node identifier, **when** the user searches it (Enter), **then** the map centers on that node and says so; upper/lower case and surrounding spaces do not matter. *(F-34)* | Automated + manual | Acceptance test · Section 8 |
| AC8 | **Given** the identifier of a device installed on another node, **when** the user searches it, **then** the map centers on that node. *(F-34)* | Automated + manual | Same |
| AC9 | **Given** an unknown identifier, or one outside the user's scope, **when** the user searches it, **then** the map does not move and a "no results" message is shown. *(F-34)* | Automated | Same |
| AC10 | **Given** a location filter that hides the found node, or layers that do not draw it, **when** it is found, **then** the location filter is cleared and its layer turned on, so the user sees it. | Automated | Same |
| AC11 | Every text exists in Spanish and English; the filters and search work at mobile (375 px), tablet (768 px) and desktop (1440 px). | Automated + manual | `src/i18n/locales.test.ts` · Section 8 |

## 3. Design (Figma)

| Frame / component | Link |
|---|---|
| Map Toolbar (filters + search) | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=5-319> |

The toolbar already exists (SCRUM-128); this story connects it to the map. Only addition: one status line under the search field for the result.

## 4. Screens and states

| State | What the user sees |
|---|---|
| No filter | Every node in scope, as today |
| Filtered | Only the nodes of the selected zone / substation / circuit; the map frames them |
| Filter with no nodes | The map's existing "no nodes" message |
| Search found | The map centers on the node; status line "Map centered on node X" |
| Search not found | The map does not move; status line "No node or device matches X in your scope" |

## 5. User flow
1. The user opens *Location* and picks a zone, a substation and/or a circuit → the map shows only those nodes.
2. The user types a node or device identifier and presses Enter → the map centers on the node, or says there is no match.

## 6. Data and endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/nodes` | Nodes in scope. **New fields:** `zone`, `substation`, `circuit`, `device_ids` |

```ts
interface NodeDto {
  // …existing fields (name, latitude, longitude, fuse_state, smac_inactive, transformer_state)
  zone: { id: number; name: string } | null
  substation: { id: number; code: string; name: string } | null
  circuit: { id: number; name: string } | null
  device_ids: string[] // current Falcon (fuses.current_hw_id) and SMAC (trafos.current_hw_id) ids
}
```

| Field | Table · column |
|---|---|
| Location | `nodes.circuit_id` → `circuits` (`id`, `name`) → `substations` (`id`, `code`, `name`) → `zones` (`id`, `name`) |
| Devices | `fuses_sets` → `fuses.current_hw_id` and `trafos.current_hw_id` of the node |

## 7. Open questions

| ID | Question | Owner | Blocking | Answer |
|---|---|---|---|---|
| Q1 | No backend subtask existed for US14 although F-33 and F-34 need the location and devices of each node | Sofia (SM) | No | Done in this story (Part 1); reviewed by backend |
| Q2 | Does the search match part of an identifier? | Paola (PO) | No | Exact identifier only (F-34 speaks of "the matching node"); case and spaces ignored. The fault panel keeps its own partial match on node id |
| Q3 | A device previously installed on a node (not `current_hw_id`)? | Paola (PO) | No | OPEN — only current devices are searched |

## 8. Acceptance test results

| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| YYYY-MM-DD | AC1 | PASS / FAIL | <Name> | — |

## 9. Implementation notes
- Filter values are **ids**, not names: circuit names repeat across substations (`CTO 1` in several), so a name cannot identify one circuit.
- The fault panel used to compare the filter with the fault's zone/substation/circuit **names** (`GET /faults` sends only the circuit name). It now keeps a fault when its **node** is among the filtered nodes, so the panel stays consistent with the map. F-56's full rules stay in US15.
- `GET /nodes` is polled every 15 s; the location lists are rebuilt from the latest nodes.
