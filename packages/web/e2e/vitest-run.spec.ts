import { execFile } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'
import { createApiToken, login, SERVER_URL } from './helpers'

const run = promisify(execFile)
// vitest.mjs is the CLI entry, but not an exported subpath: resolve it next to package.json.
const VITEST_CLI = join(dirname(createRequire(import.meta.url).resolve('vitest/package.json')), 'vitest.mjs')
const FIXTURE = fileURLToPath(new URL('./fixtures/vitest-run/', import.meta.url))
const CONFIG = join(FIXTURE, 'vitest.config.ts')
// What the nested run writes next to its tests (also git-ignored there).
const OUTPUTS = ['__screenshots__', '__traces__', '.vitest-attachments', 'node_modules']

// The Vitest path end to end, nothing seeded: Vitest browser mode -> @kinora/vitest-reporter ->
// upload -> server -> run page and trace.
test('a real Vitest run shows up with its browser tests and traces', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const slug = `vitest-run-${Date.now()}`

  try {
    // One browser test fails on purpose, so Vitest exits non-zero.
    const { stdout, stderr } = await run(process.execPath, [VITEST_CLI, 'run', '--config', CONFIG], {
      env: {
        ...process.env,
        KINORA_URL: SERVER_URL,
        KINORA_TOKEN: await createApiToken(page),
        VITEST_RUN_PROJECT_SLUG: slug,
      },
    }).catch((error: { stdout: string, stderr: string }) => error)
    // The 2 browser tests and their 2 traces; the Node test stays out by default.
    expect(`${stdout}${stderr}`).toContain('[kinora] uploaded 2 tests + 2 artifacts')
  }
  finally {
    await Promise.all(OUTPUTS.map(dir => rm(join(FIXTURE, dir), { recursive: true, force: true })))
  }

  await page.goto(`/projects/${slug}`)
  await page.getByRole('row').nth(1).click()

  await expect(page.getByText('counter increments')).toBeVisible()
  await expect(page.getByText('adds two numbers')).toHaveCount(0)
  // Locations are collected (file:line, not :0), and the failure has its message and trace.
  await expect(page.getByText(/counter\.browser\.ts:\d+ · browser \(chromium\)/).first()).not.toContainText(':0 ')
  await expect(page.getByText('Cannot find element with locator').first()).toBeVisible()
  await expect(page.getByRole('link', { name: /View trace/ })).toHaveCount(2)
})
