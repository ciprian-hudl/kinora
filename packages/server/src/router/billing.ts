import { and, eq } from 'drizzle-orm'
import { getEntitlements, getSubscription, isActivePaid } from '../billing/entitlements'
import { meteredResults } from '../billing/polar'
import { currentPeriodResults, storageBytes } from '../billing/usage'
import { db } from '../db'
import { member } from '../db/schemas/index'
import { orgProcedure, router } from '../trpc/index'

// Infinity doesn't survive JSON: unlimited limits go over the wire as null.
function finiteOrNull(n: number): number | null {
  return Number.isFinite(n) ? n : null
}

// Paid plans are billed by Polar on the subscription cycle, so show Polar's own figures there:
// the local counter runs on the calendar month and would disagree with the invoice.
async function billedUsage(organizationId: string) {
  // Polar customer = the org owner.
  const owner = await db.query.member.findFirst({
    where: and(eq(member.organizationId, organizationId), eq(member.role, 'owner')),
    columns: { userId: true },
  })
  return owner ? meteredResults(owner.userId) : null
}

export const billingRouter = router({
  summary: orgProcedure.query(async ({ ctx }) => {
    const organizationId = ctx.organizationId
    const [entitlements, sub, localResults, usedStorageBytes] = await Promise.all([
      getEntitlements(organizationId),
      getSubscription(organizationId),
      currentPeriodResults(organizationId),
      storageBytes(organizationId),
    ])

    const metered = isActivePaid(entitlements.tier, sub?.status) && Number.isFinite(entitlements.includedResults)
      ? await billedUsage(organizationId)
      : null

    return {
      tier: entitlements.tier,
      alerts: entitlements.alerts,
      maxProjects: finiteOrNull(entitlements.maxProjects),
      retentionDays: finiteOrNull(entitlements.retentionDays),
      includedResults: metered?.credited || finiteOrNull(entitlements.includedResults),
      usedResults: metered?.consumed ?? localResults,
      // 'cycle' = Polar's billing cycle (ends at currentPeriodEnd); 'month' = calendar month (UTC).
      usagePeriod: metered ? 'cycle' as const : 'month' as const,
      storageBytes: finiteOrNull(entitlements.storageBytes),
      usedStorageBytes,
      status: sub?.status ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    }
  }),
})
