import type { NormTest } from '@kinora/core'
import type { TestCase, TestModule } from 'vitest/node'
import { makeTestKey, STORY_ANNOTATION, stripAnsi } from '@kinora/core'

type Attachment = NormTest['attachments'][number]

// What Storybook's Vitest addon puts on each story test (`task.meta`).
interface StoryMeta { storyId?: string, componentName?: string }

// Vitest artifacts are experimental and typed as an open union, so read them structurally.
interface ArtifactLike {
  type: string
  attachments?: { name?: string, path?: string, contentType?: string }[]
}

// Cross-run identity, same shape as Playwright's: file, suite path, project. The file is
// relative to the Vitest root, so it is stable across machines.
function identity(test: TestCase): { file: string, titlePath: string[], projectName: string } {
  const file = test.module.relativeModuleId
  const suites: string[] = []
  for (let parent = test.parent; parent.type === 'suite'; parent = parent.parent)
    suites.unshift(parent.name)
  return { file, titlePath: [file, ...suites, test.name], projectName: test.project.name }
}

function statusOf(test: TestCase): NormTest['status'] | undefined {
  const { state } = test.result()
  if (state === 'skipped')
    return 'skipped'
  if (state === 'failed')
    return 'unexpected'
  // Passed after a retry: what Playwright calls flaky.
  if (state === 'passed')
    return test.diagnostic()?.flaky ? 'flaky' : 'expected'
  return undefined // pending: never ran (interrupted run)
}

// The story a Storybook test renders, as `<Component>/<Story>` so the Components page groups it.
// The component name is the one imported in the story file; fall back to the Storybook id
// (`example-button--primary`) when it is unknown.
function storyOf(test: TestCase, titlePath: string[]): string | undefined {
  const meta = test.meta() as StoryMeta
  if (!meta.storyId)
    return undefined
  if (!meta.componentName)
    return meta.storyId.replace('--', '/')
  // titlePath is [file, story, ...tests of that story]: the story is its first title.
  return `${meta.componentName}/${titlePath[1]}`
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'screenshot'
}

function attachmentsOf(test: TestCase): Attachment[] {
  const attachments: Attachment[] = []
  let comparisons = 0
  // Browser mode with the Playwright provider records its trace.zip as a `traces` annotation.
  for (const annotation of test.annotations()) {
    if (annotation.type === 'traces' && annotation.attachment?.path)
      attachments.push({ name: 'trace', contentType: 'application/zip', path: annotation.attachment.path, hasBody: false })
  }
  for (const artifact of test.artifacts() as readonly ArtifactLike[]) {
    if (artifact.type === 'internal:failureScreenshot') {
      for (const a of artifact.attachments ?? []) {
        if (a.path)
          attachments.push({ name: 'screenshot', contentType: a.contentType ?? 'image/png', path: a.path, hasBody: false })
      }
    }
    // toMatchScreenshot: reference / actual / diff. Renamed to the `<name>-expected|actual|diff`
    // form kinora already groups into a comparison (Playwright's naming). By the time a reporter sees
    // them, Vitest has copied the images under content hashes, so the comparison is named after the
    // test (and numbered when one test holds several).
    if (artifact.type === 'internal:toMatchScreenshot') {
      comparisons++
      const base = `${slug(test.name)}${comparisons > 1 ? `-${comparisons}` : ''}`
      for (const a of artifact.attachments ?? []) {
        if (a.path && a.name)
          attachments.push({ name: `${base}-${a.name === 'reference' ? 'expected' : a.name}.png`, contentType: a.contentType ?? 'image/png', path: a.path, hasBody: false })
      }
    }
  }
  return attachments
}

// Which tests to upload. `browser` (default): tests of projects running in a browser (browser mode,
// Storybook). Node unit tests are usually thousands of fast, deterministic tests with no trace:
// they add little to kinora and would eat the plan's monthly result quota.
export type IncludeTests = 'browser' | 'all'

export function isBrowserTest(test: TestCase): boolean {
  return !!test.project.config.browser?.enabled
}

// Storybook prefixes play-function failures with a link to the local Storybook server, which
// means nothing in kinora.
const STORYBOOK_DEBUG_LINE = /^\s*Click to debug the error directly in Storybook:.*$/m

function cleanMessage(message: string): string {
  return stripAnsi(message).replace(STORYBOOK_DEBUG_LINE, '').trim()
}

export function toNormTest(test: TestCase): NormTest | undefined {
  const status = statusOf(test)
  if (!status)
    return undefined
  const { file, titlePath, projectName } = identity(test)
  const diagnostic = test.diagnostic()
  const story = storyOf(test, titlePath)
  return {
    testKey: makeTestKey(file, titlePath, projectName),
    title: test.name,
    titlePath,
    file,
    line: test.location?.line ?? 0,
    column: test.location?.column ?? 0,
    projectName,
    status,
    ok: status !== 'unexpected',
    duration: Math.round(diagnostic?.duration ?? 0),
    retries: diagnostic?.retryCount ?? 0,
    tags: [...(test.tags ?? [])],
    annotations: [
      ...test.annotations().filter(a => a.type !== 'traces').map(a => ({ type: a.type, description: a.message })),
      ...story ? [{ type: STORY_ANNOTATION, description: story }] : [],
    ],
    errors: (test.result().errors ?? []).map(e => ({ message: cleanMessage(e.message), stack: e.stack })),
    attachments: attachmentsOf(test),
  }
}

export function toNormTests(modules: ReadonlyArray<TestModule>, include: IncludeTests = 'browser'): { tests: NormTest[], skippedNodeTests: number } {
  const tests: NormTest[] = []
  let skippedNodeTests = 0
  for (const module of modules) {
    for (const test of module.children.allTests()) {
      if (include === 'browser' && !isBrowserTest(test)) {
        skippedNodeTests++
        continue
      }
      const norm = toNormTest(test)
      if (norm)
        tests.push(norm)
    }
  }
  return { tests, skippedNodeTests }
}
