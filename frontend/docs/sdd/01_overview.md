# SDD §1: System Overview

**Version:** 0.1 (draft)
**Last updated:** 2026-10-07
**Authors:** Sofia (Frontend Lead)

## 1.1 Purpose

COLBITS is a Smart Monitoring Platform for Electrical IoT Networks. The frontend provides a web-based dashboard for operations teams at Colbits SAS to:
- Monitor real-time electrical network sensor readings
- Manage IoT devices and network topology
- Receive and respond to threshold alerts
- Generate historical reports

## 1.2 Stakeholders

| Stakeholder | Concern |
|---|---|
| Operations staff (Colbits SAS) | Real-time visibility, alerts, ease of use |
| Colbits SAS technical team | Device management, configuration |
| GDSD supervisors | Code quality, architecture, documentation |
| Frontend team (Sofia, Monica, Paola) | Maintainability, developer experience |
| Backend team (Yeison, Javier, Mahmoud) | API contract stability, integration |

## 1.3 Goals

1. Real-time dashboard with < 2-second data refresh on sensor readings
2. Accessible on desktop (primary) and tablet (secondary) at ≥ 1024px
3. Internationalized from day one (ES-CO primary, EN secondary)
4. Zero-downtime deployments via static build + API separation
5. 70% minimum test coverage before Alpha prototype

## 1.4 Non-goals

- Mobile (< 768px) is out of scope for MVP
- Offline-first / service worker caching (deferred to post-MVP)
- Native mobile app

## 1.5 System context

```
[Browser / Operator]
       ↕ HTTPS
[COLBITS Frontend SPA]  ←→  [COLBITS API Gateway (Spring Boot)]
                                    ↕
                             [IoT Device Network]
```

The frontend is a pure SPA — it has no server component. All business logic and device communication lives in the backend.
