import type { CiMeta, CommonErrors, ErrorCluster, GitMeta, InsightStatus, NormError, NormTest, TestInsight, TestOccurrence, TestOccurrences } from '@kinora/core'
import type { SQL } from 'drizzle-orm'
import type { ProjectRow } from './queries'
import { errorCategory, fingerprintError, stripAnsi } from '@kinora/core'
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

const MAX_ERROR_ROWS = 50_000
const ERROR_EXAMPLES = 3
const TALLY_SIZE = 5
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
  return sql`select r.id, r.project_id, r.started_at, r.git, r.ci, r.base_urls from run r
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
    // Playwright colours its messages for the terminal; an agent reads them as text.
    ...(r.error && { error: { message: stripAnsi(r.error.message), ...(r.error.stack && { stack: stripAnsi(r.error.stack) }) } }),
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

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

class Tally {
  private counts = new Map<string, number>()
  add(value: string | null | undefined) {
    if (value)
      this.counts.set(value, (this.counts.get(value) ?? 0) + 1)
  }

  top() {
    return [...this.counts].sort((a, b) => b[1] - a[1]).slice(0, TALLY_SIZE).map(([value, count]) => ({ value, count }))
  }
}

interface ErrorRow {
  id: string
  projectId: string
  testKey: string
  title: string
  file: string
  browser: string
  shard: number | null
  runId: string
  startedAt: Date
  git: GitMeta | null
  baseUrls: string[] | null
  error: NormError
}

// The window's failures grouped by their normalized error, most frequent first, each with the
// signals that narrow down its cause. Runs that were environment incidents are counted apart.
export async function loadCommonErrors(scope: InsightScope, limit: number): Promise<Omit<CommonErrors, 'since'>> {
  if (!scope.projects.length)
    return { errors: [], incidents: [] }
  const ids = list(scope.projects.map(p => p.id))
  const [failures, incidents] = await Promise.all([
    db.execute<ErrorRow & Record<string, unknown>>(sql`
      with w as (${windowRuns(scope)})
      select t.id, t.project_id as "projectId", t.test_key as "testKey", t.title, t.file, t.project_name as browser, t.shard_index as shard,
        w.id as "runId", w.started_at as "startedAt", w.git, w.base_urls as "baseUrls", t.errors->0 as error
      from w join test t on t.run_id = w.id
      where t.status in (${list(statuses(scope.status))}) and jsonb_array_length(t.errors) > 0
      order by w.started_at desc
      limit ${MAX_ERROR_ROWS + 1}`),
    db.execute<{ projectId: string, runs: number, reason: string }>(sql`
      select r.project_id as "projectId", count(*)::int as runs, (array_agg(r.incident->>'reason' order by r.started_at desc))[1] as reason
      from run r
      where r.project_id in (${ids}) and r.started_at >= ${scope.since} and r.incident is not null ${onBranch(scope.branch)}
      group by 1
      order by 2 desc`),
  ])
  const slugOf = new Map(scope.projects.map(p => [p.id, p.slug]))
  const rows = failures.rows.slice(0, MAX_ERROR_ROWS)
  const failuresInRun = new Map<string, number>()
  for (const r of rows)
    failuresInRun.set(r.runId, (failuresInRun.get(r.runId) ?? 0) + 1)

  interface Acc {
    fingerprint: string
    title: string
    sample: string
    occurrences: number
    tests: Set<string>
    projects: Set<string>
    perRun: Map<string, number>
    first: ErrorRow
    lastSeen: Date
    branches: Tally
    browsers: Tally
    shards: Tally
    baseUrls: Tally
    locations: Map<string, { file: string, line?: number, count: number, inTestFile: boolean }>
    examples: ErrorRow[]
  }
  const byFingerprint = new Map<string, Acc>()
  for (const r of rows) {
    const { fingerprint, title, sample } = fingerprintError(r.error)
    let c = byFingerprint.get(fingerprint)
    if (!c) {
      // Rows come newest first, so the first one seen is the freshest wording of the error.
      c = { fingerprint, title, sample, occurrences: 0, tests: new Set(), projects: new Set(), perRun: new Map(), first: r, lastSeen: r.startedAt, branches: new Tally(), browsers: new Tally(), shards: new Tally(), baseUrls: new Tally(), locations: new Map(), examples: [] }
      byFingerprint.set(fingerprint, c)
    }
    c.occurrences++
    c.tests.add(`${r.projectId}\0${r.testKey}`)
    c.projects.add(slugOf.get(r.projectId)!)
    c.perRun.set(r.runId, (c.perRun.get(r.runId) ?? 0) + 1)
    c.first = r
    c.branches.add(r.git?.branch)
    c.browsers.add(r.browser)
    c.shards.add(r.shard == null ? null : String(r.shard))
    for (const url of r.baseUrls ?? [])
      c.baseUrls.add(url)
    const at = r.error.location
    const where = at ? `${at.file}:${at.line}` : undefined
    if (at && where) {
      const l = c.locations.get(where) ?? { file: at.file, line: at.line, count: 0, inTestFile: at.file.endsWith(r.file) }
      l.count++
      c.locations.set(where, l)
    }
    if (c.examples.length < ERROR_EXAMPLES && !c.examples.some(e => e.testKey === r.testKey && e.projectId === r.projectId))
      c.examples.push(r)
  }
  const top = [...byFingerprint.values()].sort((a, b) => b.occurrences - a.occurrences).slice(0, limit)
  const [traces, lastPasses] = await Promise.all([
    traceUrls(top.flatMap(c => c.examples.map(e => e.id))),
    lastPassBefore(top.map(c => c.first)),
  ])
  const iso = (d: Date) => new Date(d).toISOString()
  return {
    errors: top.map((c, i): ErrorCluster => ({
      fingerprint: c.fingerprint,
      category: errorCategory(c.sample),
      title: c.title,
      sample: c.sample,
      occurrences: c.occurrences,
      runs: c.perRun.size,
      tests: c.tests.size,
      projects: [...c.projects],
      firstSeen: {
        at: iso(c.first.startedAt),
        project: slugOf.get(c.first.projectId)!,
        testKey: c.first.testKey,
        runId: c.first.runId,
        ...(c.first.git?.branch && { branch: c.first.git.branch }),
        ...(c.first.git?.sha && { sha: c.first.git.sha }),
        lastPass: lastPasses[i],
      },
      lastSeen: iso(c.lastSeen),
      breakdown: { branches: c.branches.top(), browsers: c.browsers.top(), shards: c.shards.top(), baseUrls: c.baseUrls.top() },
      locations: [...c.locations.values()].sort((a, b) => b.count - a.count).slice(0, TALLY_SIZE),
      testsPerRun: median([...c.perRun.values()]),
      failuresPerRun: median([...c.perRun.keys()].map(id => failuresInRun.get(id)!)),
      examples: c.examples.map(e => ({ project: slugOf.get(e.projectId)!, testKey: e.testKey, title: e.title, runId: e.runId, startedAt: iso(e.startedAt), traceUrl: traces.get(e.id) ?? null })),
    })),
    incidents: incidents.rows.map(i => ({ project: slugOf.get(i.projectId)!, runs: i.runs, reason: i.reason })),
    ...(failures.rows.length > MAX_ERROR_ROWS && { sampled: MAX_ERROR_ROWS }),
  }
}

// For each failure, the newest earlier run its test passed in.
async function lastPassBefore(failures: ErrorRow[]): Promise<ErrorCluster['firstSeen']['lastPass'][]> {
  if (!failures.length)
    return []
  const values = sql.join(failures.map((f, i) => sql`(${i}, ${f.projectId}, ${f.testKey}, ${new Date(f.startedAt)}::timestamp)`), sql`, `)
  const rows = await db.execute<{ i: number, runId: string, startedAt: Date, sha: string | null }>(sql`
    select x.i, p.run_id as "runId", p.started_at as "startedAt", p.sha
    from (values ${values}) as x(i, project_id, test_key, before)
    cross join lateral (
      select r.id as run_id, r.started_at, r.git->>'sha' as sha
      from test t join run r on r.id = t.run_id
      where t.project_id = x.project_id and t.test_key = x.test_key and t.status = 'expected' and r.started_at < x.before and r.incident is null
      order by r.started_at desc
      limit 1
    ) p`)
  const byIndex = new Map(rows.rows.map(r => [Number(r.i), r]))
  return failures.map((_, i) => {
    const r = byIndex.get(i)
    return r ? { at: new Date(r.startedAt).toISOString(), runId: r.runId, ...(r.sha && { sha: r.sha }) } : null
  })
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
