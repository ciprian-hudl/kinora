import { and, count, eq, sql, sum } from 'drizzle-orm'
import { db } from '../db'
import { artifact, project, usagePeriod } from '../db/schemas/index'

export function startOfMonthUtc(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

export function periodKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

// Usage is attributed to when tests ran (run.startedAt), not upload time, so historical
// backfill imports land in past periods and don't consume the current month's quota.
export async function recordResults(executor: Pick<typeof db, 'insert'>, organizationId: string, startedAt: Date, results: number): Promise<void> {
  if (results <= 0)
    return
  await executor
    .insert(usagePeriod)
    .values({ organizationId, period: periodKey(startedAt), results })
    .onConflictDoUpdate({
      target: [usagePeriod.organizationId, usagePeriod.period],
      set: { results: sql`${usagePeriod.results} + excluded.results`, updatedAt: new Date() },
    })
}

// Read from the counter, not the `test` rows: retention deletes those within the month on short
// windows (free = 7 days), which would otherwise give the quota back.
export async function currentPeriodResults(organizationId: string): Promise<number> {
  const row = await db.query.usagePeriod.findFirst({
    where: and(eq(usagePeriod.organizationId, organizationId), eq(usagePeriod.period, periodKey(new Date()))),
    columns: { results: true },
  })

  return row?.results ?? 0
}

// Bytes currently stored for an org. Retention purges shrink it, so it is a live total, not a period one.
export async function storageBytes(organizationId: string): Promise<number> {
  const [row] = await db
    .select({ total: sum(artifact.size) })
    .from(artifact)
    .innerJoin(project, eq(artifact.projectId, project.id))
    .where(eq(project.organizationId, organizationId))

  return Number(row?.total ?? 0)
}

export async function projectCount(organizationId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(project)
    .where(eq(project.organizationId, organizationId))

  return row?.total ?? 0
}
