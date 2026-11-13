---
feature: dashboard
story: SCRUM-115
title: 'US17 - Inactivity alarm and inactive device list'
status: IN_PROGRESS
owner: Monica
last_updated: 2026-11-12
---

# SCRUM-115 — US17 · Inactivity alarm and inactive device list

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-115>
Feature: [FEATURE.md](./FEATURE.md)

## 1. User story
> As a **maintenance user**, I want **a list of inactive devices ordered by time without data**, so that **maintenance can start with the oldest cases**.

### Scope of this delivery
The tab reads `GET /device/inactive?hours=24` (backend PR #79, Q1) and polls it like the map, so an inactivity alarm opens when the threshold passes (F-38) and closes at the next record (F-39) without a reload. The list follows the map filter (SCRUM-236, F-41). The inactivity alarm in the alarm panel (active and resolved) is a later step.

## 2. Acceptance criteria

| ID | Criterion (Given / When / Then) | Test type | Test |
|---|---|---|---|
| AC1 | **Given** inactive devices, **when** the user opens the *Inactive devices* tab, **then** the list follows the backend order (F-40): devices silent now first, from the oldest last record to the most recent (a device that never reported first of all), then the devices that came back, the most recently resolved first. Devices outside the user scope do not appear. | Automated | `model/inactiveDevices.rules.test.ts`, `FaultPanel.test.tsx`, `LiveMonitoringPage.inactiveDevices.acceptance.test.tsx` |
| AC2 | **Given** the list, **when** the user reads a card, **then** it shows the device type, node, location, time since the last record (*Never reported* if there is none, or *Reporting*), total inactive time in the range, every period (start → end or *ongoing*) and the threshold (9 h Falcon, 3 h SMAC). | Automated | `InactiveDeviceCard.test.tsx` |
| AC3 | **Given** the list, **when** the user picks *Last hour* or *Last day*, **then** periods are cut to the window and devices without inactivity in it disappear; a device silent now always stays. | Automated | `inactiveDevices.rules.test.ts` |
| AC4 | **Given** inactive devices in circuits C1 and C2, **when** the user filters the map by C1, **then** the list shows only the devices of C1, and the list offers no filter of its own (F-41). | Automated | `inactiveDevices.rules.test.ts`, `FaultPanel.test.tsx`, `LiveMonitoringPage.inactiveDevices.acceptance.test.tsx` |
| AC5 | **Given** the tab, **when** there is no data, it is loading or it failed, **then** the user sees the empty, skeleton or error state (with *Retry*). | Automated | `FaultPanel.test.tsx` |

## 3. Design (Figma)

| Frame / component | Link |
|---|---|
| Fault Panel · Inactive devices | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=8-5315> |
| Inactive Device Card | node `2009:1529` |

## 4. Screens and states

| State | What the user sees |
|---|---|
| Populated | Header "N inactivos ahora", time window chips, sort note, cards (no location selects: the map filter applies) |
| Loading | 3 skeleton cards |
| Empty | "No hay dispositivos inactivos en este periodo." |
| Error | Message with *Reintentar* |

## 5. Data
- Endpoint: `GET /device/inactive?hours=24` → `api/inactiveDevices.api.ts`, DTO `api/inactiveDevices.dto.ts`, mapper `api/inactiveDevices.mapper.ts`. `inactive_now` and `last_record_at` are used as sent, never derived from the periods.
- Types: `model/inactiveDevices.types.ts` (`InactiveDevice` with its location ids and periods; `InactiveDeviceView` = device cut to the window).
- Rules: `model/inactiveDevices.rules.ts` (`selectInactiveDevices`: window, map location filter through `isLocationInFilter`, backend order).
- Hooks: `useInactiveDevicesQuery` (polls every 15 s), `useInactiveDevicesPanel(now, location)`.
- Sample data: `src/mocks/data/inactiveDevices.fixtures.ts` in the DTO shape, served by MSW (`mocks/handlers/device.handlers.ts`) with the scope of each mock user.

## 6. Open questions

| ID | Question | Owner | Blocking | Answer |
|---|---|---|---|---|
| Q1 | Which endpoint lists inactive devices with their periods in a time window (and the scope filters)? | Backend | Yes, for real data | `GET /device/inactive?hours=N` (PR #79). Scope in the backend; zone, substation and circuit come with each device, so the map filter applies on the client. |
| Q2 | Does the inactivity alarm (the story title) also need a notice outside the panel, e.g. a counter on the map or the mobile button? | Paola (PO) | No | OPEN |

## 7. Acceptance test results

| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| 2026-11-09 | AC1–AC5 | PASS | Automated (`pnpm exec vitest run src/features/dashboard`) | — |
| 2026-11-12 | AC1–AC5 (real endpoint, map filter) | PASS | Automated (`npx vitest run`, 580 tests) | Order and inactive state taken from the backend; own location selects removed (F-41) |
