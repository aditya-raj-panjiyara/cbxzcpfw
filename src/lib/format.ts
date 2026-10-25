export const numberFormat = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })
export const decimalFormat = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 })

export function formatNumber(value: number | null | undefined) {
  return value == null ? 'N/A' : numberFormat.format(value)
}

export function formatMW(value: number | null | undefined) {
  return value == null ? 'N/A' : `${numberFormat.format(value)} MW`
}

export function formatSigned(value: number | null | undefined) {
  if (value == null) return 'N/A'
  return `${value > 0 ? '+' : ''}${numberFormat.format(value)} MW`
}

export function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
  const date = value.includes('T') ? new Date(value) : new Date(`${value}T00:00:00Z`)
  return new Intl.DateTimeFormat('en-GB', options ?? { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date)
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(new Date(value))
}

export function formatDateTime(value?: string | null) {
  if (!value) return 'Not available'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC', timeZoneName: 'short',
  }).format(new Date(value))
}

export function downloadCsv(filename: string, rows: Record<string, string | number | null>[]) {
  if (!rows.length) return false
  const headers = Object.keys(rows[0])
  const escape = (value: string | number | null) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = [headers.map(escape).join(','), ...rows.map((row) => headers.map((key) => escape(row[key])).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
  return true
}
