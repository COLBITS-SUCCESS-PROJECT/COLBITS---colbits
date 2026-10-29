---
feature: dashboard
story: SCRUM-109
title: 'US11 - Node detail with fuse sets'
status: IN_PROGRESS
owner: Sofia
last_updated: 2026-10-29
---

# SCRUM-109 — US11 · Node detail with fuse sets

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-109>
Requirements: F-27 (backend [SCRUM-214](https://colbits-success.atlassian.net/browse/SCRUM-214), frontend [SCRUM-179](https://colbits-success.atlassian.net/browse/SCRUM-179), Sofia), F-29 ([SCRUM-180](https://colbits-success.atlassian.net/browse/SCRUM-180), Yeison, PR #47)
Feature: [FEATURE.md](./FEATURE.md)

## 1. User story
> As a **consultation user**, I want **to select a node and see its circuit and substation, each fuse set with its clients and the details of every fuse in it, and the state of its transformer**, so that **I understand a problem without leaving the map**.

| Requirement | The system shall… | Acceptance criterion (Requirements Specification v2.0) |
|---|---|---|
| F-27 | Limit the node detail shown on the map to the node's circuit and substation, its fuse sets and, for each fuse in each set, its identifier, phase, current state, Falcon supercapacitor level, solar-panel measurement and time of last record, and, if the node has a transformer, its identifier, current state, SMAC battery level, per-phase voltages and time of last record | Given a node with fuse set A (phases R, S and T), fuse set B (phases R and S) and one SMAC, when its detail is shown on the map, then it shows fuse set A with three fuses, fuse set B with two, and the transformer, each with every listed field matching the database, and no other telemetry appears |
| F-29 | Show, in the node detail, the number of clients associated with each fuse set on the node | Given a node with fuse set A (120 clients) and fuse set B (45 clients), when its detail is shown, then it shows 120 for A and 45 for B |

### Out of scope
| What | Where |
|---|---|
| Transformer colour (red / yellow / gray / green) | US7 · SCRUM-105. Until then the detail shows whether the SMAC is inactive and its voltages |
| Telemetry history and charts (F-28) | Node view, not the map |

## 2. Acceptance criteria

### Part 1 — backend `GET /nodes/:name/detail` (SCRUM-214)

| ID | Criterion (Given / When / Then) | Test type | Test |
|---|---|---|---|
| AC1 | **Given** a node with set A (R, S, T), set B (R, S) and one SMAC, **when** its detail is requested, **then** it returns A with three fuses, B with two and the transformer, every listed field equal to the database, and no other telemetry field. *(F-27)* | Automated + manual against the database | `backend/src/nodes/node-detail.service.spec.ts` · Section 8 |
| AC2 | **Given** each fuse set, **when** its detail is requested, **then** it carries its number of clients (`null` when not recorded, not 0). *(F-29)* | Automated + manual | Same |
| AC3 | **Given** a fuse whose Falcon has no record or a record older than `FALCON_INACTIVITY_HOURS`, **when** its detail is requested, **then** it is marked inactive (same rule as US6); a SMAC follows the F-37 rule (`SMAC_INACTIVITY_HOURS`, newest of its three tables). | Automated | Same |
| AC4 | **Given** a node without a transformer, **when** its detail is requested, **then** `transformers` is empty. | Automated + manual | Same |
| AC5 | **Given** no token, **then** 401; **given** a node outside the user's scope or unknown, **then** 404 (same answer, F-10). | Automated + manual | Same + controller spec |

### Part 2 — frontend node detail panel (SCRUM-179)
Written before that code, in the next PR.

## 3. Design (Figma)

| Frame / component | Link |
|---|---|
| M4–M9 · Node detail | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=8-1876> |

## 4. Screens and states
Part 2.

## 5. User flow
1. The user clicks a node on the map.
2. The system requests `GET /nodes/:name/detail` and shows the panel (part 2).

## 6. Data and endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/nodes/:name/detail` | Node detail (F-27, F-29). Requires `Authorization: Bearer <token>`; user scope applied; 404 outside it |

```ts
interface NodeDetailResponse {
  node: string
  circuit: { id: number; name: string }
  substation: { id: number; code: string; name: string }
  fuse_sets: Array<{
    id: number
    set_id: string | null          // branch letter; null on a node with one set
    client_count: number | null    // F-29
    fuses: Array<{
      id: string                   // fuses.custom_id
      phase: string                // R, S, T (or legacy I, C, D)
      hw_id: string | null         // Falcon on that fuse
      fuse_state: string | null    // as stored: 'Abierto' / 'Cerrado'
      is_voltage_present: boolean | null
      inactive: boolean            // no record or older than FALCON_INACTIVITY_HOURS
      supercaps_per: number | null // Falcon supercapacitor level, %
      solar_panel: number | null   // solar-panel measurement
      recorded_at: string | null   // time of last record (ISO)
    }>
  }>
  transformers: Array<{            // empty when the node has no transformer
    id: string                     // trafos.custom_id
    hw_id: string | null           // SMAC
    inactive: boolean              // F-37 rule
    battery_per: number | null     // SMAC battery level, %
    voltages: { va: number | null; vb: number | null; vc: number | null }
    recorded_at: string | null     // newest of the three last_smac_* tables
  }>
}
```

| Field | Table · column |
|---|---|
| Circuit, substation | `nodes.circuit_id` → `circuits` → `substations` |
| Fuse sets, clients | `fuses_sets` (`id`, `set_id`, `client_count`) |
| Fuse | `fuses` (`custom_id`, `phase`, `current_hw_id`) + `last_falcon_values` (`fuse_state`, `is_voltage_present`, `supercaps_per`, `solar_panel`, `recorded_at`) |
| Transformer | `trafos` (`custom_id`, `current_hw_id`) + `last_smac_vc_values` (`battery_per`, `va`, `vb`, `vc`) + newest `recorded_at` of `last_smac_vc/pw/pf_values` |

## 7. Open questions

| ID | Question | Owner | Blocking | Answer |
|---|---|---|---|---|
| Q1 | Can a node have more than one transformer? | Backend | No | The schema allows it (`trafos.node_id`), so `transformers` is a list; with one SMAC it has one item |
| Q2 | Transformer "current state" before US7? | Monica (US7) | No | `inactive` + voltages for now; `transformer_state` is added when US7 exists |

## 8. Acceptance test results

**Part 1 — backend (SCRUM-214)**

| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| 2026-10-29 | AC1–AC5 | PASS | Automated (`node-detail.service.spec.ts` 8 tests, `nodes.controller.spec.ts` 5 new); backend suite 100/100 | — |
| 2026-10-29 | AC1 | PASS | Manual against the database, Docker, generator `--scenarios demo` (AI-assisted run on Sofia's machine) | Node 0000300008 (set A: 3 fuses, set B: 3 fuses, one SMAC): **67 of 67 fields equal the database** (circuit, substation, every fuse field, transformer fields), 0 differences; no other telemetry field |
| 2026-10-29 | AC2 | PASS | Manual against the database | Set A = 24 clients, set B = 37, as `fuses_sets.client_count` |
| 2026-10-29 | AC3 | PASS | Manual, generator scenarios | Inactivity scenario node 0000400003: fuse R `inactive: true`, S and T `false`; node 0000300005: SMAC `inactive: true` |
| 2026-10-29 | AC4 | PASS | Manual | Node 0000100001 (no transformer): `transformers: []` |
| 2026-10-29 | AC5 | PASS | Manual | client: 200 on its circuit, 404 outside it; unknown node 404; no token 401. Swagger documents 200 / 401 / 404 |

**Part 2 — frontend (SCRUM-179):** pending.

## 9. Implementation notes
- Backend: `NodeDetailService` (its own file; `NodesService` is already ~220 lines). Reuses `applyNodeScope` and the same inactivity thresholds as US6 and F-37.
- F-29's `GET /nodes/:name/fuse-sets` stays as it is.
