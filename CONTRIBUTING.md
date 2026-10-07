# Contributing to COLBITS Frontend

## Before you start

Read `agent.md` in full. Every rule there is enforced by CI or code review.

## Branch workflow

```
main           ← stable production code
└── develop    ← integration branch (all PRs target this)
    └── SCRUM-42-add-sensor-chart   ← your branch
```

1. Branch from `develop`: `git checkout -b SCRUM-<n>-<description-kebab-case>`
2. Keep branches short-lived (1–3 days max)
3. Rebase on `develop` before opening a PR: `git rebase develop`

## Commit messages

Use **Conventional Commits**:

```
feat(dashboard): add SensorChart component
fix(alerts): correct threshold comparison logic
test(devices): add empty state test for DeviceTable
docs(agent): update open questions table
refactor(auth): extract token refresh logic to hook
```

No Jira ticket in the commit message (it's in the branch name and PR title).

## Pull request checklist

- [ ] Branch name: `SCRUM-<n>-<description>`
- [ ] PR title: `SCRUM-<n> | type(scope): result`
- [ ] If AI was used: append ` [AI-ASSISTED]` to the title, add a note in `docs/bitacora-ia/`
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test:coverage` passes (≥70%)
- [ ] No `console.log`, no commented-out code, no hardcoded strings/colors
- [ ] SPEC.md updated if feature behavior changed
- [ ] SDD section updated if API/state/domain model changed
- [ ] Reviewed by at least one other frontend teammate

## Using AI assistance

AI-generated code is allowed and encouraged. Rules:

1. Mark the PR with ` [AI-ASSISTED]`
2. **You are responsible** for everything that merges — review AI output against agent.md §3
3. Verify: no literal colors, no raw strings, no `any`, no boundary violations, no oversized files
4. Document what was generated vs what you wrote in `docs/bitacora-ia/YYYY-MM-DD-SCRUM-XX.md`

## Pre-commit hook

Prettier and ESLint `--fix` run automatically on staged files before every commit.
If the hook fails, fix the issues and try again — don't skip with `--no-verify`.
