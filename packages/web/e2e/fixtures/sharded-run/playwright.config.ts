import process from 'node:process'
import { defineConfig } from '@playwright/test'

// Nested sharded run launched by e2e/sharded-run.spec.ts: each shard writes a blob report, then
// merge.config.ts uploads the merged run with the real reporter (loaded from source).
export default defineConfig({
  testDir: '.',
  // Not `.spec.ts`, so the outer e2e run never collects these.
  testMatch: '*.shard.ts',
  outputDir: process.env.SHARD_OUTPUT_DIR,
  fullyParallel: true,
  reporter: [['blob', { outputDir: process.env.SHARD_BLOB_DIR }]],
  use: { trace: 'on' },
})
