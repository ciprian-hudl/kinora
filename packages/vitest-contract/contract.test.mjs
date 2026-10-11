// Contract test of @kinora/vitest-reporter: real Vitest browser mode and real Storybook, with the
// reporter uploading to a fake kinora server that records what it receives. The reporter leans on
// Vitest artifacts (experimental) and Storybook test metadata; a Vitest or Storybook upgrade that
// changes their shape fails here, on the dependency's pull request.
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import process from 'node:process'
// node:test, not Vitest: this file drives Vitest runs itself, and nesting them in a Vitest test
// would mix the two runs' configs and reporters.
// eslint-disable-next-line test/no-import-node-test
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const ROOT = fileURLToPath(new URL('.', import.meta.url))
const VITEST = join(ROOT, 'node_modules/vitest/vitest.mjs')
const OUTPUTS = ['.vitest', 'src/__screenshots__', 'src/__traces__', '.vitest-attachments']

const runs = []
const artifacts = []
let server

function vitest(args, env) {
  // A failing test makes Vitest exit non-zero; the output is what matters here.
  return run(process.execPath, [VITEST, 'run', ...args], { cwd: ROOT, env: { ...process.env, CI: '', ...env } })
    .catch(error => error)
}

before(async () => {
  await Promise.all(OUTPUTS.map(dir => rm(join(ROOT, dir), { recursive: true, force: true })))
  server = createServer((req, res) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      res.setHeader('content-type', 'application/json')
      if (req.url === '/api/v1/runs') {
        const payload = JSON.parse(body.toString('utf8'))
        runs.push(payload)
        res.statusCode = 201
        res.end(JSON.stringify({ projectId: 'p', runId: 'run-1', tests: payload.tests.length }))
        return
      }
      // Multipart artifact upload: keep the test key and attachment name.
      const field = name => new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`).exec(body.toString('latin1'))?.[1]
      artifacts.push({ testKey: field('testKey'), name: field('name') })
      res.statusCode = 201
      res.end(JSON.stringify({ url: 'https://example.test/artifact' }))
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`

  // Record the visual reference with one color (no token: nothing uploaded), then run everything
  // with another color so toMatchScreenshot fails with reference, actual and diff images.
  await vitest(['--project=browser', '--update'], { KINORA_TOKEN: '', SWATCH: 'rgb(79, 70, 229)' })
  await vitest([], { KINORA_URL: url, KINORA_TOKEN: 'contract', SWATCH: 'rgb(16, 185, 129)' })
}, { timeout: 240_000 })

after(async () => {
  server?.close()
  await Promise.all(OUTPUTS.map(dir => rm(join(ROOT, dir), { recursive: true, force: true })))
})

const byTitle = title => runs[0]?.tests.find(t => t.title === title)

test('uploads one run with the browser and Storybook tests, without the Node test', () => {
  assert.equal(runs.length, 1)
  assert.deepEqual(runs[0].tests.map(t => t.title).sort(), ['Broken', 'Primary', 'swatch matches its reference'])
  assert.deepEqual(runs[0].run.counts, { total: 3, expected: 1, unexpected: 2, flaky: 0, skipped: 0 })
})

test('collects real test locations', () => {
  for (const t of runs[0].tests)
    assert.ok(t.line > 0, `${t.title} has no line`)
})

test('records Storybook stories as <Component>/<Story>', () => {
  const story = t => t.annotations.find(a => a.type === 'kinora:story')?.description
  assert.equal(story(byTitle('Primary')), 'Button/Primary')
  assert.equal(story(byTitle('Broken')), 'Button/Broken')
  assert.equal(story(byTitle('swatch matches its reference')), undefined)
})

test('strips Storybook\'s local debug link from errors', () => {
  const message = byTitle('Broken').errors[0].message
  assert.doesNotMatch(message, /Click to debug the error directly in Storybook/)
  assert.match(message, /toHaveTextContent/)
})

test('attaches and uploads a trace for every browser test', () => {
  for (const t of runs[0].tests)
    assert.ok(t.attachments.some(a => a.name === 'trace'), `${t.title} has no trace`)
  assert.equal(artifacts.filter(a => a.name === 'trace').length, 3)
})

test('turns a failed toMatchScreenshot into a screenshot comparison', () => {
  const names = byTitle('swatch matches its reference').attachments.map(a => a.name)
  for (const part of ['expected', 'actual', 'diff'])
    assert.ok(names.includes(`swatch-matches-its-reference-${part}.png`), `missing the ${part} image: ${names.join(', ')}`)
  // Uploaded by default, as `snapshot` attachments.
  assert.equal(artifacts.filter(a => a.name?.startsWith('swatch-matches-its-reference-')).length, 3)
})
