export interface CodeownersRule {
  pattern: string
  owners: string[]
  line: number
}

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\//, '')
}

function escapeRegex(char: string): string {
  return /[|\\{}()[\]^$+?.]/.test(char) ? `\\${char}` : char
}

function globToRegexSource(pattern: string): string {
  let out = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        out += '.*'
        i++
      }
      else {
        out += '[^/]*'
      }
    }
    else if (c === '?') {
      out += '[^/]'
    }
    else {
      out += escapeRegex(c)
    }
  }
  return out
}

export function parseCodeowners(text: string | null | undefined): CodeownersRule[] {
  if (!text)
    return []

  const rules: CodeownersRule[] = []
  const lines = text.split(/\r?\n/)
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim()
    if (!line || line.startsWith('#'))
      continue

    const [pattern, ...owners] = line.split(/\s+/)
    if (!pattern || owners.length === 0)
      continue
    if (pattern.startsWith('!'))
      continue

    rules.push({ pattern, owners, line: index + 1 })
  }
  return rules
}

export function matchCodeowners(rules: CodeownersRule[], file: string): string[] {
  const normalizedFile = normalizePath(file)
  let match: CodeownersRule | undefined

  for (const rule of rules) {
    const raw = rule.pattern.trim()
    if (!raw)
      continue

    const rooted = raw.startsWith('/')
    let pattern = normalizePath(raw)
    if (pattern.endsWith('/'))
      pattern = `${pattern}**`

    const hasSlash = pattern.includes('/')
    const source = globToRegexSource(pattern)
    const regex = rooted
      ? new RegExp(`^${source}$`)
      : hasSlash
        ? new RegExp(`^(?:.*/)?${source}$`)
        : new RegExp(`^(?:.*/)?${source}$`)

    if (regex.test(normalizedFile))
      match = rule
  }

  return match?.owners ?? []
}

export function codeOwnersForFile(text: string | null | undefined, file: string): string[] {
  return matchCodeowners(parseCodeowners(text), file)
}
