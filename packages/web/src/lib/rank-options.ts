// The options containing the search, an exact match first and the rest in the order given.
export function rankOptions(options: string[], search: string): string[] {
  const term = search.trim().toLowerCase()
  if (!term)
    return options
  const hits = options.filter(o => o.toLowerCase().includes(term))
  return [...hits.filter(o => o.toLowerCase() === term), ...hits.filter(o => o.toLowerCase() !== term)]
}
