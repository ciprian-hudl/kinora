import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/?trace=fixtures/demo.zip')
  await expect(page.getByTestId('action').first()).toBeVisible()
})

async function recordPlayedActions(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="current-action"]')!
    const seen: string[] = []
    ;(window as unknown as { seenActions: string[] }).seenActions = seen
    new MutationObserver(() => seen.push(el.textContent?.trim() ?? '')).observe(el, { childList: true, characterData: true, subtree: true })
  })
}

async function slowestSpeed(page: Page): Promise<void> {
  while ((await page.getByTestId('playback-speed').textContent())?.trim() !== '0.25x')
    await page.getByTestId('playback-speed').click()
}

test('plays in real time over the screencast and pauses on a manual pick', async ({ page }) => {
  await page.goto('/?trace=fixtures/video-trace.zip')
  await expect(page.getByTestId('action').first()).toBeVisible()
  await page.getByTestId('action-scrubber').fill('0')
  await page.getByTestId('play').click()
  await expect(page.getByTestId('play')).toHaveAttribute('title', 'Pause')
  await expect(page.getByTestId('playback-frame')).toBeVisible()
  const cursor = page.getByTestId('timeline-current-time')
  const first = await cursor.textContent()
  await expect(async () => {
    expect(await cursor.textContent()).not.toBe(first)
  }).toPass({ timeout: 5000 })

  await page.getByTestId('action').first().click()
  await expect(page.getByTestId('play')).toHaveAttribute('title', 'Play')
  await expect(page.getByTestId('playback-frame')).toHaveCount(0)
})

test('playback stops at the end of a zoomed window', async ({ page }) => {
  await page.getByTestId('action').filter({ hasText: 'Set content' }).dblclick()
  await expect(page.getByTestId('reset-zoom')).toBeVisible()
  await slowestSpeed(page)

  await page.getByTestId('play').click()
  await expect(page.getByTestId('play')).toHaveAttribute('title', 'Play', { timeout: 10_000 })
  await expect(page.locator('[data-testid="action"][class*="bg-signal/10"]')).toHaveCount(1)
  await expect(page.getByTestId('reset-zoom')).toBeVisible()
})

test('plays a trace without a screencast on its DOM snapshots', async ({ page }) => {
  await page.goto('/?trace=fixtures/annotations-trace.zip')
  await expect(page.getByTestId('action').first()).toBeVisible()
  await page.getByTestId('action-scrubber').fill('0')
  await slowestSpeed(page)
  await recordPlayedActions(page)

  await page.getByTestId('play').click()
  await expect(page.getByTestId('play')).toHaveAttribute('title', 'Play', { timeout: 10_000 })
  await expect(page.getByTestId('playback-frame')).toHaveCount(0)
  expect((await page.evaluate(() => (window as unknown as { seenActions: string[] }).seenActions)).length).toBeGreaterThan(3)
  await expect(page.locator('iframe').first()).toBeAttached()
})
