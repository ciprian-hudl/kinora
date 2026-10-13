import type { Counts } from '@kinora/core'
import { and, eq, gte, isNotNull, sql } from 'drizzle-orm'
import { db } from '../db'
import { run } from '../db/schemas/index'

// Project analytics: trends over a longer range than the per-test pages (which read the newest
// HEALTH_WINDOW runs), aggregated in SQL so a long-lived project never loads its runs into memory.

const DAY = 86_400_000

export const ANALYTICS_RANGES = [30, 90] as const
export type AnalyticsRange = typeof ANALYTICS_RANGES[number]
export type AnalyticsBucket = 'day' | 'week'

// Test outcomes summed over every run started in one bucket.
export interface OutcomeBucket {
  date: string // YYYY-MM-DD in the requested time zone, first day of the bucket (a Monday per week)
  runs: number
  expected: number
  flaky: number
  unexpected: number
  skipped: number
}

export interface ProjectAnalytics {
  days: AnalyticsRange
  bucket: AnalyticsBucket
  branches: string[] // branches with a run in the range, for the filter
  outcomes: OutcomeBucket[] // only buckets that have runs, oldest first
}

// 90 days per day would be too many points to read, so the longer range goes per week.
export function bucketFor(days: AnalyticsRange): AnalyticsBucket {
  return days > 30 ? 'week' : 'day'
}

// IANA name only (`Europe/Paris`, `UTC`): it is inlined in SQL, so nothing else may get through.
export function isTimeZone(tz: string): boolean {
  if (!/^[A-Z][\w+-]*(?:\/[\w+-]+)*$/i.test(tz))
    return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz }).format()
    return true
  }
  catch {
    return false
  }
}

// `timeZone` is the viewer's: a run at 00:30 in Paris belongs to that day, not to the UTC one before.
export async function loadProjectAnalytics(projectId: string, days: AnalyticsRange, branch?: string, timeZone = 'UTC'): Promise<ProjectAnalytics> {
  if (!isTimeZone(timeZone))
    throw new Error(`Invalid time zone: ${timeZone}`)
  const bucket = bucketFor(days)
  const since = new Date(Date.now() - days * DAY)
  const inRange = and(eq(run.projectId, projectId), gte(run.startedAt, since))
  // Inlined, not bind parameters: the select and the group by must be the same expression.
  // started_at is a UTC timestamp without zone, hence the double AT TIME ZONE.
  const local = sql`(${run.startedAt} AT TIME ZONE 'UTC') AT TIME ZONE ${sql.raw(`'${timeZone}'`)}`
  const start = sql`date_trunc(${sql.raw(`'${bucket}'`)}, ${local})`
  const total = (key: keyof Counts) => sql<number>`coalesce(sum((${run.counts}->>${sql.raw(`'${key}'`)})::int), 0)::int`
  const branchOf = sql<string>`${run.git}->>'branch'`

  const [outcomes, branches] = await Promise.all([
    db
      .select({
        date: sql<string>`to_char(${start}, 'YYYY-MM-DD')`,
        runs: sql<number>`count(*)::int`,
        expected: total('expected'),
        flaky: total('flaky'),
        unexpected: total('unexpected'),
        skipped: total('skipped'),
      })
      .from(run)
      .where(and(inRange, branch ? eq(branchOf, branch) : undefined))
      .groupBy(start)
      .orderBy(start),
    db
      .selectDistinct({ name: branchOf })
      .from(run)
      .where(and(inRange, isNotNull(branchOf)))
      .orderBy(branchOf),
  ])

  return { days, bucket, branches: branches.map(b => b.name), outcomes }
}
