// Run with: node --test .github/scripts/pr-standards.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { checkPullRequest } = require('./pr-standards.js')

const GOOD_BODY = `
## What
Adds the login page and protects the private routes.

Jira: https://colbits-success.atlassian.net/browse/SCRUM-61

## How to test
1. Open /login, sign in and see the dashboard.

## AI use
- [ ] **No AI**
- [x] **AI-assisted** (suggestions, review or parts of the code)
- [ ] **AI-generated** (most of the code)

Tool: Claude Code
`

const GOOD = {
  branch: 'SCRUM-61-login-page',
  base: 'develop',
  title: 'SCRUM-61 | feat(auth): add login page',
  body: GOOD_BODY,
}

test('accepts a PR that follows every convention', () => {
  assert.deepEqual(checkPullRequest(GOOD), [])
})

test('accepts branches and titles without a ticket', () => {
  assert.deepEqual(
    checkPullRequest({ ...GOOD, branch: 'chore/monorepo-structure', title: 'chore(repo): split frontend and backend' }),
    []
  )
})

test('accepts the release PR from develop into main', () => {
  assert.deepEqual(checkPullRequest({ ...GOOD, branch: 'develop', base: 'main', title: 'release: alpha v0.1.0' }), [])
})

test('rejects a branch name out of convention', () => {
  const errors = checkPullRequest({ ...GOOD, branch: 'Backend----Repo', title: 'feat(backend): add auth' })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /Branch/)
})

test('rejects a PR into main that does not come from develop, release or hotfix', () => {
  const errors = checkPullRequest({ ...GOOD, base: 'main' })
  assert.match(errors.join(), /can be merged into `main`/)
})

test('rejects a title out of convention, and a ticket that does not match the branch', () => {
  assert.match(checkPullRequest({ ...GOOD, title: 'login page' }).join(), /Title/)
  assert.match(checkPullRequest({ ...GOOD, title: 'SCRUM-62 | feat(auth): add login page' }).join(), /SCRUM-61/)
})

test('requires exactly one AI option, and the tool when AI was used', () => {
  const none = GOOD_BODY.replace('[x]', '[ ]')
  assert.match(checkPullRequest({ ...GOOD, body: none }).join(), /AI use/)

  const two = GOOD_BODY.replace('- [ ] **No AI**', '- [x] **No AI**')
  assert.match(checkPullRequest({ ...GOOD, body: two }).join(), /AI use/)

  const noTool = GOOD_BODY.replace('Tool: Claude Code', 'Tool:')
  assert.match(checkPullRequest({ ...GOOD, body: noTool }).join(), /Tool/)

  const noAi = GOOD_BODY.replace('[x]', '[ ]').replace('- [ ] **No AI**', '- [x] **No AI**').replace('Claude Code', '')
  assert.deepEqual(checkPullRequest({ ...GOOD, body: noAi }), [])
})

test('rejects the empty template', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const template = fs.readFileSync(path.join(__dirname, '..', 'pull_request_template.md'), 'utf8')
  const errors = checkPullRequest({ ...GOOD, body: template })
  assert.equal(errors.length, 3)
})
