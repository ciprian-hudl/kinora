import process from 'node:process'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// Nested run launched by e2e/vitest-run.spec.ts: real Vitest tests, uploaded by the real Vitest
// reporter (loaded from source, so no prior build is needed). A Node project and a browser one,
// to check that only the browser tests are uploaded by default.
export default defineConfig({
  test: {
    root: import.meta.dirname,
    reporters: [['../../../../vitest-reporter/src/index.ts', { project: { slug: process.env.VITEST_RUN_PROJECT_SLUG } }]],
    projects: [
      { test: { name: 'unit', include: ['*.unit.ts'] } },
      {
        test: {
          name: 'browser',
          include: ['*.browser.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
            // Default location (__traces__ next to the tests): Vitest 4 writes unzipped trace pieces,
            // and no trace annotation, when `tracesDir` is set.
            trace: 'on',
          },
        },
      },
    ],
  },
})
