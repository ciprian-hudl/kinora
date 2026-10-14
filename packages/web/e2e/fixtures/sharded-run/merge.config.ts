import process from 'node:process'
import { defineConfig } from '@playwright/test'

// The merge step's config: `merge-reports --reporter` loads a reporter without options, so the
// kinora reporter and its project are set here. testDir matches the shards' config, which keeps the
// file paths, and so the test identities, the same as an unsharded run.
export default defineConfig({
  testDir: '.',
  reporter: [['../../../../reporter/src/index.ts', { project: { slug: process.env.SHARD_PROJECT_SLUG } }]],
})
