import type { Owner, Smelloscope } from './smelloscope'
import { inArray, sql } from 'drizzle-orm'
import { db } from '../db'
import { projectOwner } from '../db/schemas/index'
import { env } from '../lib/env'
import { logger } from '../lib/logger'
import { createSmelloscope, squadKey } from './smelloscope'

export const directory: Smelloscope | null = env.SMELLOSCOPE_URL ? createSmelloscope(env.SMELLOSCOPE_URL) : null

export const OWNERSHIP_REFRESH_MS = 15 * 60 * 1000
const OWNER_MAX_AGE_MS = 60 * 60 * 1000
const CONCURRENCY = 5

function repoOf(repoUrl: string | null): { owner: string, repo: string } | null {
  if (!repoUrl)
    return null
  try {
    const [owner, repo] = new URL(repoUrl).pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '').split('/')
    return owner && repo ? { owner, repo } : null
  }
  catch {
    return null
  }
}

// A project's OpsLevel service is its slug less the suite: `fan/e2e` is `fan`, and
// `@local/admin-clips/integration` is `@local/admin-clips`.
export function serviceOf(slug: string): string {
  const parts = slug.split('/')
  const nameParts = slug.startsWith('@') ? 2 : 1
  return parts.length > nameParts ? parts.slice(0, -1).join('/') : slug
}

// A repo with one project owns it; a monorepo's owner says nothing about each of its apps.
async function resolveOne(dir: Smelloscope, slug: string, repo: { owner: string, repo: string } | null, monorepo: boolean): Promise<Owner & { source: 'service' | 'repo' | null }> {
  if (repo && !monorepo) {
    const byRepo = await dir.repoOwner(repo.owner, repo.repo)
    if (byRepo)
      return { ...byRepo, source: 'repo' }
  }
  const byService = await dir.serviceOwner(serviceOf(slug))
  if (byService)
    return { ...byService, source: 'service' }
  return { squad: null, slackChannel: null, slackChannelId: null, memberEmails: [], source: null }
}

// Resolves the projects whose owner is missing or older than an hour. A lookup that fails keeps
// the project's previous owner and is tried again on the next pass.
export async function refreshOwnership(dir: Smelloscope, now = new Date()): Promise<{ resolved: number, unknown: number, failed: number }> {
  const rows = await db.execute<{ id: string, slug: string, repoUrl: string | null, resolvedAt: Date | null }>(sql`
    select p.id, p.slug, o.resolved_at as "resolvedAt",
      (select r.git->>'repoUrl' from run r where r.project_id = p.id order by r.started_at desc limit 1) as "repoUrl"
    from project p left join project_owner o on o.project_id = p.id`)
  const projectsPerRepo = new Map<string, number>()
  for (const r of rows.rows) {
    if (r.repoUrl)
      projectsPerRepo.set(r.repoUrl, (projectsPerRepo.get(r.repoUrl) ?? 0) + 1)
  }
  const stale = rows.rows.filter(r => !r.resolvedAt || now.getTime() - new Date(r.resolvedAt).getTime() >= OWNER_MAX_AGE_MS)

  const result = { resolved: 0, unknown: 0, failed: 0 }
  for (let i = 0; i < stale.length; i += CONCURRENCY) {
    await Promise.all(stale.slice(i, i + CONCURRENCY).map(async (p) => {
      try {
        const owner = await resolveOne(dir, p.slug, repoOf(p.repoUrl), (projectsPerRepo.get(p.repoUrl ?? '') ?? 0) > 1)
        const values = { ...owner, resolvedAt: now }
        await db.insert(projectOwner).values({ projectId: p.id, ...values }).onConflictDoUpdate({ target: projectOwner.projectId, set: values })
        result[owner.squad ? 'resolved' : 'unknown']++
      }
      catch (error) {
        result.failed++
        logger.warn({ error, project: p.slug }, 'project owner lookup failed')
      }
    }))
  }
  return result
}

export interface ProjectOwnership {
  squad: string
  slackChannel?: string
  mine: boolean
}

// Each project's known owner, and whether the viewer is in its squad. Unknown owners are left out.
export async function loadOwnership(projectIds: string[], viewerEmail?: string, dir: Smelloscope | null = directory): Promise<Map<string, ProjectOwnership>> {
  if (!dir || !projectIds.length)
    return new Map()
  const [owners, mySquads] = await Promise.all([
    db.select().from(projectOwner).where(inArray(projectOwner.projectId, projectIds)),
    viewerEmail ? dir.squadsOf(viewerEmail).catch(() => []) : [],
  ])
  const mine = new Set(mySquads.map(squadKey))
  const email = viewerEmail?.toLowerCase()
  return new Map(owners.filter(o => o.squad).map(o => [o.projectId, {
    squad: o.squad!,
    ...(o.slackChannel && { slackChannel: o.slackChannel }),
    mine: mine.has(squadKey(o.squad!)) || (!!email && o.memberEmails.includes(email)),
  }]))
}
