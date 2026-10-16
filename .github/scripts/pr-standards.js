// Team PR conventions (CONTRIBUTING.md), used by .github/workflows/pr-standards.yml.
// Returns the list of problems; an empty list means the PR is fine.
// Local check: node --test .github/scripts/pr-standards.test.js

const TYPES = ['feat', 'fix', 'test', 'docs', 'refactor', 'style', 'build', 'ci', 'chore', 'perf', 'revert']
const AI_OPTIONS = ['No AI', 'AI-assisted', 'AI-generated']
const MIN_SUMMARY_CHARS = 10
const MIN_TEST_STEP_CHARS = 5

const STORY_BRANCH = /^SCRUM-\d+-[a-z0-9]+(-[a-z0-9]+)*$/
const OTHER_BRANCH = /^(chore|ci|docs|hotfix|release)\/[a-z0-9]+([-.][a-z0-9]+)*$/
const INTO_MAIN = /^(develop|release\/.+|hotfix\/.+)$/
const TYPE_SCOPE = `(${TYPES.join('|')})(\\([a-z0-9-]+\\))?: \\S.*`
const STORY_TITLE = new RegExp(`^SCRUM-\\d+ \\| ${TYPE_SCOPE}$`)
const PLAIN_TITLE = new RegExp(`^${TYPE_SCOPE}$`)
const RELEASE_TITLE = /^release: \S.*$/

/** Text of a "## Heading" section, without HTML comments. */
function section(body, heading) {
  const match = body.match(new RegExp(`## ${heading}\\s*([\\s\\S]*?)(?=\\n## |$)`))
  return match ? match[1] : ''
}

function checkBranch({ branch, base }) {
  const errors = []
  if (!STORY_BRANCH.test(branch) && !OTHER_BRANCH.test(branch) && branch !== 'develop') {
    errors.push(
      `Branch \`${branch}\` does not follow the convention. Use \`SCRUM-<n>-short-description\` (e.g. \`SCRUM-61-login-page\`) ` +
        'or, without a ticket, `chore/…`, `ci/…`, `docs/…`, `hotfix/…` or `release/…` — lowercase with hyphens.'
    )
  }
  if (base === 'main' && !INTO_MAIN.test(branch)) {
    errors.push('Only `develop`, `release/…` or `hotfix/…` can be merged into `main`. Change the base branch to `develop`.')
  }
  return errors
}

function checkTitle({ branch, title }) {
  const errors = []
  if (!STORY_TITLE.test(title) && !PLAIN_TITLE.test(title) && !RELEASE_TITLE.test(title)) {
    errors.push(
      `Title \`${title}\` does not follow the convention. Use \`SCRUM-<n> | type(scope): result\` ` +
        '(e.g. `SCRUM-61 | feat(auth): add login page`) or, without a ticket, `type(scope): result`. ' +
        `Types: ${TYPES.join(', ')}.`
    )
  }
  const ticket = branch.match(/^SCRUM-(\d+)-/)
  if (ticket && !title.startsWith(`SCRUM-${ticket[1]} | `)) {
    errors.push(`The branch belongs to SCRUM-${ticket[1]}: the title must start with \`SCRUM-${ticket[1]} | \`.`)
  }
  return errors
}

function checkBody(body) {
  const errors = []
  const ticked = AI_OPTIONS.filter((option) => new RegExp(`- \\[[xX]\\] \\*\\*${option}\\*\\*`).test(body))
  if (ticked.length !== 1) {
    errors.push('In **AI use**, tick exactly one option: No AI, AI-assisted or AI-generated.')
  } else if (ticked[0] !== 'No AI' && !/Tool:[ \t]*\S+/.test(body)) {
    errors.push('You ticked AI use: name it after `Tool:` (e.g. `Tool: Claude Code`).')
  }
  const summary = section(body, 'What').replace(/Jira:.*|[-\s]/g, '')
  if (summary.length < MIN_SUMMARY_CHARS) {
    errors.push('Fill in **What** (1–3 lines).')
  }
  if (section(body, 'How to test').replace(/[-\d.\s]/g, '').length < MIN_TEST_STEP_CHARS) {
    errors.push('Fill in **How to test** (one step is enough).')
  }
  return errors
}

function checkPullRequest({ branch, base, title, body }) {
  const text = (body || '').replace(/<!--[\s\S]*?-->/g, '')
  const cleanTitle = (title || '').trim()
  return [...checkBranch({ branch, base }), ...checkTitle({ branch, title: cleanTitle }), ...checkBody(text)]
}

module.exports = { checkPullRequest }
