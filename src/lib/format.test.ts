import { describe, expect, it } from 'vitest'
import { downloadCsv, formatDate, formatMW, formatSigned, formatTime } from './format'

describe('wind forecast formatting', () => {
  it('preserves missing values as N/A', () => {
    expect(formatMW(null)).toBe('N/A')
    expect(formatSigned(undefined)).toBe('N/A')
  })

  it('makes the error sign explicit', () => {
    expect(formatSigned(533)).toBe('+533 MW')
    expect(formatSigned(-217)).toBe('-217 MW')
    expect(formatSigned(0)).toBe('0 MW')
  })

  it('uses UTC and unambiguous delivery dates', () => {
    expect(formatDate('2026-02-01')).toBe('01 Feb 2026')
    expect(formatTime('2026-01-11T00:30:00Z')).toBe('00:30')
  })

  it('does not create an empty CSV export', () => {
    expect(downloadCsv('empty.csv', [])).toBe(false)
  })
})
