import type { LocationQuery, LocationQueryRaw } from 'vue-router'

export interface OverviewFilters {
  project: string
  branch: string
  tag: string
}

export interface OverviewView extends OverviewFilters {
  name: string
}

export const NO_FILTERS: OverviewFilters = { project: '', branch: 'all', tag: 'all' }

export const FILTER_KEYS = ['project', 'branch', 'tag'] as const

function glob(term: string): RegExp {
  return new RegExp(`^${term.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i')
}

// Space- or comma-separated globs on the project id: `hudl/hudl-*` keeps those, `!hudl/hudl-*` drops them.
export function projectMatcher(pattern: string): (id: string) => boolean {
  const terms = pattern.split(/[\s,]+/).filter(Boolean)
  const keep = terms.filter(t => !t.startsWith('!')).map(glob)
  const drop = terms.filter(t => t.length > 1 && t.startsWith('!')).map(t => glob(t.slice(1)))
  return id => (!keep.length || keep.some(re => re.test(id))) && !drop.some(re => re.test(id))
}

// View names double as the `?view=` of their link.
export function viewSlug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._-]/g, '').replace(/-+/g, '-')
}

export function sameFilters(a: OverviewFilters, b: OverviewFilters): boolean {
  return a.project.trim() === b.project.trim() && a.branch === b.branch && a.tag === b.tag
}

export function first(v: LocationQuery[string]): string | undefined {
  return (Array.isArray(v) ? v[0] : v) ?? undefined
}

export function filtersFromQuery(query: LocationQuery): OverviewFilters {
  return { project: first(query.project) ?? '', branch: first(query.branch) || 'all', tag: first(query.tag) || 'all' }
}

export function filtersToQuery(f: OverviewFilters, view?: string): LocationQueryRaw {
  return {
    view,
    project: f.project || undefined,
    branch: f.branch === 'all' ? undefined : f.branch,
    tag: f.tag === 'all' ? undefined : f.tag,
  }
}
