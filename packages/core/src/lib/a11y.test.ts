import type { A11yViolation } from '../contracts/kinora'
import { describe, expect, it } from 'vitest'
import { a11yScore, byImpact, countByImpact, mergeA11y } from './a11y'

function v(id: string, impact: A11yViolation['impact'], nodes: string[] = ['#a']): A11yViolation {
  return { id, ...(impact && { impact }), help: id, nodes, nodeCount: nodes.length }
}

describe('a11y', () => {
  it('ranks violations by impact, then by elements hit', () => {
    const sorted = [v('minor', 'minor'), v('crit', 'critical'), v('unknown', undefined), v('serious', 'serious', ['#a', '#b'])].sort(byImpact)
    expect(sorted.map(x => x.id)).toEqual(['crit', 'serious', 'unknown', 'minor'])
  })

  it('scores one point per rule, weighted by impact', () => {
    expect(a11yScore([v('a', 'critical', ['#1', '#2', '#3']), v('b', 'minor'), v('c', undefined)])).toBe(8 + 1 + 4)
    expect(countByImpact([v('a', 'critical'), v('b', 'critical'), v('c', undefined)])).toEqual({ critical: 2, serious: 0, moderate: 0, minor: 0, unknown: 1 })
  })

  it('merges the reports of a story: worst status, each rule once with its elements pooled', () => {
    const merged = mergeA11y([
      { status: 'passed', violations: [] },
      { status: 'warning', violations: [v('button-name', 'critical', ['#a'])] },
      undefined,
      { status: 'failed', violations: [v('button-name', undefined, ['#a', '#b']), v('region', 'moderate')] },
    ])
    expect(merged?.status).toBe('failed')
    expect(merged?.violations.map(x => [x.id, x.impact, x.nodes, x.nodeCount])).toEqual([
      ['button-name', 'critical', ['#a', '#b'], 2],
      ['region', 'moderate', ['#a'], 1],
    ])
    expect(mergeA11y([undefined])).toBeUndefined()
  })
})
