# Contributing to COLBITS Frontend

Frontend workflow, step by step. Branch, PR title and merge rules shared with the backend live in the [root CONTRIBUTING.md](../CONTRIBUTING.md) and are checked by `pr-standards`.

This is **the** guide for how we work: from taking a Jira story to merging the PR. Follow it step by step.
Questions → ask Sofia (Scrum Master) in the team chat.

**Read once before your first task:**
1. [README.md](./README.md) — set up and run the project
2. [AGENT.md](./AGENT.md) — architecture and code rules (the contract for humans and AI)
3. [docs/specs/README.md](./docs/specs/README.md) — how we write specs

---

## The workflow at a glance

```
Jira story ─► spec ─► branch ─► code + tests ─► PR ─► review ─► merge ─► Jira Done
```

## 1. Take a story

1. In [Jira](https://colbits-success.atlassian.net/jira/software/projects/SCRUM/boards/1/backlog), assign the story to yourself and move it to **In Progress**.
2. Open the Figma frame for the story ([Figma](https://www.figma.com/design/Y3dCo4cmo545kRnYyE7w8b/COLBITS-Mockups-v3?node-id=4-97)). The frame IDs per feature are in `docs/specs/<feature>/FEATURE.md`.
3. **Check the [component catalog](./src/design-system/README.md)** — list the components your screen needs and reuse the ones that exist. Only build what is missing, at the right layer (atom → molecule → organism).

## 2. Write the spec (before coding)

1. Copy `docs/specs/_templates/STORY.md` → `docs/specs/<feature>/SCRUM-XX.md`.
2. Fill in the user story, **acceptance criteria**, Figma frames and screen states.
3. Add the story to `docs/specs/<feature>/FEATURE.md` and `docs/specs/INDEX.md` with status `IN_PROGRESS`.

Details: [docs/specs/README.md](./docs/specs/README.md).

## 3. Create your branch

Always start from an up-to-date `develop`:

```bash
git checkout develop
git pull origin develop
git checkout -b SCRUM-61-login-page
```

| Situation | Branch name | Example |
|---|---|---|
| Jira story | `SCRUM-<n>-<short-kebab-description>` | `SCRUM-61-login-page` |
| Tooling / setup without a ticket | `chore/<description>` | `chore/docker-dev` |
| CI or build fix | `ci/<description>` | `ci/fix-coverage-threshold` |
| Documentation only | `docs/<description>` | `docs/specs-structure` |
| Urgent fix | `hotfix/<description>` | `hotfix/login-redirect-loop` |

Keep branches short-lived (1–3 days). One story = one branch = one PR.

## 4. Code and commit

- Follow [AGENT.md](./AGENT.md): atomic design, tokens only (no color literals), all text via `t('namespace:key')` in Spanish, no `any`, file size limits.
- Every component needs tests: **happy path + empty state + error state** (`AGENT.md §12`).

### Commit messages — Conventional Commits

```
<type>(<scope>): <what changed, imperative, lowercase>
```

| Type | Use for |
|---|---|
| `feat` | New feature or component |
| `fix` | Bug fix |
| `test` | Adding or updating tests |
| `docs` | Documentation and specs |
| `refactor` | Code change without behavior change |
| `style` | Formatting only |
| `build` | Dependencies, build config |
| `ci` | GitHub Actions |
| `chore` | Other maintenance |

```
feat(dashboard): add fault list item
fix(auth): redirect to login after logout
docs(specs): add acceptance criteria for SCRUM-61
```

No Jira key in commit messages — it is already in the branch name and PR title.

### Pre-commit hook
Every `git commit` runs ESLint and Prettier on the staged files (husky + lint-staged). If it fails, fix the errors and commit again. **Never** use `--no-verify`.

## 5. Before opening the PR

```bash
pnpm typecheck
pnpm lint
pnpm test:coverage      # must stay ≥ 80%
```

Bring in the latest `develop` and push:

```bash
git pull origin develop
git push -u origin <your-branch>
```

Also:
- Run the acceptance tests and fill in **section 8** of your story spec.
- Compare your screen with the Figma frame.

## 6. Open the PR

- **Target:** `develop`
- **Title:**
  - Story: `SCRUM-<n> | type(scope): result` → `SCRUM-61 | feat(auth): add login page`
  - No ticket: `type(scope): result` → `chore(docker): add dev container`
  - The rules are checked by `pr-standards` — see the [root CONTRIBUTING.md](../CONTRIBUTING.md).
- **Description:** GitHub pre-fills it from `.github/pull_request_template.md`. Fill in **What**, **How to test** and **AI use**.
- **Reviewer:** assign one other frontend teammate (Sofia, Monica or Paola).
- **Jira:** move the story to **In Review**.

## 7. Review and merge

- **1 approval** + green `ci-ok` and `pr-standards` are required to merge into `develop`.
- The author addresses the comments by pushing new commits to the same branch.
- After merging: delete the branch, set the spec status to `DONE` (if all acceptance criteria passed) and move the Jira story to **Done**.

### What the reviewer checks
- [ ] The PR does what the story and its acceptance criteria say
- [ ] UI matches the Figma frame
- [ ] AGENT.md rules: tokens, i18n, no `any`, no cross-feature imports, file size limits
- [ ] Tests cover happy / empty / error states
- [ ] Spec and `INDEX.md` are updated

## Using AI assistance

AI tools are allowed and encouraged.

1. Tick the option that applies under **AI use** in the PR description and name the tool.
2. **You are responsible** for everything that merges — review AI output against `AGENT.md §3`.
3. Check especially: no color literals, no hardcoded text, no `any`, no boundary violations, no oversized files.
4. AI never commits or pushes — you stage, review and commit yourself (`AGENT.md §18`).

## Releases

`develop` → `main` only at course milestones (Alpha, Beta, Final), through a PR with 1 approval — see [Releases](../CONTRIBUTING.md#releases-course-deliveries).
