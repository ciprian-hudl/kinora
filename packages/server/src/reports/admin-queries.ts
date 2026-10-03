import type { AnyColumn } from 'drizzle-orm'
import { and, count, desc, eq, gte, inArray, max, notInArray, sql, sum } from 'drizzle-orm'
import { isActivePaid, planLimits } from '../billing/entitlements'
import { meteredResults, overageCents, overagePrice, planPriceCents } from '../billing/polar'
import { periodKey } from '../billing/usage'
import { db } from '../db'
import { artifact, member, organization, project, run, subscription, test, usagePeriod, user } from '../db/schemas/index'
import { cloud } from '../lib/env'

// Cross-org operator analytics: unscoped, read-everything. Only ever reached via
// platformAdminProcedure - never import this from a user-facing router.
// Dogfood/test orgs flagged organization.internal are excluded from every metric.

const DAY = 86_400_000

export interface AdminOverview {
  users: number
  accounts: number
  activeAccounts: number
  projects: number
  testResults30d: number
  newUsers7d: number
}

export interface Bucket {
  date: string
  count: number
}

export interface AccountRow {
  orgId: string
  name: string
  ownerEmail: string | null
  members: number
  plan: string
  projects: number
  lastRunAt: string | null
  // Raw billing state; `plan` above collapses anything that is not an active paid plan to 'free'.
  subscription: { tier: string, status: string | null, currentPeriodEnd: string | null, cancelAtPeriodEnd: boolean } | null
  // Owner is a platform admin: the workspace has no caps whatever its plan.
  unlimited: boolean
  usedResults: number
  // null = unlimited.
  includedResults: number | null
  usagePct: number | null
  // 'cycle' = Polar's billed figure for the subscription cycle; 'month' = local calendar-month counter.
  usagePeriod: 'cycle' | 'month'
  overageResults: number
  overageCents: number | null
  planPriceCents: number | null
  prevMonthResults: number
  runs30d: number
  storageBytes: number
  storageLimitBytes: number | null
}

function finiteOrNull(n: number): number | null {
  return Number.isFinite(n) ? n : null
}

// Internal orgs and the users who own them, excluded from real-adoption metrics.
async function internalIds(): Promise<{ orgIds: string[], userIds: string[] }> {
  const orgs = await db.select({ id: organization.id }).from(organization).where(eq(organization.internal, true))
  const orgIds = orgs.map(o => o.id)
  if (!orgIds.length)
    return { orgIds: [], userIds: [] }
  const owners = await db
    .select({ userId: member.userId })
    .from(member)
    .where(and(inArray(member.organizationId, orgIds), eq(member.role, 'owner')))
  return { orgIds, userIds: owners.map(o => o.userId) }
}

export async function adminOverview(): Promise<AdminOverview> {
  const since30 = new Date(Date.now() - 30 * DAY)
  const since7 = new Date(Date.now() - 7 * DAY)
  const { orgIds, userIds } = await internalIds()
  const orgNot = (col: AnyColumn) => (orgIds.length ? notInArray(col, orgIds) : undefined)
  const userNot = userIds.length ? notInArray(user.id, userIds) : undefined

  const [[users], [accounts], [projects], [newUsers7d], [testResults30d], [activeAccounts]] = await Promise.all([
    db.select({ n: count() }).from(user).where(userNot),
    db.select({ n: count() }).from(organization).where(orgNot(organization.id)),
    db.select({ n: count() }).from(project).where(orgNot(project.organizationId)),
    db.select({ n: count() }).from(user).where(and(gte(user.createdAt, since7), userNot)),
    db
      .select({ n: count() })
      .from(test)
      .innerJoin(project, eq(test.projectId, project.id))
      .where(and(gte(test.createdAt, since30), orgNot(project.organizationId))),
    db
      .select({ n: sql<number>`count(distinct ${project.organizationId})::int` })
      .from(run)
      .innerJoin(project, eq(run.projectId, project.id))
      .where(and(gte(run.startedAt, since30), orgNot(project.organizationId))),
  ])

  return {
    users: users.n,
    accounts: accounts.n,
    projects: projects.n,
    newUsers7d: newUsers7d.n,
    testResults30d: testResults30d.n,
    activeAccounts: activeAccounts.n,
  }
}

export async function signupsPerWeek(weeks = 12): Promise<Bucket[]> {
  const since = new Date(Date.now() - weeks * 7 * DAY)
  const { userIds } = await internalIds()
  const bucket = sql`date_trunc('week', ${user.createdAt})`
  return db
    .select({ date: sql<string>`to_char(${bucket}, 'YYYY-MM-DD')`, count: sql<number>`count(*)::int` })
    .from(user)
    .where(and(gte(user.createdAt, since), userIds.length ? notInArray(user.id, userIds) : undefined))
    .groupBy(bucket)
    .orderBy(bucket)
}

export async function runsPerDay(days = 30): Promise<Bucket[]> {
  const since = new Date(Date.now() - days * DAY)
  const { orgIds } = await internalIds()
  const bucket = sql`date_trunc('day', ${run.startedAt})`
  return db
    .select({ date: sql<string>`to_char(${bucket}, 'YYYY-MM-DD')`, count: sql<number>`count(*)::int` })
    .from(run)
    .innerJoin(project, eq(run.projectId, project.id))
    .where(and(gte(run.startedAt, since), orgIds.length ? notInArray(project.organizationId, orgIds) : undefined))
    .groupBy(bucket)
    .orderBy(bucket)
}

export async function listAccounts(): Promise<AccountRow[]> {
  const now = new Date()
  const period = periodKey(now)
  const prevPeriod = periodKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)))

  const [orgs, owners, memberCounts, projectCounts, lastRuns, subs, usage, recentRuns, storage] = await Promise.all([
    db
      .select({ id: organization.id, name: organization.name })
      .from(organization)
      .where(eq(organization.internal, false)),
    db
      .select({ orgId: member.organizationId, userId: user.id, email: user.email, role: user.role })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(eq(member.role, 'owner'))
      // Newest first so the Map's last-write keeps the founding owner for multi-owner orgs.
      .orderBy(desc(member.createdAt)),
    db.select({ orgId: member.organizationId, n: count() }).from(member).groupBy(member.organizationId),
    db.select({ orgId: project.organizationId, n: count() }).from(project).groupBy(project.organizationId),
    db
      .select({ orgId: project.organizationId, last: max(run.startedAt) })
      .from(run)
      .innerJoin(project, eq(run.projectId, project.id))
      .groupBy(project.organizationId),
    db
      .select({
        orgId: subscription.organizationId,
        tier: subscription.tier,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      })
      .from(subscription),
    db
      .select({ orgId: usagePeriod.organizationId, period: usagePeriod.period, results: usagePeriod.results })
      .from(usagePeriod)
      .where(inArray(usagePeriod.period, [period, prevPeriod])),
    db
      .select({ orgId: project.organizationId, n: count() })
      .from(run)
      .innerJoin(project, eq(run.projectId, project.id))
      .where(gte(run.startedAt, new Date(now.getTime() - 30 * DAY)))
      .groupBy(project.organizationId),
    db
      .select({ orgId: project.organizationId, bytes: sum(artifact.size) })
      .from(artifact)
      .innerJoin(project, eq(artifact.projectId, project.id))
      .groupBy(project.organizationId),
  ])

  const ownerByOrg = new Map(owners.map(o => [o.orgId, o]))
  const membersByOrg = new Map(memberCounts.map(m => [m.orgId, m.n]))
  const projectsByOrg = new Map(projectCounts.map(p => [p.orgId, p.n]))
  const lastByOrg = new Map(lastRuns.map(r => [r.orgId, r.last]))
  const subByOrg = new Map(subs.map(s => [s.orgId, s]))
  const usageByOrg = new Map(usage.filter(u => u.period === period).map(u => [u.orgId, u.results]))
  const prevUsageByOrg = new Map(usage.filter(u => u.period === prevPeriod).map(u => [u.orgId, u.results]))
  const runsByOrg = new Map(recentRuns.map(r => [r.orgId, r.n]))
  const storageByOrg = new Map(storage.map(s => [s.orgId, Number(s.bytes ?? 0)]))

  const rows = await Promise.all(orgs.map(async (o): Promise<AccountRow> => {
    const owner = ownerByOrg.get(o.id)
    const sub = subByOrg.get(o.id)
    // Only an active paid subscription counts as its tier; canceled/past-due collapses to free.
    const plan = sub && isActivePaid(sub.tier, sub.status) ? sub.tier : 'free'
    const limits = planLimits(plan)
    const unlimited = owner?.role === 'admin'
    const productId = plan === 'pro' ? cloud?.proProductId : plan === 'team' ? cloud?.teamProductId : undefined

    // Paid plans are billed by Polar on the subscription cycle: show that figure, as their settings do.
    const metered = productId && owner ? await meteredResults(owner.userId) : null
    const usedResults = metered?.consumed ?? usageByOrg.get(o.id) ?? 0
    const includedResults = unlimited ? null : metered?.credited || finiteOrNull(limits.includedResults)
    const overageResults = productId && includedResults != null ? Math.max(0, usedResults - includedResults) : 0
    const price = productId && overageResults > 0 ? await overagePrice(productId) : null
    const last = lastByOrg.get(o.id)

    return {
      orgId: o.id,
      name: o.name,
      ownerEmail: owner?.email ?? null,
      members: membersByOrg.get(o.id) ?? 0,
      plan,
      projects: projectsByOrg.get(o.id) ?? 0,
      lastRunAt: last ? last.toISOString() : null,
      subscription: sub
        ? { tier: sub.tier, status: sub.status, currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null, cancelAtPeriodEnd: sub.cancelAtPeriodEnd }
        : null,
      unlimited,
      usedResults,
      includedResults,
      usagePct: includedResults ? Math.round((usedResults / includedResults) * 100) : null,
      usagePeriod: metered ? 'cycle' : 'month',
      overageResults,
      overageCents: price && includedResults != null ? overageCents({ consumed: usedResults, credited: includedResults }, price) : null,
      planPriceCents: productId ? await planPriceCents(productId) : null,
      prevMonthResults: prevUsageByOrg.get(o.id) ?? 0,
      runs30d: runsByOrg.get(o.id) ?? 0,
      storageBytes: storageByOrg.get(o.id) ?? 0,
      storageLimitBytes: unlimited ? null : finiteOrNull(limits.storageBytes),
    }
  }))

  return rows.sort((a, b) => {
    if (a.lastRunAt === b.lastRunAt)
      return 0
    if (a.lastRunAt === null)
      return 1
    if (b.lastRunAt === null)
      return -1
    return a.lastRunAt < b.lastRunAt ? 1 : -1
  })
}
