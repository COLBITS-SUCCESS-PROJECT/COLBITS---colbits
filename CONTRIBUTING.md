# Contributing to COLBITS

The rules every teammate follows, frontend and backend. Two GitHub checks verify them on every PR:
**`ci-ok`** (lint, tests, build) and **`pr-standards`** (branch, title, description). Both must be green, and **one teammate must approve** (course Definition of Done).

App-specific guides: [frontend/CONTRIBUTING.md](./frontend/CONTRIBUTING.md) (specs, atomic design, tests) · [backend/README.md](./backend/README.md)

## 1. Branch

Always start from an up-to-date `develop`:

```bash
git checkout develop
git pull origin develop
git checkout -b SCRUM-61-login-page
```

| Situation | Branch name | Example |
|---|---|---|
| Jira story or task | `SCRUM-<n>-<short-description>` | `SCRUM-61-login-page` |
| Tooling without a ticket | `chore/<description>` | `chore/monorepo-structure` |
| CI change | `ci/<description>` | `ci/backend-coverage` |
| Documentation only | `docs/<description>` | `docs/api-contract` |
| Urgent fix | `hotfix/<description>` | `hotfix/login-redirect-loop` |
| Delivery preparation | `release/<version>` | `release/v0.1.0` |

Lowercase, words separated by hyphens. One story = one branch = one PR.

## 2. Commits

[Conventional Commits](https://www.conventionalcommits.org/): `type(scope): what changed`

```
feat(auth): add login page
fix(device): handle missing coordinates
test(dashboard): add map acceptance tests
```

Types: `feat` `fix` `test` `docs` `refactor` `style` `build` `ci` `chore` `perf` `revert`.

## 3. Pull request

- **Base branch:** `develop`.
- **Title:** `SCRUM-<n> | type(scope): result` → `SCRUM-61 | feat(auth): add login page`.
  Without a ticket: `type(scope): result` → `chore(repo): split frontend and backend`.
  The ticket in the title must match the one in the branch.
- **Description:** GitHub fills in the template. Complete the three short parts:
  - **What** — 1–3 lines.
  - **How to test** — one step is enough.
  - **AI use** — tick one: *No AI*, *AI-assisted* or *AI-generated*; if you used AI, write the tool after `Tool:`.
- **Reviewers** are requested automatically by folder (`.github/CODEOWNERS`). Any one of them can approve.
- If `pr-standards` fails, its summary says what to fix. Edit the title or description and it runs again by itself.

## 4. Merge

| Into | Requirements |
|---|---|
| `develop` | **1 approval**, `ci-ok` and `pr-standards` green, conversations resolved, branch up to date with `develop`. |
| `main` | Same rules, and only from `develop`, `release/…` or `hotfix/…`. |

The reviewer checks that the PR does what the Jira issue and its acceptance criteria say, and that tests cover it.
After merging, delete the branch and move the Jira issue to **Done**.

## Using AI

AI tools are allowed. Declare them in the PR (**AI use**) — **you are responsible** for everything you merge.
Review what the AI produced, and never let it commit or push for you.

## Releases (course deliveries)

1. Open a PR `develop → main` titled `release: alpha v0.1.0` (Beta `v0.2.0`, Final `v1.0.0`).
2. After merging, tag `main`:
   ```bash
   git checkout main && git pull
   git tag -a v0.1.0 -m "Alpha prototype"
   git push origin v0.1.0
   ```
