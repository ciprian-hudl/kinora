import type { Counts } from '@kinora/core'

export type AlertPolicy = 'always' | 'on-failure' | 'on-regression'

// Channel-neutral alert data, built once per run and formatted per delivery channel.
export interface AlertPayload {
  projectName: string
  runUrl: string
  counts: Counts
  newlyFailing: string[]
  newlyFlaky: string[]
  codeOwners?: Record<string, string[]>
}

export function shouldFire(policy: AlertPolicy, counts: Counts, newlyFailing: number, newlyFlaky: number): boolean {
  return policy === 'always'
    || (policy === 'on-failure' && counts.unexpected > 0)
    || (policy === 'on-regression' && (newlyFailing > 0 || newlyFlaky > 0))
}

const MAX_LISTED = 10

export function listTests(titles: string[], codeOwners: Record<string, string[]> = {}): string {
  const rest = titles.length - MAX_LISTED
  const listed = titles.slice(0, MAX_LISTED).map((title) => {
    const owners = codeOwners[title]
    return owners?.length ? `${title} (${owners.join(', ')})` : title
  })
  return listed.join(', ') + (rest > 0 ? ` and ${rest} more` : '')
}
