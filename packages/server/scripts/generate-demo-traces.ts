import type { DemoTrace } from './demo-traces'
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { stripAnsi } from '@kinora/core'
import { DEMO_TRACES_DIR } from './demo-traces'

// Runs the demo suite (demo-traces/suite) and stores one trace.zip per test plus a
// manifest in demo-traces/traces, which seed-market uploads for the matching seeded tests.
// Some tests fail on purpose: their real error lands in the manifest so the dashboard
// shows the same failure as the trace.

const execFileAsync = promisify(execFile)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const suite = path.join(root, 'demo-traces/suite')
const out = fileURLToPath(DEMO_TRACES_DIR)

interface JsonError { message?: string, location?: { file: string, line: number, column: number } }
interface JsonResult { status: string, error?: JsonError, attachments: { name: string, path?: string }[] }
interface JsonSpec { title: string, file: string, line: number, column: number, tests: { results: JsonResult[] }[] }
interface JsonSuite { specs?: JsonSpec[], suites?: JsonSuite[] }

// The suite and Playwright itself are copied out of the repo, so trace paths are neutral: a
// failure records Playwright's own stack frames, which would otherwise carry the home directory.
// (A symlink to node_modules is not enough: Node resolves it back to the real path.)
const tmpRoot = process.platform === 'win32' ? os.tmpdir() : '/tmp'
const tmp = path.join(tmpRoot, 'kinora-demo-traces')
const playwrightBin = path.join(tmp, 'node_modules/@playwright/test/cli.js')

await rm(tmp, { force: true, recursive: true })
await cp(suite, tmp, { recursive: true })
await writeFile(path.join(tmp, 'package.json'), '{ "type": "module" }\n')
const fromTest = createRequire(path.join(root, 'node_modules/@playwright/test/package.json'))
for (const name of ['@playwright/test', 'playwright', 'playwright-core']) {
  const dir = name === '@playwright/test' ? path.join(root, 'node_modules/@playwright/test') : path.dirname(fromTest.resolve(`${name}/package.json`))
  await cp(dir, path.join(tmp, 'node_modules', name), { recursive: true, dereference: true, filter: src => !src.startsWith(path.join(dir, 'node_modules')) })
}

try {
  // Visual tests first record their reference from the fixed components, so the real run
  // below fails them with expected / actual / diff images rendered by the same browser.
  await execFileAsync(process.execPath, [playwrightBin, 'test', '--grep', '@visual', '--update-snapshots'], { cwd: tmp, env: { ...process.env, DEMO_BASELINE: '1' } })
  // Exits 1 because of the deliberate failures; the JSON report says what actually ran.
  await execFileAsync(process.execPath, [playwrightBin, 'test'], { cwd: tmp }).catch(() => {})
  const report = JSON.parse(await readFile(path.join(tmp, 'results.json'), 'utf8')) as { suites: JsonSuite[] }

  await rm(out, { force: true, recursive: true })
  await mkdir(out, { recursive: true })
  const traces: DemoTrace[] = []
  for (const spec of specsOf(report.suites)) {
    const result = spec.tests[0].results.at(-1)!
    if (result.status !== 'passed' && result.status !== 'failed')
      throw new Error(`${spec.file} › ${spec.title}: unexpected status ${result.status}`)
    const trace = result.attachments.find(a => a.name === 'trace')?.path
    if (!trace)
      throw new Error(`${spec.file} › ${spec.title}: no trace recorded`)

    const name = `${path.basename(spec.file, '.spec.ts')}--${spec.title.replace(/\W+/g, '-').toLowerCase()}.zip`
    await copyFile(trace, path.join(out, name))
    const screenshots: NonNullable<DemoTrace['screenshots']> = []
    for (const a of result.attachments) {
      if (!a.path || !/-(?:expected|actual|diff)\.png$/.test(a.name))
        continue
      await copyFile(a.path, path.join(out, a.name))
      screenshots.push({ name: a.name, file: a.name })
    }
    traces.push({
      file: spec.file,
      title: spec.title,
      line: spec.line,
      column: spec.column,
      status: result.status,
      trace: name,
      error: result.status === 'failed' ? errorOf(spec, result.error) : undefined,
      screenshots: screenshots.length ? screenshots : undefined,
    })
    console.log(`${result.status.padEnd(6)} ${spec.file} › ${spec.title}`)
  }
  await writeFile(path.join(out, 'manifest.json'), `${JSON.stringify(traces, null, 2)}\n`)
  await assertNoHomePath(traces.map(t => t.trace))
  console.log(`Wrote ${traces.length} traces to ${path.relative(process.cwd(), out)}`)
}
finally {
  await rm(tmp, { force: true, recursive: true })
}

// Guards the point of copying everything to a neutral directory.
async function assertNoHomePath(zips: string[]): Promise<void> {
  const home = Buffer.from(os.homedir())
  for (const zip of zips) {
    const { stdout } = await execFileAsync('unzip', ['-p', path.join(out, zip)], { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 })
    if (stdout.includes(home))
      throw new Error(`${zip} contains the home directory path`)
  }
}

function* specsOf(suites: JsonSuite[]): Generator<JsonSpec> {
  for (const s of suites) {
    yield* s.specs ?? []
    yield* specsOf(s.suites ?? [])
  }
}

// Same shape the reporter uploads: Playwright's message (no code frame) and where it threw.
function errorOf(spec: JsonSpec, error: JsonError | undefined): DemoTrace['error'] {
  const at = error?.location
  return {
    message: stripAnsi(error?.message ?? 'Error').trim(),
    stack: at ? `at ${spec.file}:${at.line}:${at.column}` : `at ${spec.file}:${spec.line}:${spec.column}`,
  }
}
