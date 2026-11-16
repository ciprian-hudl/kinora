import type { OverviewProject } from '@kinora/core'
import type { LocationQuery, LocationQueryRaw } from 'vue-router'
import { PROJECT_VIEWS, viewMatcher } from '@kinora/core'

export interface OverviewFilters {
  view: string
  squad: string
  branch: string
  tag: string
}

export const NO_FILTERS: OverviewFilters = { view: 'all', squad: 'all', branch: 'all', tag: 'all' }

export const FILTER_KEYS = ['view', 'squad', 'branch', 'tag'] as const

// The projects of the viewer's own squads; the other views group projects by repo.
export const MINE = 'mine'
// The squad filter's bucket for projects with no known owner.
export const OTHER_SQUAD = 'other'

const VIEWS: string[] = [MINE, ...PROJECT_VIEWS.map(v => v.id)]

export function sameFilters(a: OverviewFilters, b: OverviewFilters): boolean {
  return a.view === b.view && a.squad === b.squad && a.branch === b.branch && a.tag === b.tag
}

function first(v: LocationQuery[string]): string | undefined {
  return (Array.isArray(v) ? v[0] : v) ?? undefined
}

export function filtersFromQuery(query: LocationQuery): OverviewFilters {
  const view = first(query.view)?.toLowerCase()
  return {
    view: VIEWS.find(v => v === view) ?? 'all',
    squad: first(query.squad) || 'all',
    branch: first(query.branch) || 'all',
    tag: first(query.tag) || 'all',
  }
}

export function filtersToQuery(f: OverviewFilters): LocationQueryRaw {
  return {
    view: f.view === 'all' ? undefined : f.view,
    squad: f.squad === 'all' ? undefined : f.squad,
    branch: f.branch === 'all' ? undefined : f.branch,
    tag: f.tag === 'all' ? undefined : f.tag,
  }
}

export function inView(view: string, squad: string): (p: Pick<OverviewProject, 'id' | 'owner'>) => boolean {
  const inRepos = viewMatcher(view)
  return p => (view === MINE ? !!p.owner?.mine : inRepos(p.id))
    && (squad === 'all' || (squad === OTHER_SQUAD ? !p.owner : p.owner?.squad === squad))
}

// The squads owning the projects, most projects first, then the bucket of unknown owners.
export function squadOptions(projects: Pick<OverviewProject, 'owner'>[]): string[] {
  const counts = new Map<string, number>()
  for (const p of projects) {
    if (p.owner)
      counts.set(p.owner.squad, (counts.get(p.owner.squad) ?? 0) + 1)
  }
  const known = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([squad]) => squad)
  return projects.some(p => !p.owner) ? [...known, OTHER_SQUAD] : known
}
