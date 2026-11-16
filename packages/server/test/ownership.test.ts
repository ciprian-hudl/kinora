import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { project, projectOwner } from '../src/db/schemas/index'
import { loadOwnership, refreshOwnership, serviceOf } from '../src/ownership/resolve'
import { createSmelloscope } from '../src/ownership/smelloscope'
import { createApiKey, createUser, ingest, runPayload } from './helpers'

const HOUR = 3_600_000

// A smelloscope that knows the fan service and the hudl-ui repo, and records what was asked.
function fakeDirectory(fail = false) {
  const asked: string[] = []
  const answers: Record<string, unknown> = {
    '/directory/service/fan/owners': { ownerTeam: 'fan_team_6', slackChannel: '#fan-team-6', slackChannelId: 'C1', members: [{ githubLogin: 'f', email: 'Fan@hudl.com', squads: ['Fan Team 6'] }] },
    '/directory/repo/hudl/hudl-ui/owners': { squad: 'Mandalorians', slackChannel: '#mandos', slackChannelId: 'C2', partial: false, members: [{ githubLogin: 'm', email: 'mando@hudl.com', squads: ['Mandalorians'] }] },
    '/directory/users': { users: { me: { githubLogin: 'me', email: 'me@hudl.com', squads: ['mandalorians'] } } },
  }
  const fetchImpl = (async (input: string) => {
    const path = new URL(input).pathname
    asked.push(decodeURIComponent(path))
    if (fail)
      return new Response('down', { status: 503 })
    return path in answers ? Response.json(answers[path]) : Response.json({ message: 'Not found' }, { status: 404 })
  }) as typeof fetch
  return { dir: createSmelloscope('https://smelloscope.test', fetchImpl), asked }
}

async function seed() {
  const a = await createUser('a@test.dev')
  const key = await createApiKey(a.id)
  const post = (slug: string, repo: string) => {
    const payload = runPayload(slug)
    payload.run.git = { repoUrl: `https://github.com/hudl/${repo}` }
    return ingest(key, payload)
  }
  await post('fan/e2e', 'hudl-frontends')
  await post('@local/admin-clips/integration', 'hudl-frontends')
  await post('hudl/hudl-ui', 'hudl-ui')
  const ids = Object.fromEntries((await db.select({ id: project.id, slug: project.slug }).from(project)).map(p => [p.slug, p.id]))
  return ids
}

describe('serviceOf', () => {
  it('drops the suite from the slug, keeping a package scope', () => {
    expect(serviceOf('fan/e2e')).toBe('fan')
    expect(serviceOf('@local/admin-clips/integration')).toBe('@local/admin-clips')
    expect(serviceOf('@hudl/performance-core-video-editor')).toBe('@hudl/performance-core-video-editor')
    expect(serviceOf('fan')).toBe('fan')
  })
})

describe('project ownership', () => {
  it('resolves a monorepo app by its service and a single-project repo by its repo, leaving the rest unknown', async () => {
    const ids = await seed()
    const { dir, asked } = fakeDirectory()

    expect(await refreshOwnership(dir)).toEqual({ resolved: 2, unknown: 1, failed: 0 })
    // The monorepo's owner says nothing about its apps, so it is never asked for.
    expect(asked).not.toContain('/directory/repo/hudl/hudl-frontends/owners')
    expect(asked).toContain('/directory/service/@local/admin-clips/owners')

    const owners = await loadOwnership(Object.values(ids), 'ME@hudl.com', dir)
    expect(owners.get(ids['fan/e2e'])).toEqual({ squad: 'Fan Team 6', slackChannel: '#fan-team-6', mine: false })
    expect(owners.get(ids['hudl/hudl-ui'])).toEqual({ squad: 'Mandalorians', slackChannel: '#mandos', mine: true })
    expect(owners.has(ids['@local/admin-clips/integration'])).toBe(false)
  })

  it('counts a project as mine when the viewer is among its members', async () => {
    const ids = await seed()
    const { dir } = fakeDirectory()
    await refreshOwnership(dir)
    expect((await loadOwnership([ids['fan/e2e']], 'fan@hudl.com', dir)).get(ids['fan/e2e'])?.mine).toBe(true)
  })

  it('only looks owners up again once they are an hour old, and keeps them when the directory fails', async () => {
    const ids = await seed()
    const now = new Date()
    await refreshOwnership(fakeDirectory().dir, now)

    const again = fakeDirectory()
    expect(await refreshOwnership(again.dir, new Date(now.getTime() + 10 * 60_000))).toEqual({ resolved: 0, unknown: 0, failed: 0 })
    expect(again.asked.filter(path => path.endsWith('/owners'))).toEqual([])

    expect(await refreshOwnership(fakeDirectory(true).dir, new Date(now.getTime() + 2 * HOUR))).toEqual({ resolved: 0, unknown: 0, failed: 3 })
    const [kept] = await db.select().from(projectOwner).where(eq(projectOwner.projectId, ids['hudl/hudl-ui']))
    expect(kept).toMatchObject({ squad: 'Mandalorians', source: 'repo' })
  })

  it('never holds a page up on an unreachable directory', async () => {
    const ids = await seed()
    const unreachable = createSmelloscope('https://smelloscope.test', (() => Promise.reject(new TypeError('fetch failed'))) as typeof fetch)
    expect(await refreshOwnership(unreachable)).toEqual({ resolved: 0, unknown: 0, failed: 3 })

    await refreshOwnership(fakeDirectory().dir)
    const hanging = createSmelloscope('https://smelloscope.test', (() => new Promise(() => {})) as typeof fetch)
    const owners = await loadOwnership(Object.values(ids), 'me@hudl.com', hanging)
    expect(owners.get(ids['hudl/hudl-ui'])).toEqual({ squad: 'Mandalorians', slackChannel: '#mandos', mine: false })
  })
})
