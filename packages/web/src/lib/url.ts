import type { GitMeta } from '@kinora/core'

// Return the URL only if it is https (the only scheme we link out to); blocks javascript:/data:/http
// in href bindings (stored XSS + transport downgrade).
export function httpsUrl(url: string | undefined | null): string | undefined {
  if (!url)
    return undefined
  try {
    return new URL(url).protocol === 'https:' ? url : undefined
  }
  catch {
    return undefined
  }
}

// Link a sha to its commit. github/gitlab use /commit/, bitbucket /commits/.
// repoUrl is only trusted as an href if it's https; a bad value yields no link (guards stored XSS).
export function commitUrl(git: Pick<GitMeta, 'sha' | 'repoUrl'> | undefined): string | undefined {
  const url = httpsUrl(git?.repoUrl)
  if (!url || !git?.sha)
    return undefined
  const seg = new URL(url).hostname === 'bitbucket.org' ? 'commits' : 'commit'
  return `${url.replace(/\/$/, '')}/${seg}/${git.sha}`
}
