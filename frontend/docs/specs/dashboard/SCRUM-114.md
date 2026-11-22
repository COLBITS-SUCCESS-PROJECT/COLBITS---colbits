---
feature: dashboard
story: SCRUM-114
title: 'US16 - Active and resolved alarms'
status: IN_REVIEW
owner: Paola
last_updated: 2026-11-16
---

# SCRUM-114 — US16 · Active and resolved alarms

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-114>
Requirements: F-59 to F-63 (frontend subtasks SCRUM-230, SCRUM-231; backend SCRUM-225 to SCRUM-229)
Feature: [FEATURE.md](./FEATURE.md)

## 1. User story
> As a **consultation user**, I want **each alarm, including loss of voltage and transformer phase alarms, to show as active or resolved based on what the device reports, with its duration and a list of the alarms resolved in the last hour or the last day**, so that **I know what is still happening and what just ended**.

| Requirement | The system shall… | Subtask | Owner |
|---|---|---|---|
| F-59, F-60, F-63 | Show each alarm as active or resolved, as the device reports it, with its duration | SCRUM-230 | Paola |
| F-62 | List the alarms resolved in the last hour or the last day, newest first | SCRUM-231 | Paola |
| F-61 | Resolve a fuse fault only when every involved phase has closed | SCRUM-227 (backend) | Mahmoud |

### How it works
- The device decides the state; nobody closes an alarm by hand (F-60). The backend computes it: `GET /faults` lists what is still open and `GET /faults/resolved` what was resolved inside a window. A fuse fault stays open until every phase it involved has closed (F-61).
- **Activas** is unchanged: the open alarms with the duration so far, which grows at every 15 s refresh (F-63).
- **Resueltas** lists the alarms resolved in the window of the *Mostrar* selector (*Última hora* asks `window=1h`, *Último día* asks `window=24h`), newest resolution first (F-62). Each card shows the *Resuelta* badge, a gray accent, the start time and the total duration with the closing time: *45 min · cerrada 10:45* (F-63).
- The list follows the filter at the top of the map, like the active one: layers, location and search (F-56). It has no node counters, because they count active alarms. The header counts the resolved alarms listed.
- The resolved list is asked only while its tab is open, and then every 15 s like the rest of the live view. An alarm that resolves moves from *Activas* to *Resueltas* at the next refresh of each list (NF-01).

### Out of scope
| What | Where |
|---|---|
| Older alarms and their statistics | Historical analysis (`analysis`), linked from the panel |
| Resolved device alerts (free fall, solar panel, overload) | Backend: they are not stored yet (Q1) |
| Inactive devices | [SCRUM-115](./SCRUM-115.md) |

## 2. Acceptance criteria

| ID | Criterion (Given / When / Then) | Test type | Test |
|---|---|---|---|
| AC1 | **Given** an active alarm, **when** the device reports that the condition is back to normal, **then** it leaves *Activas* and appears in *Resueltas* within 20 s (F-59, F-60, F-61, NF-01) | Automated + end-to-end | `pages/LiveMonitoringPage.resolved.acceptance.test.tsx`, section 8 |
| AC2 | **Given** alarms resolved at 08:00, 10:00 and 09:00, **when** *Resueltas* is shown, **then** they appear in the order 10:00, 09:00, 08:00 (F-62) | Automated | `pages/LiveMonitoringPage.resolved.acceptance.test.tsx`, `model/faultRules.test.ts` |
| AC3 | **Given** an alarm activated at 10:00 and resolved at 10:45, **then** its card reads *45 min · cerrada 10:45*; **given** one activated at 10:00 and still active at 11:30, **then** it reads *1 h 30 min* (F-63) | Automated | `components/FaultListItem/FaultListItem.test.tsx`, `pages/LiveMonitoringPage.resolved.acceptance.test.tsx` |
| AC4 | **Given** *Resueltas*, **when** the user picks *Última hora* or *Último día*, **then** only the alarms resolved in that window are listed | Automated | `pages/LiveMonitoringPage.resolved.acceptance.test.tsx`, `hooks/useResolvedFaultsQuery.integration.test.tsx` |
| AC5 | **Given** a map filter (layers, location or search), **when** *Resueltas* is shown, **then** it lists only the resolved alarms the filter keeps, like *Activas* (F-56) | Automated | `pages/LiveMonitoringPage.resolved.acceptance.test.tsx`, `model/faultRules.test.ts` |
| AC6 | **Given** *Resueltas*, **then** it shows a loading state, an empty state when nothing was resolved in the window, and an error with *Reintentar* when the service fails; it shows no node counters | Automated | `components/FaultPanel/FaultPanel.test.tsx`, `pages/LiveMonitoringPage.resolved.acceptance.test.tsx` |
| AC7 | **Given** the panel on *Activas*, **then** the page does not ask for the resolved alarms; it asks only while *Resueltas* is open | Automated | `pages/LiveMonitoringPage.resolved.acceptance.test.tsx` |

## 3. Design (Figma)

| Frame / component | Link |
|---|---|
| M11 · Resolved alarms | [8-4841](https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=8-4841) |
| Fault List Item | [3-131](https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=3-131) |

## 4. Screens and states

| State | What the user sees |
|---|---|
| Loading | Card skeletons while the resolved alarms arrive |
| Populated | *Fallas resueltas*, the *Mostrar* selector, *Resueltas automáticamente por el equipo · la más reciente primero*, and one card per resolved alarm |
| Empty | *No hay fallas que coincidan con los filtros.* |
| Error | *No se pudieron cargar las fallas.* with *Reintentar* |

## 5. User flow
1. The user opens *Resueltas* in the fault panel.
2. The system asks `GET /faults/resolved` for the window of the *Mostrar* selector and lists the alarms newest first.
3. The user switches between *Última hora* and *Último día*; the list follows the map filter and refreshes every 15 s.

## 6. Data and endpoints

Same shape as `GET /faults` (`backend/src/faults/dto/faults.dto.ts`), with `state: 'RESOLVED'`.

```ts
interface ActiveFaultDto {
  // … same fields as in GET /faults
  state: 'OPEN' | 'RESOLVED'
  started_at: string
  /** Resolution time; null while open. */
  ended_at: string | null
  /** From started_at to ended_at when resolved, to generated_at while open (F-63). */
  duration_seconds: number
}
```

| Method | Path | Purpose |
|---|---|---|
| GET | `/faults` | Open faults and alarms in scope (US10) |
| GET | `/faults/resolved?window=1h` or `24h` | Faults and alarms resolved in the last hour or day, in scope, newest resolution first. 400 for any other window |

## 7. Open questions

| ID | Question | Owner | Blocking | Answer |
|---|---|---|---|---|
| Q1 | Device alerts (free fall, solar panel, overload) are computed on each request and their end is not stored, so they never reach *Resueltas* | Backend team | No | OPEN — the PO asked the backend to store them (2026-11-16) |
| Q2 | Figma shows *Auto-resolved* in the panel header | Paola (PO) | No | The header counts the resolved alarms (*3 resueltas*), like the other tabs count theirs; the note under the selector says the device resolved them (2026-11-16) |
| Q3 | Figma titles a resolved SMAC alarm *Phase recovery* | Paola (PO) | No | The card keeps its alert type (*Pérdida de fase*) with the *Resuelta* badge, so an alarm has the same name in both tabs (2026-11-16) |

## 8. Acceptance test results
Fill in after testing. Every FAIL needs an action taken.

| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| 2026-11-16 | AC1–AC7 | PASS | Automated (`pnpm test:coverage`) | — |
| 2026-11-16 | AC1, AC2, AC4, AC5, AC7 | PASS | End-to-end: local PostgreSQL + API from `develop` (demo mode on) + built frontend in Chromium | — |

**How the end-to-end check was run:** the API from `develop` with the seed database and demo mode on, and the frontend built from this branch, logged in as `admin@colbits.com` at 1440 px.
- The demo scenarios opened and closed a fuse, cut and restored a voltage, and dropped and restored a phase.
- With the panel on *Activas*, the page sent no request for resolved alarms. Opening *Resueltas* asked `window=24h`, and *Última hora* asked `window=1h`.
- With the fuse layer only, the list showed the loss of voltage and the fuse opening. With both layers, the phase loss came first, newest resolution first, as the API sent them. Each card read *0 min · cerrada 00:16* (the scenarios lasted 2 s), and the header read *3 resueltas*.
- With the tab open, a fuse was opened and closed through the API. Its card appeared at the top 14.1 s later, at the next 15 s refresh (NF-01).
- At 390 px the tab fits the bottom sheet with no horizontal scroll, and the console had no errors.

**How to run the automated tests:** `pnpm exec vitest run src/features/dashboard/pages/LiveMonitoringPage.resolved.acceptance.test.tsx src/features/dashboard/hooks/useResolvedFaultsQuery.integration.test.tsx`. They also run in CI on every push.

## 9. Implementation notes
- `useResolvedFaultsQuery(window, isOpen)` asks `GET /faults/resolved` with `window=1h` or `24h`, every 15 s while the tab is open. Its key starts with `['live-monitoring']`, so whatever refreshes the fault list (the demo scenarios, [SCRUM-218](./SCRUM-218.md)) refreshes it too.
- `useResolvedFaultsPanel` gives the tab its list and states; the page passes it to `FaultPanel` as `resolved`.
- `faultRules.ts`: a resolved alarm is inside the window by its resolution time, not its start, as the backend counts it; `selectFaults(…, 'RESOLVED', …)` sorts newest resolution first. Active alarms keep their order (F-57).
- `FaultAlert` gains `endedAt`. `FaultListItem` shows *Resuelta*, a gray accent (`status-offline`) and *{duration} · cerrada {HH:MM}* for a resolved alarm.
- The placeholder *La lista de fallas resueltas llegará en una próxima historia.* is removed.
