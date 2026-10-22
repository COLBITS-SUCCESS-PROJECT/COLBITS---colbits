---
feature: dashboard
story: SCRUM-65
title: 'US6 - Fuse layer node colors'
status: DONE
owner: Sofia
last_updated: 2026-10-21
---

# SCRUM-65 — US6 · Fuse layer node colors

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-65>
Requirements: F-15, F-16, F-17, F-18 (subtasks SCRUM-83 to SCRUM-86)
Feature: [FEATURE.md](./FEATURE.md)

## 1. User story
> As a **consultation user**, I want **each node on the fuse layer to show red, yellow, gray or green by the state of its fuses**, so that **I spot open fuses and voltage loss right away**.

| Requirement | The system shall… |
|---|---|
| F-15 | Show a node in **red** on the fuse layer while at least one fuse on that node is open |
| F-16 | Show a node in **yellow** while no fuse is open but at least one fuse is without voltage |
| F-17 | Show a node in **gray** while no fuse is open or without voltage, but at least one Falcon is inactive (no record for more than 9 h, F-36) |
| F-18 | Show a node in **green** while every Falcon has a recent record, its fuse is closed and voltage is present |

The state is computed **in the backend** (`GET /nodes` → `fuse_state`) with a strict order: red > yellow > gray > green. The frontend draws the color the backend sends.

### Out of scope
| What | Where |
|---|---|
| Transformer layer colors (SMAC) | US7 · SCRUM-105 (Sprint 4) |
| Showing both layers on the same node | US8 · SCRUM-106 (Sprint 4) |
| Colors changing by themselves without reloading | US12 · SCRUM-110 (Sprint 4) |

## 2. Acceptance criteria

| ID | Criterion (Given / When / Then) | Test type | Test |
|---|---|---|---|
| AC1 | **Given** a node with at least one open fuse, **when** the map shows the fuse layer, **then** the node is red, even if another fuse has no voltage or a Falcon is inactive. *(F-15)* | Automated + manual | `backend/src/nodes/fuse-state.spec.ts` · Section 8 |
| AC2 | **Given** a node with no open fuse and at least one fuse without voltage, **when** the map shows the fuse layer, **then** the node is yellow. *(F-16)* | Automated + manual | `backend/src/nodes/fuse-state.spec.ts` · Section 8 |
| AC3 | **Given** a node with no open fuse and no fuse without voltage, but a Falcon with no record for more than `FALCON_INACTIVITY_HOURS` (9 h), **when** the map shows the fuse layer, **then** the node is gray. *(F-17)* | Automated + manual | `backend/src/nodes/fuse-state.spec.ts`, `nodes.service.spec.ts` · Section 8 |
| AC4 | **Given** a node whose Falcons all reported in time, closed and with voltage, **when** the map shows the fuse layer, **then** the node is green. *(F-18)* | Automated + manual | `backend/src/nodes/fuse-state.spec.ts` · Section 8 |
| AC5 | **Given** the map is open, **when** the user looks at the legend, **then** it explains the four fuse colors. | Automated | `MapLegend/MapLegend.test.tsx` |
| AC6 | **Given** the backend sends `fuse_state` for each node, **when** the frontend maps the response, **then** each marker uses that state, and a node without fuses (`null`) is not drawn on the fuse layer. | Automated | `api/nodes.mapper.test.ts`, `MapCanvas/MapCanvas.test.tsx` |

## 3. Design (Figma)

| Frame / component | Link |
|---|---|
| M1 · Monitor / Fuses layer | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=8-133> |
| Map Marker | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=3-267> |
| Map Legend | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=5-348> |

## 4. Screens and states

| State | What the user sees |
|---|---|
| Loading | Map with a loading indication (same as SCRUM-77) |
| Populated | Each node marker in red, yellow, gray or green; legend with the four colors |
| Empty | No nodes in the user's scope (same as SCRUM-77) |
| Error | Error message with retry (same as SCRUM-77) |

## 5. User flow
1. The user opens **Monitoreo en vivo** (`/dashboard`) with the **Fusibles · Falcon** layer on.
2. The system requests `GET /nodes`; the backend returns `fuse_state` for each node in the user's scope.
3. Each marker is drawn with the color of its state; the legend explains the colors.

## 6. Data and endpoints

```ts
// GET /nodes — one item of `nodes` (verified against the running API on 2026-10-21)
interface NodeDto {
  name: string
  latitude: number | null
  longitude: number | null
  fuse_state: 'CRITICAL' | 'WARNING' | 'INACTIVE' | 'NORMAL' | null // null = node without fuses
}
```

| `fuse_state` | Color | Rule (backend `fuse-state.ts`) |
|---|---|---|
| `CRITICAL` | Red | A fuse is open (`last_falcon_values.fuse_state = 'Abierto'`) |
| `WARNING` | Yellow | None open, a fuse without voltage (`is_voltage_present = false`) |
| `INACTIVE` | Gray | None of the above, a Falcon without a record or older than `FALCON_INACTIVITY_HOURS` |
| `NORMAL` | Green | Everything reported in time, closed and with voltage |

| Method | Path | Purpose |
|---|---|---|
| GET | `/nodes` | Nodes in the user's scope with their fuse state. Requires `Authorization: Bearer <token>`. |

## 7. Open questions

| ID | Question | Owner | Blocking | Answer |
|---|---|---|---|---|
| Q1 | Is the state computed in the backend or in the frontend? | Sofia / backend | No | **Backend**, in `GET /nodes` (PR #29), so every client gets the same color |
| Q2 | Which threshold makes a Falcon inactive? | Paola (PO) | No | **9 h** (F-36), configurable with `FALCON_INACTIVITY_HOURS` (NF-07) |

## 8. Acceptance test results

| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| 2026-10-19 | AC1–AC6 | PASS | Automated (CI, PR #29) | — |
| 2026-10-21 | AC1 | PASS | Manual, real API + map in Docker (AI-assisted run on Sofia's machine) | Node 0000100003: one fuse set to open → `CRITICAL`, red marker |
| 2026-10-21 | AC1 | PASS | Manual, real API | Node 0000100005: open **and** without voltage → `CRITICAL` (red wins) |
| 2026-10-21 | AC2 | PASS | Manual, real API + map | Node 0000100004: one fuse without voltage → `WARNING`, yellow marker |
| 2026-10-20 | AC3 | PASS | Manual, real API + map | Freshly generated data with 6 silent devices: 4 nodes `INACTIVE`, gray markers |
| 2026-10-21 | AC4 | PASS | Manual, real API + map | Untouched nodes → `NORMAL`, green markers |
| 2026-10-20 | AC5 | PASS | Manual, map in ES and EN | Legend shows *Fusible abierto / Sin tensión / Inactivo > 9 h / Normal* |

**How the manual test was run:** the data was generated with the project generator, then single rows of `last_falcon_values` were changed (`fuse_state`, `is_voltage_present`), the API and the map were checked as `client@colbits.com`, and the original values were restored afterwards.

**Limits of this evidence:** the generator does not create open fuses or voltage loss by itself yet (that is US9, Sprint 4), so red and yellow were produced by editing the test database by hand.

## 9. Implementation notes
- Delivered in PR #29 (backend + frontend). Jira subtasks: F-15 to F-17 Monica, F-18 Paola; the implementation was integrated by Sofia.
- Backend: `backend/src/nodes/fuse-state.ts` (rule) and `nodes.service.ts` (one SQL query per page of nodes, `FUSE_SUMMARY_SQL`).
- Frontend: `nodes.dto.ts` / `nodes.mapper.ts` read `fuse_state`; `networkStateStyles.ts` maps each state to a color token; `MapLegend` explains the colors.
- The same inactivity threshold is used for the gray color and for US5 (F-36), so both always agree.
