import { expect, test } from '@playwright/test'
import { createApiToken, login, postRun, runOf, scanPage, testOf } from './helpers'

const DAY = 86_400_000
const REPO = 'https://github.com/acme/shop'

// Flaky and broken read from runs with known commits: the whole chain from the commit a reporter
// sends to the diagnosis on the test page.
test('a test that passed and failed on one commit is flaky, one failing since a commit is broken', async ({ page }) => {
  await login(page)
  const slug = `health-${Date.now()}`
  const token = await createApiToken(page)
  const FILE = 'tests/checkout.spec.ts'
  // The 2nd and 3rd runs are the same commit, rerun.
  const runs: [string, 'expected' | 'unexpected', 'expected' | 'unexpected'][] = [
    ['a1a1a1a1a1', 'expected', 'expected'],
    ['b2b2b2b2b2', 'unexpected', 'expected'],
    ['b2b2b2b2b2', 'expected', 'expected'],
    ['c3c3c3c3c3', 'expected', 'unexpected'],
  ]
  for (const [i, [sha, rerun, total]] of runs.entries()) {
    const tests = [testOf(FILE, 'pays with a saved card', rerun), testOf(FILE, 'shows the order total', total)]
    await postRun(page, token, runOf(slug, new Date(Date.now() - (runs.length - i) * DAY), tests, { sha, repoUrl: REPO }))
  }

  await page.goto(`/projects/${slug}/tests`)
  const row = (title: string) => page.getByRole('link').filter({ hasText: title })
  await expect(row('pays with a saved card').locator('[data-health]')).toHaveAttribute('data-health', 'flaky')

  await row('pays with a saved card').click()
  const flaky = page.getByTestId('test-health')
  await expect(flaky).toContainText('Passed and failed on the same commit b2b2b2b.')
  await expect(flaky.getByRole('link', { name: 'b2b2b2b' })).toHaveAttribute('href', `${REPO}/commit/b2b2b2b2b2`)
  await scanPage(page)

  // A "New failure" badge stands in for Broken on the list; the test page names the commit.
  await page.goto(`/projects/${slug}/tests`)
  await row('shows the order total').click()
  const broken = page.getByTestId('test-health')
  await expect(broken.locator('[data-health]')).toHaveAttribute('data-health', 'broken')
  await expect(broken).toContainText('Failed its latest run, on commit c3c3c3c.')
  await expect(broken.getByRole('link', { name: 'c3c3c3c' })).toHaveAttribute('href', `${REPO}/commit/c3c3c3c3c3`)
  await expect(broken.getByRole('link', { name: /Failing run/ })).toBeVisible()
})
