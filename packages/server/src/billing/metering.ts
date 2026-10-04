import { and, asc, count, eq, lt } from 'drizzle-orm'
import { db } from '../db'
import { member, project, run, test } from '../db/schemas/index'
import { logger } from '../lib/logger'
import { meterTestResults } from './polar'

const BATCH = 500
// Leave runs this young to the ingest request that is still reporting them.
const IN_FLIGHT_MS = 5 * 60 * 1000

// Report one run's results to Polar and clear its pending flag. Never throws: a failure leaves the
// flag set for report-pending-usage to retry, so billable usage is delayed rather than lost.
// Not reported to Sentry here: a transient failure heals on the next retry, and the cron raises one
// summary for the runs that stay pending.
export async function meterRun(runId: string, organizationId: string, results: number): Promise<boolean> {
  try {
    // Polar customer = the org owner; meter usage against them.
    const owner = await db.query.member.findFirst({
      where: and(eq(member.organizationId, organizationId), eq(member.role, 'owner')),
      columns: { userId: true },
    })
    if (owner && results > 0)
      await meterTestResults(owner.userId, results, runId)
    await db.update(run).set({ meterPending: false }).where(eq(run.id, runId))
    return true
  }
  catch (error) {
    logger.error({ error, orgId: organizationId, runId }, 'polar usage ingest failed')
    return false
  }
}

export interface ReportResult {
  reported: number
  failed: number
}

// Retry every run whose usage never reached Polar. Oldest first, one bounded batch per call.
export async function reportPendingUsage(now: Date): Promise<ReportResult> {
  const pending = await db
    .select({ id: run.id, organizationId: project.organizationId })
    .from(run)
    .innerJoin(project, eq(run.projectId, project.id))
    .where(and(eq(run.meterPending, true), lt(run.createdAt, new Date(now.getTime() - IN_FLIGHT_MS))))
    .orderBy(asc(run.createdAt))
    .limit(BATCH)

  let reported = 0
  for (const r of pending) {
    const [row] = await db.select({ total: count() }).from(test).where(eq(test.runId, r.id))
    if (await meterRun(r.id, r.organizationId, row?.total ?? 0))
      reported++
  }

  return { reported, failed: pending.length - reported }
}
