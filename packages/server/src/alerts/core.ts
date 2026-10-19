import type { Counts, ShardProgress } from '@kinora/core'

export type AlertPolicy = 'always' | 'on-failure' | 'on-regression'

// Channel-neutral alert data, built once per run and formatted per delivery channel.
export interface AlertPayload {
  projectName: string
  runUrl: string
  counts: Counts
  newlyFailing: string[]
  newlyFlaky: string[]
  codeOwners?: Record<string, string[]>
  // A sharded run closed with shards missing: its counts cover the landed shards only.
  incomplete?: ShardProgress
}

// A run missing shards is a failure of the run itself, whatever the landed tests say.
export function shouldFire(policy: AlertPolicy, counts: Counts, newlyFailing: number, newlyFlaky: number, incomplete = false): boolean {
  return policy === 'always'
    || (policy === 'on-failure' && (counts.unexpected > 0 || incomplete))
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

export function incompleteLine(p: ShardProgress): string {
  return `Incomplete: ${p.landed} of ${p.total} shards landed, the others never uploaded`
}
