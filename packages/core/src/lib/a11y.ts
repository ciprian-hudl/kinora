import type { A11yReport, A11yViolation } from '../contracts/kinora'
import { A11Y_IMPACTS, MAX_A11Y_NODES, MAX_A11Y_VIOLATIONS } from '../contracts/kinora'

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

// --- Reading axe ---
// axe-core's result, read structurally: it comes from another tool (Storybook's a11y addon,
// @axe-core/playwright) and through JSON.
interface AxeViolationLike { id?: unknown, impact?: unknown, help?: unknown, helpUrl?: unknown, nodes?: { target?: unknown }[] }

const MAX_TEXT = 300
const truncate = (s: string): string => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}…` : s)
const isImpact = (v: unknown): v is NonNullable<A11yViolation['impact']> => A11Y_IMPACTS.includes(v as never)

// axe targets an element by a list of selectors, nested when it crosses iframes or shadow roots.
function selector(target: unknown): string {
  if (!Array.isArray(target))
    return ''
  return truncate(target.map(t => (Array.isArray(t) ? t.join(' >>> ') : String(t))).join(' '))
}

// axe's violations, trimmed to what kinora keeps: the rule, its impact and docs, and the first
// failing elements with their count. axe's full result also lists every passing rule with the HTML
// of each node, far too heavy to upload.
export function axeViolations(violations: unknown): A11yViolation[] {
  if (!Array.isArray(violations))
    return []
  return (violations as AxeViolationLike[]).slice(0, MAX_A11Y_VIOLATIONS).flatMap((v) => {
    if (typeof v?.id !== 'string')
      return []
    const nodes = Array.isArray(v.nodes) ? v.nodes : []
    return [{
      id: v.id,
      ...(isImpact(v.impact) && { impact: v.impact }),
      help: truncate(typeof v.help === 'string' ? v.help : v.id),
      ...(typeof v.helpUrl === 'string' && { helpUrl: v.helpUrl }),
      nodes: nodes.slice(0, MAX_A11Y_NODES).map(n => selector(n?.target)).filter(Boolean),
      nodeCount: nodes.length,
    }]
  })
}

// An axe scan attached to a test as JSON, the way Playwright's accessibility guide shows
// (`testInfo.attach('accessibility-scan-results', { body: JSON.stringify(results), ... })`).
// Told by its content, since the attachment name is the test author's choice.
export function parseAxeScan(json: string): { violations: unknown[] } | undefined {
  try {
    const value = JSON.parse(json) as { testEngine?: { name?: unknown }, violations?: unknown }
    return value?.testEngine?.name === 'axe-core' && Array.isArray(value.violations) ? { violations: value.violations } : undefined
  }
  catch {
    return undefined
  }
}

// The accessibility check of a Playwright test from the axe scans it attached (one per page or
// state it scanned). Violations of a test that still passes are warnings.
export function a11yFromScans(scans: { violations: unknown[] }[], testOk: boolean): A11yReport | undefined {
  if (!scans.length)
    return undefined
  const reports = scans.map((scan): A11yReport => {
    const violations = axeViolations(scan.violations)
    return { status: !violations.length ? 'passed' : testOk ? 'warning' : 'failed', violations }
  })
  return mergeA11y(reports)
}
