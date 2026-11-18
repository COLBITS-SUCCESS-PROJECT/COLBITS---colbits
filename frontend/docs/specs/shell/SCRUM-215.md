---
feature: shell
story: SCRUM-215
title: Collapsible sidebar and cleaner map attribution
status: IN_REVIEW
owner: Sofia
last_updated: 2026-10-31
---

# SCRUM-215 — Collapsible sidebar and cleaner map attribution

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-215>
Feature: shared app shell (no feature spec — see [INDEX.md](../INDEX.md), "Shared foundation")

## 1. User story
> As a **signed-in user**, I want **to collapse the sidebar to icons at any moment and not hit the map credits by accident** so that **the map gets more room and I stay in the app**.

## 2. Acceptance criteria

| ID | Criterion (Given / When / Then) | Test type | Test |
|---|---|---|---|
| AC1 | **Given** a desktop or tablet screen, **when** the user presses "Contraer menú / Collapse menu", **then** the sidebar shrinks to an icon rail and the button becomes "Expandir menú / Expand menu"; pressing it again restores it. | Automated | `NavSidebar.test.tsx`, `AppShell.test.tsx` |
| AC2 | **Given** the sidebar is collapsed, **when** the user hovers or uses a screen reader, **then** every link, the role and the logout button keep their names (tooltip on links), and the active route is still highlighted. | Automated | `NavSidebar.test.tsx` |
| AC3 | **Given** the user collapsed the sidebar, **when** they reload or sign in again on the same browser, **then** it stays collapsed (`uiPreferences.store` → `sidebarCollapsed`, localStorage). | Automated (store) · Manual | `AppShell.test.tsx` · Section 8 |
| AC4 | **Given** a phone screen, **when** the menu opens, **then** it is the usual full drawer; the collapse button is not shown. | Automated | `NavSidebar.test.tsx` |
| AC5 | **Given** the map, **when** it is displayed, **then** the attribution shows only "© OpenStreetMap" (opens in a new tab) — no "Leaflet" link or flag. | Manual | Section 8 |
| AC6 | **Given** the map is visible, **when** the sidebar collapses or expands, **then** the map resizes to fill the space without grey tiles. | Manual | Section 8 |

## 3. Design (Figma)
No Figma frame for the collapsed rail; it reuses the Sidebar tokens (navy background, Nav Item states). Icons: lucide `PanelLeftClose` / `PanelLeftOpen`, registered as `sidebar-collapse` / `sidebar-expand`.

## 4. Screens and states

| State | What the user sees |
|---|---|
| Expanded (default) | Logo, "MENÚ", icon + label links, user name/role, collapse button next to the logo |
| Collapsed | 80 px rail: expand button, icons only (tooltip with the label), avatar and logout stacked |
| Mobile | Unchanged drawer opened from the top bar |

## 5. User flow
1. The user presses the collapse button next to the logo.
2. The sidebar becomes an icon rail; the map grows.
3. The choice is saved; the expand button restores the full sidebar.

## 6. Data and endpoints
None. Local preference only.

## 7. Open questions

| ID | Question | Owner | Blocking | Answer |
|---|---|---|---|---|
| Q1 | Is "© OpenStreetMap" alone enough for the tile provider? | Sofia | No | Yes for OSM tiles (ODbL asks for the "© OpenStreetMap contributors" credit with a link to the copyright page, which is kept). The "Leaflet" prefix is optional. Re-check if `VITE_MAP_TILE_URL` points to another provider. |

## 8. Acceptance test results

| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| 2026-10-31 | AC1, AC2, AC4 | PASS | Automated (`NavSidebar.test.tsx`, `AppShell.test.tsx`) | — |
| — | AC3, AC5, AC6 | PENDING (manual) | — | Check in the browser before merge |

## 9. Implementation notes
- The collapsed state only applies from `md` up; `NavSidebar` ignores `isCollapsed` when `isMobile`.
- `NavItem` and `UserSummary` take `isCollapsed`: labels become `sr-only`, so names stay accessible.
- The map already listens to its container size (`ResizeObserver` in `MapCanvas`), so it resizes by itself (AC6).
- Attribution: `map.attributionControl.setPrefix(false)` in `MapCanvas`; the text `map.attribution` (es-CO / en) is unchanged.
