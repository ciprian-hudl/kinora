import type { Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // The bare viewer now shows the drop zone, so the demo trace is explicit.
  await page.goto('/?trace=fixtures/demo.zip')
  // Trace loads asynchronously once the service worker controls the page.
  await expect(page.getByTestId('action').first()).toBeVisible()
})

test('loads the demo trace into the workbench', async ({ page }) => {
  await expect(page.getByText('kinora', { exact: true })).toBeVisible()
  expect(await page.getByTestId('action').count()).toBeGreaterThan(5)
})

test('replays the DOM snapshot in the iframe', async ({ page }) => {
  const frame = page.frameLocator('iframe[name="snapshot"]')
  await expect(frame.getByText('Order complete')).toBeVisible()
})

test('shows ARIA snapshot mode empty state', async ({ page }) => {
  await page.getByRole('button', { name: 'ARIA' }).click()
  await expect(page.getByText('No ARIA snapshot captured for this phase')).toBeVisible()
})

test('renders an ARIA snapshot when present', async ({ page }) => {
  await page.goto('/?trace=fixtures/aria-trace.zip')
  await expect(page.getByTestId('action').first()).toBeVisible()
  await page.getByTestId('action').filter({ hasText: 'Click' }).first().click()
  await page.getByRole('button', { name: 'ARIA' }).click()

  await expect(page.getByText('ARIA snapshot', { exact: true })).toBeVisible()
  // The id of the call the snapshot belongs to. Its prefix depends on the Playwright version
  // (`call@57` up to 1.63, a per-run prefix like `cdwd@57` since), so only its shape is checked.
  await expect(page.getByText(/^[\w:]+@\d+$/)).toBeVisible()
  await expect(page.getByText('resources/aria-checkout.yml')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy ARIA' })).toBeVisible()
  await expect(page.getByText('- document:')).toBeVisible()
  await expect(page.getByText('button "Complete checkout"')).toBeVisible()
})

test('shows the test source code', async ({ page }) => {
  await page.getByRole('button', { name: 'Source', exact: true }).click()
  await expect(page.getByText(/testInfo\.attach\('screenshot'/)).toBeVisible()
})

test('locator tab shows the selected action locator', async ({ page }) => {
  await page.getByTestId('action').filter({ hasText: 'Fill "alex@example.com"' }).click()
  await page.getByRole('button', { name: 'Locator', exact: true }).click()

  await expect(page.getByTestId('locator-source')).toHaveText('Selected action')
  await expect(page.getByTestId('locator-value')).toContainText(/locator\('#customer'\)/)
  await expect(page.getByTestId('selector-value')).toHaveText('#customer')
  await expect(page.getByRole('button', { name: 'Copy locator' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy selector' })).toBeVisible()
})

test('call tab highlights action details', async ({ page }) => {
  await page.getByTestId('action').filter({ hasText: 'Fill "alex@example.com"' }).click()
  await page.getByRole('button', { name: 'Call', exact: true }).click()

  await expect(page.getByTestId('call-title')).toHaveText('Fill "alex@example.com"')
  await expect(page.getByTestId('call-method')).toHaveText('Frame.fill')
  await expect(page.getByText('Key details')).toBeVisible()
  await expect(page.getByText('selector')).toBeVisible()
  await expect(page.getByText('#customer', { exact: true })).toBeVisible()
  await expect(page.getByText('alex@example.com', { exact: true })).toBeVisible()
})

test('call tab formats expect details', async ({ page }) => {
  await page.getByTestId('action').filter({ hasText: 'Expect "toHaveText"' }).first().click()
  await page.getByRole('button', { name: 'Call', exact: true }).click()

  await expect(page.getByTestId('call-title')).toHaveText('Expect "toHaveText"')
  await expect(page.getByText('expected text')).toBeVisible()
  await expect(page.getByText('Order complete', { exact: true })).toBeVisible()
})

test('picks a locator from the snapshot', async ({ page }) => {
  await page.getByRole('button', { name: 'Pick locator' }).click()
  await page.frameLocator('iframe[name="snapshot"]').getByRole('button', { name: 'Complete checkout' }).click()

  await expect(page.getByRole('button', { name: 'Locator', exact: true })).toHaveClass(/text-foreground/)
  await expect(page.getByTestId('locator-source')).toHaveText('Snapshot picker')
  await expect(page.getByTestId('locator-value')).toContainText(/getByRole\('button', \{ name: 'Complete checkout' \}\)/)
  await expect(page.getByTestId('selector-value')).toHaveText('#complete')
})

test('syntax highlights the source', async ({ page }) => {
  await page.getByRole('button', { name: 'Source', exact: true }).click()
  // A duplicate @codemirror/view silently drops highlight decorations, leaving plain monochrome text.
  const tokens = page.locator('.cm-content span')
  await expect(tokens.first()).toBeVisible()
  expect(await tokens.count()).toBeGreaterThan(20)
})

test('action group filters hide noisy actions', async ({ page }) => {
  const before = await page.getByTestId('action').count()
  await page.getByRole('button', { name: 'Filter actions' }).click()
  await page.getByRole('menuitemcheckbox', { name: /Network routes/ }).click()

  await expect(page.getByText('4 hidden')).toBeVisible()
  expect(await page.getByTestId('action').count()).toBe(before - 4)
})

test('timeline hover shows action details', async ({ page }) => {
  await page.locator('[data-testid="action-segment"][aria-label*=\'Fill "alex@example.com"\']').hover()

  await expect(page.getByTestId('timeline-hover-card')).toContainText('Fill "alex@example.com"')
  await expect(page.getByTestId('timeline-hover-card')).toContainText(/\d+ms/)
})

test('timeline cursor follows clicked segments', async ({ page }) => {
  await page.locator('[data-testid="action-segment"][aria-label*=\'Fill "alex@example.com"\']').click()

  await expect(page.getByTestId('current-action')).toContainText('Fill "alex@example.com"')
  await expect(page.getByTestId('timeline-cursor')).toBeVisible()
  await expect(page.getByTestId('timeline-current-time')).toContainText(/\d+ms/)
})

test('timeline brush stays visible while selecting a range', async ({ page }) => {
  const box = await page.getByTestId('timeline-track').boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + 20, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(box!.x + 140, box!.y + box!.height / 2)

  await expect(page.getByTestId('timeline-brush')).toBeVisible()

  await page.mouse.up()
})

test('double-clicking an action zooms to its time range', async ({ page }) => {
  await page.getByTestId('action').filter({ hasText: 'Fill "alex@example.com"' }).dblclick()
  await expect(page.getByTestId('reset-zoom')).toBeVisible()
  await expect(page.getByTestId('reset-zoom')).toContainText(/\d+ms - \d+ms/)
})

test('network tab lists requests and previews a response body', async ({ page }) => {
  await page.getByRole('button', { name: /^Network/ }).click()
  const rows = page.getByTestId('net-row')
  await expect(rows.first()).toBeVisible()
  await rows.filter({ hasText: 'style.css' }).click()
  await expect(page.getByText('Response body')).toBeVisible()
  await expect(page.getByText('font-family')).toBeVisible()
})

test('network tab can show all requests in the trace', async ({ page }) => {
  await page.getByTestId('action').first().click()
  await page.getByRole('button', { name: /^Network/ }).click()
  await expect(page.getByText('No network for this action')).toBeVisible()
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await expect(page.getByTestId('net-row').filter({ hasText: 'style.css' })).toBeVisible()
})

test('network copy menu offers cURL and fetch', async ({ page }) => {
  await page.getByRole('button', { name: /^Network/ }).click()
  await page.getByTestId('net-row').first().click()
  await page.getByRole('button', { name: 'Copy' }).click()
  await expect(page.getByRole('menuitem', { name: 'Copy as cURL' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Copy as fetch' })).toBeVisible()
})

test('console tab can show all messages in the trace', async ({ page }) => {
  await page.getByTestId('action').first().click()
  await page.getByRole('button', { name: /^Console/ }).click()
  await expect(page.getByText('No console output for this action')).toBeVisible()
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await expect(page.getByText('order submitted, customer = alex@example.com')).toBeVisible()
  await expect(page.getByText('demo warning from checkout flow')).toBeVisible()
})

test('attachments tab previews the screenshot', async ({ page }) => {
  await page.getByRole('button', { name: /^Attachments/ }).click()
  await expect(page.getByText('screenshot', { exact: true })).toBeVisible()
  await expect(page.getByText('note', { exact: true })).toBeVisible()
})

test('metadata tab shows trace environment details', async ({ page }) => {
  await page.getByRole('button', { name: 'Metadata' }).click()
  await expect(page.getByRole('heading', { name: 'Browser' })).toBeVisible()
  await expect(page.getByText('playwright version')).toBeVisible()
  await expect(page.getByText(/\d+\.\d+\.\d+/).first()).toBeVisible()
  await expect(page.getByRole('cell', { name: 'actions' })).toBeVisible()
})

test('annotations tab shows the empty state', async ({ page }) => {
  await page.getByRole('button', { name: 'Annotations' }).click()
  await expect(page.getByText('No annotations')).toBeVisible()
})

test('filmstrip renders screencast frames', async ({ page }) => {
  await expect(page.locator('img[src*="file/"]').first()).toBeVisible()
})

test('opens the current snapshot in a new tab', async ({ page }) => {
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('button', { name: 'Open snapshot in new tab' }).click(),
  ])

  await expect(popup).toHaveURL(/\/snapshot\//)
  await expect(popup.getByText('Order complete')).toBeVisible()
})

test('play advances the selected action', async ({ page }) => {
  const current = page.getByTestId('current-action')
  const before = await current.textContent()
  await page.getByTestId('play').click()
  await expect(page.getByTestId('play')).toHaveAttribute('title', 'Pause')
  await expect(async () => {
    expect(await current.textContent()).not.toBe(before)
  }).toPass({ timeout: 5000 })
  await page.getByTestId('play').click()
  await expect(page.getByTestId('play')).toHaveAttribute('title', 'Play')
})

test('cycles playback speed and scrubs actions', async ({ page }) => {
  await expect(page.getByTestId('playback-speed')).toHaveText('1x')
  await page.getByTestId('playback-speed').click()
  await expect(page.getByTestId('playback-speed')).toHaveText('2x')
  await page.getByTestId('playback-speed').click()
  await expect(page.getByTestId('playback-speed')).toHaveText('0.25x')
  await page.getByTestId('playback-speed').click()
  await expect(page.getByTestId('playback-speed')).toHaveText('0.5x')

  await page.getByTestId('action-scrubber').fill('0')
  await expect(page.getByTestId('current-action')).toContainText('Before Hooks')
})

test('keyboard navigates between actions', async ({ page }) => {
  const current = page.getByTestId('current-action')
  const before = await current.textContent()
  await page.locator('body').press('k')
  await expect(current).not.toHaveText(before ?? '')
})

test('tooltip shows the full url on a truncated network name', async ({ page }) => {
  await page.getByRole('button', { name: /^Network/ }).click()
  const name = page.getByTestId('net-row').first().locator('span').first()
  await name.hover()
  await expect(page.locator('[data-slot="tooltip-content"]').first()).toContainText('demo.kinora.dev')
})

// The connector seam: the dashboard's "View trace" button opens the viewer with
// ?trace=<hosted zip url>. This proves the viewer loads a trace from that param.
test('loads a trace passed via ?trace=', async ({ page, baseURL }) => {
  const traceUrl = `${baseURL}/fixtures/demo.zip`
  await page.goto(`/?trace=${encodeURIComponent(traceUrl)}`)
  await expect(page.getByTestId('action').first()).toBeVisible()
  expect(await page.getByTestId('action').count()).toBeGreaterThan(5)
})

async function openVideoTrace(page: Page, baseURL: string | undefined): Promise<void> {
  await page.goto(`/?trace=${encodeURIComponent(`${baseURL}/fixtures/video-trace.zip`)}`)
  await expect(page.getByTestId('action').first()).toBeVisible()
  await page.getByRole('button', { name: /^Attachments/ }).click()
}

test('plays a video attachment inline', async ({ page, baseURL }) => {
  await openVideoTrace(page, baseURL)
  const video = page.locator('video')
  await expect(video).toBeVisible()
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.duration)).toBeGreaterThan(0)
})

// Chromium never routes `<a download>` through the service worker, so fetch the body first.
test('downloads attachment bodies rather than the app shell', async ({ page, baseURL }) => {
  await openVideoTrace(page, baseURL)

  const cases = [
    { contentType: 'video/webm', filename: 'video.webm', magic: '1a45dfa3' },
    { contentType: 'image/png', filename: 'screenshot.png', magic: '89504e47' },
  ]
  for (const { contentType, filename, magic } of cases) {
    const row = page.getByTestId('attachment').filter({ hasText: contentType })
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      row.getByTestId('attachment-download').click(),
    ])
    expect(download.suggestedFilename()).toBe(filename)
    const body = await readFile((await download.path())!)
    expect(body.subarray(0, 4).toString('hex')).toBe(magic)
  }
})

test('opens the tab named by ?tab=', async ({ page, baseURL }) => {
  await page.goto(`/?trace=${encodeURIComponent(`${baseURL}/fixtures/video-trace.zip`)}&tab=attachments`)
  await expect(page.getByTestId('attachment').first()).toBeVisible()
})

test('remembers hidden action groups across reloads', async ({ page }) => {
  const before = await page.getByTestId('action').count()
  await page.getByRole('button', { name: 'Filter actions' }).click()
  await page.getByRole('menuitemcheckbox', { name: /Network routes/ }).click()
  await expect(page.getByText('4 hidden')).toBeVisible()

  await page.reload()
  await expect(page.getByTestId('action').first()).toBeVisible()
  await expect(page.getByText('4 hidden')).toBeVisible()
  expect(await page.getByTestId('action').count()).toBe(before - 4)

  await page.getByRole('button', { name: 'Filter actions' }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: /Network routes/ })).toHaveAttribute('aria-checked', 'false')
})

test('plays in real time over the screencast and pauses on a manual pick', async ({ page }) => {
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

test('marks requests a route handled', async ({ page }) => {
  await page.getByRole('button', { name: /^Network/ }).click()
  await page.getByRole('button', { name: 'All', exact: true }).click()
  const routed = page.locator('[data-testid="net-row"][data-route="fulfilled"]')
  await expect(routed.first()).toBeVisible()
  await expect(routed.first()).toContainText('fulfilled')
})

test('downloads the open trace', async ({ page }) => {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download trace' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('demo.zip')
})

test('network search finds text in response bodies and headers', async ({ page }) => {
  await page.getByRole('button', { name: /^Network/ }).click()
  await page.getByRole('button', { name: 'All', exact: true }).click()
  const filter = page.getByPlaceholder('Search URLs, headers, bodies')

  await filter.fill('box-sizing')
  const rows = page.getByTestId('net-row')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('style.css')
  await expect(rows.first().getByTestId('net-match')).toHaveText('response body')

  await filter.fill('content-length')
  await expect(rows).toHaveCount(2)
  await expect(rows.first().getByTestId('net-match')).toHaveText('headers')

  await page.getByRole('button', { name: 'Search in' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Headers' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByText('No network in this trace')).toBeVisible()

  await page.reload()
  await expect(page.getByTestId('action').first()).toBeVisible()
  await page.getByRole('button', { name: /^Network/ }).click()
  await page.getByRole('button', { name: 'Search in' }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'Headers' })).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByRole('menuitemcheckbox', { name: 'Response body' })).toHaveAttribute('aria-checked', 'true')
})

// Records every action title playback shows, so a test can check which actions it stepped through.
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

test('playback skips hidden action groups', async ({ page }) => {
  await page.getByRole('button', { name: 'Filter actions' }).click()
  await page.getByRole('menuitemcheckbox', { name: /Network routes/ }).click()
  await page.keyboard.press('Escape')
  await page.getByTestId('action-scrubber').fill('0')
  await slowestSpeed(page)
  await recordPlayedActions(page)

  await page.getByTestId('play').click()
  await expect(page.getByTestId('play')).toHaveAttribute('title', 'Play', { timeout: 10_000 })

  const seen = await page.evaluate(() => (window as unknown as { seenActions: string[] }).seenActions)
  expect(seen.length).toBeGreaterThan(3)
  expect(seen.filter(title => /Route requests|Fulfill request/.test(title))).toEqual([])
})

test('playback stops at the end of a zoomed window', async ({ page }) => {
  await page.getByTestId('action').filter({ hasText: 'Set content' }).dblclick()
  await expect(page.getByTestId('reset-zoom')).toBeVisible()
  await slowestSpeed(page)

  await page.getByTestId('play').click()
  await expect(page.getByTestId('play')).toHaveAttribute('title', 'Play', { timeout: 10_000 })
  // The list only shows actions inside the window; the selection must still be one of them.
  await expect(page.locator('[data-testid="action"][class*="bg-signal/10"]')).toHaveCount(1)
  await expect(page.getByTestId('reset-zoom')).toBeVisible()
})

test('plays a trace without a screencast on its DOM snapshots', async ({ page }) => {
  await page.goto('/?trace=fixtures/annotations-trace.zip')
  await expect(page.getByTestId('action').first()).toBeVisible()
  await page.getByTestId('action-scrubber').fill('0')
  await recordPlayedActions(page)

  await page.getByTestId('play').click()
  await expect(page.getByTestId('play')).toHaveAttribute('title', 'Play', { timeout: 10_000 })
  await expect(page.getByTestId('playback-frame')).toHaveCount(0)
  expect((await page.evaluate(() => (window as unknown as { seenActions: string[] }).seenActions)).length).toBeGreaterThan(3)
  await expect(page.locator('iframe').first()).toBeAttached()
})

test('network search finds a request body stored as a trace file', async ({ page }) => {
  await page.goto('/?trace=fixtures/network-rich-trace.zip')
  await expect(page.getByTestId('action').first()).toBeVisible()
  await page.getByRole('button', { name: /^Network/ }).click()
  await page.getByRole('button', { name: 'All', exact: true }).click()

  await page.getByPlaceholder('Search URLs, headers, bodies').fill('"plan":"Pro"')
  const row = page.getByTestId('net-row').filter({ hasText: 'checkout' })
  await expect(row).toBeVisible()
  await expect(row.getByTestId('net-match').filter({ hasText: 'request body' })).toBeVisible()
})

test('shows how a route handled a request in the network detail', async ({ page }) => {
  await page.getByRole('button', { name: /^Network/ }).click()
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await page.locator('[data-testid="net-row"][data-route="fulfilled"]').first().click()

  const detail = page.getByTestId('net-detail')
  await expect(detail.getByText('Route', { exact: true })).toBeVisible()
  await expect(detail.getByText('fulfilled', { exact: true })).toBeVisible()
})

test('filmstrip tiles never overlap', async ({ page }) => {
  const tiles = page.getByTestId('filmstrip-tile')
  await expect(tiles.first()).toBeVisible()
  const boxes = await tiles.evaluateAll(els => els.map(el => el.getBoundingClientRect()).map(r => ({ left: r.left, right: r.right })))
  expect(boxes.length).toBeGreaterThan(1)
  for (let i = 1; i < boxes.length; i++)
    expect(boxes[i].left).toBeGreaterThanOrEqual(boxes[i - 1].right - 0.5)
})
