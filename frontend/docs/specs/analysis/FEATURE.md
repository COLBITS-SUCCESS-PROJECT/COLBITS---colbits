---
feature: analysis
title: Historical Analysis
status: PLANNED
owner: TBD
last_updated: 2026-10-07
---

# Feature: Historical Analysis

## 1. Purpose
Let operators and managers study fault history over a period and a network scope — trends, phase distribution, faults by substation and circuit, load distribution and rankings — to find recurring problems.

## 2. Scope

### In scope
- Period selector: quick ranges and custom range
- Hierarchical scope filter (zone › substation › circuit › node)
- Chart cards: fault trend, phase distribution, faults by substation, faults by circuit, load distribution
- Ranking tables: top failed nodes, longest faults, critical transformers

### Out of scope
- Live state of the network (→ `dashboard`)
- Exporting files (→ `reports`)

## 3. Stories

| Story | Summary | Owner | Status |
|---|---|---|---|
| — | Add one row per Jira story when it enters a sprint | — | — |

## 4. Design (Figma)
Base URL: `https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=<id>`

| Frame | node-id |
|---|---|
| Period & Scope Selector | `7-789` |
| Chart Cards | `7-930` |
| Ranking Tables | `7-1035` |
| Range Chip (molecule) | `3-319` |
| Scope Tag / Scope Tree Row (molecules) | `119-918` / `119-6278` |

## 5. Routes

| Route | Page component | Guard |
|---|---|---|
| `/analysis` | `HistoricalAnalysisPage` | RequireAuth (pending SCRUM-61) |

Currently renders `ComingSoonPage` — replace it in `src/app/router/appRoutes.tsx`.

## 6. Components

| Component | Layer | Location |
|---|---|---|
| `RangeChip`, `ScopeTag`, `ScopeTreeRow` | Molecule | design-system (also used by `reports`) |
| `PeriodScopeSelector` | Organism | design-system (also used by `reports`) |
| `ChartCard`, `RankingTable` | Organism | feature |

Charts use **Recharts** only (`AGENT.md §1`).

## 7. API contract (PROVISIONAL)
Not defined yet — pending backend OpenAPI (OQ-02).

## 8. Open questions and decisions

| ID | Question | Owner | Answer | Date |
|---|---|---|---|---|
| Q1 | Maximum period that can be queried at once? | Paola (PO) / backend | OPEN | — |
