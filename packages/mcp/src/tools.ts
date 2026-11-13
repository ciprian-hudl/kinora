import type { createReadClient } from '@kinora/core'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { buildComponents, byInstability, diagnose, IngestError, PROJECT_VIEWS } from '@kinora/core'
import { z } from 'zod'
import { formatComponent, formatFailure, formatHistory, formatOccurrences, formatTestInsight, traceUrlOf } from './format'

type ReadClient = ReturnType<typeof createReadClient>

const MAX_HISTORY_RESULTS = 25
const MAX_COMPONENTS = 50
const MAX_RUN_TESTS = 1000
// Each formatted failure carries up to ~8KB of error + stack; cap so a broken run can't flood the agent's context.
const MAX_FAILURES = 50

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

function fail(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true }
}

// Surface the server's JSON error message (e.g. "Project not found") instead of a raw stack.
async function guard<T>(fn: () => Promise<T>, wrap: (v: T) => ReturnType<typeof ok>) {
  try {
    return wrap(await fn())
  }
  catch (err) {
    if (err instanceof IngestError)
      return fail(`kinora: ${err.message}`)
    return fail(`kinora: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// `health` picks flaky or broken stories; the older `unstableOnly` means either of them.
function matchesHealth(kind: 'stable' | 'flaky' | 'broken', health?: 'flaky' | 'broken', unstableOnly?: boolean): boolean {
  if (health)
    return kind === health
  return !unstableOnly || kind !== 'stable'
}

const VIEWS = PROJECT_VIEWS.map(v => v.id) as [string, ...string[]]

// The time window and project scope every insight tool takes.
const windowInput = {
  since: z.string().optional().describe('How far back: a span like 24h, 2d, 1w, or an ISO date. Default 7d, at most 90d.'),
  branch: z.string().optional().describe('Only runs on this branch; `default` for main / master (leaves out PR and feature-branch runs). Omit for every branch.'),
  limit: z.number().int().min(1).max(100).optional().describe('Results to return, default 25.'),
}
const scopeInput = {
  view: z.enum(VIEWS).optional().describe(`A group of projects: ${PROJECT_VIEWS.map(v => `${v.id} (${v.projects})`).join(', ')}.`),
  projects: z.string().optional().describe('Globs on the project id (from list_projects), space-separated; `!` drops, e.g. "watch/*" or "hudl/hudl-* !hudl/hudl-ui". Overrides view. Omit both for every project.'),
  ...windowInput,
}

function projectsOf(view?: string, projects?: string): string | undefined {
  return projects ?? PROJECT_VIEWS.find(v => v.id === view)?.projects
}

export function registerTools(server: McpServer, client: ReadClient): void {
  server.registerTool('list_projects', {
    title: 'List kinora projects',
    description: 'List every project on the kinora server with its latest run summary (pass/fail counts, git branch, started time).',
    inputSchema: z.object({}),
  }, () => guard(() => client.listProjects(), ps => ok({ projects: ps })))

  server.registerTool('list_failures', {
    title: 'List failing tests of a run',
    description: 'Failing and flaky tests of a run (defaults to the latest run): error message, file:line, and a trace.zip URL to open in the Playwright viewer. Start here to debug the last CI failures. When the result has an `incident`, the run is an environment incident: its failures come from the app under test or the browser being down, not from the code, so re-run rather than fix the tests.',
    inputSchema: z.object({
      project: z.string().describe('Project slug (from list_projects).'),
      runId: z.string().optional().describe('Run id; omit for the latest run.'),
    }),
  }, ({ project, runId }) => guard(
    () => client.getFailures(project, runId),
    r => ok({
      runId: r.runId,
      startedAt: r.startedAt,
      counts: r.counts,
      ...(r.incident && { incident: r.incident }),
      failures: r.failures.slice(0, MAX_FAILURES).map(formatFailure),
      ...(r.failures.length > MAX_FAILURES && { truncated: `showing ${MAX_FAILURES} of ${r.failures.length} failures` }),
    }),
  ))

  server.registerTool('get_run', {
    title: 'Get a run report',
    description: 'Full report for one run (defaults to latest): counts, git/CI metadata, every test status, and formatted failures with errors + trace URLs.',
    inputSchema: z.object({
      project: z.string().describe('Project slug.'),
      runId: z.string().optional().describe('Run id; omit for the latest run.'),
    }),
  }, ({ project, runId }) => guard(
    () => client.getRun(project, runId),
    (r) => {
      const failures = r.tests.filter(t => t.status === 'unexpected' || t.status === 'flaky')
      return ok({
        runId: r.runId,
        startedAt: r.startedAt,
        duration: r.duration,
        counts: r.counts,
        meta: r.meta,
        failures: failures.slice(0, MAX_FAILURES).map(formatFailure),
        tests: r.tests.slice(0, MAX_RUN_TESTS).map(t => ({ testKey: t.testKey, title: t.title, status: t.status, location: `${t.file}:${t.line}` })),
        ...((failures.length > MAX_FAILURES || r.tests.length > MAX_RUN_TESTS) && {
          truncated: `showing ${Math.min(failures.length, MAX_FAILURES)}/${failures.length} failures, ${Math.min(r.tests.length, MAX_RUN_TESTS)}/${r.tests.length} tests`,
        }),
      })
    },
  ))

  server.registerTool('test_history', {
    title: 'Per-test history',
    description: 'History of a test across recent runs to tell a fresh regression from a chronic/flaky test: health over the last 20 runs (flaky: passed and failed on the same commit, needed a retry, or keeps flipping between pass and fail; broken: fails and keeps failing) with its reason, pass/fail/flaky rates, recent-window rates, newlyBroken/newlyFlaky flags, and recent per-run points with their commit. Pass testKey for one test, query to search by title, or neither to get the flaky and broken tests.',
    inputSchema: z.object({
      project: z.string().describe('Project slug.'),
      testKey: z.string().optional().describe('Exact test key (from list_failures) for a single test.'),
      query: z.string().optional().describe('Case-insensitive substring match on the test title.'),
    }),
  }, ({ project, testKey, query }) => guard(
    () => client.getHistory(project, testKey),
    (histories) => {
      let out = histories
      if (!testKey && query) {
        const q = query.toLowerCase()
        out = histories.filter(h => h.title.toLowerCase().includes(q))
      }
      else if (!testKey) {
        out = histories.filter(h => diagnose(h.points).kind !== 'stable').sort(byInstability)
      }
      return ok({ histories: out.slice(0, MAX_HISTORY_RESULTS).map(formatHistory) })
    },
  ))

  server.registerTool('component_health', {
    title: 'Component and story health',
    description: 'Health of the UI components a project tests, from Playwright component tests (stories recorded by @kinora/reporter/ct) or Storybook stories run by Vitest (@kinora/vitest-reporter), grouped by component: per story, its latest status, its health over the last 20 runs (flaky or broken, with the reason), its accessibility violations when the Storybook a11y addon checks it (rule, impact, failing elements, docs link), fail/flaky rates, and the tests that mount it. Filter by component name or story id, or by health. Empty when the project records no stories.',
    inputSchema: z.object({
      project: z.string().describe('Project slug.'),
      component: z.string().optional().describe('Case-insensitive substring of a component name, path or story id, e.g. "Button".'),
      health: z.enum(['flaky', 'broken']).optional().describe('Only flaky or only broken stories.'),
      unstableOnly: z.boolean().optional().describe('Only flaky or broken stories.'),
    }),
  }, ({ project, component, health, unstableOnly }) => guard(
    () => client.getHistory(project),
    (histories) => {
      const q = component?.toLowerCase()
      const components = buildComponents(histories)
        .map(c => ({
          component: c,
          stories: c.stories.filter(s =>
            matchesHealth(diagnose(s.points).kind, health, unstableOnly)
            && (!q || c.path.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))),
        }))
        .filter(c => c.stories.length)
      return ok({
        components: components.slice(0, MAX_COMPONENTS).map(c => formatComponent(c.component, c.stories)),
        ...(components.length > MAX_COMPONENTS && { truncated: `showing ${MAX_COMPONENTS} of ${components.length} components` }),
        ...(!histories.some(h => h.stories?.length) && { note: 'No component stories recorded for this project. Component tests must import test from @kinora/reporter/ct.' }),
      })
    },
  ))

  server.registerTool('get_trace', {
    title: 'Get a test trace URL',
    description: 'Resolve the Playwright trace.zip URL for one test in a run (defaults to latest), to open in the trace viewer or download for inspection.',
    inputSchema: z.object({
      project: z.string().describe('Project slug.'),
      testKey: z.string().describe('Test key (from list_failures).'),
      runId: z.string().optional().describe('Run id; omit for the latest run.'),
    }),
  }, ({ project, testKey, runId }) => guard(
    () => client.getRun(project, runId),
    (report) => {
      const t = report.tests.find(t => t.testKey === testKey)
      if (!t)
        return fail(`kinora: test not found in run ${report.runId}: ${testKey}`)
      const url = traceUrlOf(t)
      if (!url)
        return fail(`kinora: no trace attached for ${testKey} in run ${report.runId}`)
      return ok({ runId: report.runId, testKey, traceUrl: url })
    },
  ))

  server.registerTool('top_failing_tests', {
    title: 'Tests that failed or flaked most',
    description: 'The tests that failed or flaked most over a time window, across every project or a group of them (view, or globs on the project id), most occurrences first. Per test: its project, test key, title, file:line, fails, flakes, runs in the window, fail and flake rates, first and last seen, and its newest failure with the error, branch, commit and a trace.zip URL. Environment-incident runs are left out. Answers "which tests failed in watch in the last 24h" or "what failed most across marvel this week"; follow with test_occurrences for a test\'s other failures and traces.',
    inputSchema: z.object({
      ...scopeInput,
      status: z.enum(['failed', 'flaky', 'any']).optional().describe('failed: hard failures; flaky: passed on a retry; any (default): both.'),
    }),
  }, ({ view, projects, ...query }) => guard(
    () => client.getTestInsights({ ...query, projects: projectsOf(view, projects), sort: 'count' }),
    r => ok({ since: r.since, tests: r.tests.map(formatTestInsight) }),
  ))

  server.registerTool('flakiest_tests', {
    title: 'Flakiest tests',
    description: 'The tests with the highest share of flaky runs (failed, then passed on a retry) over a time window, across every project or a group of them, so a test that ran 3 times and flaked twice outranks one that flaked twice in 200 runs. Needs 3 runs in the window. Same fields as top_failing_tests. Answers "which are the flakiest tests across hudl-frontends".',
    inputSchema: z.object(scopeInput),
  }, ({ view, projects, ...query }) => guard(
    () => client.getTestInsights({ ...query, projects: projectsOf(view, projects), sort: 'flakeRate', status: 'any' }),
    r => ok({ since: r.since, tests: r.tests.map(formatTestInsight) }),
  ))

  server.registerTool('root_causes', {
    title: 'Most common failure causes',
    description: 'Failures and flakes over a time window grouped by their normalized error (numbers, ids, paths and urls stripped), most frequent first: the error title and a sample, occurrences, how many tests and which projects it hits, first and last seen, and example failures with trace.zip URLs. Runs flagged as environment incidents (the app or browser was down) are listed apart under incidents, not as causes. Answers "what are the most common root causes of flakes and failures".',
    inputSchema: z.object({
      ...scopeInput,
      status: z.enum(['failed', 'flaky', 'any']).optional().describe('failed, flaky, or any (default).'),
    }),
  }, ({ view, projects, ...query }) => guard(
    () => client.getRootCauses({ ...query, projects: projectsOf(view, projects) }),
    r => ok(r),
  ))

  server.registerTool('test_occurrences', {
    title: 'A test\'s failures and traces',
    description: 'Every failure or flake of one test over a time window, newest first, each with its run, time, branch, commit, CI run link, retries, error and trace.zip URL, plus the newest run it passed in with that trace to compare against. Use after top_failing_tests, flakiest_tests or root_causes to collect the traces to debug.',
    inputSchema: z.object({
      project: z.string().describe('Project slug.'),
      testKey: z.string().describe('Test key (from top_failing_tests, flakiest_tests, root_causes or list_failures).'),
      ...windowInput,
      status: z.enum(['failed', 'flaky', 'any']).optional().describe('failed, flaky, or any (default).'),
    }),
  }, ({ project, testKey, ...window }) => guard(
    () => client.getTestOccurrences(project, testKey, window),
    r => ok(formatOccurrences(r)),
  ))
}
