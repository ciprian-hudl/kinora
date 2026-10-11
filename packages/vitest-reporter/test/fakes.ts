import type { TestCase, TestModule } from 'vitest/node'

export interface FakeTest {
  name?: string
  file?: string
  suites?: string[]
  project?: string
  browser?: boolean
  state?: 'passed' | 'failed' | 'skipped' | 'pending'
  flaky?: boolean
  retryCount?: number
  errors?: { message: string, stack?: string }[]
  annotations?: { type: string, message: string, attachment?: { path?: string } }[]
  artifacts?: { type: string, attachments?: { name?: string, path?: string, contentType?: string }[] }[]
  meta?: Record<string, unknown>
  location?: { line: number, column: number }
}

// The slice of Vitest's TestCase the converter reads.
export function fakeTest(over: FakeTest = {}): TestCase {
  const module = { type: 'module', relativeModuleId: over.file ?? 'src/Button.test.ts' }
  let parent: unknown = module
  for (const name of over.suites ?? [])
    parent = { type: 'suite', name, parent }
  const state = over.state ?? 'passed'
  return {
    name: over.name ?? 'renders',
    module,
    parent,
    project: { name: over.project ?? 'browser (chromium)', config: { browser: { enabled: over.browser ?? true } } },
    location: over.location ?? { line: 12, column: 3 },
    tags: [],
    result: () => ({ state, errors: state === 'failed' || over.flaky ? (over.errors ?? [{ message: 'boom' }]) : undefined }),
    diagnostic: () => (state === 'pending' ? undefined : { duration: 42.6, retryCount: over.retryCount ?? 0, flaky: !!over.flaky }),
    annotations: () => over.annotations ?? [],
    artifacts: () => over.artifacts ?? [],
    meta: () => over.meta ?? {},
  } as unknown as TestCase
}

export function fakeModule(tests: TestCase[]): TestModule {
  return { children: { allTests: () => tests } } as unknown as TestModule
}
