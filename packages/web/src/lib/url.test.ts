import { describe, expect, it } from 'vitest'
import { commitUrl, httpsUrl } from './url'

describe('httpsUrl', () => {
  it('returns https urls unchanged', () => {
    expect(httpsUrl('https://github.com/org/repo')).toBe('https://github.com/org/repo')
  })

  it('rejects http and other schemes', () => {
    expect(httpsUrl('http://example.com')).toBeUndefined()
    expect(httpsUrl('javascript:alert(1)')).toBeUndefined()
    expect(httpsUrl('data:text/html,<script>')).toBeUndefined()
    expect(httpsUrl('file:///etc/passwd')).toBeUndefined()
  })

  it('rejects non-urls and empty', () => {
    expect(httpsUrl('not a url')).toBeUndefined()
    expect(httpsUrl('')).toBeUndefined()
    expect(httpsUrl(undefined)).toBeUndefined()
    expect(httpsUrl(null)).toBeUndefined()
  })
})

describe('commitUrl', () => {
  it('links a sha to its commit on the repo host', () => {
    expect(commitUrl({ repoUrl: 'https://github.com/org/repo', sha: 'abc123' })).toBe('https://github.com/org/repo/commit/abc123')
    expect(commitUrl({ repoUrl: 'https://gitlab.com/org/repo/', sha: 'abc123' })).toBe('https://gitlab.com/org/repo/commit/abc123')
    expect(commitUrl({ repoUrl: 'https://bitbucket.org/org/repo', sha: 'abc123' })).toBe('https://bitbucket.org/org/repo/commits/abc123')
  })

  it('gives no link without an https repo url or a sha', () => {
    expect(commitUrl({ repoUrl: 'javascript:alert(1)', sha: 'abc123' })).toBeUndefined()
    expect(commitUrl({ sha: 'abc123' })).toBeUndefined()
    expect(commitUrl({ repoUrl: 'https://github.com/org/repo' })).toBeUndefined()
    expect(commitUrl(undefined)).toBeUndefined()
  })
})
