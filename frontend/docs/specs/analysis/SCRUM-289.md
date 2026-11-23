---
feature: analysis
story: SCRUM-289
title: "[F-66, F-67] Trend chart of faults and voltage alarms, and phase-distribution chart"
status: IN_REVIEW
owner: Sofia
last_updated: 2026-11-19
---

# SCRUM-289 — Fault trend and phase-distribution charts

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-289> · Story US20 (SCRUM-118)
Feature: [FEATURE.md](./FEATURE.md)

## 1. User story
> As an **operator or manager**, I want **to see how fuse faults and voltage alarms evolve and how faults split by phases** so that **I can spot trends and the severity of outages**.

## 2. Acceptance criteria
From `COLBITS_Requirements_Specification_v2.md` (F-66, F-67). Tests: `src/features/analysis/pages/HistoricalAnalysisPage.charts.acceptance.test.tsx`.

| ID | Criterion (Given / When / Then) | Test type |
|---|---|---|
| AC1 | **Given** a range with fuse openings and loss-of-voltage events, **then** the trend chart shows both series per interval, with their totals in the legend (F-66). | Automated |
| AC2 | **Given** a long range (last year), **then** the trend is drawn per week (per day up to 62 days). | Automated |
| AC3 | **Given** the history, **then** the distribution shows the single-, two- and three-phase counts with their share (F-67). | Automated |
| AC4 | **Given** openings on R, S and T of one fuse set within 3 minutes, **then** they count as exactly one three-phase fault (F-67; grouping done by the backend, view shows its result). | Automated |
| AC5 | **Given** a period without faults, **then** both charts say there are no faults. | Automated |
| AC6 | **Given** the history fails to load, **then** both charts show an error with Retry. | Automated |
| AC7 | **Given** the user switches to English, **then** every text of the view is in English (US30). | Automated |

## 3. Design (Figma)
| Frame | Link |
|---|---|
| Chart Cards (Fault trend, Phase distribution) | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=7-930> |

## 4. Screens and states
Loading (skeleton) · Populated · Empty (message) · Error (message + Retry). The SVG charts are decorative; a hidden table and an `aria-label` give the same numbers to screen readers.

## 6. Data and endpoints
SCRUM-283 supplies trend series and totals. SCRUM-284 phase counts are pending. See `GET /history` in [SCRUM-288](./SCRUM-288.md) §6.

## 8. Acceptance test results
| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| 2026-11-19 | AC1–AC7 (automated, MSW) | PASS | Claude (AI-assisted) | — |

## 9. Implementation notes
- Recharts (`AreaChart`, `PieChart`) with colors from semantic tokens `--color-chart-*` / `--color-phase-*`.
- Shares are rounded so they add up to 100 % (`model/phaseShares.ts`).
- The other chart cards of the frame (faults by substation / circuit, transformer load) are F-68 / later stories.
