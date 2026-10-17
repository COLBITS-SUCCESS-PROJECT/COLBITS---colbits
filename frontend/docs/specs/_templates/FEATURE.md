---
feature: <name>            # same as the folder in src/features/<name>/
title: <Human-readable name>
status: PLANNED            # PLANNED | IN_PROGRESS | IN_REVIEW | DONE
owner: <Name>
last_updated: YYYY-MM-DD
---

# Feature: <Human-readable name>

## 1. Purpose
One paragraph: what problem does this feature solve for the user, and who uses it?

## 2. Scope

### In scope
- ...

### Out of scope
- ... (→ which feature handles it instead)

## 3. Stories
Every Jira story of this feature. Each one has its own spec file in this folder.

| Story | Summary | Owner | Status |
|---|---|---|---|
| [SCRUM-XX](./SCRUM-XX.md) | As a ... I can ... | <Name> | PLANNED |

## 4. Design (Figma)
Link the frames this feature implements.

| Frame | Link |
|---|---|
| <Frame name> | <Figma link with node-id> |

## 5. Routes

| Route | Page component | Guard |
|---|---|---|
| `/path` | `<PageName>` | RequireAuth |

## 6. Components
Feature-owned components (in `src/features/<name>/components/`) and shared ones it reuses from `src/design-system/`.

| Component | Layer | Location |
|---|---|---|
| `<Name>` | Organism | feature / design-system |

## 7. API contract (PROVISIONAL)
Mark `PROVISIONAL` until confirmed against the backend OpenAPI spec.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/...` | ... |

## 8. Open questions and decisions

| ID | Question | Owner | Answer | Date |
|---|---|---|---|---|
| Q1 | ... | ... | OPEN | — |
