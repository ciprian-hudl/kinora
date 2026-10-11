import type { RunSummary } from '@kinora/core'

// Lowercased words of a palette query.
export function queryTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

// How well a command answers the query, 0 when a word is found nowhere. A word scores more at the
// start of the label than at the start of a later word, inside one, or only in the hidden keywords.
export function matchScore(terms: string[], label: string, keywords = ''): number {
  const text = label.toLowerCase()
  const extra = keywords.toLowerCase()
  let score = 0
  for (const term of terms) {
    const at = text.indexOf(term)
    if (at === 0)
      score += 4
    else if (at > 0)
      score += /[a-z0-9]/.test(text[at - 1]) ? 2 : 3
    else if (extra.includes(term))
      score += 1
    else
      return 0
  }
  return score
}

// The items matching every word, best match first; ties keep their original order.
export function rankByQuery<T extends { label: string, keywords?: string }>(items: T[], terms: string[]): T[] {
  return items
    .map(item => ({ item, score: matchScore(terms, item.label, item.keywords) }))
    .filter(scored => scored.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(scored => scored.item)
}

// What a run is looked up by: its branch, its commit, the CI run number, its id.
export function runKeywords(run: RunSummary): string {
  const number = run.ci?.runNumber
  return [run.git?.branch, run.git?.sha, number && `#${number}`, run.runId].filter(Boolean).join(' ')
}

// Whether a run answers the query: every word is in the run's own keywords or in its project's
// name, and at least one is the run's, so a project name alone doesn't list all of its runs.
export function runMatches(terms: string[], run: RunSummary, projectText: string): boolean {
  const own = runKeywords(run).toLowerCase()
  const project = projectText.toLowerCase()
  return terms.some(term => own.includes(term)) && terms.every(term => own.includes(term) || project.includes(term))
}

// "main @ 1a2b3c4", or whichever half the run carries; undefined for a run uploaded without git data.
export function runRef(run: RunSummary): string | undefined {
  return [run.git?.branch, run.git?.sha?.slice(0, 7)].filter(Boolean).join(' @ ') || undefined
}
