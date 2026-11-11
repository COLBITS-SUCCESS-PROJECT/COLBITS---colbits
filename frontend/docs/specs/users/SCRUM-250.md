---
feature: users
story: SCRUM-250
title: "[F-05] Frontend: user management page with the list and deactivate action"
status: IN_PROGRESS
owner: Monica
last_updated: 2026-11-11
---

# SCRUM-250 — User management page with the list and deactivate action

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-250> (sub-task of [SCRUM-117 · US19](https://colbits-success.atlassian.net/browse/SCRUM-117))
Feature: [FEATURE.md](./FEATURE.md)

## 1. User story
> As the **Colbits administrator**, I want **to see the whole network and to create, edit and deactivate consultation users, giving each one a scope**, so that **I control what each client sees**.

Requirements: F-05, F-07, F-08, F-09.

**Scope of this story: views only.** The backend endpoints (F-05 / F-07) are still in progress, so the page works on in-memory sample data held by `useUserManagement`. Connecting the API is a follow-up (`TODO SCRUM-117`).

## 2. Acceptance criteria

| ID | Criterion (Given / When / Then) | Test type | Test |
|---|---|---|---|
| AC1 | **Given** an administrator, **when** they open *User Management*, **then** they see every consultation user with name, email, up to two scope tags plus "+N more", and status (Active / Inactive). | Automated | `src/features/users/pages/UserManagementPage.test.tsx` |
| AC2 | **Given** the user list, **when** the administrator types in the search box or picks a status, **then** only matching users are listed; with no match an empty message is shown. | Automated | `src/features/users/components/UserTable/UserTable.test.tsx` |
| AC3 | **Given** an active user, **when** the administrator presses *Deactivate* and confirms, **then** the user is shown as Inactive; pressing *Cancel* or Escape leaves the user unchanged. | Automated | `src/features/users/pages/UserManagementPage.test.tsx` |
| AC4 | **Given** an inactive user, **when** the administrator presses *Reactivate*, **then** the user is Active again with the same scope. | Automated | `src/features/users/pages/UserManagementPage.test.tsx` |
| AC5 | **Given** the administrator presses *New user*, **when** they fill name, email and at least one scope item and press *Create user*, **then** the user appears in the list as Active. Missing name, invalid email or empty scope show an error and nothing is created. | Automated | `src/features/users/components/UserFormDrawer/UserFormDrawer.test.tsx` |
| AC6 | **Given** the scope tree, **when** the administrator ticks a zone, substation, circuit, node or device (F-08), **then** it is listed under *Selected scope*; a parent with only some children ticked shows a partial checkbox. | Automated | `src/features/users/model/scopeTree.test.ts` |
| AC7 | **Given** two users, **when** the same scope item is assigned to both (F-09), **then** both keep it. | Automated | `src/features/users/hooks/useUserManagement.test.ts` |
| AC8 | **Given** an existing user, **when** the administrator presses *Edit*, changes the data or the scope and presses *Save changes*, **then** the list shows the new values. | Automated | `src/features/users/pages/UserManagementPage.test.tsx` |
| AC9 | **Given** a user who is not an administrator, **when** they go to `/users`, **then** they are sent to the map (already covered by `RequireRole`). | Automated | `src/app/router/guards/RequireRole.test.tsx` |

## 3. Design (Figma)

Base URL: `https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=<id>`

| Frame / component | node-id |
|---|---|
| Group of the four screens | `2148-11452` |
| Admin / User list | `123-6799` |
| Admin / Create user | `123-7063` |
| Admin / Edit user | `123-7457` |
| Admin / Deactivate confirmation | `123-7854` |
| User Table | `123-1261` |
| User Form Drawer | `122-1079` |
| Confirm Deactivate | `122-1343` |

## 4. Screens and states

| State | What the user sees |
|---|---|
| Populated | Card *Consultation users* with search, status filter and one row per user |
| Empty (filtered) | "No users match the search" message inside the card |
| Empty (no users) | "There are no consultation users yet" message and the *New user* button |
| Deactivate | Centered dialog over a dark overlay; focus inside; Escape cancels |
| Create / Edit | Drawer from the right (full width on phones) with form + scope tree |

Loading and error states arrive with the API (`TODO SCRUM-117`).

## 5. User flow
1. The administrator opens *Gestión de usuarios* in the sidebar.
2. They search or filter the list.
3. *New user* opens the drawer in create mode; *Edit* (pencil) opens it in edit mode with the user's data.
4. The power button on an active user opens the confirmation dialog; on an inactive user it reactivates the account.
5. In the edit drawer, *Deactivate user* closes the drawer and opens the same confirmation dialog.

## 6. Data and endpoints (PROVISIONAL)
Not defined by the backend yet. The domain types are in `src/features/users/model/users.types.ts`.

## 7. Open questions

| ID | Question | Owner | Blocking | Answer |
|---|---|---|---|---|
| Q1 | Does reactivating a user need a confirmation too? The design only shows the deactivate dialog. | Paola (PO) | No | OPEN — reactivates directly for now |
| Q2 | The Role select only offers *Consultation user*. Will the administrator create other roles from here? | Paola (PO) | No | OPEN |
| Q3 | Who sends the temporary password and the reset link: backend email? | Backend | No | OPEN — the field is read-only and the reset link shows a notice |

## 8. Acceptance test results

| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| — | — | — | — | — |

## 9. Implementation notes
- Sample data and the in-memory state are in `features/users` until the endpoints exist; replacing `useUserManagement` with TanStack Query hooks must not change the components.
- `ScopeTag` and `ScopeTreeRow` live in `design-system/molecules` because `analysis` will reuse them (FEATURE.md §6).
- **Scope selection model (F-08).** The scope stores exactly what the administrator ticks. Ticking an element covers its whole subtree: the rows below show checked and locked, and ticks that were already below it are dropped. Nothing is promoted upwards — ticking the only node of a circuit assigns the node, not the circuit, so nodes added to that circuit later stay out of the user's scope. Logic in `model/scopeTree.ts`.
- The scope tree has open / close chevrons (not in Figma) so a substation or a node can be reached without ticking its zone; the path to an existing scope opens by itself, and a search shows every match with its path.
- In Figma the partial zone also appears in *Selected scope*; here only the ticked elements are listed, which is what is saved.
- Edit mode: the password field is replaced by *Send password reset link*, which only shows a notice until the endpoint exists (Q3). *Deactivate user* appears for active users only; it closes the drawer and opens the same confirmation dialog.
- The blue note under the table in Figma (*"Laura Gómez and Carlos Pérez both have…"*) is a design annotation for F-09, not UI.
