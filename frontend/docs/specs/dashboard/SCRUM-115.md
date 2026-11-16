---
feature: dashboard
story: SCRUM-115
title: 'US17 - Inactivity alarm and inactive device list'
status: IN_PROGRESS
owner: Monica
last_updated: 2026-11-15
---

# SCRUM-115 — US17 · Inactivity alarm and inactive device list

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-115>
Feature: [FEATURE.md](./FEATURE.md)

## 1. User story

> As a **maintenance user**, I want **a list of inactive devices ordered by time without data**, so that **maintenance can start with the oldest cases**.

### Scope of this delivery

The tab reads `GET /device/inactive?hours=24` or `?hours=1`, one request per window (backend PR #79, Q1), and polls it like the map, so an inactivity alarm opens when the threshold passes (F-38) and closes at the next record (F-39) without a reload. The list follows the map filter (SCRUM-236, F-41), keeps the backend order and measures every time against the server's `to`, never the browser clock (F-46). Each card shows what the device monitors (`source_id`: the fuse or transformer `custom_id`).

The inactivity alarm is also listed in the _Active_ and _Resolved_ tabs (Q2, AC6). The backend does not put it in `GET /faults` and will not (its tests check that silent devices are not there, Q3): the frontend turns each period of `GET /device/inactive` into one `DEVICE_INACTIVITY` alarm and adds it to the panel's lists.

## 2. Acceptance criteria

| ID  | Criterion (Given / When / Then)                                                                                                                                                                                                                                                                                                                                                                                                                                       | Test type | Test                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| AC1 | **Given** inactive devices, **when** the user opens the _Inactive devices_ tab, **then** the list follows the backend order (F-40): devices silent now first, from the oldest last record to the most recent (a device that never reported first of all), then the devices that came back, the most recently resolved first. Devices outside the user scope do not appear.                                                                                            | Automated | `model/inactiveDevices.rules.test.ts`, `FaultPanel.test.tsx`, `LiveMonitoringPage.inactiveDevices.acceptance.test.tsx` |
| AC2 | **Given** the list, **when** the user reads a card, **then** it shows the device type, node, location, time since the last record (_Never reported_ if there is none, or _Reporting_), total inactive time in the range, every period (start → end or _ongoing_) and the threshold (9 h Falcon, 3 h SMAC).                                                                                                                                                            | Automated | `InactiveDeviceCard.test.tsx`                                                                                          |
| AC3 | **Given** the list, **when** the user picks _Last hour_ or _Last day_, **then** periods are cut to the window and devices without inactivity in it disappear; a device silent now always stays.                                                                                                                                                                                                                                                                       | Automated | `inactiveDevices.rules.test.ts`                                                                                        |
| AC4 | **Given** inactive devices in circuits C1 and C2, **when** the user filters the map by C1, **then** the list shows only the devices of C1, and the list offers no filter of its own (F-41).                                                                                                                                                                                                                                                                           | Automated | `inactiveDevices.rules.test.ts`, `FaultPanel.test.tsx`, `LiveMonitoringPage.inactiveDevices.acceptance.test.tsx`       |
| AC5 | **Given** the tab, **when** there is no data, it is loading or it failed, **then** the user sees the empty, skeleton or error state (with _Retry_).                                                                                                                                                                                                                                                                                                                   | Automated | `FaultPanel.test.tsx`                                                                                                  |
| AC6 | **Given** an active device whose last record passes its threshold (9 h Falcon, 3 h SMAC), **when** the panel refreshes, **then** an inactivity alarm appears in the _Active_ tab (F-38); **given** that device stores a new record, **when** the panel refreshes, **then** the alarm leaves _Active_ and appears in _Resolved_ with its end taken from that record's timestamp (F-39), with no manual action. It follows the map filter like the other alarms (F-56). | Automated | `model/inactivityAlarms.rules.test.ts`, `LiveMonitoringPage.inactivityAlarms.acceptance.test.tsx`                      |

## 3. Design (Figma)

| Frame / component              | Link                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| Fault Panel · Inactive devices | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=8-5315> |
| Inactive Device Card           | node `2009:1529`                                                                        |

## 4. Screens and states

| State     | What the user sees                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------- |
| Populated | Header "N inactivos ahora", time window chips, sort note, cards (no location selects: the map filter applies) |
| Loading   | 3 skeleton cards                                                                                              |
| Empty     | "No hay dispositivos inactivos en este periodo."                                                              |
| Error     | Message with _Reintentar_                                                                                     |

## 5. Data

- Endpoint: `GET /device/inactive?hours=24` (_Last day_) or `?hours=1` (_Last hour_) → `api/inactiveDevices.api.ts`, DTO `api/inactiveDevices.dto.ts`, mapper `api/inactiveDevices.mapper.ts` → `InactiveDevicesSnapshot` (`from`, `to`, devices). `inactive_now`, `last_record_at` and the order are used as sent, never derived from the periods; `from` / `to` are the server window and clock.
- Types: `model/inactiveDevices.types.ts` (`InactiveDevice` with its `sourceId`, location ids and periods; `InactiveDeviceView` = device cut to the window).
- Rules: `model/inactiveDevices.rules.ts` (`selectInactiveDevices`: periods cut to `from`–`to`, map location filter through `isLocationInFilter`; no sorting). `model/inactivityAlarms.rules.ts` (`toInactivityAlarms`: one `FaultAlert` per period, open without an end, resolved when its end is inside the window; a device that never reported has no alarm, it is only in the tab).
- Hooks: `useInactiveDevicesQuery(timeWindow)` (one key per window, polls every 15 s), `useInactiveDevicesPanel(location)` and `useInactivityAlarms(timeWindow)`. The page adds the alarms to the _Active_ list and passes them to `useResolvedFaultsPanel`, so both follow the map filter and the panel's window (F-56).
- Sample data: `src/mocks/data/inactiveDevices.fixtures.ts` in the DTO shape, served by MSW (`mocks/handlers/device.handlers.ts`) with the scope of each mock user.

## 6. Open questions

| ID  | Question                                                                                           | Owner              | Blocking                      | Answer                                                                                                                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1  | Which endpoint lists inactive devices with their periods in a time window (and the scope filters)? | Backend            | Yes, for real data            | `GET /device/inactive?hours=N` (PR #79). Scope in the backend; zone, substation and circuit come with each device, so the map filter applies on the client.                                                                                                                                                                                |
| Q2  | Must the inactivity alarm (the story title) appear with the other alarms?                          | Paola (PO)         | Yes, for completing the story | **Yes (2026-11-15): inactivity alarms must appear in the _Active_ tab and then in the _Resolved_ tab.** A notice outside the panel (counter on the map, mobile button) was not asked for. A device that never reported has no alarm in the panel, only in the _Inactive devices_ tab (PO, 2026-11-15).                                     |
| Q3  | What is missing to list the inactivity alarm in the panel?                                         | Backend + Frontend | Yes, for AC6                  | **Answered (2026-11-15).** The backend keeps the alarm out of `GET /faults` and `/faults/resolved` (its tests check it). `GET /device/inactive` returns the open (`end: null`) and resolved periods, and each one is an alarm: start = opens (F-38), end = resolves (F-39). The frontend builds the alarms from it (`toInactivityAlarms`). |

## 7. Acceptance test results

| Date       | Criterion                           | Result  | Tested by                                                                                                                         | Action taken                                                                                                                                                           |
| ---------- | ----------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-09 | AC1–AC5                             | PASS    | Automated (`pnpm exec vitest run src/features/dashboard`)                                                                         | —                                                                                                                                                                      |
| 2026-11-12 | AC1–AC5 (real endpoint, map filter) | PASS    | Automated (`npx vitest run`, 580 tests)                                                                                           | Order and inactive state taken from the backend; own location selects removed (F-41)                                                                                   |
| 2026-11-15 | AC1–AC5 (tab only)                  | PASS    | Automated (43 tests of the tab, run on their own; against MSW, not the real backend)                                              | Q2 answered by the PO: AC6 added, pending the backend                                                                                                                  |
| 2026-11-15 | AC6                                 | NOT RUN | —                                                                                                                                 | Not implemented: the alarm is not in `/faults` yet (Q3)                                                                                                                |
| 2026-11-15 | AC1–AC6                             | PASS    | Automated (`npx vitest run --no-file-parallelism src/features/dashboard`, 49 files, 358 tests; against MSW, not the real backend) | Q3 answered: the alarm is built from the periods of `GET /device/inactive`; the tab asks per window, uses the server time and the backend order, and shows `source_id` |
