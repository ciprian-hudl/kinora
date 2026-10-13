import process from 'node:process'
import { defineConfig } from '@playwright/test'

// Nested run launched by e2e/a11y-run.spec.ts: real axe scans (@axe-core/playwright, through the
// reporter's `scanA11y` helper), uploaded by the real reporter. Both are loaded from source so the
// suite needs no prior build of @kinora/reporter.
export default defineConfig({
  testDir: '.',
  // Not `.spec.ts`, so the outer e2e run never collects these.
  testMatch: '*.a11y.ts',
  outputDir: process.env.A11Y_OUTPUT_DIR,
  reporter: [['../../../../reporter/src/index.ts', { project: { slug: process.env.A11Y_PROJECT_SLUG } }]],
})
