// Smelloscope's user directory: who owns an OpsLevel service or a GitHub repo, and which squads a
// person is in. Read-only and unauthenticated; see /hudl/repos/smelloscope/api/user-directory.

interface DirectoryUser {
  githubLogin: string
  email: string | null
  squads: string[]
}

export interface Owner {
  squad: string | null
  slackChannel: string | null
  slackChannelId: string | null
  memberEmails: string[]
}

const TIMEOUT_MS = 10_000

export function createSmelloscope(baseUrl: string, fetchImpl: typeof fetch = fetch) {
  const root = `${baseUrl.replace(/\/$/, '')}/directory`

  // A 404 is an answer (the directory does not know it); anything else that fails is thrown so the
  // caller keeps what it had.
  async function get<T>(path: string): Promise<T | null> {
    const res = await fetchImpl(`${root}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (res.status === 404)
      return null
    if (!res.ok)
      throw new Error(`smelloscope ${path}: ${res.status}`)
    return res.json() as Promise<T>
  }

  const emails = (members: DirectoryUser[]) => members.map(m => m.email?.toLowerCase()).filter((e): e is string => !!e)

  return {
    async serviceOwner(service: string): Promise<Owner | null> {
      const r = await get<{ ownerTeam: string | null, slackChannel: string | null, slackChannelId: string | null, members: DirectoryUser[] }>(`/service/${encodeURIComponent(service)}/owners`)
      if (!r?.ownerTeam)
        return null
      // OpsLevel names the team by alias (fan_team_6), its members by the squad's display name. A
      // secondary alias (agave_2 for Agave) matches no name, so the squad most members share stands in.
      const squads = r.members.flatMap(m => m.squads)
      const squad = squads.find(s => squadKey(s) === squadKey(r.ownerTeam!)) ?? mostCommon(squads) ?? r.ownerTeam
      return { squad, slackChannel: r.slackChannel, slackChannelId: r.slackChannelId, memberEmails: emails(r.members) }
    },

    async repoOwner(owner: string, repo: string): Promise<Owner | null> {
      const r = await get<{ squad: string | null, slackChannel: string, slackChannelId: string, members: DirectoryUser[], partial: boolean }>(`/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/owners`)
      if (!r?.squad || r.partial)
        return null
      return { squad: r.squad, slackChannel: r.slackChannel, slackChannelId: r.slackChannelId, memberEmails: emails(r.members) }
    },

    // Everyone in the directory with an email, and their squads.
    async people(): Promise<{ email: string, squads: string[] }[]> {
      const r = await get<{ users: Record<string, DirectoryUser> }>('/users')
      return Object.values(r?.users ?? {}).filter(u => u.email).map(u => ({ email: u.email!.toLowerCase(), squads: u.squads }))
    },
  }
}

export type Smelloscope = ReturnType<typeof createSmelloscope>

function mostCommon(values: string[]): string | undefined {
  const counts = new Map<string, number>()
  for (const v of values)
    counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
}

// Squads are spelled differently across sources ("Fan Team 6", "fan_team_6"): compare on this.
export function squadKey(squad: string): string {
  return squad.toLowerCase().replace(/[^a-z0-9]/g, '')
}
