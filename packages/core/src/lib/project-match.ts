// Groups of projects by id, as globs: `hudl/hudl-*` keeps those, `!hudl/hudl-*` drops them.
export const PROJECT_VIEWS = [
  { id: 'hudl-frontends', projects: '!hudl/hudl-* !canary-tests/*' },
  { id: 'marvel', projects: 'hudl/hudl-*' },
] as const

export type ProjectView = (typeof PROJECT_VIEWS)[number]['id']

function glob(term: string): RegExp {
  return new RegExp(`^${term.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i')
}

// Space- or comma-separated globs on the project id; none keeps every project.
export function projectMatcher(pattern: string): (id: string) => boolean {
  const terms = pattern.split(/[\s,]+/).filter(Boolean)
  const keep = terms.filter(t => !t.startsWith('!')).map(glob)
  const drop = terms.filter(t => t.length > 1 && t.startsWith('!')).map(t => glob(t.slice(1)))
  return id => (!keep.length || keep.some(re => re.test(id))) && !drop.some(re => re.test(id))
}

export function viewMatcher(view: string): (id: string) => boolean {
  return projectMatcher(PROJECT_VIEWS.find(v => v.id === view)?.projects ?? '')
}
