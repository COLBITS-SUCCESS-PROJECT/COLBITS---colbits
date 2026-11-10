---
feature: dashboard
story: SCRUM-115
title: 'US17 - Inactivity alarm and inactive device list'
status: IN_PROGRESS
owner: Monica
last_updated: 2026-11-09
---

# SCRUM-115 — US17 · Inactivity alarm and inactive device list

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-115>
Feature: [FEATURE.md](./FEATURE.md)

## 1. User story
> As a **maintenance user**, I want **a list of inactive devices ordered by time without data**, so that **maintenance can start with the oldest cases**.

### Scope of this delivery
UI only, with sample data. The backend has no endpoint that lists inactive devices (only `GET /device/inactivity-status`, one device at a time, with no periods), so the data layer waits for it (see Q1).

## 2. Acceptance criteria

| ID | Criterion (Given / When / Then) | Test type | Test |
|---|---|---|---|
| AC1 | **Given** inactive devices, **when** the user opens the *Inactive devices* tab, **then** the list shows devices silent now first, longest silence first, then the devices that came back by total inactive time. | Automated | `model/inactiveDevices.rules.test.ts`, `FaultPanel.test.tsx` |
| AC2 | **Given** the list, **when** the user reads a card, **then** it shows the device type, node, location, silence time (or *Reporting*), total inactive time in the range, every period (start → end or *ongoing*) and the threshold (9 h Falcon, 3 h SMAC). | Automated | `InactiveDeviceCard.test.tsx` |
| AC3 | **Given** the list, **when** the user picks *Last hour* or *Last day*, **then** periods are cut to the window and devices without inactivity in it disappear. | Automated | `inactiveDevices.rules.test.ts` |
| AC4 | **Given** the list, **when** the user picks a zone, substation, circuit or node, **then** the list narrows, and each select only offers values that fit the ones above it. | Automated | `inactiveDevices.rules.test.ts`, `useInactiveDevicesFilters.test.ts` |
| AC5 | **Given** the tab, **when** there is no data, it is loading or it failed, **then** the user sees the empty, skeleton or error state (with *Retry*). | Automated | `FaultPanel.test.tsx` |

## 3. Design (Figma)

| Frame / component | Link |
|---|---|
| Fault Panel · Inactive devices | <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=8-5315> |
| Inactive Device Card | node `2009:1529` |

## 4. Screens and states

| State | What the user sees |
|---|---|
| Populated | Header "N inactivos ahora", time window chips, 4 location selects, sort note, cards |
| Loading | 3 skeleton cards |
| Empty | "No hay dispositivos inactivos en este periodo." |
| Error | Message with *Reintentar* |
| No data source yet | The placeholder of the tab (flag `INACTIVE_DEVICES_SAMPLE_DATA` off) |

## 5. Data
- Types: `model/inactiveDevices.types.ts` (`InactiveDevice` with its periods; `InactiveDeviceView` = device cut to the window).
- Rules: `model/inactiveDevices.rules.ts` (`selectInactiveDevices`, `deriveInactiveScope`).
- Sample data: `src/mocks/data/inactiveDevices.fixtures.ts` (the 4 devices of the Figma frame), shown only when `FEATURES.INACTIVE_DEVICES_SAMPLE_DATA` is `true`.
- Hook: `useInactiveDevicesPanel` (marked `TODO SCRUM-115` where the endpoint goes).

## 6. Open questions

| ID | Question | Owner | Blocking | Answer |
|---|---|---|---|---|
| Q1 | Which endpoint lists inactive devices with their periods in a time window (and the scope filters)? | Backend | Yes, for real data | OPEN |
| Q2 | Does the inactivity alarm (the story title) also need a notice outside the panel, e.g. a counter on the map or the mobile button? | Paola (PO) | No | OPEN |

## 7. Acceptance test results

| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| 2026-11-09 | AC1–AC5 | PASS | Automated (`pnpm exec vitest run src/features/dashboard`) | — |
