<!--
PR title format:
  Story:      SCRUM-<n> | type(scope): result          e.g. SCRUM-61 | feat(auth): add login page
  No ticket:  type(scope): result                      e.g. chore(docker): add dev container
Append " [AI-ASSISTED]" if AI generated significant code.
Full guide: CONTRIBUTING.md
-->

## Summary
<!-- What does this PR do and why? 1–3 sentences. -->

Jira: https://colbits-success.atlassian.net/browse/SCRUM-
Spec: `docs/specs/<feature>/SCRUM-XX.md`

## Changes
<!-- Main changes, grouped by area. -->
-

## Screenshots
<!-- Required for UI changes: before / after, or the new screen next to its Figma frame. -->

## How to test
<!-- Steps for the reviewer, e.g. "open /dashboard, click X, see Y". -->
1.

## Checklist
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test:coverage` passes (≥ 80%)
- [ ] Happy path, empty state and error state are tested
- [ ] No hardcoded colors or visible text (tokens + `t('namespace:key')`)
- [ ] No `console.log`, no `TODO` without a Jira ticket
- [ ] Spec updated in `docs/specs/` (acceptance criteria / test results) — or N/A
- [ ] `docs/specs/INDEX.md` status updated — or N/A
- [ ] Matches the Figma frame — or N/A
- [ ] Reviewer assigned (Sofia, Monica or Paola)
