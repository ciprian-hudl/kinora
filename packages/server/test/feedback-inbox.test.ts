import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendFeedback } from '../src/lib/feedback-inbox'

const config = { url: 'https://inbox.example.com/', key: 'inbox-key' }

const feedback = { type: 'bug' as const, title: 'Flaky badge stays', description: 'After the fix', userEmail: 'a@b.dev', appVersion: '0.4.0' }

describe('feedback inbox', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the feedback with the inbox key', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ id: 7 }, { status: 201 }))
    vi.stubGlobal('fetch', fetch)

    expect(await sendFeedback(feedback, config)).toEqual({ id: 7 })
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://inbox.example.com/ingest/feedback')
    expect(new Headers(init!.headers).get('authorization')).toBe('Bearer inbox-key')
    expect(JSON.parse(String(init!.body))).toEqual(feedback)
  })

  it('refuses to send when no inbox is configured (self-host)', async () => {
    await expect(sendFeedback(feedback, null)).rejects.toThrow('not configured')
  })

  it('fails when the inbox refuses it', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: 'unauthorized' }, { status: 401 }))
    await expect(sendFeedback(feedback, config)).rejects.toThrow('Feedback inbox request failed (401)')
  })
})
