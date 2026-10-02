#!/usr/bin/env node
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { BlobReader, BlobWriter, ZipReader, ZipWriter } from '@zip.js/zip.js'

const execFileAsync = promisify(execFile)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixtures = path.join(root, 'public/fixtures')
const playwrightBin = path.join(root, 'node_modules/.bin/playwright')

await generateDemoTrace()
await generateAriaTrace()
await sanitizeFixturePaths()

async function generateDemoTrace() {
  const tmpRoot = process.platform === 'win32' ? os.tmpdir() : '/tmp'
  const tmp = path.join(tmpRoot, 'kinora-trace-fixtures')
  await rm(tmp, { force: true, recursive: true })
  await mkdir(tmp, { recursive: true })
  try {
    await symlink(path.join(root, 'node_modules'), path.join(tmp, 'node_modules'), 'dir')
    await writeFile(path.join(tmp, 'playwright.config.mjs'), `
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  retries: 0,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    trace: 'on',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
`)
    await writeFile(path.join(tmp, 'demo.spec.ts'), `
import { expect, test } from '@playwright/test'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l5Ta2QAAAABJRU5ErkJggg==', 'base64')

test('checkout flow demo', async ({ page }, testInfo) => {
  await page.route('**/style.css', route => route.fulfill({
    contentType: 'text/css',
    body: \`body{font-family:system-ui;margin:40px;background:#0f172a;color:#e2e8f0}
      .card{background:#1e293b;padding:24px;border-radius:12px;max-width:520px;box-shadow:0 10px 40px rgba(0,0,0,.4)}
      h1{margin:0 0 8px;color:#f59e0b} button{background:#f59e0b;color:#000;border:0;padding:10px 16px;border-radius:8px;font-weight:600;cursor:pointer}
      input{padding:8px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#fff;margin-right:8px}\`,
  }))
  await page.route('**/logo.png', route => route.fulfill({ contentType: 'image/png', body: PNG }))

  await page.setContent(\`<!doctype html><html><head>
    <link rel="stylesheet" href="https://demo.kinora.dev/style.css">
    </head><body>
    <div class="card">
      <img src="https://demo.kinora.dev/logo.png" width="32" height="32" alt="Kinora logo">
      <h1 id="title">Checkout flow</h1>
      <p>Sample page for the Kinora trace viewer.</p>
      <input id="customer" placeholder="customer name">
      <button id="complete">Complete order</button>
    </div>
    <script>
      document.getElementById('complete').addEventListener('click', () => {
        console.log('order submitted, customer =', document.getElementById('customer').value);
        console.warn('demo warning from checkout flow');
        document.getElementById('title').textContent = 'Order complete';
      });
    </script>
  </body></html>\`, { baseURL: 'https://demo.kinora.dev' })

  await page.fill('#customer', 'Alex')
  await page.click('#complete')
  await expect(page.locator('#title')).toHaveText('Order complete')

  await testInfo.attach('screenshot', { body: await page.screenshot(), contentType: 'image/png' })
  await testInfo.attach('note', { body: 'Demo trace generated for Kinora', contentType: 'text/plain' })
})
`)

    await execFileAsync(playwrightBin, ['test', '--config', 'playwright.config.mjs'], { cwd: tmp })
    const trace = await findTraceZip(path.join(tmp, 'test-results'))
    await writeFile(path.join(fixtures, 'demo.zip'), await readFile(trace))
    console.log(`Generated ${path.relative(process.cwd(), path.join(fixtures, 'demo.zip'))}`)
  }
  finally {
    await rm(tmp, { force: true, recursive: true })
  }
}

async function findTraceZip(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  const entry = entries.find(entry => entry.isFile() && entry.name === 'trace.zip')
  if (!entry)
    throw new Error(`Could not find trace.zip under ${dir}`)
  return path.join(entry.parentPath, entry.name)
}

async function generateAriaTrace() {
  const source = path.join(fixtures, 'demo.zip')
  const target = path.join(fixtures, 'aria-trace.zip')
  const ariaFile = 'resources/aria-checkout.yml'
  const ariaText = `- document:
  - heading "Order complete" [level=1]
  - textbox "customer name": Alex
  - button "Complete order"
`

  const entries = await readZip(source)
  const libraryTraceEntry = [...entries.keys()].find((name) => {
    if (!/^\d+-trace\.trace$/.test(name))
      return false
    const trace = decode(entries.get(name))
    return !!trace && !!tryFindEvent(trace, event => event.type === 'before' && event.method === 'click' && event.params?.selector === '#complete')
  })
  const trace = libraryTraceEntry ? decode(entries.get(libraryTraceEntry)) : undefined
  const testTrace = decode(entries.get('test.trace'))
  if (!trace || !testTrace || !libraryTraceEntry)
    throw new Error('demo.zip is missing trace files')

  const libraryClick = findEvent(trace, event => event.type === 'before' && event.method === 'click' && event.params?.selector === '#complete')
  const testClick = findEvent(testTrace, event => event.type === 'before' && String(event.params?.selector ?? event.params?.locator ?? '').includes('#complete'))
  const pageId = libraryClick?.pageId ?? 'page@kinora-demo'
  const timestamp = libraryClick?.startTime ?? 0
  const events = [
    { type: 'aria-snapshot', callId: libraryClick.callId, phase: 'action', pageId, timestamp, file: ariaFile },
    { type: 'aria-snapshot', callId: libraryClick.callId, phase: 'after', pageId, timestamp, file: ariaFile },
    { type: 'aria-snapshot', callId: testClick.callId, phase: 'action', pageId, timestamp, file: ariaFile },
    { type: 'aria-snapshot', callId: testClick.callId, phase: 'after', pageId, timestamp, file: ariaFile },
  ]
  entries.set(libraryTraceEntry, encode(`${trace.trimEnd()}\n${events.map(event => JSON.stringify(event)).join('\n')}\n`))
  entries.set(ariaFile, encode(ariaText))

  await writeZip(target, entries)
  console.log(`Generated ${path.relative(process.cwd(), target)}`)
}

function tryFindEvent(trace, predicate) {
  for (const line of trace.split('\n')) {
    if (!line.trim())
      continue
    const event = JSON.parse(line)
    if (predicate(event))
      return event
  }
}

function findEvent(trace, predicate) {
  const event = tryFindEvent(trace, predicate)
  if (!event)
    throw new Error('Could not find expected trace event')
  return event
}

async function readZip(file) {
  const bytes = await readFile(file)
  const reader = new ZipReader(new BlobReader(new Blob([bytes])))
  const entries = new Map()
  for (const entry of await reader.getEntries()) {
    if (!entry.getData)
      continue
    const blob = await entry.getData(new BlobWriter())
    entries.set(entry.filename, new Uint8Array(await blob.arrayBuffer()))
  }
  await reader.close()
  return entries
}

async function writeZip(file, entries) {
  await mkdir(path.dirname(file), { recursive: true })
  const writer = new ZipWriter(new BlobWriter('application/zip'))
  for (const [name, bytes] of entries)
    await writer.add(name, new BlobReader(new Blob([bytes])))
  const blob = await writer.close()
  await writeFile(file, Buffer.from(await blob.arrayBuffer()))
}

function decode(value) {
  return value ? new TextDecoder().decode(value) : undefined
}

function encode(value) {
  return new TextEncoder().encode(value)
}

async function sanitizeFixturePaths() {
  for (const name of await readdir(fixtures)) {
    if (!name.endsWith('.zip'))
      continue
    const file = path.join(fixtures, name)
    const entries = await readZip(file)
    let changed = false

    for (const [entryName, bytes] of [...entries]) {
      if (!isTextEntry(entryName))
        continue
      const text = decode(bytes)
      const sanitized = sanitizeText(text, entries)
      if (sanitized !== text) {
        entries.set(entryName, encode(sanitized))
        changed = true
      }
    }

    if (changed) {
      await writeZip(file, entries)
      console.log(`Sanitized ${path.relative(process.cwd(), file)}`)
    }
  }
}

function isTextEntry(name) {
  return name.endsWith('.trace') || name.endsWith('.stacks') || name.endsWith('.network') || name.startsWith('src/') || name.startsWith('resources/src@')
}

function sanitizeText(text, entries) {
  return text.replace(/\/(?:private\/)?Users\/joris\/workspace\/kinora[^"'\\\s,}]*/g, path => sanitizePath(path, entries))
    .replace(/\/tmp\/claude-1000\/-home-joris-workspace-kinora[^"'\\\s,}]*/g, path => sanitizePath(path, entries))
}

function sanitizePath(original, entries) {
  let sanitized = original
    .replace(/\/(?:private\/)?Users\/joris\/workspace\/kinora/g, '/tmp/kinora-public-demo')
    .replace(/\/tmp\/claude-1000\/-home-joris-workspace-kinora\/[a-f0-9-]+\/scratchpad\/vidrepro/g, '/tmp/kinora-public-demo/video')
    .replace(/\/tmp\/claude-1000\/-home-joris-workspace-kinora\/[a-f0-9-]+\/scratchpad/g, '/tmp/kinora-public-demo')
  sanitized = sanitized.replaceAll('joris', 'demo')
  duplicateLegacySource(original, sanitized, entries)
  return sanitized
}

function duplicateLegacySource(original, sanitized, entries) {
  const oldName = `resources/src@${sha1(original)}.txt`
  const source = entries.get(oldName)
  if (!source)
    return
  entries.set(`resources/src@${sha1(sanitized)}.txt`, source)
}

function sha1(value) {
  return createHash('sha1').update(value).digest('hex')
}
