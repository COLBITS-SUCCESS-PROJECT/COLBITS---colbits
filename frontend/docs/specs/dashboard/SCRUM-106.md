---
feature: dashboard
story: SCRUM-106
title: 'US8 - Layer toggles and dual-state nodes'
status: IN_REVIEW
owner: Sofia
last_updated: 2026-10-29
---

# SCRUM-106 — US8 · Layer toggles and dual-state nodes

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-106>
Requirements: F-14 ([SCRUM-167](https://colbits-success.atlassian.net/browse/SCRUM-167)), F-24 ([SCRUM-168](https://colbits-success.atlassian.net/browse/SCRUM-168))
Feature: [FEATURE.md](./FEATURE.md)

## 1. User story
> As a **consultation user**, I want **to show or hide the fuse and transformer layers and still tell both states apart on the same node**, so that **one problem never hides another**.

| Requirement | The system shall… | Acceptance criterion (Requirements Specification v2.0) |
|---|---|---|
| F-14 | Provide a fuse layer and a transformer layer that the user can show or hide independently of each other | Given both layers shown, when the user hides the transformer layer, then only fuse-layer markers remain; when the user shows it again and hides the fuse layer, then only transformer-layer markers remain |
| F-24 | While both layers are shown, display a node that has Falcon and SMAC devices so that its fuse-layer state and its transformer-layer state can both be identified | Given both layers shown and a node that is red on the fuse layer and green on the transformer layer, when the map is displayed, then a user can identify both states without hiding a layer (CU-01, flow 3c) |

### Out of scope
| What | Where |
|---|---|
| Transformer-layer colours (red / yellow / gray / green) | US7 · SCRUM-105 (Monica). Until the backend sends `transformer_state`, a node with a transformer is drawn as *Sin dato* on the transformer layer |

## 2. Acceptance criteria

| ID | Criterion (Given / When / Then) | Test type | Test |
|---|---|---|---|
| AC1 | **Given** both layers shown, **when** the user hides the transformer layer, **then** only fuse-layer markers remain; **when** the user shows it again and hides the fuse layer, **then** only transformer-layer markers remain. *(F-14)* | Automated + manual | `pages/LiveMonitoringPage.layers.acceptance.test.tsx` · Section 8 |
| AC2 | **Given** the transformer layer is shown, **when** the map is displayed, **then** a node without a transformer is not drawn on it (it has nothing to show on that layer). *(F-14)* | Automated + manual | `api/nodes.mapper.test.ts`, `LiveMonitoringPage.layers.acceptance.test.tsx` · Section 8 |
| AC3 | **Given** any layer combination, **when** the user looks at the toolbar and the legend, **then** each layer button says whether it is on (`aria-pressed`) and the legend explains only the visible layers. *(F-14)* | Automated | `LiveMonitoringPage.layers.acceptance.test.tsx`, `MapLegend.test.tsx` |
| AC4 | **Given** both layers shown and a node that is red on the fuse layer and green on the transformer layer, **when** the map is displayed, **then** its marker shows both states, and its accessible name says both, without hiding a layer. *(F-24)* | Automated; manual after US7 | `LiveMonitoringPage.layers.acceptance.test.tsx` · Section 8 |

**Decision kept from the base screen (SCRUM-128):** one layer always stays visible: clicking the only visible layer does nothing, so the map is never empty by mistake. See Q1.

## 3. Design (Figma)

| Frame / component | Link |
|---|---|
| M1 · Monitor / Fuses layer | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=8-133> |
| M2 · Monitor / Transformers layer | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=8-580> |
| M3 · Monitor / Both layers | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=8-946> |
| Map Toolbar (layer switch) | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=5-319> |
| Map Marker (fuse, transformer, both) | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=3-267> |

## 4. Screens and states

| State | What the user sees |
|---|---|
| Fuses layer only (default, M1) | Fuse markers; legend: fuse colours |
| Transformers layer only (M2) | Transformer markers, only for nodes with a transformer; legend: transformer colours |
| Both layers (M3) | Nodes with both devices show a split marker (fuse + transformer); legend: both groups |
| Loading / empty / error | Same as SCRUM-77 |

## 5. User flow
1. The user opens **Monitoreo en vivo**: only **Fusibles · Falcon** is on (M1).
2. The user turns on **Transformadores · SMAC**: nodes with both devices show both states (M3).
3. The user turns off **Fusibles · Falcon**: only transformer markers remain (M2).

## 6. Data and endpoints
No new endpoint. `GET /nodes` (US4, US6, US5):

| Field | Meaning on the transformer layer |
|---|---|
| `transformer_state` | Transformer colour. **Not sent yet** (US7): absent = unknown → *Sin dato*; `null` = no transformer |
| `smac_inactive` | Sent since US5 (PR #33). `null` = the node has no transformer → not drawn on the transformer layer (AC2) |

## 7. Open questions

| ID | Question | Owner | Blocking | Answer |
|---|---|---|---|---|
| Q1 | Should the user be able to hide both layers (empty map)? | Paola (PO) | No | OPEN — kept as in the base screen: one layer always visible |
| Q2 | When does the backend send `transformer_state`? | Monica (US7) | AC4 manual only | OPEN — AC4 is verified with the mock until then |

## 8. Acceptance test results

| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| 2026-10-29 | AC1–AC4 | PASS | Automated (`LiveMonitoringPage.layers.acceptance.test.tsx`, 4 tests; `nodes.mapper.test.ts`) | — |
| 2026-10-29 | AC1 | PASS | Manual, real API + map in Docker, generator with `--scenarios demo` (AI-assisted run on Sofia's machine) | Fuses only: 50 nodes · both layers: 50 · transformers only: 15 |
| 2026-10-29 | AC2 | FAIL → PASS | Manual, real API + map | Before: the transformer layer drew all 50 nodes as *Sin dato*, including the 35 without a transformer. Fixed in `nodes.mapper.ts` with `smac_inactive: null`; after: 15 nodes, exactly the ones with a transformer |
| 2026-10-29 | AC3 | PASS | Manual, real API + map | `aria-pressed` follows each button; the legend shows only *Transformadores · SMAC* when it is the only layer; the only visible layer cannot be turned off |
| — | AC4 | PENDING (manual) | — | Automated test passes with the mock. The real-data check waits for `transformer_state` from the backend (US7, Q2) |
| 2026-10-29 | Responsive (AC1, AC3) | PASS | Manual, real API, both layers on, at 375 px (mobile), 768 px (tablet) and 1440 px (desktop) | No horizontal page scroll; both layer buttons fully inside the screen; legend shows both groups at every width |

## 9. Implementation notes
- The layer switch, the dual marker and the legend groups already exist since the base screen (SCRUM-128). This story adds the acceptance tests, the AC2 fix and the real-data check.
- AC2 lives in the mapper (`nodes.mapper.ts`): it is the only place that knows the backend fields.
