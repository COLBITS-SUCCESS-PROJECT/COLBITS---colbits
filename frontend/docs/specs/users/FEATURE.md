---
feature: users
title: User Management
status: PLANNED
owner: TBD
last_updated: 2026-10-07
---

# Feature: User Management

## 1. Purpose
Let administrators create, edit and deactivate platform users and decide which part of the network (zones, substations, circuits) each user can see.

## 2. Scope

### In scope
- User table (including users that share a scope)
- Create / edit user drawer with scope tree
- Confirm-deactivate dialog
- Admin variant of the sidebar with the *User Management* entry (admins only)

### Out of scope
- Login and session (→ `auth`)
- Self-registration and password reset (not planned)

## 3. Stories

| Story | Summary | Owner | Status |
|---|---|---|---|
| — | Add one row per Jira story when it enters a sprint | — | — |

## 4. Design (Figma)
Base URL: `https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=<id>`

| Frame | node-id |
|---|---|
| User Table | `123-1261` |
| User Form Drawer (Create / Edit) | `122-1340` |
| Confirm Deactivate Dialog | `122-1343` |
| User Row (molecule) | `119-6389` |
| Sidebar · Admin | `119-6439` |

## 5. Routes

| Route | Page component | Guard |
|---|---|---|
| `/users` | `UserManagementPage` | RequireRole(`ADMIN`) |

**Already in place (2026-10-17, SCRUM-61 PR):** the sidebar shows *Gestión de usuarios* **only to `ADMIN`**; the page says *Próximamente*, and `/users` is protected by `RequireRole roles={['ADMIN']}` (any other role goes to the map). The page is the shared *coming soon* placeholder until US19 enters a sprint.

## 6. Components

| Component | Layer | Location |
|---|---|---|
| `ScopeTreeRow` | Molecule | design-system (shared with `analysis`) |
| `UserRow`, `UserTable`, `UserFormDrawer`, `ConfirmDeactivateDialog` | Molecule / organism | feature |

## 7. API contract (PROVISIONAL)
Not defined yet — pending backend OpenAPI (OQ-02).

## 8. Open questions and decisions

| ID | Question | Owner | Answer | Date |
|---|---|---|---|---|
| Q1 | Exact roles and what each can see? (`auth.store` has `ADMIN`, `OPERATOR`, `VIEWER`) | Paola (PO) | OPEN | — |
