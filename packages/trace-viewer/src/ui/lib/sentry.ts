import type { Breadcrumb, ErrorEvent } from '@sentry/vue'

// The viewer's URLs carry the trace location: a signed artifact link (cloud) or a local file path
// (desktop). Keep origin + path only so neither reaches Sentry.
export function stripQuery(url: string): string {
  const i = url.search(/[?#]/)
  return i === -1 ? url : url.slice(0, i)
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request?.url)
    event.request.url = stripQuery(event.request.url)
  delete event.request?.query_string
  return event
}

// fetch/xhr breadcrumbs carry `url`, navigation ones `from` / `to`.
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const data = breadcrumb.data
  if (data) {
    for (const key of ['url', 'from', 'to']) {
      if (typeof data[key] === 'string')
        data[key] = stripQuery(data[key])
    }
  }
  return breadcrumb
}
