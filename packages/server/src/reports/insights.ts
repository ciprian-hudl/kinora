import type { CiMeta, GitMeta, InsightStatus, NormError, NormTest, RootCause, RootCauses, TestInsight, TestOccurrence, TestOccurrences } from '@kinora/core'
import type { SQL } from 'drizzle-orm'
import type { ProjectRow } from './queries'
import { fingerprintError } from '@kinora/core'
import { sql } from 'drizzle-orm'
import { db } from '../db'
import { storage } from '../lib/storage'

// Insights read every failure of every project in a time window, so they run off the failing-test
// index and only fetch the heavy columns for the rows they return.

export interface InsightScope {
  projects: ProjectRow[]
  since: Date
  // A branch name, or `default` for main / master.
  branch?: string
  status: InsightStatus
}

export type InsightSort = 'count' | 'flakeRate'

const MAX_CAUSE_ROWS = 50_000
const CAUSE_EXAMPLES = 3
// A test needs this many runs in the window before its flake rate ranks it.
const MIN_RATE_RUNS = 3

function statuses(status: InsightStatus): NormTest['status'][] {
  return status === 'failed' ? ['unexpected'] : status === 'flaky' ? ['flaky'] : ['unexpected', 'flaky']
}

function list(values: string[]): SQL {
  return sql.join(values.map(v => sql`${v}`), sql`, `)
}

function onBranch(branch?: string): SQL {
  if (!branch)
    return sql``
  return branch === 'default' ? sql`and r.git->>'branch' in ('main', 'master')` : sql`and r.git->>'branch' = ${branch}`
}

// The counted runs in scope: incidents are the environment failing, not the tests.
function windowRuns(scope: InsightScope): SQL {
  return sql`select r.id, r.project_id, r.started_at, r.git, r.ci from run r
    where r.project_id in (${list(scope.projects.map(p => p.id))}) and r.started_at >= ${scope.since} and r.incident is null ${onBranch(scope.branch)}`
}

function pairs(rows: { projectId: string, testKey: string }[]): SQL {
  return sql.join(rows.map(r => sql`(${r.projectId}, ${r.testKey})`), sql`, `)
}

async function traceUrls(testIds: string[]): Promise<Map<string, string>> {
  if (!testIds.length)
    return new Map()
  const rows = await db.execute<{ testId: string, storageKey: string }>(sql`
    select test_id as "testId", storage_key as "storageKey" from artifact where test_id in (${list(testIds)}) and name = 'trace'`)
  return new Map(await Promise.all(rows.rows.map(async r => [r.testId, await storage.url(r.storageKey)] as const)))
}

interface OccurrenceRow {
  id: string
  runId: string
  startedAt: Date
  status: NormTest['status']
  retries: number
  error: NormError | null
  git: GitMeta | null
  ci: CiMeta | null
}

function occurrence(r: OccurrenceRow, traces: Map<string, string>): TestOccurrence {
  return {
    runId: r.runId,
    startedAt: new Date(r.startedAt).toISOString(),
    status: r.status,
    ...(r.git?.branch && { branch: r.git.branch }),
    ...(r.git?.sha && { sha: r.git.sha }),
    ...(r.ci?.runUrl && { ciRunUrl: r.ci.runUrl }),
    retries: r.retries,
    ...(r.error && { error: { message: r.error.message, ...(r.error.stack && { stack: r.error.stack }) } }),
    traceUrl: traces.get(r.id) ?? null,
  }
}

// The tests that failed or flaked in the window, by how often (`count`) or by the share of their
// runs that flaked (`flakeRate`), each with its newest failure and trace.
export async function loadTestInsights(scope: InsightScope, sort: InsightSort, limit: number): Promise<TestInsight[]> {
  if (!scope.projects.length)
    return []
  const counted = await db.execute<{ projectId: string, testKey: string, fails: number, flakes: number, firstSeen: Date, lastSeen: Date }>(sql`
    with w as (${windowRuns(scope)})
    select t.project_id as "projectId", t.test_key as "testKey",
      count(*) filter (where t.status = 'unexpected')::int as fails, count(*) filter (where t.status = 'flaky')::int as flakes,
      min(w.started_at) as "firstSeen", max(w.started_at) as "lastSeen"
    from w join test t on t.run_id = w.id
    where t.status in (${list(statuses(scope.status))})
    group by 1, 2
    order by ${sort === 'flakeRate' ? sql`flakes desc` : sql`count(*) desc`}, 2
    limit ${sort === 'flakeRate' ? Math.max(limit * 4, 100) : limit}`)
  if (!counted.rows.length)
    return []

  const [totals, latest] = await Promise.all([
    db.execute<{ projectId: string, testKey: string, runs: number }>(sql`
      with w as (${windowRuns(scope)})
      select t.project_id as "projectId", t.test_key as "testKey", count(*)::int as runs
      from test t join w on w.id = t.run_id
      where (t.project_id, t.test_key) in (${pairs(counted.rows)}) and t.status <> 'skipped'
      group by 1, 2`),
    db.execute<OccurrenceRow & { projectId: string, testKey: string, title: string, titlePath: string[], file: string, line: number } & Record<string, unknown>>(sql`
      with w as (${windowRuns(scope)})
      select distinct on (t.project_id, t.test_key) t.id, t.project_id as "projectId", t.test_key as "testKey", t.title,
        t.title_path as "titlePath", t.file, t.line, t.status, t.retries, t.errors->0 as error,
        w.id as "runId", w.started_at as "startedAt", w.git, w.ci
      from w join test t on t.run_id = w.id
      where t.status in (${list(statuses(scope.status))}) and (t.project_id, t.test_key) in (${pairs(counted.rows)})
      order by t.project_id, t.test_key, w.started_at desc`),
  ])
  const key = (r: { projectId: string, testKey: string }) => `${r.projectId}\0${r.testKey}`
  const runsOf = new Map(totals.rows.map(r => [key(r), r.runs]))
  const latestOf = new Map(latest.rows.map(r => [key(r), r]))
  const traces = await traceUrls(latest.rows.map(r => r.id))
  const slugOf = new Map(scope.projects.map(p => [p.id, p.slug]))

  const tests = counted.rows.map((c) => {
    const l = latestOf.get(key(c))!
    const runs = Math.max(runsOf.get(key(c)) ?? 0, c.fails + c.flakes)
    return {
      project: slugOf.get(c.projectId)!,
      testKey: c.testKey,
      title: l.title,
      titlePath: l.titlePath,
      location: `${l.file}:${l.line}`,
      runs,
      fails: c.fails,
      flakes: c.flakes,
      failRate: c.fails / runs,
      flakeRate: c.flakes / runs,
      firstSeen: new Date(c.firstSeen).toISOString(),
      lastSeen: new Date(c.lastSeen).toISOString(),
      latest: occurrence(l, traces),
    }
  })
  if (sort === 'count')
    return tests
  return tests
    .filter(t => t.flakes && t.runs >= MIN_RATE_RUNS)
    .sort((a, b) => b.flakeRate - a.flakeRate || b.flakes - a.flakes)
    .slice(0, limit)
}

// The window's failures grouped by their normalized error, most frequent first, with the runs
// that were environment incidents counted apart.
export async function loadRootCauses(scope: InsightScope, limit: number): Promise<Omit<RootCauses, 'since'>> {
  if (!scope.projects.length)
    return { causes: [], incidents: [] }
  const ids = list(scope.projects.map(p => p.id))
  const [failures, incidents] = await Promise.all([
    db.execute<{ id: string, projectId: string, testKey: string, title: string, runId: string, startedAt: Date, error: NormError }>(sql`
      with w as (${windowRuns(scope)})
      select t.id, t.project_id as "projectId", t.test_key as "testKey", t.title, w.id as "runId", w.started_at as "startedAt", t.errors->0 as error
      from w join test t on t.run_id = w.id
      where t.status in (${list(statuses(scope.status))}) and jsonb_array_length(t.errors) > 0
      order by w.started_at desc
      limit ${MAX_CAUSE_ROWS + 1}`),
    db.execute<{ projectId: string, runs: number, reason: string }>(sql`
      select r.project_id as "projectId", count(*)::int as runs, (array_agg(r.incident->>'reason' order by r.started_at desc))[1] as reason
      from run r
      where r.project_id in (${ids}) and r.started_at >= ${scope.since} and r.incident is not null ${onBranch(scope.branch)}
      group by 1
      order by 2 desc`),
  ])
  const slugOf = new Map(scope.projects.map(p => [p.id, p.slug]))
  const rows = failures.rows.slice(0, MAX_CAUSE_ROWS)

  interface Acc extends Omit<RootCause, 'tests' | 'projects' | 'examples'> {
    tests: Set<string>
    projects: Set<string>
    examples: typeof rows
  }
  const byFingerprint = new Map<string, Acc>()
  for (const r of rows) {
    const { fingerprint, title, sample } = fingerprintError(r.error)
    const at = new Date(r.startedAt).toISOString()
    let c = byFingerprint.get(fingerprint)
    if (!c) {
      // Rows come newest first, so the first one seen is the freshest wording of the error.
      c = { fingerprint, title, sample, occurrences: 0, tests: new Set(), projects: new Set(), firstSeen: at, lastSeen: at, examples: [] }
      byFingerprint.set(fingerprint, c)
    }
    c.occurrences++
    c.tests.add(`${r.projectId}\0${r.testKey}`)
    c.projects.add(slugOf.get(r.projectId)!)
    c.firstSeen = at
    if (c.examples.length < CAUSE_EXAMPLES && !c.examples.some(e => e.testKey === r.testKey && e.projectId === r.projectId))
      c.examples.push(r)
  }
  const top = [...byFingerprint.values()].sort((a, b) => b.occurrences - a.occurrences).slice(0, limit)
  const traces = await traceUrls(top.flatMap(c => c.examples.map(e => e.id)))
  return {
    causes: top.map(c => ({
      ...c,
      tests: c.tests.size,
      projects: [...c.projects],
      examples: c.examples.map(e => ({ project: slugOf.get(e.projectId)!, testKey: e.testKey, title: e.title, runId: e.runId, startedAt: new Date(e.startedAt).toISOString(), traceUrl: traces.get(e.id) ?? null })),
    })),
    incidents: incidents.rows.map(i => ({ project: slugOf.get(i.projectId)!, runs: i.runs, reason: i.reason })),
    ...(failures.rows.length > MAX_CAUSE_ROWS && { sampled: MAX_CAUSE_ROWS }),
  }
}

// One test in the window: its failures newest first with their traces, and the newest run it
// passed in to compare against.
export async function loadTestOccurrences(p: ProjectRow, testKey: string, scope: Omit<InsightScope, 'projects'>, limit: number): Promise<Omit<TestOccurrences, 'since'>> {
  const rows = await db.execute<OccurrenceRow & { title: string } & Record<string, unknown>>(sql`
    select t.id, t.title, t.status, t.retries, t.errors->0 as error, r.id as "runId", r.started_at as "startedAt", r.git, r.ci
    from test t join run r on r.id = t.run_id
    where t.project_id = ${p.id} and t.test_key = ${testKey} and r.started_at >= ${scope.since} and r.incident is null ${onBranch(scope.branch)}
    order by r.started_at desc`)
  const wanted = statuses(scope.status)
  const failing = rows.rows.filter(r => wanted.includes(r.status)).slice(0, limit)
  const pass = rows.rows.find(r => r.status === 'expected')
  const traces = await traceUrls([...failing, ...(pass ? [pass] : [])].map(r => r.id))
  return {
    project: p.slug,
    testKey,
    ...(rows.rows[0] && { title: rows.rows[0].title }),
    runs: rows.rows.filter(r => r.status !== 'skipped').length,
    fails: rows.rows.filter(r => r.status === 'unexpected').length,
    flakes: rows.rows.filter(r => r.status === 'flaky').length,
    occurrences: failing.map(r => occurrence(r, traces)),
    lastPass: pass ? occurrence(pass, traces) : null,
  }
}
