---
feature: dashboard
story: SCRUM-116
title: 'US18 - Device alerts'
status: IN_PROGRESS
owner: Monica
last_updated: 2026-11-16
---

# SCRUM-116 — US18 · Device alerts

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-116> (frontend subtask [SCRUM-246](https://colbits-success.atlassian.net/browse/SCRUM-246))
Feature: [FEATURE.md](./FEATURE.md)

## 1. User story

> As a **consultation user**, I want **device alerts when a Falcon's supercapacitor or a SMAC's battery drops below a configurable level, when a Falcon falls or its solar panel fails, and when a transformer is overloaded or unbalanced**, so that **I can act before a device stops reporting or a transformer is damaged**.

Requirements: F-44 (Falcon low energy), F-45 (SMAC low energy), F-47 (alert list), NF-08 (configurable thresholds).

### Scope of this delivery

The alerts are shown in the _Active_ tab of the fault panel, with the other alarms, and follow the map filter and layers like them (F-56). Two sources:

| Alert                                                     | Requirement | Source                   | Backend subtask |
| --------------------------------------------------------- | ----------- | ------------------------ | --------------- |
| `FREE_FALL` (free fall or abnormal movement, Falcon)      | F-47        | `GET /faults`            | SCRUM-245       |
| `SOLAR_PANEL_FAILURE` (Falcon)                            | F-47        | `GET /faults`            | SCRUM-245       |
| `OVERLOAD_UNBALANCE` (SMAC transformer)                   | F-47        | `GET /faults`            | SCRUM-245       |
| `LOW_ENERGY`, supercapacitor below the threshold (Falcon) | F-44        | `GET /device/low-energy` | SCRUM-242       |
| `LOW_ENERGY`, battery below the threshold (SMAC)          | F-45        | `GET /device/low-energy` | SCRUM-243       |

The thresholds are backend settings (NF-08, SCRUM-244): `FALCON_LOW_ENERGY_PERCENT` and `SMAC_LOW_ENERGY_PERCENT` (30 % by default), `SMAC_OVERLOAD_PERCENT` (90) and `SMAC_VOLTAGE_UNBALANCE_PERCENT` (2). The frontend never compares a value with a threshold: it shows what the backend decided.

**TEMPORARY — low energy.** `GET /faults` does not list `LOW_ENERGY` yet, so the panel reads `GET /device/low-energy` and merges its alerts, exactly as it already does with the inactivity alarms of [SCRUM-115](./SCRUM-115.md). The team's plan is for the backend to list `LOW_ENERGY` and `DEVICE_INACTIVITY` in `GET /faults` and `GET /faults/resolved` (Q1); §9 says what to remove then.

**Not in this delivery.** Resolved device alerts: the backend derives them on each request and keeps no history, so `GET /faults/resolved` does not list them and `GET /device/low-energy` has only active ones (Q2). An ended alert leaves the _Active_ tab and does not appear in _Resolved_.

## 2. Acceptance criteria

| ID  | Criterion (Given / When / Then)                                                                                                                                                                                                                                                               | Test type | Test                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------- |
| AC1 | **Given** a Falcon whose latest supercapacitor level is below its threshold, **when** the _Active_ tab loads, **then** a _Baja energía_ alarm shows the node, the fuse it monitors and the level against the threshold (_Supercondensador: 12 % · umbral 30 %_), amber and open (F-44).       | Automated | `FaultListItem.test.tsx`, `lowEnergyAlerts.mapper.test.ts`, `LiveMonitoringPage.deviceAlerts.acceptance.test.tsx` |
| AC2 | **Given** a SMAC whose latest battery level is below its threshold, **when** the transformer layer is on, **then** a _Baja energía_ alarm shows the transformer and its battery level against the threshold, without channel or conditions (F-45).                                            | Automated | `FaultListItem.test.tsx`, `LiveMonitoringPage.deviceAlerts.acceptance.test.tsx`                                   |
| AC3 | **Given** a free fall or a solar-panel failure on a Falcon, **when** the _Active_ tab loads, **then** the alarm shows the node, the branch and phase of its fuse, its start and its duration (F-47).                                                                                          | Automated | `LiveMonitoringPage.deviceAlerts.acceptance.test.tsx`                                                             |
| AC4 | **Given** a transformer above its load or unbalance threshold, **when** the transformer layer is on, **then** the alarm shows the transformer, its active conditions (_Sobrecarga, Desbalance de tensión_) and the values it reported (_Carga 118 % · Desb. V 3.4 % · Desb. I 1.1 %_) (F-47). | Automated | `faults.mapper.test.ts`, `FaultListItem.test.tsx`, `LiveMonitoringPage.deviceAlerts.acceptance.test.tsx`          |
| AC5 | **Given** device alerts inside and outside the user scope, **when** the user opens the map, **then** only the alerts of the devices in scope appear (F-10).                                                                                                                                   | Automated | `LiveMonitoringPage.deviceAlerts.acceptance.test.tsx`                                                             |
| AC6 | **Given** the low-energy service fails, **when** the panel loads, **then** it shows the error with _Reintentar_, and retrying asks the service again.                                                                                                                                         | Automated | `LiveMonitoringPage.deviceAlerts.acceptance.test.tsx`                                                             |
| AC7 | **Given** the backend starts listing `LOW_ENERGY` or `DEVICE_INACTIVITY` in `GET /faults` or `GET /faults/resolved`, **when** the panel loads, **then** each alarm appears once (the temporary sources stop adding that type), open or resolved as the backend says.                          | Automated | `temporaryAlarms.rules.test.ts`, `faults.mapper.test.ts`                                                          |
| AC8 | **Given** the real backend with stored readings below and above the thresholds, **when** a consultation user opens the map, **then** AC1–AC4 hold with real data, and an alert leaves the _Active_ tab after a reading back within its threshold, with no reload.                             | Manual    | §8                                                                                                                |

## 3. Design (Figma)

There is no specific frame for device alerts: they use the existing card.

| Frame / component | Link                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------- |
| Fault List Item   | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=8-5315> |

## 4. Screens and states

The alerts are cards of the _Active_ tab, so the tab's states apply ([SCRUM-108](./SCRUM-108.md), [SCRUM-114](./SCRUM-114.md)). What changes:

| Alarm                              | First two fields of the card                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `LOW_ENERGY`, Falcon               | _Fusible_ (the fuse `custom_id`) · _Supercondensador_ (`12 % · umbral 30 %`, a dash when not sent) |
| `LOW_ENERGY`, SMAC                 | _Transformador_ · _Batería_ (`22 % · umbral 30 %`, a dash when not sent)                           |
| `FREE_FALL`, `SOLAR_PANEL_FAILURE` | _Ramal_ · _Fases_, like a fuse alarm                                                               |
| `OVERLOAD_UNBALANCE`               | _Transformador_ · _Condiciones_, with the load and unbalance values in the footer                  |

| State | What the user sees                                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- |
| Error | If `GET /faults` or `GET /device/low-energy` fails: "No se pudieron cargar las fallas." with _Reintentar_ (both asked again) |

SMAC alerts (battery, overload) are shown only with the _Transformadores · SMAC_ layer on, like every SMAC alarm (F-56).

## 5. User flow

1. The user opens _Monitoreo en vivo_. The panel asks `GET /faults` and `GET /device/low-energy` and polls both every 15 s (NF-01).
2. The device alerts appear among the active alarms: first those of `GET /faults` in the backend order (F-57), then the low-energy ones (lowest level first), then the inactivity ones.
3. Clicking a card centers the map on its node and opens its detail (M13), where the supercapacitor and battery levels are already shown ([SCRUM-109](./SCRUM-109.md)).
4. When a later reading is back within its threshold, the next refresh no longer lists the alert.

## 6. Data and endpoints

| Method | Path                 | Purpose                                                                                    |
| ------ | -------------------- | ------------------------------------------------------------------------------------------ |
| GET    | `/faults`            | Open faults and alarms, including `FREE_FALL`, `SOLAR_PANEL_FAILURE`, `OVERLOAD_UNBALANCE` |
| GET    | `/device/low-energy` | TEMPORARY: active low-energy alerts (F-44, F-45)                                           |

```ts
// Same fields as backend/src/device/dto/low-energy-alerts.dto.ts
interface LowEnergyAlertDto {
  alert_type: 'LOW_ENERGY'
  kind: 'FALCON' | 'SMAC'
  hw_id: string
  source_id: string // fuse or transformer custom_id
  node: string
  zone: { id: number; name: string }
  substation: { id: number; code: string; name: string }
  circuit: { id: number; name: string }
  energy_percent: number // supercaps_per (Falcon) or battery_per (SMAC)
  threshold_percent: number
  recorded_at: string // latest reading
  since: string // first reading of the current low streak
}
```

- `GET /faults` alerts: `faults.dto.ts` → `faults.mapper.ts`. `OVERLOAD_UNBALANCE` carries `conditions` and `transformer_load`. The DTO also accepts `LOW_ENERGY` and `DEVICE_INACTIVITY` (AC7); `DEVICE_INACTIVITY` maps to the gray `INACTIVE` severity.
- Low energy: `lowEnergyAlerts.dto.ts` → `lowEnergyAlerts.mapper.ts` (`toLowEnergyAlarm`) → `FaultAlert` with `energy: { levelPct, thresholdPct }`; hook `useLowEnergyAlarms`. The id is `LOW_ENERGY:<source_id>:<since>`, the form of the backend device-alert ids, so it stays the same during the whole low streak.
- Merge: `model/temporaryAlarms.rules.ts` (`mergeTemporaryAlarms`), used by `LiveMonitoringPage` (active) and `useResolvedFaultsPanel` (resolved).
- Demo scenarios ask the low-energy alerts again after each run (`useRunScenarioMutation`, `LIVE_VIEW_QUERY_KEYS`).
- Sample data (MSW): `mocks/data/faults.fixtures.ts` (one alert of each F-47 type) and `mocks/data/lowEnergyAlerts.fixtures.ts`, in the DTO shapes. Tests that count fuse faults use `fuseOpeningsOnlyHandler` and `noLowEnergyAlertsHandler`.

## 7. Open questions

| ID  | Question                                                                                                                       | Owner                    | Blocking             | Answer                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Should `GET /faults` and `GET /faults/resolved` list `LOW_ENERGY` and `DEVICE_INACTIVITY`, which are in the closed F-47 list?  | Backend (Yeison, Javier) | No (temporary merge) | **OPEN.** Proposed by the frontend (2026-11-16): one source for order (F-57), ids and scope, and resolved ones in the _Resolved_ tab. Until then the frontend merges them. A `GET /faults` `LOW_ENERGY` would also need the level and threshold to fill the card. |
| Q2  | Will resolved device alerts (free fall, solar panel, overload, low energy) be stored, so `GET /faults/resolved` can list them? | Team                     | No                   | **OPEN** (pending team decision, backend `faults.controller.ts`).                                                                                                                                                                                                 |
| Q3  | Threshold for current unbalance (`cuf_percent`, TD-10)?                                                                        | Team                     | No                   | **OPEN.** Disabled until `SMAC_CURRENT_UNBALANCE_PERCENT` is set. Proposed: 10 % as a starting value (2026-11-16).                                                                                                                                                |
| Q4  | Should the node detail mark a supercapacitor or battery level below its threshold?                                             | Backend + PO             | No                   | **OPEN.** The level is shown, but not compared with the threshold. Proposed: `GET /nodes/:name/detail` sends `low_energy` (and the threshold) per fuse and transformer, as `GET /device/inactive` already does.                                                   |

## 8. Acceptance test results

| Date       | Criterion | Result  | Tested by                                                                                                                                       | Action taken                                                         |
| ---------- | --------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 2026-11-16 | AC1–AC7   | PASS    | Automated (`npx vitest run`, 106 files, 739 tests; against MSW, not the real backend; `NODE_OPTIONS=--no-experimental-webstorage` with Node 26) | —                                                                    |
| 2026-11-16 | AC8       | NOT RUN | —                                                                                                                                               | Pending a manual check against the real backend with stored readings |

## 9. Implementation notes

- **Removing the temporary merges** (when Q1 is done): delete `api/lowEnergyAlerts.*`, `hooks/useLowEnergyAlarms.ts`, `hooks/useInactivityAlarms.ts`, `model/inactivityAlarms.rules.ts`, `model/temporaryAlarms.rules.ts`, `mocks/data/lowEnergyAlerts.fixtures.ts`, the low-energy MSW handler and `LOW_ENERGY_ALERTS_QUERY_KEY` in `LIVE_VIEW_QUERY_KEYS`; pass the `GET /faults` and `GET /faults/resolved` lists to `selectFaults` as they are; map the energy level in `faults.mapper.ts` if the backend adds it. Every place is marked `TEMPORARY` in the code. The _Inactive devices_ tab keeps reading `GET /device/inactive`: it lists devices, not alarms.
- **Safety net:** `mergeTemporaryAlarms` drops a merged type as soon as the fault service lists it, and any merged alarm with an id it already sent, so a backend release before the cleanup never shows an alarm twice.
- **Duration of a low-energy alarm:** `GET /device/low-energy` sends no server time, so it runs from `since` to the latest reading (`recorded_at`), never to the browser clock (F-46). It can be shorter than the real time if the device reports rarely.
- **Order:** the low-energy alarms are added after the `GET /faults` ones, not inside the F-57 order (they have no client count, so the backend would place them with the zero-client alarms). Same as the inactivity alarms.
- **Counters (F-58):** unchanged. They count fuse, voltage and phase alarms only.
- **Card:** `FaultListItem` picks its first two fields in `SourceFields` (`EnergyFields`, `TransformerFields`, `FuseSetFields`) by alarm type.
