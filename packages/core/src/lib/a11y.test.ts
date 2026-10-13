import type { A11yViolation } from '../contracts/kinora'
import { describe, expect, it } from 'vitest'
import { a11yFromScans, a11yScore, axeViolations, byImpact, countByImpact, mergeA11y, parseAxeScan } from './a11y'

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

describe('reading axe', () => {
  const axe = { id: 'button-name', impact: 'critical', help: 'Buttons must have discernible text', helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/button-name', nodes: [{ target: ['#save'], html: '<button>' }] }

  it('trims violations to the rule, its docs and the first failing elements', () => {
    const nodes = [{ target: [['my-app', 'button']] }, ...Array.from({ length: 14 }, (_, i) => ({ target: [`#b${i}`] }))]
    const [v] = axeViolations([{ ...axe, impact: null, nodes }, { help: 'no id' }, 'junk'])
    expect(v).toMatchObject({ id: 'button-name', help: 'Buttons must have discernible text', nodeCount: 15 })
    expect(v.impact).toBeUndefined()
    expect(v.nodes).toHaveLength(10)
    expect(v.nodes[0]).toBe('my-app >>> button')
    expect(axeViolations(undefined)).toEqual([])
  })

  it('tells an axe scan by its content, not its name', () => {
    expect(parseAxeScan(JSON.stringify({ testEngine: { name: 'axe-core' }, violations: [axe] }))?.violations).toHaveLength(1)
    expect(parseAxeScan(JSON.stringify({ violations: [axe] }))).toBeUndefined()
    expect(parseAxeScan('not json')).toBeUndefined()
    expect(parseAxeScan('null')).toBeUndefined()
  })

  it('builds the check of a test from its scans: warnings while it passes, failed otherwise', () => {
    expect(a11yFromScans([{ violations: [axe] }, { violations: [] }], true)).toMatchObject({ status: 'warning', violations: [{ id: 'button-name' }] })
    expect(a11yFromScans([{ violations: [axe] }], false)?.status).toBe('failed')
    expect(a11yFromScans([{ violations: [] }], false)).toEqual({ status: 'passed', violations: [] })
    expect(a11yFromScans([], true)).toBeUndefined()
  })
})
