#!/usr/bin/env node
import { Buffer } from 'node:buffer'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { BlobReader, BlobWriter, TextReader, ZipReader, ZipWriter } from '@zip.js/zip.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixtures = path.join(root, 'public/fixtures')

await generateAriaTrace()

async function generateAriaTrace() {
  const source = path.join(fixtures, 'demo.zip')
  const target = path.join(fixtures, 'aria-trace.zip')
  const ariaFile = 'resources/aria-click.yml'
  const ariaText = `- document:
  - heading "Submitted!" [level=1]
  - textbox "your name": Joris
  - button "Submit"
`

  const entries = await readZip(source)
  const trace = entries.get('0-trace.trace')
  if (!trace)
    throw new Error('demo.zip is missing 0-trace.trace')

  const events = [
    { type: 'aria-snapshot', callId: 'call@20', phase: 'action', pageId: 'page@a60a383e344ed4187fb339e96bdffd22', timestamp: 1011.789, file: ariaFile },
    { type: 'aria-snapshot', callId: 'call@20', phase: 'after', pageId: 'page@a60a383e344ed4187fb339e96bdffd22', timestamp: 1014.576, file: ariaFile },
    { type: 'aria-snapshot', callId: 'pw:api@46', phase: 'action', pageId: 'page@a60a383e344ed4187fb339e96bdffd22', timestamp: 1011.789, file: ariaFile },
    { type: 'aria-snapshot', callId: 'pw:api@46', phase: 'after', pageId: 'page@a60a383e344ed4187fb339e96bdffd22', timestamp: 1014.576, file: ariaFile },
  ]
  entries.set('0-trace.trace', `${trace.trimEnd()}\n${events.map(event => JSON.stringify(event)).join('\n')}\n`)
  entries.set(ariaFile, ariaText)

  await writeZip(target, entries)
  console.log(`Generated ${path.relative(process.cwd(), target)}`)
}

async function readZip(file) {
  const bytes = await readFile(file)
  const reader = new ZipReader(new BlobReader(new Blob([bytes])))
  const entries = new Map()
  for (const entry of await reader.getEntries()) {
    if (!entry.getData)
      continue
    const blob = await entry.getData(new BlobWriter())
    entries.set(entry.filename, await blob.text())
  }
  await reader.close()
  return entries
}

async function writeZip(file, entries) {
  await mkdir(path.dirname(file), { recursive: true })
  const writer = new ZipWriter(new BlobWriter('application/zip'))
  for (const [name, text] of entries)
    await writer.add(name, new TextReader(text))
  const blob = await writer.close()
  await writeFile(file, Buffer.from(await blob.arrayBuffer()))
}
