---
feature: analysis
title: Historical Analysis
status: IN_PROGRESS
owner: Sofia
last_updated: 2026-11-19
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
| [SCRUM-288](./SCRUM-288.md) | [F-64, F-65] Date presets, custom range, scope filter | Sofia | IN_REVIEW |
| [SCRUM-289](./SCRUM-289.md) | [F-66, F-67] Fault trend and phase distribution charts | Sofia | IN_REVIEW |

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
| `/analysis` | `HistoricalAnalysisPage` | RequireAuth |

## 6. Components

| Component | Layer | Location |
|---|---|---|
| `RangeChip`, `ScopeTag`, `ScopeTreeRow` | Molecule | design-system (also used by `reports`) |
| `PeriodScopeSelector` | Organism | design-system (also used by `reports`) |
| `PeriodScopeSelector` (with `PeriodSelector`, `ScopeFilterBar`) | Organism | feature — moves to design-system when `reports` needs it |
| `ChartCard`, `FaultTrendChart`, `PhaseDistributionChart` | Organism | feature |
| `RankingTable` | Organism | feature (not built) |

Charts use **Recharts** only (`AGENT.md §1`).

## 7. API contract

SCRUM-283 provides authenticated GET /history for F-64–F-66. See SCRUM-288 for date and scope semantics. GET /nodes populates the selectors. SCRUM-284 supplies single_phase, two_phase, three_phase and unclassified counts in phase_distribution. In real API mode the phase card shows an unavailable state when the response omits that data.
