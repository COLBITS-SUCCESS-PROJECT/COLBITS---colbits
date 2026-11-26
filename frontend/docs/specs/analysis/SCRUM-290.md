---
feature: analysis
story: SCRUM-290
title: "[F-68, F-69, F-70] Indicators panel with counts, durations and rankings"
status: IN_REVIEW
owner: Paola
last_updated: 2026-11-26
---

# SCRUM-290 — Indicators panel: counts, durations and rankings

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-290> · Story US21 (SCRUM-119)
Feature: [FEATURE.md](./FEATURE.md)

## 1. User story
> As a **consultation user**, I want **fault counts by substation and circuit, average and maximum durations, and rankings of nodes and longest faults**, so that **I find where the network fails most**.

## 2. Acceptance criteria
From `COLBITS_Requirements_Specification_v2.md` (F-68, F-69, F-70). Tests: `src/features/analysis/pages/HistoricalAnalysisPage.indicators.acceptance.test.tsx`.

| ID | Criterion (Given / When / Then) | Test type |
|---|---|---|
| AC1 | **Given** faults in several substations and circuits, **when** the user views the panel, **then** "Faults by substation" and "Faults by circuit" show the exact count of each one (F-68). | Automated |
| AC2 | **Given** the minimum-duration filter on with a 1-minute threshold, **when** the indicators load, **then** the average and maximum durations come only from faults longer than 1 minute, and a label next to them says that the filter is on (F-69). | Automated |
| AC3 | **Given** faults in the period, **when** the user views the rankings, **then** the nodes are ordered by fault count and the faults by duration, longest first (F-70). | Automated |
| AC4 | **Given** a period and a scope element, **then** the indicators cover the same days as the charts and only the deepest selected element (F-65). | Automated |
| AC5 | **Given** no faults in the period and scope, or none left by the filter, **then** each card says so. | Automated |
| AC6 | **Given** the indicator service fails, **then** each card shows an error with Retry, and Retry asks again. | Automated |
| AC7 | **Given** the user switches to English, **then** the cards, the filter and its label are in English. | Automated |

## 3. Design (Figma)

| Frame | Link |
|---|---|
| Chart Cards (Faults by substation / by circuit) | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=7-930> |
| Ranking Tables (Top failed nodes, Longest faults) | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=7-1035> |
| Period & Scope Selector (Minimum duration filter) | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=7-789> |

## 4. Screens and states
| State | What the user sees |
|---|---|
| Populated | Four cards under the charts: faults by substation, faults by circuit, top failed nodes, and longest faults with the duration summary on top |
| Filter on | Every card subtitle adds "only faults longer than 1 min", and the duration summary shows an amber label with the threshold |
| Filter off | The duration summary shows a grey "Minimum duration filter off" label |
| Empty | "No faults recorded in this period and scope.", or "No faults longer than 1 min in this period and scope." when the filter removed them |
| Error | Error text and Retry in each card |

## 6. Data and endpoints

GET /faults/indicators (SCRUM-285, SCRUM-286). Unlike GET /history:
- `from` and `to` are both inclusive, so the last day goes as `YYYY-MM-DDT23:59:59.999-05:00`.
- The node filter is `node_id`. The backend intersects the scope filters; the frontend sends only the deepest selected element, as for the charts.
- `min_duration_filter=true` turns the filter on. The threshold comes from the backend (`FAULT_MIN_DURATION_MINUTES`, NF-10), and the UI shows the one in the response instead of a fixed value.

The "Last fault" column is not in the response. It is the latest `started_at` of the node's faults in `longest_faults`, which lists every included fault.

## 8. Acceptance test results
| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| 2026-11-26 | AC1–AC7 (automated, MSW) | PASS | Automated (local run, `pnpm test:coverage`) | — |
| 2026-11-26 | AC1–AC5 live: Chrome, MSW off, local NestJS + PostgreSQL with the repo seed, develop e84d9a5, as admin and as the client user | PASS | Manual, real API (local run) | For 25 Aug–5 Sep, compared the counts, both rankings, the last-fault date and the durations with GET /faults/indicators. Checked the filter request and label, the circuit and node filters, and the empty text with the filter on. |

## 9. Implementation notes
- The minimum-duration filter sits in the Period & Scope Selector, as in Figma, but only these four cards use it: GET /history has no such parameter, so the trend and phase charts stay the same. The card subtitles say when it is on.
- Each ranking shows the top five rows, as in Figma. The substation and circuit lists show every element with faults, because F-68 asks for each one; a long list scrolls inside the card and shows in full when expanded.
- The bars are plain bars, not a chart: the exact count is the number next to each one.
- A fault that is still open is marked "Open", because its duration is still growing.
- `ChartCard` takes an optional `emptyText`, used when the filter removed every fault.
