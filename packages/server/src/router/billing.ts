import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getEntitlements, getSubscription, isActivePaid } from '../billing/entitlements'
import { meteredResults, overageCents, overagePrice } from '../billing/polar'
import { currentPeriodResults, storageBytes } from '../billing/usage'
import { db } from '../db'
import { member, organization } from '../db/schemas/index'
import { cloud } from '../lib/env'
import { adminProcedure, orgProcedure, router } from '../trpc/index'

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
    const [entitlements, sub, org, localResults, usedStorageBytes] = await Promise.all([
      getEntitlements(organizationId),
      getSubscription(organizationId),
      db.query.organization.findFirst({
        where: eq(organization.id, organizationId),
        columns: { usageNearEmailEnabled: true, usageLimitEmailEnabled: true },
      }),
      currentPeriodResults(organizationId),
      storageBytes(organizationId),
    ])

    const metered = isActivePaid(entitlements.tier, sub?.status) && Number.isFinite(entitlements.includedResults)
      ? await billedUsage(organizationId)
      : null

    const productId = entitlements.tier === 'pro' ? cloud?.proProductId : entitlements.tier === 'team' ? cloud?.teamProductId : undefined
    const price = metered && productId && metered.consumed > metered.credited ? await overagePrice(productId) : null

    return {
      tier: entitlements.tier,
      alerts: entitlements.alerts,
      maxProjects: finiteOrNull(entitlements.maxProjects),
      retentionDays: finiteOrNull(entitlements.retentionDays),
      includedResults: metered?.credited || finiteOrNull(entitlements.includedResults),
      usedResults: metered?.consumed ?? localResults,
      // 'cycle' = Polar's billing cycle (ends at currentPeriodEnd); 'month' = calendar month (UTC).
      usagePeriod: metered ? 'cycle' as const : 'month' as const,
      // Cost of the results past the included ones so far this cycle; null when not in overage.
      overage: metered && price
        ? { amountCents: overageCents(metered, price), unitAmountCents: price.unitAmount, currency: price.currency }
        : null,
      storageBytes: finiteOrNull(entitlements.storageBytes),
      usedStorageBytes,
      status: sub?.status ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
      usageNearEmailEnabled: org?.usageNearEmailEnabled ?? true,
      usageLimitEmailEnabled: org?.usageLimitEmailEnabled ?? true,
    }
  }),

  updateUsageEmailSettings: adminProcedure
    .input(z.object({ usageNearEmailEnabled: z.boolean(), usageLimitEmailEnabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .update(organization)
        .set(input)
        .where(eq(organization.id, ctx.organizationId))
        .returning({
          usageNearEmailEnabled: organization.usageNearEmailEnabled,
          usageLimitEmailEnabled: organization.usageLimitEmailEnabled,
        })
      return row ?? input
    }),
})
