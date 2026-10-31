---
feature: dashboard
title: Live Monitoring
status: IN_PROGRESS
owner: Sofia
last_updated: 2026-10-21
---

# Feature: Live Monitoring

## 1. Purpose
Give grid operators a real-time view of the medium-voltage network on a map: where fuses (Falcon devices) and transformers (SMAC devices) are, which ones are in fault right now, and the live detail of any node — so they can react to outages quickly.

## 2. Scope

### In scope
- Map with fuse / transformer / combined markers coloured by state, grouped into clusters where they overlap (F-13) ✅
- Layer switch (fuses, transformers, both), hierarchical filters (zone › substation › circuit) and node search ✅
- Map legend ✅
- Active faults panel: counters, *Active* / *Resolved* tabs, time window, alert type, classification, minimum-duration filter ✅
- *Inactive devices* tab 🔲 (placeholder)
- Node detail panel: live status (F-27, F-29) ✅ · time series and alarm history 🔲 (node view, F-28)
- Top bar with last-refresh timestamp and *Live* / *Stale* state ✅ (shared, in `AppShell`)
- Stale-data banner, alarm selection → map focus 🔲
- Responsive layout: mobile navigation drawer, collapsible location filters and map legend, and fault panel bottom sheet below desktop width ✅

### Out of scope
- Historical charts and rankings (→ `analysis`)
- Report export (→ `reports`)
- User administration (→ `users`)
- Assistant chat (→ `chatbot`)

## 3. Stories

| Story | Summary | Owner | Status |
|---|---|---|---|
| SCRUM-128 | Base screen M1: map, toolbar, legend, fault panel (with sample data) | Sofia | DONE |
| [SCRUM-77](./SCRUM-77.md) | [F-12] Node markers on a real map at recorded coordinates (US4) | Sofia | DONE |
| [SCRUM-63](./SCRUM-63.md) | [F-13] Group overlapping node markers into one cluster (US4) | Paola | IN_REVIEW |
| [SCRUM-65](./SCRUM-65.md) | US6 · Fuse layer node colors: red / yellow / gray / green from `GET /nodes` (F-15 to F-18) | Sofia | DONE |
| [SCRUM-106](./SCRUM-106.md) | US8 · Layer toggles and dual-state nodes (F-14, F-24) | Sofia | IN_REVIEW |
| [SCRUM-109](./SCRUM-109.md) | US11 · Node detail panel (M4–M6): `GET /nodes/:name/detail` + panel over the map (F-27, F-29) | Sofia | IN_REVIEW |
| — | Inactive devices tab (M12, M14) | TBD | PLANNED |
| [SCRUM-110](./SCRUM-110.md) | US12 · Live node state updates: the map refreshes every 15 s (F-25, F-26, F-30, NF-01) | Paola | IN_REVIEW |
| [SCRUM-108](./SCRUM-108.md) | US10 · Active fault list from `GET /faults`: each fault with its classification and affected clients (F-51, F-55) | Paola | IN_REVIEW |

## 4. Design (Figma)
Base URL: `https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=<id>`

| Screen (page *2 Templates & Pages*) | node-id | Status |
|---|---|---|
| M1 · Monitor / Fuses layer | `8-133` | ✅ |
| M2 · Monitor / Transformers layer | `8-580` | ✅ (layer switch) |
| M3 · Monitor / Both layers | `8-946` | ✅ (layer switch) |
| M4–M9 · Node detail | `8-1876` … `8-3987` | 🔲 |
| M10 · Stale data + min-duration filter | `8-4449` | Partly (top bar stale state, filter) |
| M11 · Resolved alarms | `8-4841` | ✅ |
| M12 / M14 · Inactive devices | `8-5197`, `2011-11763` | 🔲 |
| M13 · Alarm selected → map focus | `2011-11123` | 🔲 |

| Component (page *1 Design System*) | node-id |
|---|---|
| Top Bar | `5-196` |
| Map Toolbar | `5-319` |
| Map Canvas | `5-322` |
| Map Legend | `5-348` |
| Map Marker | `3-267` |
| Fault Panel | `5-764` |
| Fault List Item (F-51, F-55) | `3-131` |
| Fault Counter Card | `3-96` |

## 5. Routes

| Route | Page component | Guard |
|---|---|---|
| `/dashboard` | `pages/LiveMonitoringPage` | RequireAuth (pending SCRUM-61) |

## 6. Components

| Component | Layer | Location |
|---|---|---|
| `TopBar`, `NavSidebar` | Organism | design-system (via `AppShell`) |
| `Select`, `SearchField`, `Tabs`, `LegendItem`, `CounterCard`, `DataField`, `RefreshTimestamp` | Molecule | design-system |
| `ToggleChip`, `Badge`, `StatusDot`, `Toggle`, `Tooltip`, `Icon`, `Button`, `Skeleton` | Atom | design-system |
| `MapMarker`, `PhaseChips`, `FaultListItem`, `FuseSetCard`, `TransformerCard`, `FaultPanelToggle` | Molecule | `src/features/dashboard/components/` |
| `MapToolbar`, `MapCanvas`, `MapLegend`, `FaultPanel` (+ `FaultFilters`, `FaultList`), `NodeDetailPanel` | Organism | `src/features/dashboard/components/` |

Other code:
- `model/` — types, constants, `faultRules.ts` (filters, sort: customers affected → oldest first), `scopeOptions.ts`
- `hooks/` — `useLiveMonitoringQuery` (TanStack Query on `GET /faults`, polling every 15 s, marks data freshness), `useLiveMonitoringFilters` (UI state)
- `api/` — node service: `nodes.dto.ts` (PROVISIONAL), `nodes.mapper.ts`, `nodes.api.ts`; hook `useNodesQuery`. Fault service: `faults.dto.ts`, `faults.mapper.ts`, `faults.api.ts` (SCRUM-108)
- Sample fault-panel data for component tests (every alert type, resolved faults, counters): `src/mocks/data/liveMonitoring.fixtures.ts`
- Map: Leaflet + OpenStreetMap inside `MapCanvas` only (ADR-0006). Sample nodes in Cali come from the MSW mock (`src/mocks/`)

## 7. API contract
- **Map:** `GET /nodes` (SCRUM-77, SCRUM-65) and `GET /nodes/:name/detail` (SCRUM-109).
- **Fault panel, active tab:** `GET /faults` — open fuse-opening faults in the user's scope (US10, [SCRUM-108](./SCRUM-108.md)). The page reads `LiveMonitoringData` (`model/liveMonitoring.types.ts`) through `faults.mapper.ts`.
- **Not available yet:** node counters (US15) and resolved faults (US16). Until then the counters are hidden and the Resolved tab says the list is coming (PO decision, 2026-10-31).

## 8. Open questions and decisions

| ID | Question | Owner | Answer | Date |
|---|---|---|---|---|
| Q1 | WebSocket or polling for live data? (`AGENT.md §20`, OQ-03) | Javier / Mahmoud | **Polling every 15 s** — [decision](../../decisions/live-updates.md), [SCRUM-110](./SCRUM-110.md) | 2026-10-27 |
| Q2 | Which map library / basemap provider? | Frontend team | **Leaflet + OpenStreetMap** — ADR-0006. Markers at real coordinates (SCRUM-77) | 2026-10-10 |
| Q3 | After how long without data is the view *Stale*? | Paola (PO) | OPEN — 5 min meanwhile (`STALE_AFTER_MS`) | — |
| Q4 | Spanish copy for toolbar options ("Todas" instead of "Todas las subestaciones") to fit Figma widths | Paola (PO) | Proposed | 2026-10-07 |
| Q5 | Minimum viewport and mobile fault-panel presentation | Paola (PO) | **360 px minimum; panel opens as a bottom sheet over the map on mobile.** | 2026-10-18 |
