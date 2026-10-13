import type { A11yReport, A11yViolation } from '../contracts/kinora'
import { MAX_A11Y_NODES } from '../contracts/kinora'

type Impact = NonNullable<A11yViolation['impact']>

// How much a violation weighs when ranking what needs fixing first. A violation read from a failing
// story's error has no impact (see the Vitest reporter): it failed the test, so it counts as serious.
export const A11Y_WEIGHT: Record<Impact, number> = { critical: 8, serious: 4, moderate: 2, minor: 1 }
const UNKNOWN_WEIGHT = A11Y_WEIGHT.serious

export const impactWeight = (impact: A11yViolation['impact']): number => (impact ? A11Y_WEIGHT[impact] : UNKNOWN_WEIGHT)

// Most severe first, then the rule that hits the most elements.
export function byImpact(a: A11yViolation, b: A11yViolation): number {
  return impactWeight(b.impact) - impactWeight(a.impact) || b.nodeCount - a.nodeCount
}

// One point per rule broken, weighted by impact: a page with 30 unlabeled icons is one fix.
export function a11yScore(violations: A11yViolation[]): number {
  return violations.reduce((sum, v) => sum + impactWeight(v.impact), 0)
}

// Violations per impact, with `unknown` for the ones without.
export function countByImpact(violations: A11yViolation[]): Record<Impact | 'unknown', number> {
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 }
  for (const v of violations)
    counts[v.impact ?? 'unknown']++
  return counts
}

const STATUS_RANK = { passed: 0, warning: 1, failed: 2 } as const

// Several tests check the same story: one report with the worst status and each rule once, its
// elements pooled.
export function mergeA11y(reports: (A11yReport | undefined)[]): A11yReport | undefined {
  const present = reports.filter((r): r is A11yReport => !!r)
  if (!present.length)
    return undefined
  const status = present.reduce<A11yReport['status']>((s, r) => (STATUS_RANK[r.status] > STATUS_RANK[s] ? r.status : s), 'passed')
  const byRule = new Map<string, A11yViolation>()
  for (const v of present.flatMap(r => r.violations)) {
    const seen = byRule.get(v.id)
    if (!seen) {
      byRule.set(v.id, { ...v, nodes: [...v.nodes] })
      continue
    }
    seen.impact ??= v.impact
    for (const node of v.nodes) {
      if (seen.nodes.length < MAX_A11Y_NODES && !seen.nodes.includes(node))
        seen.nodes.push(node)
    }
    seen.nodeCount = Math.max(seen.nodeCount, v.nodeCount, seen.nodes.length)
  }
  const error = present.find(r => r.error)?.error
  return { status, violations: [...byRule.values()].sort(byImpact), ...(error && { error }) }
}
