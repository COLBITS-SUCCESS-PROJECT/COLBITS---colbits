---
feature: i18n
story: SCRUM-158
title: 'Language switch: change the app between Spanish and English with a toggle'
status: IN_REVIEW
owner: Sofia
last_updated: 2026-10-17
---

# SCRUM-158 — Language switch (Spanish ⇄ English)

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-158>
Feature: shared foundation (every page) — no feature folder in `src/features/`.

## 1. User story
> As **a user**, I want **to switch the interface between Spanish and English with one control**, so that **people who do not read Spanish (supervisors, the Sweden sub-team) can use the platform**.

**Origin.** The client prefers Spanish; the course and the supervisors work in English. Created as a Task by Sofia (SM) on 2026-10-17. The PO is adding the user story and the requirement to the Product Backlog — **link them here when they exist**.

**Proposed requirement (Source: Team, Status: Proposed):** *The system shall let the user switch the interface language between Spanish (es-CO, default) and English, and shall remember the choice on that browser.*

### Out of scope
| What | Why |
|---|---|
| Translating data from the API or the database (node names, backend messages) | It is data, not interface text |
| Languages other than Spanish and English | Not requested |

## 2. Acceptance criteria

| ID | Criterion (Given / When / Then) | Test type | Test |
|---|---|---|---|
| AC1 | **Given** any page, login included, **when** the user selects EN, **then** every visible text changes to English without reloading; ES changes it back | Automated + manual | `src/app/language.acceptance.test.tsx` · §8 |
| AC2 | **Given** a chosen language, **when** the page is reloaded or opened again on the same browser, **then** it opens in that language | Automated + manual | `language.acceptance.test.tsx` · §8 |
| AC3 | **Given** a first visit, **when** the app opens, **then** it is in Spanish | Automated | `language.acceptance.test.tsx` |
| AC4 | **Given** the language changes, **then** dates and times follow it and `<html lang>` changes (`es` / `en`) | Automated + manual | `language.acceptance.test.tsx` · §8 |
| AC5 | Every translation key exists in `es-CO` and `en`; a missing or empty one fails a test | Automated | `src/i18n/locales.test.ts` |
| AC6 | **One click anywhere on the switch** changes to the other language; it works with the keyboard (Tab + Enter/Space), has an accessible name and shows the active language | Automated | `LanguageSwitch.test.tsx`, `language.acceptance.test.tsx` |

## 3. Design (Figma)
No frame yet. Compact **ES | EN** pill, top-right: in the top bar (before the avatar) and on the login page. **Placement to be confirmed with the PO** (DoD).

## 4. Screens and states

| State | What the user sees |
|---|---|
| Spanish (default) | `ES` filled, `EN` plain; every text in Spanish |
| English | `EN` filled; every text in English, dates as "Oct 17, 2026" |

## 5. User flow
1. The user clicks the switch anywhere (or presses Enter / Space on it): it moves to the other language.
2. `useLanguage().setLanguage('en')` stores the choice in `uiPreferences` (localStorage) and calls `applyLanguage('en')`.
3. i18next switches every `t()` text; `<html lang>` becomes `en`.
4. On the next start, `main.tsx` applies the stored language before the first render.

## 6. Data and endpoints
No API. Storage: `localStorage['colbits-ui-prefs'].state.language` = `es-CO` | `en`.

## 7. Open questions

| ID | Question | Owner | Blocking | Answer |
|---|---|---|---|---|
| Q1 | Story and requirement number in the Product Backlog / SRS | Paola (PO) | No | OPEN — requested 2026-10-17 |
| Q2 | Final placement and look of the switch (no Figma frame) | Paola (PO) | No | OPEN — proposed top-right of the top bar and of the login page |

## 8. Acceptance test results

| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| 2026-10-17 | AC1 | PASS | Automated (`pnpm test:coverage`) + manual in the browser, real backend in Docker (AI-assisted run on Sofia's machine) | Login page and map, menu, filters, legend and faults in English |
| 2026-10-17 | AC2 | PASS | Automated + manual (reload kept English) | — |
| 2026-10-17 | AC3 | PASS | Automated | — |
| 2026-10-17 | AC4 | PASS | Automated + manual | Top bar date "Oct 17, 2026"; `<html lang="en">` |
| 2026-10-17 | AC5 | PASS | Automated | English was missing 40 keys (`auth` and `errors` whole, 13 in `common`): added |
| 2026-10-17 | AC6 | PASS | Automated | — |

## 9. Implementation notes
- One button, not two radio buttons: in the first version you had to hit the other half exactly, which Sofia found hard to use (2026-10-17). Now a click anywhere switches.
- Atomic design: `LanguageSwitch` molecule (no i18n, labels by props) → `TopBar` organism gets a `languageSwitch` slot → `AppShell` and `AuthLayout` render it through the `useLanguage` hook.
- `i18next-browser-languagedetector` is no longer used: the `uiPreferences` store is the only source of the language (the detector kept its own copy in localStorage).
- Language codes, `<html lang>` values and the `ES` / `EN` labels: `src/config/languages.ts`.
- Rule for everyone from now on: `AGENT.md §10` — every text in both languages in the same PR.
