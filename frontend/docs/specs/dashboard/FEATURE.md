---
feature: dashboard
title: Live Monitoring
status: IN_PROGRESS
owner: Sofia
last_updated: 2026-11-16
---

# Feature: Live Monitoring

## 1. Purpose

Give grid operators a real-time view of the medium-voltage network on a map: where fuses (Falcon devices) and transformers (SMAC devices) are, which ones are in fault right now, and the live detail of any node — so they can react to outages quickly.

## 2. Scope

### In scope

- Map with fuse / transformer / combined markers coloured by state, grouped into clusters where they overlap (F-13) ✅
- Cluster color: each cluster takes the color of its most severe node on the layers shown (Colbits, 2026-11-20) ✅ ([SCRUM-305](./SCRUM-305.md))
- Layer switch (fuses, transformers, both), hierarchical filters (zone › substation › circuit) and node search ✅
- Map legend ✅
- Active faults panel: counters (from the backend), _Active_ / _Resolved_ tabs and the last hour / last day selector; it follows the map filter and has no filters of its own (F-56) ✅ ([SCRUM-113](./SCRUM-113.md))
- _Inactive devices_ tab: list from `GET /device/inactive`, ordered by time without data, following the map filter (F-40, F-41) ✅ ([SCRUM-115](./SCRUM-115.md))
- Inactivity alarm in the _Active_ and _Resolved_ tabs, built from the periods of `GET /device/inactive` (F-38, F-39) ✅ ([SCRUM-115](./SCRUM-115.md) AC6)
- _Resolved_ tab: the alarms resolved in the last hour or day, newest first, each with its total duration; active alarms show the duration so far (F-59 to F-63) ✅ ([SCRUM-114](./SCRUM-114.md))
- Device alerts in the _Active_ tab: free fall, solar-panel failure and transformer overload / unbalance (F-47), and low supercapacitor or battery energy with its level against the threshold (F-44, F-45) 🔲 ([SCRUM-116](./SCRUM-116.md))
- _Inactive devices_ tab 🔲 (placeholder)
- Node detail panel: live status (F-27, F-29) ✅ · time series and alarm history 🔲 (node view, F-28)
- Time of the last successful map refresh (F-32): in the top bar with the _Live_ / _Stale_ state (shared, in `AppShell`), on the map below 1024 px ✅ ([SCRUM-111](./SCRUM-111.md))
- Warning when the map stops refreshing (F-31): banner on the map (M10) and red dot in the top bar ✅ ([SCRUM-111](./SCRUM-111.md))
- Alarm selection → map focus: clicking a card of the _Active_, _Resolved_ or _Inactive devices_ tab centers the map on its node, like the search (F-34), and opens its detail (F-27) ✅
- Demo scenario panel in the node detail, for the administrator in demo mode only (F-100, NF-01, NF-03) 🔲 ([SCRUM-218](./SCRUM-218.md))
- Responsive layout: mobile navigation drawer, collapsible location filters and map legend, and fault panel bottom sheet below desktop width ✅

### Out of scope

- Historical charts and rankings (→ `analysis`)
- Report export (→ `reports`)
- User administration (→ `users`)
- Assistant chat (→ `chatbot`)

## 3. Stories

| Story                       | Summary                                                                                                                                                                                    | Owner                             | Status      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ----------- |
| SCRUM-128                   | Base screen M1: map, toolbar, legend, fault panel (with sample data)                                                                                                                       | Sofia                             | DONE        |
| [SCRUM-77](./SCRUM-77.md)   | [F-12] Node markers on a real map at recorded coordinates (US4)                                                                                                                            | Sofia                             | DONE        |
| [SCRUM-63](./SCRUM-63.md)   | [F-13] Group overlapping node markers into one cluster (US4)                                                                                                                               | Paola                             | IN_REVIEW   |
| [SCRUM-305](./SCRUM-305.md) | Cluster color: the most severe state of its nodes, red before yellow, gray and green (Colbits, 2026-11-20)                                                                                 | Paola                             | IN_REVIEW   |
| [SCRUM-65](./SCRUM-65.md)   | US6 · Fuse layer node colors: red / yellow / gray / green from `GET /nodes` (F-15 to F-18)                                                                                                 | Sofia                             | DONE        |
| [SCRUM-106](./SCRUM-106.md) | US8 · Layer toggles and dual-state nodes (F-14, F-24)                                                                                                                                      | Sofia                             | IN_REVIEW   |
| [SCRUM-109](./SCRUM-109.md) | US11 · Node detail panel (M4–M6): `GET /nodes/:name/detail` + panel over the map (F-27, F-29)                                                                                              | Sofia                             | IN_REVIEW   |
| [SCRUM-115](./SCRUM-115.md) | US17 · Inactive devices tab (M12, M14): list ordered by time without data from `GET /device/inactive` (F-40, F-41); inactivity alarm in the Active / Resolved tabs (F-38, F-39)            | Monica                            | IN_PROGRESS |
| [SCRUM-110](./SCRUM-110.md) | US12 · Live node state updates: the map refreshes every 15 s (F-25, F-26, F-30, NF-01)                                                                                                     | Paola                             | IN_REVIEW   |
| [SCRUM-108](./SCRUM-108.md) | US10 · Active fault list from `GET /faults`: each fault with its classification and affected clients (F-51, F-55)                                                                          | Paola                             | IN_REVIEW   |
| [SCRUM-111](./SCRUM-111.md) | US13 · Time of the last successful map refresh (F-32) and warning when the map stops updating (F-31)                                                                                       | Paola                             | IN_REVIEW   |
| [SCRUM-112](./SCRUM-112.md) | US14 · Map filter (zone / substation / circuit) and node or device search; `GET /nodes` sends location and devices (F-33, F-34)                                                            | Sofia                             | IN_REVIEW   |
| [SCRUM-113](./SCRUM-113.md) | US15 · The panel follows the map filter with no filters of its own (F-56), fault ordering (F-57), node counters (F-58)                                                                     | Paola · Javier · Mónica · Mahmoud | IN_PROGRESS |
| [SCRUM-114](./SCRUM-114.md) | US16 · Active and resolved alarms: resolved list from `GET /faults/resolved` (last hour / last day, newest first) and the duration of each alarm (F-59 to F-63)                            | Paola                             | IN_REVIEW   |
| [SCRUM-116](./SCRUM-116.md) | US18 · Device alerts in the Active tab: free fall, solar panel and overload / unbalance from `GET /faults` (F-47); low energy from `GET /device/low-energy`, temporary (F-44, F-45, NF-08) | Monica                            | IN_PROGRESS |
| [SCRUM-218](./SCRUM-218.md) | US31 · Demo scenario panel in the node detail: run fuse, voltage and phase scenarios and see the map react (F-100, NF-01, NF-03)                                                           | Paola                             | IN_REVIEW   |

## 4. Design (Figma)

Base URL: `https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=<id>`

| Screen (page _2 Templates & Pages_)    | node-id                | Status                                       |
| -------------------------------------- | ---------------------- | -------------------------------------------- |
| M1 · Monitor / Fuses layer             | `8-133`                | ✅                                           |
| M2 · Monitor / Transformers layer      | `8-580`                | ✅ (layer switch)                            |
| M3 · Monitor / Both layers             | `8-946`                | ✅ (layer switch)                            |
| M4–M9 · Node detail                    | `8-1876` … `8-3987`    | 🔲                                           |
| M10 · Stale data + min-duration filter | `8-4449`               | Partly (top bar stale state, banner, filter) |
| M11 · Resolved alarms                  | `8-4841`               | ✅                                           |
| M12 / M14 · Inactive devices           | `8-5197`, `2011-11763` | ✅                                           |
| M13 · Alarm selected → map focus       | `2011-11123`           | ✅                                           |

| Component (page _1 Design System_) | node-id |
| ---------------------------------- | ------- |
| Top Bar                            | `5-196` |
| Map Toolbar                        | `5-319` |
| Map Canvas                         | `5-322` |
| Map Legend                         | `5-348` |
| Map Marker                         | `3-267` |
| Fault Panel                        | `5-764` |
| Fault List Item (F-51, F-55)       | `3-131` |
| Fault Counter Card                 | `3-96`  |
| Banner (Kind=Stale)                | `3-270` |

## 5. Routes

| Route        | Page component             | Guard                          |
| ------------ | -------------------------- | ------------------------------ |
| `/dashboard` | `pages/LiveMonitoringPage` | RequireAuth (pending SCRUM-61) |

## 6. Components

| Component                                                                                                                                                     | Layer    | Location                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------ |
| `TopBar`, `NavSidebar`                                                                                                                                        | Organism | design-system (via `AppShell`)       |
| `Select`, `SearchField`, `Tabs`, `LegendItem`, `CounterCard`, `DataField`, `RefreshTimestamp`, `Banner`                                                       | Molecule | design-system                        |
| `ToggleChip`, `Badge`, `StatusDot`, `Toggle`, `Tooltip`, `Icon`, `Button`, `Skeleton`                                                                         | Atom     | design-system                        |
| `MapMarker`, `PhaseChips`, `FaultListItem`, `FuseSetCard`, `TransformerCard`, `FaultPanelToggle`, `MapRefreshTime`, `MapRefreshStatus`, `ScenarioActionGroup` | Molecule | `src/features/dashboard/components/` |
| `MapToolbar`, `MapCanvas`, `MapLegend`, `FaultPanel` (+ `FaultFilters`, `FaultList`), `NodeDetailPanel`, `DemoScenarioPanel`                                  | Organism | `src/features/dashboard/components/` |

Other code:

- `model/` — types, constants, `faultRules.ts` (filters, sort: customers affected → oldest first), `scopeOptions.ts`
- `hooks/` — `useNodesQuery` (`GET /nodes` every 15 s; each successful answer sets the last refresh time, F-32; a failed refresh marks the map as interrupted, F-31), `useLiveMonitoringQuery` (TanStack Query on `GET /faults`, polling every 15 s), `useResolvedFaultsQuery` (`GET /faults/resolved` every 15 s while the _Resolved_ tab is open) and `useResolvedFaultsPanel` (that tab's list and states), `useLiveMonitoringFilters` (UI state)
- `api/` — node service: `nodes.dto.ts` (PROVISIONAL), `nodes.mapper.ts`, `nodes.api.ts`; hook `useNodesQuery`. Fault service: `faults.dto.ts`, `faults.mapper.ts`, `faults.api.ts` (SCRUM-108). Scenario service: `scenarios.dto.ts` (PROVISIONAL), `scenarios.mapper.ts`, `scenarios.api.ts`; hooks `useScenariosQuery`, `useRunScenarioMutation` ([SCRUM-218](./SCRUM-218.md))
- Sample fault-panel data for component tests (every alert type, resolved faults, counters): `src/mocks/data/liveMonitoring.fixtures.ts`
- Map: Leaflet + OpenStreetMap inside `MapCanvas` only (ADR-0006). Sample nodes in Cali come from the MSW mock (`src/mocks/`)

## 7. API contract

- **Map:** `GET /nodes` (SCRUM-77, SCRUM-65) and `GET /nodes/:name/detail` (SCRUM-109).
- **Fault panel, active tab:** `GET /faults` — open fuse-opening faults in the user's scope (US10, [SCRUM-108](./SCRUM-108.md)), source alarms and device alerts (free fall, solar panel, overload / unbalance; US18, [SCRUM-116](./SCRUM-116.md)). The page reads `LiveMonitoringData` (`model/liveMonitoring.types.ts`) through `faults.mapper.ts`.
- **Fault panel, low-energy alarms (TEMPORARY):** `GET /device/low-energy` — active low supercapacitor (Falcon) or battery (SMAC) alerts with level and threshold, merged into _Active_ until `GET /faults` lists `LOW_ENERGY` ([SCRUM-116](./SCRUM-116.md) Q1, `model/temporaryAlarms.rules.ts`).
- **Fault panel, inactive devices tab and inactivity alarms:** `GET /device/inactive?hours=24` or `?hours=1` — devices of the user scope with their inactivity periods, already in the F-40 order, and the server window (`from`, `to`); polled every 15 s, so the alarm opens (F-38) and closes (F-39) without a reload (US17, [SCRUM-115](./SCRUM-115.md)). The backend does not list the inactivity alarm in `GET /faults` or `/faults/resolved`: the frontend builds one per period and adds it to _Active_ (open) and _Resolved_ (closed inside the window).
- **Node counters (US15, F-58):** computed by the backend and sent in the `counters` field of `GET /faults` (`FaultNodeCountersDto`); the frontend shows them as they come and does not recount (`toFaultCounters` in `api/faults.mapper.ts`). They count the nodes of the whole in-scope list, so they do not narrow with the map filter. The 2026-10-31 decision to hide them (no endpoint, no made-up data) is **superseded by US15**: they are now shown with real data.
- **Demo scenarios (US31):** `GET /scenarios` (demo mode and its actions) and `POST /scenarios` (run one action, administrator only), [SCRUM-218](./SCRUM-218.md) §6.
- **Fault panel, resolved tab (US16):** `GET /faults/resolved?window=1h` or `24h` — faults and alarms resolved in the window, in scope, newest resolution first, with their total duration ([SCRUM-114](./SCRUM-114.md)). Resolved device alerts are not stored yet (SCRUM-114 Q1).

## 8. Open questions and decisions

| ID  | Question                                                                                              | Owner            | Answer                                                                                                                                                  | Date       |
| --- | ----------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Q1  | WebSocket or polling for live data? (`AGENT.md §20`, OQ-03)                                           | Javier / Mahmoud | **Polling every 15 s** — [decision](../../decisions/live-updates.md), [SCRUM-110](./SCRUM-110.md)                                                       | 2026-10-27 |
| Q2  | Which map library / basemap provider?                                                                 | Frontend team    | **Leaflet + OpenStreetMap** — ADR-0006. Markers at real coordinates (SCRUM-77)                                                                          | 2026-10-10 |
| Q3  | After how long without data is the view _Stale_?                                                      | Paola (PO)       | OPEN — 5 min meanwhile (`STALE_AFTER_MS`)                                                                                                               | —          |
| Q4  | Spanish copy for toolbar options ("Todas" instead of "Todas las subestaciones") to fit Figma widths   | Paola (PO)       | Proposed                                                                                                                                                | 2026-10-07 |
| Q5  | Minimum viewport and mobile fault-panel presentation                                                  | Paola (PO)       | **360 px minimum; panel opens as a bottom sheet over the map on mobile.**                                                                               | 2026-10-18 |
| Q6  | The fault panel loses its own filters (F-56). Where does the minimum-duration filter (F-53, F-54) go? | Paola (PO)       | **Historical analysis and reports**, where faults and averages are counted (F-69). The live panel follows only the map ([SCRUM-113](./SCRUM-113.md) Q1) | 2026-11-12 |
| Q7  | Where does the demo scenario panel go? There is no Figma frame                                        | Paola (PO)       | **In the node detail**, for the administrator in demo mode only ([SCRUM-218](./SCRUM-218.md) Q1)                                                        | 2026-11-15 |
