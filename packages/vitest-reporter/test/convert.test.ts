import { makeTestKey, STORY_ANNOTATION } from '@kinora/core'
import { describe, expect, it } from 'vitest'
import { toNormTest, toNormTests } from '../src/convert'
import { fakeModule, fakeTest } from './fakes'

describe('toNormTest', () => {
  it('builds the same identity as Playwright: file, suite path, project', () => {
    const t = toNormTest(fakeTest({ suites: ['Button', 'disabled'], name: 'ignores clicks' }))!
    expect(t.titlePath).toEqual(['src/Button.test.ts', 'Button', 'disabled', 'ignores clicks'])
    expect(t.testKey).toBe(makeTestKey('src/Button.test.ts', t.titlePath, 'browser (chromium)'))
    expect(t).toMatchObject({ file: 'src/Button.test.ts', line: 12, column: 3, projectName: 'browser (chromium)', duration: 43 })
  })

  it('maps Vitest results onto kinora statuses, a retried pass being flaky', () => {
    expect(toNormTest(fakeTest({ state: 'passed' }))!.status).toBe('expected')
    expect(toNormTest(fakeTest({ state: 'failed' }))).toMatchObject({ status: 'unexpected', ok: false })
    expect(toNormTest(fakeTest({ state: 'skipped' }))!.status).toBe('skipped')
    expect(toNormTest(fakeTest({ flaky: true, retryCount: 1 }))).toMatchObject({ status: 'flaky', ok: true, retries: 1 })
  })

  it('leaves out a test that never ran', () => {
    expect(toNormTest(fakeTest({ state: 'pending' }))).toBeUndefined()
  })

  it('cleans error messages of ANSI codes and Storybook\'s local debug link', () => {
    const message = '\nClick to debug the error directly in Storybook: http://localhost:6006/?path=/story/button--broken\n\n\u001B[31mexpect(element).toHaveTextContent()\u001B[39m'
    expect(toNormTest(fakeTest({ state: 'failed', errors: [{ message }] }))!.errors[0].message).toBe('expect(element).toHaveTextContent()')
  })

  it('records a Storybook story as <Component>/<Story>', () => {
    const story = (t: ReturnType<typeof toNormTest>) => t!.annotations.find(a => a.type === STORY_ANNOTATION)?.description
    expect(story(toNormTest(fakeTest({ file: 'src/Button.stories.tsx', name: 'Primary', meta: { storyId: 'example-button--primary', componentName: 'Button' } })))).toBe('Button/Primary')
    // Without the component name, the Storybook id is the best stable label.
    expect(story(toNormTest(fakeTest({ meta: { storyId: 'example-button--primary' } })))).toBe('example-button/primary')
    expect(story(toNormTest(fakeTest()))).toBeUndefined()
  })

  it('turns the browser-mode trace annotation into a trace attachment', () => {
    const t = toNormTest(fakeTest({ annotations: [
      { type: 'traces', message: 'src/__traces__/x.trace.zip', attachment: { path: '/abs/x.trace.zip' } },
      { type: 'issue', message: 'KIN-1' },
    ] }))!
    expect(t.attachments).toEqual([{ name: 'trace', contentType: 'application/zip', path: '/abs/x.trace.zip', hasBody: false }])
    expect(t.annotations).toEqual([{ type: 'issue', description: 'KIN-1' }])
  })

  it('keeps the failure screenshot and names visual regressions after the test', () => {
    // As a reporter receives them: Vitest has already copied the images under content hashes.
    const regression = (hash: string) => ({ type: 'internal:toMatchScreenshot', attachments: [
      { name: 'reference', path: `/a/${hash}1.png` },
      { name: 'actual', path: `/a/${hash}2.png` },
      { name: 'diff', path: `/a/${hash}3.png` },
    ] })
    const t = toNormTest(fakeTest({ name: 'Swatch matches its reference!', state: 'failed', artifacts: [
      { type: 'internal:failureScreenshot', attachments: [{ path: '/a/fail.png', contentType: 'image/png' }] },
      regression('e6c5'),
      regression('9f01'),
    ] }))!
    expect(t.attachments.map(a => [a.name, a.path])).toEqual([
      ['screenshot', '/a/fail.png'],
      ['swatch-matches-its-reference-expected.png', '/a/e6c51.png'],
      ['swatch-matches-its-reference-actual.png', '/a/e6c52.png'],
      ['swatch-matches-its-reference-diff.png', '/a/e6c53.png'],
      ['swatch-matches-its-reference-2-expected.png', '/a/9f011.png'],
      ['swatch-matches-its-reference-2-actual.png', '/a/9f012.png'],
      ['swatch-matches-its-reference-2-diff.png', '/a/9f013.png'],
    ])
  })
})

describe('toNormTest a11y', () => {
  const axe = (over: Record<string, unknown> = {}) => ({
    id: 'button-name',
    impact: 'critical',
    help: 'Buttons must have discernible text',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/button-name',
    nodes: [{ target: ['#root > button'], html: '<button></button>' }],
    ...over,
  })
  const withReport = (report: Record<string, unknown>) => toNormTest(fakeTest({ meta: { storyId: 'button--empty', reports: [{ type: 'a11y', version: 1, ...report }] } }))!

  it('keeps only the violations of axe\'s result, with the selectors of the failing elements', () => {
    const t = withReport({ status: 'warning', result: { violations: [axe()], passes: [axe({ id: 'region' })], incomplete: [] } })
    expect(t.a11y).toEqual({
      status: 'warning',
      violations: [{ id: 'button-name', impact: 'critical', help: 'Buttons must have discernible text', helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/button-name', nodes: ['#root > button'], nodeCount: 1 }],
    })
  })

  it('records a passed check, so the story is known to be checked', () => {
    expect(withReport({ status: 'passed', result: { violations: [] } }).a11y).toEqual({ status: 'passed', violations: [] })
  })

  it('caps the elements listed per violation, keeps their count, and joins shadow DOM selectors', () => {
    const nodes = [{ target: [['my-app', 'button']] }, ...Array.from({ length: 14 }, (_, i) => ({ target: [`#b${i}`] }))]
    const [v] = withReport({ status: 'failed', result: { violations: [axe({ impact: null, nodes })] } }).a11y!.violations
    expect(v.nodes).toHaveLength(10)
    expect(v.nodes[0]).toBe('my-app >>> button')
    expect(v.nodeCount).toBe(15)
    expect(v.impact).toBeUndefined()
  })

  it('reports an axe crash as a failed check with its message', () => {
    expect(withReport({ status: 'failed', result: { error: { message: 'axe is already running' } } }).a11y)
      .toEqual({ status: 'failed', violations: [], error: 'axe is already running' })
    expect(withReport({ status: 'failed', result: { error: {} } }).a11y?.error).toBe('The accessibility check failed.')
  })

  it('reads the violations of a story in error mode from its failure, without impact', () => {
    // vitest-axe's message, as Storybook throws it: the report itself never reaches the reporter.
    const message = [
      'expect(received).toHaveNoViolations(expected)',
      '',
      'Expected the HTML found at $(\'div:nth-child(5) > button\') to have no violations:',
      '',
      '<button></button>',
      '',
      'Received:',
      '',
      '"Buttons must have discernible text (button-name)"',
      '',
      'Fix any of the following:',
      '  Element does not have inner text that is visible to screen readers',
      '',
      'You can find more information on this issue here: ',
      'https://dequeuniversity.com/rules/axe/4.14/button-name?application=axeAPI',
    ].join('\n')
    const t = toNormTest(fakeTest({ state: 'failed', errors: [{ message }], meta: { storyId: 'button--unlabeled' } }))!
    expect(t.a11y).toEqual({
      status: 'failed',
      violations: [{ id: 'button-name', help: 'Buttons must have discernible text', helpUrl: 'https://dequeuniversity.com/rules/axe/4.14/button-name?application=axeAPI', nodes: ['div:nth-child(5) > button'], nodeCount: 1 }],
    })
  })

  it('leaves tests without an a11y report alone', () => {
    expect(toNormTest(fakeTest({ meta: { storyId: 'button--primary', reports: [] } }))!.a11y).toBeUndefined()
    expect(toNormTest(fakeTest())!.a11y).toBeUndefined()
  })
})

describe('toNormTests', () => {
  const tests = [fakeTest({ name: 'clicks', browser: true }), fakeTest({ name: 'adds', browser: false, project: 'unit' }), fakeTest({ name: 'sums', browser: false, project: 'unit' })]

  it('keeps browser tests only by default and counts the Node tests left out', () => {
    const { tests: kept, skippedNodeTests } = toNormTests([fakeModule(tests)])
    expect(kept.map(t => t.title)).toEqual(['clicks'])
    expect(skippedNodeTests).toBe(2)
  })

  it('keeps every test with include: all', () => {
    const { tests: kept, skippedNodeTests } = toNormTests([fakeModule(tests)], 'all')
    expect(kept.map(t => t.title)).toEqual(['clicks', 'adds', 'sums'])
    expect(skippedNodeTests).toBe(0)
  })
})
