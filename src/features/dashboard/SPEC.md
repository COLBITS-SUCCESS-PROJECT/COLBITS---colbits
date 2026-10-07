---
feature: dashboard
backlog: v1
status: PLACEHOLDER
last_updated: 2026-10-07
stories: []
---

# Feature: dashboard

## 1. Purpose
Provide a real-time overview of the electrical network status: live sensor readings, active alerts, and device health at a glance.

## 2. Scope

### In scope
- Summary stat cards (active devices, active alerts, networks monitored)
- Real-time sensor reading charts (per sensor, last N minutes)
- Active alerts feed
- Device status overview

### Out of scope
- Detailed device management (→ `devices` feature)
- Historical reports (→ `reports` feature)
- Alert configuration (→ `alerts` feature)

## 3. User stories

| ID | Summary | Status |
|---|---|---|
| SCRUM-? | As an operator I can see the current status of all networks | Not started |
| SCRUM-? | As an operator I can see real-time sensor readings | Not started |
| SCRUM-? | As an operator I can see active alerts | Not started |

## 4. Routes

| Route | Component | Guard |
|---|---|---|
| `/dashboard` | `DashboardPage` | RequireAuth |

## 5. Screen states

### DashboardPage
- **Loading** — skeleton cards for stat tiles, skeleton for chart areas
- **Populated** — stat cards + sensor charts + alert feed
- **No data** — empty state per section (no devices, no alerts)
- **Error** — inline error per widget (one widget failing shouldn't break the page)
- **Partial data** — some sensors offline, shown with `DeviceStatus.OFFLINE` indicator

### SensorChart
- **Loading** — skeleton
- **Populated** — Recharts line/area chart with time on X axis, sensor value on Y
- **No data** — "No recent readings" empty state
- **Error** — "Could not load data" with retry

## 6. API contract (PROVISIONAL)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/dashboard/summary` | Stat counts: devices, alerts, networks |
| GET | `/api/v1/sensors/{id}/readings?from=&to=` | Historical readings for chart |
| GET | `/api/v1/alerts?status=active` | Active alerts list |

> **OQ-03:** Real-time strategy (WebSocket vs polling) is unconfirmed. See agent.md §19.

## 7. Decisions and open questions

| ID | Question | Answer | Date |
|---|---|---|---|
| Q1 | WebSocket or polling for live readings? | OPEN | — |
| Q2 | How many sensors can be on the dashboard at once? | OPEN | — |
| Q3 | What's the data resolution? (readings per minute?) | OPEN | — |
