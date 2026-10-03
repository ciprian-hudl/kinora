import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Polar usage and mail delivery are stubbed: the test drives the meter and observes what is sent.
vi.mock('../src/billing/polar', async importOriginal => ({
  ...(await importOriginal<typeof import('../src/billing/polar')>()),
  meteredResults: vi.fn(),
  overagePrice: vi.fn(async () => ({ unitAmount: 0.4, capAmount: null, currency: 'usd' })),
}))
vi.mock('../src/lib/mailer', async importOriginal => ({
  ...(await importOriginal<typeof import('../src/lib/mailer')>()),
  deliverMail: vi.fn(async () => true),
}))
vi.resetModules()

const { meteredResults } = await import('../src/billing/polar')
const { notifyUsageAlerts, usageAlertText, usageLevel } = await import('../src/billing/usage-alerts')
const { db } = await import('../src/db')
const { subscription, user } = await import('../src/db/schemas/index')
const { deliverMail } = await import('../src/lib/mailer')
const { createUser, ownedOrgId, resetDb } = await import('./helpers')

const meter = vi.mocked(meteredResults)
const mail = vi.mocked(deliverMail)

async function proWorkspace(email = 'pro@test.dev'): Promise<string> {
  const u = await createUser(email)
  const organizationId = await ownedOrgId(u.id)
  await db.insert(subscription).values({ organizationId, polarCustomerId: 'cus_test', tier: 'pro', status: 'active' })
  return organizationId
}

async function alerted(organizationId: string) {
  const row = await db.query.subscription.findFirst({ where: eq(subscription.organizationId, organizationId) })
  return row?.usageAlertLevel ?? null
}

beforeEach(async () => {
  await resetDb()
  meter.mockReset()
  mail.mockClear()
  mail.mockResolvedValue(true)
})

describe('usageLevel', () => {
  it('maps the cycle usage to the 80% / 100% thresholds', () => {
    expect(usageLevel({ consumed: 39_999, credited: 50_000 })).toBeNull()
    expect(usageLevel({ consumed: 40_000, credited: 50_000 })).toBe('near')
    expect(usageLevel({ consumed: 50_000, credited: 50_000 })).toBe('reached')
    expect(usageLevel({ consumed: 10, credited: 0 })).toBeNull() // no credits granted: nothing to compare to
  })
})

describe('usageAlertText', () => {
  it('states the usage, the overage rate, and that nothing is blocked', () => {
    const text = usageAlertText('Ada', 'Pro', 'reached', { consumed: 50_120, credited: 50_000 }, { unitAmount: 0.4, capAmount: null, currency: 'usd' }, 'https://app/settings/workspace')
    expect(text).toContain('all 50,000 test results')
    expect(text).toContain('$0.004 each')
    expect(text).toContain('Nothing is blocked')
  })
})

describe('notifyUsageAlerts', () => {
  it('sends nothing below 80%', async () => {
    const org = await proWorkspace()
    meter.mockResolvedValue({ consumed: 20_000, credited: 50_000 })

    expect(await notifyUsageAlerts()).toEqual({ checked: 1, sent: 0 })
    expect(mail).not.toHaveBeenCalled()
    expect(await alerted(org)).toBeNull()
  })

  it('emails once at 80%, once at 100%, and never repeats a level', async () => {
    const org = await proWorkspace()

    meter.mockResolvedValue({ consumed: 41_000, credited: 50_000 })
    expect((await notifyUsageAlerts()).sent).toBe(1)
    expect((await notifyUsageAlerts()).sent).toBe(0)
    expect(mail.mock.calls[0]![0]).toMatchObject({ to: 'pro@test.dev', subject: expect.stringContaining('nearing') })
    expect(await alerted(org)).toBe('near')

    meter.mockResolvedValue({ consumed: 52_000, credited: 50_000 })
    expect((await notifyUsageAlerts()).sent).toBe(1)
    expect((await notifyUsageAlerts()).sent).toBe(0)
    expect(mail).toHaveBeenCalledTimes(2)
    expect(await alerted(org)).toBe('reached')
  })

  it('re-arms when a new billing cycle resets the meter', async () => {
    const org = await proWorkspace()
    meter.mockResolvedValue({ consumed: 52_000, credited: 50_000 })
    await notifyUsageAlerts()

    meter.mockResolvedValue({ consumed: 300, credited: 50_000 })
    expect((await notifyUsageAlerts()).sent).toBe(0)
    expect(await alerted(org)).toBeNull()

    meter.mockResolvedValue({ consumed: 45_000, credited: 50_000 })
    expect((await notifyUsageAlerts()).sent).toBe(1)
  })

  it('retries next time when the mail could not be delivered', async () => {
    const org = await proWorkspace()
    meter.mockResolvedValue({ consumed: 41_000, credited: 50_000 })
    mail.mockResolvedValueOnce(false)

    expect((await notifyUsageAlerts()).sent).toBe(0)
    expect(await alerted(org)).toBeNull()
    expect((await notifyUsageAlerts()).sent).toBe(1)
  })

  it('skips free, inactive and admin-owned workspaces', async () => {
    await createUser('free@test.dev')
    const canceled = await proWorkspace('canceled@test.dev')
    await db.update(subscription).set({ status: 'canceled' }).where(eq(subscription.organizationId, canceled))
    await proWorkspace('admin@test.dev')
    await db.update(user).set({ role: 'admin' }).where(eq(user.email, 'admin@test.dev'))
    meter.mockResolvedValue({ consumed: 60_000, credited: 50_000 })

    expect(await notifyUsageAlerts()).toEqual({ checked: 0, sent: 0 })
    expect(mail).not.toHaveBeenCalled()
  })
})
