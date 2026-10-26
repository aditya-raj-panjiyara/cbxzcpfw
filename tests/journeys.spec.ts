import { test, expect, type Page } from '@playwright/test'

const source = { status: 'complete', cached: false, refreshedAt: '2026-02-02T09:15:00Z', forecastRecords: 72, actualRecords: 48, warnings: [] }
const periods = Array.from({ length: 48 }, (_, i) => {
  const start = new Date(Date.UTC(2026, 0, 11, 0, i * 30))
  const end = new Date(start.getTime() + 30 * 60_000)
  const forecast = 9000 - Math.floor(i / 2) * 100
  const actual = forecast - 500 + (i % 2) * 60
  return { startTime: start.toISOString(), endTime: end.toISOString(), forecastStartTime: new Date(Date.UTC(2026, 0, 11, Math.floor(i / 2))).toISOString(), forecast, publishTime: '2026-01-10T17:00:00Z', actual, error: forecast - actual, leadTimeHours: 7 + Math.floor(i / 2) }
})
const pairs = Array.from({ length: 31 }, (_, d) => Array.from({ length: 24 }, (_, h) => {
  const forecast = 8000 + d * 20 + h * 10
  const actual = forecast - ((d + h) % 7) * 100 + 300
  return { decisionDate: `2026-01-${String(d + 1).padStart(2, '0')}`, deliveryDate: new Date(Date.UTC(2026, 0, d + 2)).toISOString().slice(0, 10), startTime: new Date(Date.UTC(2026, 0, d + 2, h)).toISOString(), forecast, actual, publishTime: `2026-01-${String(d + 1).padStart(2, '0')}T17:00:00Z`, error: forecast - actual }
})).flat()

async function mockApi(page: Page) {
  await page.route('**/api/decision-day?**', (route) => route.fulfill({ json: { decisionDate: '2026-01-10', deliveryDate: '2026-01-11', cutoff: '2026-01-10T17:00:00Z', cutoffLocalTime: '17:00', timezone: 'Europe/London', forecastResolution: 'HOURLY', actualResolution: 'HALF_HOURLY', accuracyNote: 'Accuracy metrics compare each hourly forecast with the mean of its two half-hour actuals.', periods, coverage: { forecastHours: 24, expectedForecastHours: 24, actualPeriods: 48, expectedActualPeriods: 48, matchedPeriods: 48 }, source } }))
  await page.route('**/api/revisions?**', (route) => route.fulfill({ json: { decisionDate: '2026-01-10', deliveryStart: '2026-01-11T00:00:00Z', cutoff: '2026-01-10T17:00:00Z', revisions: [
    { publishTime: '2026-01-10T14:00:00Z', generation: 9420, change: null, eligible: true, selected: false },
    { publishTime: '2026-01-10T17:00:00Z', generation: 9000, change: -420, eligible: true, selected: true },
    { publishTime: '2026-01-10T20:00:00Z', generation: 8820, change: -180, eligible: false, selected: false },
  ] } }))
  await page.route('**/api/accuracy?**', (route) => {
    const url = new URL(route.request().url())
    const decisionFrom = url.searchParams.get('decisionFrom') ?? '2026-01-01'
    const decisionTo = url.searchParams.get('decisionTo') ?? '2026-01-31'
    const deliveryFrom = url.searchParams.get('deliveryFrom')
    const deliveryTo = url.searchParams.get('deliveryTo')
    const fromTime = url.searchParams.get('fromTime')
    const toTime = url.searchParams.get('toTime')
    const filtered = pairs.filter((p) => p.decisionDate >= decisionFrom && p.decisionDate <= decisionTo && (!deliveryFrom || p.deliveryDate >= deliveryFrom) && (!deliveryTo || p.deliveryDate <= deliveryTo) && (!fromTime || p.startTime.slice(11, 16) >= fromTime) && (!toTime || p.startTime.slice(11, 16) <= toTime))
    const errors = filtered.map((p) => p.error)
    const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
    const sorted = [...errors].sort((a, b) => a - b)
    return route.fulfill({ json: { decisionFrom, decisionTo, metrics: { mae: mean(errors.map(Math.abs)), rmse: errors.length ? Math.sqrt(mean(errors.map((e) => e * e))!) : null, bias: mean(errors) }, pairs: filtered, coverage: { matchedPairs: filtered.length, excludedPairs: 744 - filtered.length, loadedDecisions: 31, requestedDecisions: 31 }, errorRange: { p05: sorted[Math.floor(sorted.length * .05)] ?? null, p95: sorted[Math.floor(sorted.length * .95)] ?? null, sampleSize: filtered.length, minimumSample: 30 }, source } })
  })
}

test.beforeEach(async ({ page }) => { await mockApi(page) })

test('Decision Day shows 48 periods and only the cutoff forecast is selected', async ({ page }, testInfo) => {
  await page.goto('/decision-day?decisionDate=2026-01-10')
  await expect(page.getByRole('heading', { name: 'National wind generation' })).toBeVisible()
  await expect(page.locator('.data-table tbody tr')).toHaveCount(48)
  await page.screenshot({ path: testInfo.outputPath('decision-desktop.png'), fullPage: false })
  await page.getByRole('button', { name: 'Open', exact: true }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText('After cutoff · review only')).toBeVisible()
  await expect(page.locator('.selected-revision')).toContainText('17:00')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV' }).click()
  expect((await download).suggestedFilename()).toBe('wind-decision-2026-01-10.csv')
})

test('Accuracy filters, Back navigation, CSV and drill-down stay in sync', async ({ page }, testInfo) => {
  await page.goto('/accuracy')
  await expect(page.locator('.coverage-line')).toContainText('744 matched pairs')
  await page.screenshot({ path: testInfo.outputPath('accuracy-desktop.png'), fullPage: false })
  await page.getByText('Time of day', { exact: false }).click()
  await page.locator('input[type="time"]').first().fill('12:00')
  await page.locator('input[type="time"]').last().fill('12:00')
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect(page.locator('.coverage-line')).toContainText('31 matched pairs')
  await expect(page).toHaveURL(/fromTime=12%3A00/)
  await page.goBack()
  await expect(page.locator('.coverage-line')).toContainText('744 matched pairs')
  await expect(page.locator('input[type="time"]').first()).toHaveValue('')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV' }).click()
  expect((await download).suggestedFilename()).toContain('wind-accuracy-')
  await page.goto('/accuracy?decisionFrom=2026-01-10&decisionTo=2026-01-10')
  await expect(page.locator('.coverage-line')).toContainText('24 matched pairs')
  await page.getByRole('link', { name: 'Inspect' }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page).toHaveURL(/decision-day.*deliveryStart/)
})

test('Data status is keyboard-dismissible', async ({ page }) => {
  await page.goto('/decision-day')
  await page.getByRole('button', { name: 'Data status', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Elexon WINDFOR')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('Source failures explain that no zero substitution occurred', async ({ page }) => {
  await page.unroute('**/api/decision-day?**')
  await page.route('**/api/decision-day?**', (route) => route.fulfill({ status: 503, json: { detail: 'Elexon source unavailable.' } }))
  await page.goto('/decision-day')
  await expect(page.getByRole('alert')).toContainText('Elexon source unavailable.')
  await expect(page.getByRole('alert')).toContainText('No forecast values have been substituted or treated as zero.')
})

test('Mobile layout keeps the page within the viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/decision-day?decisionDate=2026-01-10')
  await expect(page.locator('.data-table tbody tr')).toHaveCount(48)
  const widths = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: window.innerWidth }))
  expect(widths.body).toBeLessThanOrEqual(widths.viewport)
  await page.screenshot({ path: testInfo.outputPath('decision-mobile.png'), fullPage: false })
})
