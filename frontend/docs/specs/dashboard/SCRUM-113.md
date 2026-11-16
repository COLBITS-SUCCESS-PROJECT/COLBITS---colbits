---
feature: dashboard
story: SCRUM-113
title: 'US15 - Fault list ordering and node counters'
status: IN_PROGRESS
owner: Paola
last_updated: 2026-11-15
---

# SCRUM-113 — US15 · Fault list ordering, node counters and the panel following the map

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-113>
Requirements: F-56, F-57, F-58, NF-11 (subtasks below)
Feature: [FEATURE.md](./FEATURE.md)

## 1. User story
> As a **consultation user**, I want **the alarm panel to follow the map filter, list the most serious faults first and summarize the nodes in alarm**, so that **I see the situation of the area I am looking at, starting with what matters most**.

| Requirement | The system shall… | Subtask | Owner | State |
|---|---|---|---|---|
| F-56 | When the user filters the map by zone, substation or circuit, show in the alarm panel only the alarms of the selected element, without a separate filter in the panel | [SCRUM-239](https://colbits-success.atlassian.net/browse/SCRUM-239) | Paola | In review |
| F-57 | Order the fault listing by severity (affected clients) and, for equal severity, by age | [SCRUM-237](https://colbits-success.atlassian.net/browse/SCRUM-237) | Javier | Merged (#77) |
| F-58 | Show in the panel summary separate counters of the nodes with a fuse alarm, a voltage alarm, a phase out of range and a phase drop | [SCRUM-240](https://colbits-success.atlassian.net/browse/SCRUM-240) (backend) · [SCRUM-241](https://colbits-success.atlassian.net/browse/SCRUM-241) (frontend) | Mahmoud · Mónica | In review (#78) |
| NF-11 | Let the severity criterion of the fault listing be changed without modifying code | [SCRUM-238](https://colbits-success.atlassian.net/browse/SCRUM-238) | Mahmoud | Backend done (`SEVERITY_WEIGHT_*` variables); the frontend keeps its order |

### How it works (F-56)
- The live view has a single filter: the toolbar at the top of the map (zone › substation › circuit, layers and search). Since US14 ([SCRUM-112](./SCRUM-112.md) §9) the panel follows its location through each fault's node.
- F-56 removes the panel's own filters: alert type, classification and "Duración mínima ≥ 5 min". The panel keeps its tabs (*Activas* · *Resueltas* · *Dispositivos inactivos*) and the *Mostrar: Última hora · Último día* selector (F-62).
- The minimum-duration filter of F-53, F-54 and NF-10 moves to historical analysis and reports, where faults and average durations are counted (F-69). PO decision, Q1.

### How it works (F-57, F-58, NF-11)
- **The backend decides the order and the counters; the frontend shows them.** `GET /faults` sends the faults already ordered (`fault-ordering.ts`: affected clients, then oldest first, or by alarm type when the `SEVERITY_WEIGHT_*` variables change the criterion) and a `counters` field with the distinct nodes with a fuse alarm, a voltage alarm, a phase out of range and a dropped phase. The frontend neither sorts the open faults nor recounts the nodes.
- The counters count the whole in-scope list, so they do **not** narrow with the map filter or the search; the list does (F-56).
- Inactivity alarms (US17) come from another service: they follow the backend faults, oldest first, and do not count in F-58. The Resolved tab sorts its merged list by resolution time for the same reason.

### Out of scope
| What | Where |
|---|---|
| Minimum-duration filter for counts, averages and reports (F-53, F-54, F-69, NF-10) | Historical analysis and reports |
| Inactive-device list following the map filter (F-41) | US17 · SCRUM-115 |

## 2. Acceptance criteria
AC1 to AC3 split the F-56 criterion of the Requirements Specification v2.2: *"Given active faults in circuits C1 and C2, when the user filters the map by C1, then the alarm panel shows only the faults of C1, and the panel has no filter of its own apart from its tabs and the last hour / last day selector."* AC4 to AC6 are the criteria of F-57, F-58 and NF-11; their tests come with their subtasks.

| ID | Criterion (Given / When / Then) | Test type | Test |
|---|---|---|---|
| AC1 | **Given** active faults in circuits C1 and C2, **when** the user filters the map by C1, **then** the alarm panel shows only the faults of C1, and its count says so. *(F-56)* | Automated + manual | `pages/LiveMonitoringPage.panelFollowsMap.acceptance.test.tsx` · Section 8 |
| AC2 | **Given** the same faults, **when** the user filters the map by substation or by zone, **then** the panel follows each level, says when no fault matches, and lists every fault again with *Todas*. *(F-56)* | Automated | Same file |
| AC3 | **Given** the panel, **then** it has no filter of its own apart from its tabs and the last hour / last day selector: no location, alert type or classification select and no minimum-duration switch. *(F-56)* | Automated + manual | Same file + `components/FaultPanel/FaultPanel.test.tsx` · Section 8 |
| AC4 | **Given** three active faults affecting 200, 50 and 50 clients, **when** the listing loads, **then** the 200-client fault is first and the two 50-client faults follow, oldest first. *(F-57)* | Automated | Backend: SCRUM-237 (#77). Frontend keeps the order it receives: `model/faultRules.test.ts` |
| AC5 | **Given** node N1 with open fuses on two different fuse sets and node N2 whose SMAC reports a dropped phase, **when** the panel summary is shown, **then** it counts 1 node with a fuse alarm, 1 node with a phase drop and 0 nodes with a phase out of range, and no counter by classification or alert type appears. *(F-58)* | Automated | Backend: SCRUM-240 (`active-faults.service.spec.ts`). Frontend shows the counters received: `api/faults.mapper.test.ts`, `LiveMonitoringPage.faults.acceptance.test.tsx` (AC6) |
| AC6 | **Method:** change the severity criterion through the configuration. **Pass if** the fault listing follows the new criterion, with no code change. *(NF-11)* | Configuration test | Backend: SCRUM-238 (`fault-ordering.spec.ts`). Frontend: `model/faultRules.test.ts` (keeps the order received) |

## 3. Design (Figma)

| Frame / component | Link |
|---|---|
| M1 · Monitor / Fuses layer (fault panel) | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=8-133> |
| M10 · Stale data + min-duration filter | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=8-4449> |
| Fault Panel (component) | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=5-764> |

The frames still show the alert type and classification selects and the minimum-duration switch (with its *Filter active* badge in M10). They are older than the client review that corrected F-56; the code follows F-56 (Q2).

## 4. Screens and states

| State | What the user sees |
|---|---|
| Populated | The panel lists the faults of the area chosen at the top of the map. Its header count and the mobile *Fallas (N)* button count the same faults |
| Empty | No fault in the chosen area: "No hay fallas que coincidan con los filtros." |
| Loading / Error | Unchanged ([SCRUM-108](./SCRUM-108.md)) |

## 5. User flow
1. The user opens **Monitoreo en vivo** (`/dashboard`): the panel lists every active fault in their scope.
2. The user picks a zone, substation or circuit at the top of the map: the map and the panel narrow to that area together.
3. *Todas* / *Todos* brings every fault back.

## 6. Data and endpoints
No new endpoint: `GET /faults` now also sends `counters` (`FaultNodeCountersDto`: `fuseAlarmNodes`, `voltageAlarmNodes`, `phaseOutOfRangeNodes`, `phaseDroppedNodes`). The panel takes each fault's area from its node in `GET /nodes` (zone › substation › circuit since US14); `GET /faults` sends only the circuit name.

## 7. Open questions

| ID | Question | Owner | Blocking | Answer |
|---|---|---|---|---|
| Q1 | F-56 leaves the panel without filters of its own, but F-53 and F-54 describe a minimum-duration filter. Where does it go? | Paola (PO) | No | **Historical analysis and reports** (2026-11-12): that is where faults and average durations are counted (F-69) and where reports state the filter (F-54). The live panel follows only the map |
| Q2 | Figma M1 and M10 still show the panel filters. Update the frames? | Paola (PO) | No | OPEN — the code follows F-56 |

## 8. Acceptance test results
Fill in after testing. Every FAIL needs an action taken.

| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| 2026-11-12 | AC1–AC3 | PASS | Automated (`pnpm test:coverage`) | — |
| 2026-11-12 | AC1, AC3 | PASS | Manual check: mocked services (MSW) in Chromium at 1440 and 390 px | — |

AC1 and AC2 already pass with US14 alone, because the panel follows the location since SCRUM-112. AC3 fails without this change: the panel had three filters of its own.

**How to run the automated tests:** `pnpm exec vitest run src/features/dashboard/pages/LiveMonitoringPage.panelFollowsMap.acceptance.test.tsx`. The suite also runs in CI on every push.

## 9. Implementation notes
- `components/FaultPanel/FaultFilters.tsx` keeps only the *Mostrar: Última hora · Último día* chips and the sort note. The alert type and classification selects and the minimum-duration switch, with its tooltip, are gone.
- The `FaultFilters` type (`model/faultRules.ts`) no longer has `alertType`, `classification` or `onlyLongFaults`, and `matchesFilters` no longer checks them. `DEFAULT_FILTERS` and both translation files follow.
- Constants with no other use were removed: `MIN_FAULT_DURATION_MINUTES`, `ALERT_TYPES` and `PHASE_CLASSIFICATIONS`. The alert type and classification labels stay, because the fault cards use them.
- Since 2026-11-15 `selectFaults` no longer sorts open faults and `countAlarmNodes` / `compareFaults` are gone (backend order and counters, F-57, F-58, NF-11). `api/faults.dto.ts` declares `counters`; `toLiveMonitoringData` in the mapper passes it to `useLiveMonitoringQuery`.
- The search of the toolbar still narrows the panel to the nodes whose identifier contains the text, as before this change: it is part of the filter at the top of the map.
