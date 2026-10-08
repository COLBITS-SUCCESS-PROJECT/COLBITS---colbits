---
feature: dashboard
title: Live Monitoring
status: PLANNED
owner: TBD
last_updated: 2026-10-07
---

# Feature: Live Monitoring

## 1. Purpose
Give grid operators a real-time view of the medium-voltage network on a map: where fuses (Falcon devices) and transformers (SMAC devices) are, which ones are in fault right now, and the live detail of any node — so they can react to outages quickly.

## 2. Scope

### In scope
- Map with fuse / transformer / combined markers coloured by state, and clusters
- Layer switch (fuses, transformers, both), hierarchical filters (zone › substation › circuit) and node search
- Map legend
- Active faults panel: tabs *Active*, *Resolved*, *Inactive devices*; minimum-duration filter
- Node detail panel: live status (fuse, transformer or both), time series (Falcon / SMAC), alarm history
- Top bar with last-refresh timestamp and *Live* / *Stale* state

### Out of scope
- Historical charts and rankings (→ `analysis`)
- Report export (→ `reports`)
- User administration (→ `users`)
- Assistant chat (→ `chatbot`)

## 3. Stories

| Story | Summary | Owner | Status |
|---|---|---|---|
| — | Add one row per Jira story when it enters a sprint | — | — |

## 4. Design (Figma)
Base URL: `https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=<id>`

| Frame | node-id |
|---|---|
| Top Bar (Live / Stale) | `5-196` |
| Map Toolbar (layers + filters + search) | `5-319` |
| Map Canvas | `5-322` |
| Map Legend | `5-348` |
| Map Marker (molecule) | `3-267` |
| Active Faults Panel | `5-764` |
| Fault List Item (molecule — F-51, F-55) | `3-131` |
| Node Detail Panel | `6-963` |
| Fuse Group Card / Fuse Row (F-27, F-29) | `2044-1886` / `2044-1847` |

## 5. Routes

| Route | Page component | Guard |
|---|---|---|
| `/dashboard` | `LiveMonitoringPage` | RequireAuth (pending SCRUM-61) |

Rendered inside `AppShell` (navy sidebar), already wired in `src/app/router/index.tsx`.

## 6. Components

| Component | Layer | Location |
|---|---|---|
| `NavSidebar`, `Button`, `Badge`, `StatusDot`, `Toggle`, `Checkbox`, `Icon` | Atoms / organism | design-system (done) |
| `MapMarker`, `FaultListItem`, `FuseRow`, `TelemetryRow` | Molecule | feature |
| `MapToolbar`, `MapCanvas`, `FaultPanel`, `NodeDetailPanel` | Organism | feature |
| `TopBar` | Organism | design-system (shared by every page) |

## 7. API contract (PROVISIONAL)
Not defined yet — pending backend OpenAPI (OQ-02) and real-time strategy (OQ-03).

## 8. Open questions and decisions

| ID | Question | Owner | Answer | Date |
|---|---|---|---|---|
| Q1 | WebSocket or polling for live data? (`AGENT.md §20`, OQ-03) | Javier / Mahmoud | OPEN | — |
| Q2 | Which map library / basemap provider? | Frontend team | OPEN | — |
| Q3 | After how long without data is the view *Stale*? | Paola (PO) | OPEN | — |
