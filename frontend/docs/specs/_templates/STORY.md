---
feature: <name>            # folder name in docs/specs/ and src/features/
story: SCRUM-XX
title: <Story title from Jira>
status: IN_PROGRESS        # PLANNED | IN_PROGRESS | IN_REVIEW | DONE
owner: <Name>
last_updated: YYYY-MM-DD
---

# SCRUM-XX — <Story title>

Jira: <https://colbits-success.atlassian.net/browse/SCRUM-XX>
Feature: [FEATURE.md](./FEATURE.md)

## 1. User story
> As a **<role>**, I want **<capability>** so that **<benefit>**.

## 2. Acceptance criteria
Written **before** coding, agreed with the PO. Each criterion maps to a test (automated or manual).

| ID | Criterion (Given / When / Then) | Test type | Test |
|---|---|---|---|
| AC1 | **Given** ... **when** ... **then** ... | Automated | `src/features/<name>/.../X.test.tsx` |
| AC2 | **Given** ... **when** ... **then** ... | Manual | Section 8 |

## 3. Design (Figma)

| Frame / component | Link |
|---|---|
| <Frame name> | <Figma link with node-id> |

## 4. Screens and states
Every page or significant component must cover these states (`AGENT.md §12`).

| State | What the user sees |
|---|---|
| Loading | Skeleton / spinner while data arrives |
| Populated | Main view with data |
| Empty | Message when there is no data |
| Error | Error message with a retry option |

## 5. User flow
1. The user ...
2. The system ...

## 6. Data and endpoints (PROVISIONAL)

```ts
// PROVISIONAL — pending OpenAPI confirmation
interface ExampleDto {
  id: string
}
```

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/...` | ... |

## 7. Open questions

| ID | Question | Owner | Blocking | Answer |
|---|---|---|---|---|
| Q1 | ... | ... | Yes / No | OPEN |

## 8. Acceptance test results
Fill in after testing. Every FAIL needs an action taken.

| Date | Criterion | Result | Tested by | Action taken |
|---|---|---|---|---|
| YYYY-MM-DD | AC1 | PASS / FAIL | <Name> | — |

## 9. Implementation notes
Technical decisions, edge cases, anything the reviewer or the next developer should know.
