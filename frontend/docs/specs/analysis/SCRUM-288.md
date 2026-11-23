---
feature: analysis
story: SCRUM-288
title: "[F-64, F-65] Historical view with date presets, custom range and scope filter"
status: IN_REVIEW
owner: Sofia
last_updated: 2026-11-19
---

# SCRUM-288 — Historical view: date presets, custom range and scope filter

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-288> · Story US20 (SCRUM-118)
Feature: [FEATURE.md](./FEATURE.md)

## 1. User story
> As an **operator or manager**, I want **to choose the period and the network element of the historical analysis** so that **I can study faults where and when they matter**.

## 2. Acceptance criteria
From `COLBITS_Requirements_Specification_v2.md` (F-64, F-65). Tests: `src/features/analysis/pages/HistoricalAnalysisPage.periodScope.acceptance.test.tsx`.

| ID | Criterion (Given / When / Then) | Test type |
|---|---|---|
| AC1 | **Given** a logged-in user, **when** the view opens, **then** "Last month" is selected and the queried range spans the preceding 30 or 31 calendar days (F-64). | Automated |
| AC2 | **Given** the view, **when** the user picks Last week / Last 6 months / Last year, **then** the range ends today and starts 7 days / 6 months / 1 year before (F-64). | Automated |
| AC3 | **Given** "Custom range", **when** the user picks a start and an end date, **then** exactly that range is queried (F-64). | Automated |
| AC4 | **Given** a custom range with start after end, a missing date or an end in the future, **then** the reason is shown and nothing is queried. | Automated |
| AC5 | **Given** a user with access to Circuit A and Circuit B, **when** Circuit A is selected, **then** all charts and totals reflect only Circuit A (F-65). | Automated |
| AC6 | **Given** any user, **then** the zone › substation › circuit › node selects only offer elements of the user's scope, each narrowed by the level above. | Automated |
| AC7 | **Given** the scope list fails to load, **then** the charts still show the user's whole scope and a note says so. | Automated |

## 3. Design (Figma)

| Frame | Link |
|---|---|
| Period & Scope Selector | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=7-789> |

## 4. Screens and states
| State | What the user sees |
|---|---|
| Populated | Chips, four selects, charts below |
| Custom | Two date pills after the chips |
| Invalid range | Red message under the chips; charts keep the last valid result |
| Scope error | Selects stay at "All"; grey note under them |

## 6. Data and endpoints

GET /history accepts ISO timestamps. The frontend sends midnight in Bogotá for the first day and midnight after the last day (exclusive). Maximum range: 366 days. Send only the deepest selected scope element because the backend unions supplied filters. GET /nodes supplies the user's available network elements.

## 8. Acceptance test results
| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| 2026-11-19 | AC1–AC7 (automated, MSW) | PASS | Claude (AI-assisted) | — |

## 9. Implementation notes
- Ranges are calendar days (`YYYY-MM-DD`, both inclusive) computed on the local date: "last month" goes back one calendar month (31 Mar → 28 Feb).
- The "Minimum duration filter" toggle of the Figma frame belongs to F-69 and is not part of this story.
