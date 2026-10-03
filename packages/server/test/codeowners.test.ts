import { describe, expect, it } from 'vitest'
import { matchCodeowners, parseCodeowners } from '../src/lib/codeowners'

describe('codeowners parser', () => {
  it('ignores comments, blanks and unsupported negations', () => {
    expect(parseCodeowners(`
# team owners
*.ts @frontend

!secret.ts @nobody
invalid-without-owner
`).map(r => r.pattern)).toEqual(['*.ts'])
  })
})

describe('codeowners matching', () => {
  it('matches basename globs anywhere', () => {
    const rules = parseCodeowners('*.spec.ts @qa')
    expect(matchCodeowners(rules, 'packages/web/tests/login.spec.ts')).toEqual(['@qa'])
  })

  it('matches rooted paths from the repository root', () => {
    const rules = parseCodeowners('/packages/web/** @frontend')
    expect(matchCodeowners(rules, 'packages/web/src/App.vue')).toEqual(['@frontend'])
    expect(matchCodeowners(rules, 'apps/packages/web/src/App.vue')).toEqual([])
  })

  it('lets the last matching rule win', () => {
    const rules = parseCodeowners(`
*.ts @frontend
/tests/checkout/** @checkout @qa
`)
    expect(matchCodeowners(rules, 'tests/checkout/cart.spec.ts')).toEqual(['@checkout', '@qa'])
  })
})
