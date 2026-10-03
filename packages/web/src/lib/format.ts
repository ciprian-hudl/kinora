export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${Math.round(value * 10) / 10} ${units[unit]}`
}

// Polar amounts are in cents and can be fractions of one (a $0.004 unit price).
export function money(cents: number, currency: string): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 2, maximumFractionDigits: 4 })
}
