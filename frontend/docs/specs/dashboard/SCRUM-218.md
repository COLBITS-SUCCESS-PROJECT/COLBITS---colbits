---
feature: dashboard
story: SCRUM-218
title: 'US31 - Demo scenario panel'
status: IN_REVIEW
owner: Paola
last_updated: 2026-11-15
---

# SCRUM-218 — US31 · Demo scenario panel

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-218>
Requirements: F-100, NF-01, NF-03 (subtasks SCRUM-254, SCRUM-255; backend SCRUM-252, SCRUM-253)
Feature: [FEATURE.md](./FEATURE.md)

## 1. User story
> As the **Colbits administrator**, I want **a scenario panel in the demo environment where I pick a node and start or stop a scenario**, so that **I can watch the map, the alarms and the fault list react in real time without touching real data**.

| Requirement | The system shall… | Subtask | Owner |
|---|---|---|---|
| F-100 | Let the administrator pick a node and trigger each scenario from a panel | SCRUM-254 | Paola |
| NF-01 | Show the effect of a scenario on the map, the alarms and the fault list within 20 s | SCRUM-255 | Paola |
| NF-03 | Offer the scenarios only in the demo environment | SCRUM-252, SCRUM-253 | Yeison, Javier |

### How it works
- The panel is a **Demo scenarios** section at the end of the node detail (M4–M6). It is shown only to the administrator, and only when the backend says demo mode is on (`GET /scenarios` → `enabled: true`). Production runs with demo mode off, so the section never appears there (NF-03).
- The actions come from the backend, not from the frontend. Each one says whether it acts on a **fuse** (Falcon) or a **transformer** (SMAC) and whether it needs a phase. The panel groups them:
  - **Fuses:** pick one of the node's fuses that has a Falcon, then *Abrir fusible*, *Cerrar fusible*, *Cortar tensión* or *Restaurar tensión*.
  - **Transformer:** pick the transformer (when the node has more than one) and a phase, then *Quitar fase* or *Restaurar fase*. Only the phases the transformer has are offered: a two-phase transformer has no phase C.
- Each action writes what the device would send (one reading and one alarm, Technical Annex §4.2). The frontend does not change any state itself: after the backend confirms the action, the panel asks the map, the fault list and the node detail for their data again at once, so the change shows without waiting for the next 15 s refresh.
- An action that would not change anything (opening a fuse that is already open) is refused by the backend; the panel explains it. Every action has its opposite, so the administrator undoes a scenario with the same panel.
- The other F-100 scenarios (low energy, inactivity, overload, free fall, solar panel) arrive with SCRUM-253. If they keep the same format, the panel lists them with no frontend change.

### Out of scope
| What | Where |
|---|---|
| The scenarios themselves (what each one writes) | Backend, SCRUM-252 and SCRUM-253 |
| Turning demo mode on in an environment | Deployment (`DEMO_SCENARIOS_ENABLED`) |
| Scenarios that run on a timer (the synthetic generator, F-93) | Backend generator |

## 2. Acceptance criteria

| ID | Criterion (Given / When / Then) | Test type | Test |
|---|---|---|---|
| AC1 | **Given** demo mode is on and I am the administrator, **when** I open a node's detail, **then** I see *Escenarios de demo* with the actions the backend offers for that node's fuses and transformer | Automated | `pages/LiveMonitoringPage.scenarios.acceptance.test.tsx`, `components/DemoScenarioPanel/DemoScenarioPanel.test.tsx` |
| AC2 | **Given** I am a consultation user or an operator, **when** I open a node's detail, **then** there is no scenario section and the page never asks for the scenarios | Automated | Same files |
| AC3 | **Given** demo mode is off (NF-03) or the backend has no scenario service, **when** the administrator opens a node's detail, **then** there is no scenario section | Automated | Same files |
| AC4 | **Given** a node with fuses, **when** I pick a fuse and press *Abrir fusible*, **then** the backend receives `OPEN_FUSE` for that fuse and the panel confirms it with the time of the event. The same holds for *Cerrar fusible*, *Cortar tensión* and *Restaurar tensión* | Automated | Same files |
| AC5 | **Given** a node with a transformer, **when** I choose a phase and press *Quitar fase*, **then** the backend receives `DROP_PHASE` with that channel. Only the phases the transformer has are offered | Automated | `components/DemoScenarioPanel/DemoScenarioPanel.test.tsx`, `model/scenarios.rules.test.ts` |
| AC6 | **Given** I just ran a scenario, **then** the map, the fault list and the node detail show its effect within 20 s (NF-01) | Automated + end-to-end | `pages/LiveMonitoringPage.scenarios.acceptance.test.tsx` (simulated time) and section 8 |
| AC7 | **Given** the action would not change anything, **when** I run it, **then** the panel says the target is already in that state. Every other refusal (demo mode off or not allowed, target not found, invalid, no connection) has its own message | Automated | `components/DemoScenarioPanel/DemoScenarioPanel.test.tsx` |
| AC8 | **Given** the backend offers a new action for a fuse or a transformer (SCRUM-253), **when** the panel loads, **then** it lists it with no frontend change, under its code until it has a label | Automated | Same file |

## 3. Design (Figma)
There is no frame for this panel. It reuses the node detail and its parts: the section title of *Estado actual*, `Select` and `Button`.

| Frame / component | Link |
|---|---|
| M4–M6 · Node detail | [8-1876](https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=8-1876) |
| Select | [Design System](https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=4-97) |

## 4. Screens and states

| State | What the user sees |
|---|---|
| Hidden | Not the administrator, demo mode off, or `GET /scenarios` unavailable (an older backend answers 404) or failed: the node detail looks as before |
| Loading | Nothing until the list of scenarios arrives. It is asked once per session |
| Populated | *Escenarios de demo*: a note that the actions generate test data, then *Escenarios de fusible* (fuse picker and its actions) and *Escenarios del transformador* (transformer and phase pickers and their actions) |
| Empty | *Este nodo no tiene equipos para simular escenarios.* when no fuse has a Falcon and no transformer has a SMAC |
| Running | The pressed button shows a spinner and every action button is disabled |
| Done | *Fusible abierto en ND04821A07-A-R (10:42:05).* (the action, its target and the time of the event) |
| Error | One message per refusal: already in that state (409), demo mode off or not allowed (403), not found (404), invalid (400), any other failure |

## 5. User flow
1. The administrator opens the map in the demo environment and clicks a node.
2. At the end of the node detail, under *Escenarios de demo*, they pick a fuse (or the transformer and a phase) and press an action.
3. The panel sends `POST /scenarios` and shows the confirmation.
4. The marker, the fault list and the node detail show the new state; the opposite action undoes it.

## 6. Data and endpoints (PROVISIONAL)

Same shapes as `backend/src/scenarios/dto/scenarios.dto.ts` (backend PR #90).

```ts
// PROVISIONAL — pending OpenAPI confirmation
interface ScenariosStatusDto {
  enabled: boolean
  actions: Array<{ action: string; target: 'FUSE' | 'TRANSFORMER'; channel_required: boolean; effect: string }>
}
interface RunScenarioRequestDto {
  action: string
  target: string // fuse or transformer id from GET /nodes/:name/detail
  channel?: 'A' | 'B' | 'C' // only when channel_required
}
interface ScenarioResultDto {
  action: string
  node: string
  target: string
  channel: 'A' | 'B' | 'C' | null
  hw_id: string
  event_code: string
  event_type: 'SET' | 'CLEAR'
  recorded_at: string
  effect: string
}
```

| Method | Path | Purpose |
|---|---|---|
| GET | `/scenarios` | Demo mode on or off and the actions it offers (any signed-in user) |
| POST | `/scenarios` | Run one action. Administrator only, inside the user's scope, demo mode only. 201 with the event; 400 invalid, 403 demo mode off or not allowed, 404 not found or out of scope, 409 nothing would change |

A phase exists when the transformer's last reading states its voltage (a dropped phase reads 0 V and still exists). Without a reading, the phase count at the end of the transformer id decides (`-2`: A and B), as the backend checks.

## 7. Open questions

| ID | Question | Owner | Blocking | Answer |
|---|---|---|---|---|
| Q1 | Where does the panel go? There is no Figma frame | Paola (PO) | No | In the node detail, for the administrator in demo mode only (2026-11-15) |
| Q2 | Targets of the SCRUM-253 scenarios: free fall and solar panel on a fuse (Falcon), overload on a transformer (SMAC); low energy and inactivity on both, as one action per target | Javier | No | OPEN (asked 2026-11-15) |
| Q3 | Demo mode on the Beta server: `deploy/docker-compose.yml` does not set `DEMO_SCENARIOS_ENABLED` | Yeison | Yes, for the Beta demo | OPEN |

## 8. Acceptance test results
Fill in after testing. Every FAIL needs an action taken.

| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| 2026-11-15 | AC1–AC8 | PASS | Automated (`pnpm test:coverage`) | — |
| 2026-11-15 | AC1, AC2, AC4–AC7 | PASS | End-to-end: local PostgreSQL + API from backend PR #90 in demo mode + built frontend in Chromium | — |
| 2026-11-15 | AC8 | PENDING | End-to-end needs the SCRUM-253 actions | Run again when SCRUM-253 is merged |

**How the end-to-end check was run:** the API of backend PR #90 with `DEMO_SCENARIOS_ENABLED=true`, the seed database, and the frontend built from this branch, logged in as `admin@colbits.com` at 1440 px. Each action was pressed in the panel and timed until the map and the fault list showed it:

| Action | Target | Map and fault list after | Time from the click |
|---|---|---|---|
| Abrir fusible | `0000100002-A-R` | Marker *Fusible abierto*, fault *Apertura de fusible · 0000100002* listed, fuse *Abierto* in the detail | 0.17 s |
| Abrir fusible again | same | *No cambió nada: 0000100002-A-R ya está en ese estado.* (409) | — |
| Cerrar fusible | same | Fault gone, marker back to its previous state | 0.13 s |
| Cortar tensión / Restaurar tensión | same | Marker *Sin tensión*, then back | 0.15 s / 0.15 s |
| Quitar fase A | `0000100004-T1-3` | Marker *1 fase caída*, fault *Pérdida de fase*, phase A at 0 V in the detail and in the phase picker | 0.15 s |
| Restaurar fase A | same | Marker *Todas las fases OK* | 0.13 s |

Logged in as `client@colbits.com`, the node detail had no scenario section and the page sent no request to `/scenarios`. At 390 px the panel fits the bottom sheet with no horizontal scroll.

**Seen during the check:** a fuse opened again less than 5 minutes after it was closed joins the same fault (grouping window, F-48), so the list keeps the first start time. In a demo, use another fuse or wait 5 minutes before opening the same one again.

**How to run the automated tests:** `pnpm exec vitest run src/features/dashboard/pages/LiveMonitoringPage.scenarios.acceptance.test.tsx src/features/dashboard/components/DemoScenarioPanel`. They also run in CI on every push.

## 9. Implementation notes
- `DemoScenarioPanel` (organism) lives in the node detail and renders nothing unless the user is the administrator and `useScenariosQuery` says demo mode is on. The query is not even sent for other roles.
- The list of scenarios is kept for the whole session (`staleTime: Infinity`): demo mode only changes when the backend restarts. A 403 when running an action asks for it again, so the section disappears if demo mode was turned off.
- Labels: `dashboard:scenarios.action.<CODE>`. An action without a label shows its code and the backend's description, so a new backend action works before the frontend names it.
- An action whose target is neither `FUSE` nor `TRANSFORMER` is not shown, because the panel would not know which ids to offer.
- After each action `useRunScenarioMutation` invalidates `['nodes']` (map and node detail), `['live-monitoring']` (fault list) and `['inactive-devices']`. The 15 s polling (SCRUM-110) stays as it is.
- The fuse list shows each fuse with its state; fuses without a Falcon are left out, because the backend refuses them.
- The session ends 15 min after login until US33 adds the refresh token: log in again right before a demo.
