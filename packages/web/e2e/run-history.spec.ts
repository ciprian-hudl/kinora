import { expect, test } from '@playwright/test'
import { createApiToken, login, postRun, runOf, scanPage, testOf } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('pages the run table newest first and keeps the cursor in the URL', async ({ page }) => {
  const slug = `paging-${Date.now()}`
  const token = await createApiToken(page)
  const now = Date.now()
  for (let i = 0; i < 30; i++)
    await postRun(page, token, runOf(slug, new Date(now - i * 60_000), [testOf('a.spec.ts', 'works', 'expected')]))

  await page.goto(`/projects/${slug}`)
  const rows = page.getByRole('row')
  await expect(rows).toHaveCount(26)
  await expect(page.getByText('30 runs', { exact: true })).toBeVisible()
  const newest = (await rows.nth(1).getByRole('cell').first().textContent())!.trim()

  await page.getByRole('button', { name: 'Older' }).click()
  await expect(page).toHaveURL(/[?&]before=/)
  await expect(rows).toHaveCount(6)
  await scanPage(page)

  await page.reload()
  await expect(rows).toHaveCount(6)

  await page.getByRole('button', { name: 'Newer' }).click()
  await expect(page).toHaveURL(/[?&]after=/)
  await expect(rows).toHaveCount(26)
  await expect(rows.nth(1).getByRole('cell').first()).toHaveText(newest)
})

test('shows each run\'s branch next to its sha', async ({ page }) => {
  const slug = `branch-${Date.now()}`
  const token = await createApiToken(page)
  await postRun(page, token, runOf(slug, new Date(), [testOf('a.spec.ts', 'works', 'expected')], { branch: 'feature/thor-run', sha: 'abcdef1234567' }))

  await page.goto(`/projects/${slug}`)
  const row = page.getByRole('row').nth(1)
  await expect(row.getByRole('cell', { name: 'feature/thor-run' })).toBeVisible()
  await expect(row.getByRole('cell', { name: 'abcdef1' })).toBeVisible()
})

test('filters and sorts the run table by branch', async ({ page }) => {
  const slug = `branches-${Date.now()}`
  const token = await createApiToken(page)
  const now = Date.now()
  const tests = [testOf('a.spec.ts', 'works', 'expected')]
  for (const [i, branch] of ['main', 'thor/b', 'main', 'thor/a'].entries())
    await postRun(page, token, runOf(slug, new Date(now - i * 60_000), tests, { branch }))

  await page.goto(`/projects/${slug}`)
  const branchCells = page.getByRole('row').locator('td:nth-child(7)')
  await expect(branchCells).toHaveText(['main', 'thor/b', 'main', 'thor/a'])

  const sortByBranch = page.getByRole('button', { name: 'Branch' })
  await sortByBranch.click()
  await expect(page).toHaveURL(/[?&]sort=branch/)
  await expect(branchCells).toHaveText(['main', 'main', 'thor/a', 'thor/b'])
  await sortByBranch.click()
  await expect(branchCells).toHaveText(['thor/b', 'thor/a', 'main', 'main'])
  await sortByBranch.click()
  await expect(page).not.toHaveURL(/[?&]sort=/)
  await expect(branchCells).toHaveText(['main', 'thor/b', 'main', 'thor/a'])

  await page.getByRole('button', { name: 'Run' }).click()
  await expect(branchCells).toHaveText(['thor/a', 'main', 'thor/b', 'main'])

  await page.getByRole('combobox', { name: 'Filter by branch' }).click()
  await page.getByRole('option', { name: 'thor/a' }).click()
  await expect(branchCells).toHaveText(['thor/a'])
  await expect(page).toHaveURL(/[?&]branch=thor\/a/)
})
