---
feature: <name>
backlog: <backlog version, e.g. v4>
status: PLACEHOLDER
last_updated: YYYY-MM-DD
stories: []
---

# Feature: <Name>

## 1. Purpose
One paragraph: what problem does this feature solve for the user?

## 2. Scope

### In scope
- ...

### Out of scope
- ...

## 3. User stories
List the Jira story IDs and their one-line summaries from the backlog.

| ID | Summary | Status |
|---|---|---|
| SCRUM-XX | As a user I can ... | Not started |

## 4. Routes

| Route | Component | Guard |
|---|---|---|
| `/path` | `<PageName>` | RequireAuth |

## 5. Screen states

For each page or significant component, describe all states:
- **Loading** — what shows while data fetches
- **Empty** — what shows when there's no data
- **Populated** — the main content
- **Error** — what shows when the request fails

## 6. API contract (PROVISIONAL)

List endpoints this feature uses. Mark `PROVISIONAL` until confirmed against OpenAPI.

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/v1/...` | — | `{ ... }` |

## 7. Decisions and open questions

| ID | Question | Answer | Date |
|---|---|---|---|
| Q1 | ... | ... | YYYY-MM-DD |

## 8. Known issues / blockers

| ID | Description | Impact |
|---|---|---|
| B-XX | ... | ... |
