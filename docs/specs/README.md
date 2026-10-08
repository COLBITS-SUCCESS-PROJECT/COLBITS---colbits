# Specs — how we document features and stories

Every piece of product behavior is written down **before** it is coded. Specs are the bridge between the Jira backlog, the Figma design and the code, and they are where the course's **acceptance test results** are recorded.

All specs live in this folder. Nothing spec-related lives in `src/`.

---

## Folder layout

```
docs/specs/
├── README.md              ← this guide
├── INDEX.md               ← table of every feature and story with its status
├── _templates/
│   ├── FEATURE.md         ← copy to start a new feature
│   └── STORY.md           ← copy to start a new Jira story
├── dashboard/             ← one folder per feature (same name as src/features/<name>/)
│   ├── FEATURE.md         ← overview of the whole feature
│   ├── SCRUM-140.md       ← one file per Jira story
│   └── SCRUM-141.md
└── auth/
    └── FEATURE.md
```

## Two kinds of spec

| File | Scope | Who writes it | When |
|---|---|---|---|
| `<feature>/FEATURE.md` | The whole feature: purpose, scope, routes, Figma frames, open questions, list of its stories | Whoever starts the feature | Once, then kept up to date |
| `<feature>/SCRUM-XX.md` | One Jira story: user story, acceptance criteria, screen states, data, **acceptance test results** | The developer assigned to the story | **Before** writing code for that story |

The feature spec is the map; story specs are the detailed instructions. A story spec never repeats what is in the feature spec — it links to it.

## Status values

Use exactly these values in the front-matter `status:` field and in `INDEX.md`:

| Status | Meaning |
|---|---|
| `PLANNED` | Exists in the backlog/Figma, nobody is working on it yet |
| `IN_PROGRESS` | Story is in the current sprint and someone is working on it |
| `IN_REVIEW` | PR is open |
| `DONE` | PR merged **and** every acceptance criterion passed |

## Workflow for a story

1. **Take the story in Jira** and move it to *In Progress*.
2. **Create the spec:** copy `_templates/STORY.md` to `docs/specs/<feature>/SCRUM-XX.md`.
   If the feature folder does not exist yet, also copy `_templates/FEATURE.md` to `docs/specs/<feature>/FEATURE.md`.
3. **Fill in sections 1–4** (user story, acceptance criteria, Figma frames, screen states) **before coding**. If something is unclear, write it in *Open questions* and ask the PO (Paola).
4. **Add the story** to the *Stories* table in `FEATURE.md` and to `INDEX.md`.
5. **Code + tests.** Each acceptance criterion should map to at least one test (or a documented manual check).
6. **Run the acceptance tests** and fill in section 8 (*Acceptance test results*) — PASS/FAIL per criterion, and the action taken for every FAIL.
7. **Open the PR.** The spec changes go in the **same PR** as the code.
8. When merged, set `status: DONE` in the story spec and in `INDEX.md`.

## Rules

- **Language:** specs are written in **English** (like the code). Only UI copy examples are in Spanish.
- **Same PR:** if your PR changes behavior described in a spec, the spec update is part of that PR.
- **API contracts are provisional** until the backend publishes an OpenAPI spec (`AGENT.md §20`, OQ-02). Mark them `PROVISIONAL`.
- **Link, don't copy:** link to Figma frames, Jira issues and `AGENT.md` sections instead of pasting their content.
- **Keep `INDEX.md` current** — it is how the team (and the supervisors) see progress at a glance.

## Useful links

- Jira backlog: <https://colbits-success.atlassian.net/jira/software/projects/SCRUM/boards/1/backlog>
- Figma (design reference): <https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3>
- Testing rules (unit / integration / acceptance): [`AGENT.md §12`](../../AGENT.md)
