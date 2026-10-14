import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { artifact, member, organization, project, run, subscription } from '../src/db/schemas/index'
import { hasBillingSubscription, purgeUserOwnedData } from '../src/lib/account'
import { auth } from '../src/lib/auth'
import { env } from '../src/lib/env'
import { storage } from '../src/lib/storage'
import { createUser, ownedOrgId, resetDb } from './helpers'

beforeEach(resetDb)

const root = resolve(env.STORAGE_DIR)

async function seedRunWithBlob(orgId: string): Promise<{ projectId: string, key: string }> {
  const projectId = randomUUID()
  await db.insert(project).values({ id: projectId, organizationId: orgId, slug: `s-${projectId}`, name: 'p' })
  const runId = randomUUID()
  await db.insert(run).values({
    id: runId,
    projectId,
    startedAt: new Date(),
    duration: 0,
    counts: { total: 0, expected: 0, unexpected: 0, flaky: 0, skipped: 0 },
  })
  const key = `test/${runId}.zip`
  await storage.put(key, Buffer.from('trace'))
  await db.insert(artifact).values({ id: randomUUID(), projectId, runId, name: 'trace.zip', contentType: 'application/zip', storageKey: key })
  return { projectId, key }
}

function orgExists(id: string) {
  return db.query.organization.findFirst({ where: eq(organization.id, id), columns: { id: true } })
}

describe('purgeUserOwnedData', () => {
  it('deletes the owned org, its data (cascade), and its storage blobs', async () => {
    const user = await createUser()
    const orgId = await ownedOrgId(user.id)
    const { projectId, key } = await seedRunWithBlob(orgId)
    expect(existsSync(join(root, key))).toBe(true)

    await purgeUserOwnedData(user.id)

    expect(await orgExists(orgId)).toBeFalsy()
    expect(await db.query.project.findFirst({ where: eq(project.id, projectId), columns: { id: true } })).toBeFalsy()
    // The blob is the part FK cascade can't reach - it must be gone too.
    expect(existsSync(join(root, key))).toBe(false)
  })

  it('leaves orgs where the user is only a member', async () => {
    const owner = await createUser('owner@test.dev')
    const guest = await createUser('guest@test.dev')
    const ownerOrg = await ownedOrgId(owner.id)
    const guestOrg = await ownedOrgId(guest.id)
    await db.insert(member).values({ id: randomUUID(), organizationId: ownerOrg, userId: guest.id, role: 'member' })

    await purgeUserOwnedData(guest.id)

    expect(await orgExists(guestOrg)).toBeFalsy() // their own org is removed
    expect(await orgExists(ownerOrg)).toBeTruthy() // an org they only belong to is not
  })

  it('no-ops for a user that owns nothing', async () => {
    await expect(purgeUserOwnedData(randomUUID())).resolves.toBeUndefined()
  })
})

async function subscribe(orgId: string, tier: 'free' | 'team' | 'pro', status: string | null) {
  await db.insert(subscription).values({ organizationId: orgId, polarCustomerId: 'cus_test', tier, status })
}

async function deleteAccount(email: string) {
  const { headers } = await auth.api.signInEmail({ body: { email, password: 'password123' }, returnHeaders: true })
  const cookie = headers.get('set-cookie')!.split(';')[0]!
  return auth.api.deleteUser({ body: { password: 'password123' }, headers: new Headers({ cookie }), asResponse: true })
}

describe('hasBillingSubscription', () => {
  it('is true while an owned workspace has a paid plan Polar still bills', async () => {
    for (const status of ['active', 'trialing', 'past_due']) {
      await resetDb()
      const user = await createUser()
      await subscribe(await ownedOrgId(user.id), 'team', status)
      expect(await hasBillingSubscription(user.id)).toBe(true)
    }
  })

  it('is false once the subscription has ended, on the free plan, or for a mere member', async () => {
    const ended = await createUser('ended@test.dev')
    await subscribe(await ownedOrgId(ended.id), 'pro', 'canceled')
    expect(await hasBillingSubscription(ended.id)).toBe(false)

    const free = await createUser('free@test.dev')
    await subscribe(await ownedOrgId(free.id), 'free', null)
    expect(await hasBillingSubscription(free.id)).toBe(false)

    const owner = await createUser('owner@test.dev')
    const guest = await createUser('guest@test.dev')
    await subscribe(await ownedOrgId(owner.id), 'team', 'active')
    await db.insert(member).values({ id: randomUUID(), organizationId: await ownedOrgId(owner.id), userId: guest.id, role: 'member' })
    expect(await hasBillingSubscription(guest.id)).toBe(false)
  })
})

describe('account deletion', () => {
  it('is refused while a paid subscription is billing, and keeps the workspace', async () => {
    const user = await createUser()
    const orgId = await ownedOrgId(user.id)
    await subscribe(orgId, 'team', 'active')

    const res = await deleteAccount(user.email)
    expect(res.status).toBe(400)
    expect(await orgExists(orgId)).toBeTruthy()
  })

  it('goes through once the subscription has ended', async () => {
    const user = await createUser()
    const orgId = await ownedOrgId(user.id)
    await subscribe(orgId, 'team', 'canceled')

    const res = await deleteAccount(user.email)
    expect(res.status).toBe(200)
    expect(await orgExists(orgId)).toBeFalsy()
  })
})
