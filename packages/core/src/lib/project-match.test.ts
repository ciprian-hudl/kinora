import { describe, expect, it } from 'vitest'
import { projectMatcher, viewMatcher } from './project-match'

describe('projectMatcher', () => {
  const ids = ['hudl/hudl-ui', 'hudl/hudl-users', 'fan/e2e', 'watch/integration']
  const matching = (pattern: string) => ids.filter(projectMatcher(pattern))

  it('keeps the projects a glob matches', () => {
    expect(matching('hudl/hudl-*')).toEqual(['hudl/hudl-ui', 'hudl/hudl-users'])
    expect(matching('FAN/*, watch/*')).toEqual(['fan/e2e', 'watch/integration'])
  })

  it('drops the projects a negated glob matches', () => {
    expect(matching('!hudl/hudl-*')).toEqual(['fan/e2e', 'watch/integration'])
    expect(matching('*/e2e !fan/*')).toEqual([])
  })

  it('keeps everything without a pattern', () => {
    expect(matching('')).toEqual(ids)
    expect(matching('!')).toEqual(ids)
  })

  it('treats regex characters literally', () => {
    expect(matching('hudl.hudl-ui')).toEqual([])
  })
})

describe('viewMatcher', () => {
  const ids = ['hudl/hudl-ui', 'fan/e2e', 'canary-tests/prod']

  it('splits marvel from hudl-frontends, and all keeps every project', () => {
    expect(ids.filter(viewMatcher('marvel'))).toEqual(['hudl/hudl-ui'])
    expect(ids.filter(viewMatcher('hudl-frontends'))).toEqual(['fan/e2e'])
    expect(ids.filter(viewMatcher('all'))).toEqual(ids)
  })
})
