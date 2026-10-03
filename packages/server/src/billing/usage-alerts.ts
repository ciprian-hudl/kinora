import type { MeteredUsage, OveragePrice } from './polar'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { member, subscription, user } from '../db/schemas/index'
import { cloud, env } from '../lib/env'
import { logger } from '../lib/logger'
import { deliverMail } from '../lib/mailer'
import { isActivePaid, ownerIsAdmin, quotaCrossing } from './entitlements'
import { meteredResults, overagePrice } from './polar'

export type UsageLevel = 'near' | 'reached'

const RANK: Record<UsageLevel, number> = { near: 1, reached: 2 }
const rank = (level: UsageLevel | null): number => (level ? RANK[level] : 0)

// Where the cycle stands against the included results: same 80% / 100% thresholds as the free quota.
export function usageLevel(usage: MeteredUsage): UsageLevel | null {
  return usage.credited > 0 ? quotaCrossing(0, usage.consumed, usage.credited) : null
}

function money(cents: number, currency: string): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

export function usageAlertText(name: string | null, plan: string, level: UsageLevel, usage: MeteredUsage, price: OveragePrice | null, link: string): string {
  const greeting = `Hi${name ? ` ${name}` : ''},`
  const used = usage.consumed.toLocaleString('en-US')
  const included = usage.credited.toLocaleString('en-US')
  const rate = price ? ` at ${money(price.unitAmount, price.currency)} each` : ''
  if (level === 'reached')
    return `${greeting}\n\nYour kinora workspace has used all ${included} test results included in your ${plan} plan for this billing period (${used} so far).\n\nNothing is blocked: your runs keep being ingested, and results past the included amount are billed${rate} on your next invoice.\n\nSee your usage and the overage so far: ${link}\n\nExpecting this volume every month? Write to hi@kinora.dev and we will find a plan that fits.`
  return `${greeting}\n\nYour kinora workspace has used ${used} of the ${included} test results included in your ${plan} plan for this billing period.\n\nNothing will be blocked when you pass it: results past the included amount are billed${rate} on your next invoice.\n\nFollow your usage: ${link}`
}

export interface UsageAlertResult {
  checked: number
  sent: number
}

// Email paid workspaces when their billing cycle crosses 80% / 100% of the included results.
// Run from a cron: usage is read from Polar (the billed figure), which is too slow for the ingest path.
export async function notifyUsageAlerts(): Promise<UsageAlertResult> {
  const subs = await db
    .select({ organizationId: subscription.organizationId, tier: subscription.tier, status: subscription.status, alerted: subscription.usageAlertLevel })
    .from(subscription)

  let checked = 0
  let sent = 0
  for (const sub of subs) {
    if (!isActivePaid(sub.tier, sub.status) || (sub.tier !== 'team' && sub.tier !== 'pro'))
      continue
    // Admin-owned workspaces have no caps: nothing to warn about.
    if (await ownerIsAdmin(sub.organizationId))
      continue

    const [owner] = await db
      .select({ id: user.id, email: user.email, name: user.name })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(and(eq(member.organizationId, sub.organizationId), eq(member.role, 'owner')))
      .limit(1)
    const usage = owner ? await meteredResults(owner.id) : null
    if (!owner || !usage)
      continue
    checked++

    const level = usageLevel(usage)
    let next = sub.alerted
    if (level && rank(level) > rank(sub.alerted)) {
      const plan = sub.tier === 'team' ? 'Team' : 'Pro'
      const productId = sub.tier === 'team' ? cloud?.teamProductId : cloud?.proProductId
      const delivered = await deliverMail({
        to: owner.email,
        subject: level === 'reached' ? `You've used your included kinora ${plan} test results` : `You're nearing your included kinora ${plan} test results`,
        text: usageAlertText(owner.name, plan, level, usage, productId ? await overagePrice(productId) : null, `${env.WEB_ORIGIN}/settings/workspace`),
      })
      // Only record what actually left, so a mail outage is retried on the next run.
      if (!delivered)
        continue
      sent++
      next = level
      logger.info({ orgId: sub.organizationId, level, consumed: usage.consumed, credited: usage.credited }, 'usage alert sent')
    }
    // Usage only grows within a cycle, so a lower level means Polar started a new one: re-arm.
    else if (rank(level) < rank(sub.alerted)) {
      next = level
    }

    if (next !== sub.alerted)
      await db.update(subscription).set({ usageAlertLevel: next }).where(eq(subscription.organizationId, sub.organizationId))
  }

  return { checked, sent }
}
