---
feature: dashboard
story: SCRUM-108
title: 'US10 - Active fault list and phase classification'
status: IN_REVIEW
owner: Paola
last_updated: 2026-10-31
---

# SCRUM-108 — US10 · Active fault list and phase classification

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-108>
Requirements: F-47 to F-51, F-55, NF-09 (subtasks SCRUM-172 to SCRUM-178)
Feature: [FEATURE.md](./FEATURE.md)

## 1. User story
> As a **consultation user**, I want **a list of active faults next to the map, grouped and classified as single-, two- or three-phase, with the clients each one affects**, so that **I know how serious each outage is**.

| Requirement | The system shall… | Owner | Where |
|---|---|---|---|
| F-47 | List next to the map only the alert types of the Colbits specification §3.2 | Javier | Backend, `GET /faults` |
| F-48 | Group openings of the same fuse set less than the grouping window apart (5 min) into one fault | Javier | Backend |
| F-49 | Classify each fault as single-, two- or three-phase by its distinct canonical phases | Javier | Backend |
| F-50 | Report openings in different fuse sets of the same node as separate faults | Mahmoud | Backend |
| NF-09 | Let the grouping window change without code (`FAULT_GROUPING_WINDOW_MINUTES`) | Mahmoud | Backend |
| F-51 | Show for each fault its node, circuit, branch, affected phases, classification, first opening, elapsed duration and state | Paola | This spec |
| F-55 | Show for each active fault the number of affected clients, from its fuse set | Paola | This spec |

This spec covers the frontend part (F-51, F-55): the fault panel stops showing sample data and shows what `GET /faults` returns.

### Out of scope
| What | Where |
|---|---|
| Alert types other than fuse openings (voltage loss, phase drop, overload…) | `GET /faults` lists fuse openings only for now |
| Node counters in the panel summary (F-58) | US15 (Sprint 5) |
| The panel following the map filter, with no filters of its own (F-56) | US15 (Sprint 5) |
| Resolved faults and their last hour / last day list (F-59 to F-63) | US16 (Sprint 5) |

## 2. Acceptance criteria

| ID | Criterion (Given / When / Then) | Test type | Test |
|---|---|---|---|
| AC1 | **Given** an active two-phase fault on branch B of a node, **when** it appears in the list, **then** it shows the node, circuit, branch B, the two affected phases, two-phase, the time of the first opening, the elapsed duration and the state open. *(F-51)* | Automated + end-to-end | `pages/LiveMonitoringPage.faults.acceptance.test.tsx` · Section 8 |
| AC2 | **Given** an active fault on a fuse set with 80 associated clients, **when** the list is shown, **then** that fault shows 80 affected clients. *(F-55)* | Automated + end-to-end | Same file · Section 8 |
| AC3 | **Given** a fault whose fuse set has no client count recorded, **when** the list is shown, **then** the card says the number is missing instead of showing 0. | Automated | Same file |
| AC4 | **Given** a fault active for two days, **when** the user selects the last hour or the last day, **then** it stays in the active list: the selector only limits resolved faults. *(F-62, client review)* | Automated | Same file + `model/faultRules.test.ts` |
| AC5 | **Given** a consultation user, **when** the list loads, **then** it shows only the faults of nodes in their scope. *(F-10, applied by the backend)* | Automated + end-to-end | Same file · Section 8 |
| AC6 | **Given** the panel, **then** it shows no sample data: the node counters are hidden and the Resolved tab says the list is coming. *(PO decision, 2026-10-31)* | Automated + end-to-end | Same file · Section 8 |
| AC7 | **Given** the fault service fails, **when** the panel loads, **then** it shows the error with a retry, and retrying asks the service again. | Automated | Same file |

## 3. Design (Figma)

| Frame / component | Link |
|---|---|
| M1 · Monitor / Fuses layer (Fault Panel, Fault List Item) | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=8-133> |

No new screens: the existing card now shows real data.

## 4. Screens and states

| State | What the user sees |
|---|---|
| Loading | Skeleton cards until the first answer arrives |
| Populated | One card per open fault, ordered by affected clients, then oldest first |
| Empty | "No hay fallas que coincidan con los filtros." |
| Error | "No se pudieron cargar las fallas." with a retry button |
| Resolved tab | "La lista de fallas resueltas llegará en una próxima historia." |

## 5. User flow
1. The user opens **Monitoreo en vivo** (`/dashboard`); the panel requests `GET /faults` and lists the open faults in their scope.
2. The list refreshes every 15 s, together with the map ([SCRUM-110](./SCRUM-110.md)).
3. The user can still narrow the list by alert type, classification, minimum duration and node search.

## 6. Data and endpoints
`GET /faults` (backend `faults.controller.ts`, PR #59). Requires `Authorization: Bearer <token>`; the backend applies the user's scope.

| Response field | What the card shows |
|---|---|
| `node` | Node ID |
| `circuit.name` | Circuit. The service sends no substation, so the circuit is shown alone |
| `branch` | "Ramal B"; a dash when the node has a single fuse set (`null`) |
| `phases` | R · S · T squares, affected in red. Legacy I · C · D phases are not drawn, only their classification (no mapping, client decision 2026-10-23) |
| `classification` | Monofásica / Bifásica / Trifásica, as computed by the backend (F-49); a dash when `PHASES_UNCLASSIFIED` |
| `started_at` | Start time |
| `duration_seconds` | Duration, in minutes |
| `state` | "Abierta" |
| `client_count` | "80 clientes sin servicio"; "Sin dato de clientes" when `null` |

## 7. Open questions

| ID | Question | Owner | Blocking | Answer |
|---|---|---|---|---|
| Q1 | Counters and resolved faults have no endpoint yet: hide them or keep the sample data? | Paola (PO) | No | **Hide them** (2026-10-31): no made-up data on screen |
| Q2 | A node can have one fault per fuse set (F-50), so two cards can have the same accessible name ("Apertura de fusible · node"). Add the branch to the name? | Paola (PO) | No | OPEN |

## 8. Acceptance test results

| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| 2026-10-31 | AC1–AC7 | PASS | Automated (`pnpm test:coverage`) | — |
| 2026-10-31 | AC1, AC2, AC5, AC6 | PASS | End-to-end: local PostgreSQL + API + built frontend in Chromium | — |

**How the end-to-end check was run:** the database was loaded with `backend/database/*.sql` and the generator's demo scenarios (`--reset --scenarios demo`, 20 alarm events), and the API and the frontend were built from this branch. As `admin@colbits.com`, `GET /faults` returned 8 open faults and the panel showed the same 8 ("8 activas"), each with node, circuit, branch, phases, classification, start, duration and clients, ordered 53, 53, 32, 29, 25, 21, 18 and 12 clients. Node 0000400006 showed two faults, single-phase on branch A and two-phase on branch B (F-50); node 0000500002 showed two single-phase faults that opened 6 minutes apart, outside the 5-minute window (F-48). As `client@colbits.com`, the panel showed 1 fault, on node 0000100010, inside that user's scope. No counters were shown, and the Resolved tab showed the coming-soon text.

**Limits of this evidence:** the generator records a client count for every fuse set, so AC3 is covered by the automated test only. The service lists fuse openings only, so other alert types cannot appear yet.

**How to run the automated tests:** `pnpm exec vitest run src/features/dashboard/pages/LiveMonitoringPage.faults.acceptance.test.tsx src/features/dashboard/api/faults.mapper.test.ts`. The suite also runs in CI on every push.

## 9. Implementation notes
- `api/faults.dto.ts`, `faults.mapper.ts` and `faults.api.ts` read the service; `useLiveMonitoringQuery` now calls `GET /faults` and returns `counters: null`. The "last update" time follows this query, so it now reflects real data.
- The classification comes from the backend (F-49). `PhaseChips` receives it and the classification filter uses it; the frontend no longer works it out from the phases (`classifyPhases` removed).
- The last hour / last day selector only limits resolved faults (F-62, client review). Before, an active fault older than a day disappeared from the list.
- `FaultAlert`: `zone` and `substation` can be `null` (the service sends only the circuit), `classification` is new and `customersAffected` can be `null`. A fault without a client count sorts as 0.
- `FaultPanel`: `resolvedFaults: null` shows the coming-soon text; `counters: null` already hid the counters.
- The sample data moved from `model/liveMonitoring.mock.ts` to `src/mocks/data/liveMonitoring.fixtures.ts`: component tests still use it for every alert type, resolved faults and counters.
- Mock service: `src/mocks/handlers/faults.handlers.ts` and `src/mocks/data/faults.fixtures.ts`, with the same scope rule as the node service.
- "1 activa" instead of "1 activas": the count now has singular and plural texts.
