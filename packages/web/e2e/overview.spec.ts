import { expect, test } from '@playwright/test'
import { createApiToken, login, postRun, runOf, scanPage, testOf } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('lists the seeded projects', async ({ page }) => {
  await expect(page.getByRole('link', { name: 'Web App' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'API Gateway' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Marketing Site' })).toBeVisible()
  await scanPage(page)
})

test('filters the overview by tag', async ({ page }) => {
  await page.goto('/?tag=@smoke')
  // Only Web App carries @smoke-tagged tests in the seed.
  await expect(page.getByRole('link', { name: 'Web App' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'API Gateway' })).toHaveCount(0)
  await expect(page.getByText('@smoke / latest')).toBeVisible()
})

test('a failed filter change keeps the filters', async ({ page }) => {
  await page.goto('/?tag=@smoke')
  await expect(page.getByRole('link', { name: 'Web App' })).toBeVisible()

  await page.route('**/trpc/dashboard.overview**', route => route.abort())
  await page.getByRole('button', { name: 'Clear' }).click()

  const alert = page.getByRole('alert')
  await expect(alert.getByText('Can\'t reach the kinora server.')).toBeVisible()
  await expect(page.getByRole('combobox').filter({ hasText: 'all branches' })).toBeVisible()

  await page.unroute('**/trpc/dashboard.overview**')
  await alert.getByRole('button', { name: 'Retry' }).click()

  await expect(page.getByRole('link', { name: 'API Gateway' })).toBeVisible()
})

test('the marvel and hudl-frontends tabs split the projects, link, and come back next visit', async ({ page, context }) => {
  const stamp = Date.now()
  const token = await createApiToken(page)
  const tests = [testOf('a.spec.ts', 'works', 'expected')]
  await postRun(page, token, runOf(`fan-${stamp}/e2e`, new Date(), tests))
  await postRun(page, token, runOf(`hudl/hudl-${stamp}`, new Date(), tests))
  const hfe = page.getByRole('link', { name: `fan-${stamp}/e2e` })
  const marvel = page.getByRole('link', { name: `hudl/hudl-${stamp}` })

  await page.goto('/')
  await page.getByRole('tab', { name: 'marvel' }).click()
  await expect(page).toHaveURL(/[?&]view=marvel/)
  await expect(marvel).toBeVisible()
  await expect(hfe).toHaveCount(0)
  await scanPage(page)

  await page.goto('/')
  await expect(page).toHaveURL(/[?&]view=marvel/)
  await expect(page.getByRole('tab', { name: 'marvel' })).toHaveAttribute('aria-selected', 'true')

  await page.getByRole('tab', { name: 'hudl-frontends' }).click()
  await expect(hfe).toBeVisible()
  await expect(marvel).toHaveCount(0)

  const other = await context.browser()!.newContext({ storageState: { cookies: (await context.storageState()).cookies, origins: [] } })
  const peer = await other.newPage()
  await peer.goto('/?view=marvel')
  await expect(peer.getByRole('link', { name: `hudl/hudl-${stamp}` })).toBeVisible()
  await peer.goto('/')
  await expect(peer).toHaveURL(/[?&]view=marvel/)
  await other.close()
})
