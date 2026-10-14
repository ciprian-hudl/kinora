import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'
import { createApiToken, login, SERVER_URL } from './helpers'

const run = promisify(execFile)
const PLAYWRIGHT_CLI = createRequire(import.meta.url).resolve('@playwright/test/cli')
const FIXTURE = fileURLToPath(new URL('./fixtures/sharded-run/', import.meta.url))

// The sharding setup the docs recommend, nothing seeded: two shards write blob reports, then
// `merge-reports` runs @kinora/reporter once. kinora gets one complete run with every trace.
test('a sharded run merged from blob reports lands as one run with its traces', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  // Unique even when repeated in parallel (`--repeat-each`): two runs in one project would read as
  // the shards landing separately.
  const slug = `sharded-run-${randomUUID().slice(0, 8)}`
  const tmp = await mkdtemp(join(tmpdir(), 'kinora-shards-'))
  const env = {
    ...process.env,
    KINORA_URL: SERVER_URL,
    KINORA_TOKEN: await createApiToken(page),
    SHARD_PROJECT_SLUG: slug,
    SHARD_OUTPUT_DIR: join(tmp, 'results'),
  }
  const merged = join(tmp, 'all-blob-reports')

  try {
    // Each shard in its own blob dir, as on separate CI jobs (the blob reporter empties its dir on
    // start), then gathered in one dir, as the merge job does when it downloads them.
    for (const n of [1, 2]) {
      const blobs = join(tmp, `blob-${n}`)
      await run(process.execPath, [PLAYWRIGHT_CLI, 'test', '-c', join(FIXTURE, 'playwright.config.ts'), `--shard=${n}/2`], { env: { ...env, SHARD_BLOB_DIR: blobs } })
      await cp(blobs, merged, { recursive: true })
    }
    const { stdout } = await run(process.execPath, [PLAYWRIGHT_CLI, 'merge-reports', '-c', join(FIXTURE, 'merge.config.ts'), merged], { env })
    // The merge extracts each shard's trace.zip, which the reporter uploads like any run.
    expect(stdout).toContain('[kinora] uploaded 2 tests + 2 artifacts')
  }
  finally {
    await rm(tmp, { recursive: true, force: true })
  }

  // One run, not one per shard, holding the tests of both shards.
  await page.goto(`/projects/${slug}`)
  await expect(page.getByRole('row')).toHaveCount(2) // header + the merged run
  await page.getByRole('row').nth(1).click()
  await expect(page.getByText('cart shows its total')).toBeVisible()
  await expect(page.getByText('checkout asks for a card')).toBeVisible()
  await expect(page.getByRole('link', { name: /View trace/ })).toHaveCount(2)
})
