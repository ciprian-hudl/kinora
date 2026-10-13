import type { Page } from '@playwright/test'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { A11Y_ATTACHMENT, scanA11y } from '../src/a11y'

const RESULTS = { testEngine: { name: 'axe-core' }, violations: [{ id: 'button-name' }], passes: [] }
const attach = vi.fn()
const withTags = vi.fn()
const built: { page: unknown }[] = []

vi.mock('@playwright/test', () => ({ test: { info: () => ({ attach }) } }))
vi.mock('@axe-core/playwright', () => ({
  default: class {
    constructor(options: { page: unknown }) {
      built.push(options)
    }

    withTags(tags: string[]) {
      withTags(tags)
      return this
    }

    analyze() {
      return Promise.resolve(RESULTS)
    }
  },
}))

describe('scanA11y', () => {
  const page = { url: () => 'about:blank' } as unknown as Page

  beforeEach(() => {
    attach.mockClear()
    withTags.mockClear()
    built.length = 0
  })

  it('scans the page and attaches axe\'s result to the running test as JSON', async () => {
    const results = await scanA11y(page)
    expect(results).toBe(RESULTS)
    expect(built).toEqual([{ page }])
    expect(attach).toHaveBeenCalledWith(A11Y_ATTACHMENT, { body: JSON.stringify(RESULTS), contentType: 'application/json' })
  })

  it('lets the caller configure the scan', async () => {
    await scanA11y(page, axe => axe.withTags(['wcag2aa']))
    expect(withTags).toHaveBeenCalledWith(['wcag2aa'])
    expect(attach).toHaveBeenCalledTimes(1)
  })
})
