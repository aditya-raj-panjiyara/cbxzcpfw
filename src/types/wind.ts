export interface SourceStatus {
  status: string
  cached: boolean
  refreshedAt?: string | null
  warning?: string | null
  warnings?: string[]
  forecastRecords?: number | null
  actualRecords?: number | null
}

export interface Period {
  startTime: string
  endTime: string
  forecastStartTime: string
  forecast: number | null
  publishTime: string | null
  actual: number | null
  error: number | null
  leadTimeHours: number | null
}

export interface DecisionDay {
  decisionDate: string
  deliveryDate: string
  cutoff: string
  cutoffLocalTime: string
  timezone: string
  forecastResolution: 'HOURLY'
  actualResolution: 'HALF_HOURLY'
  accuracyNote: string
  periods: Period[]
  coverage: {
    forecastHours: number
    expectedForecastHours: number
    actualPeriods: number
    expectedActualPeriods: number
    matchedPeriods: number
  }
  source: SourceStatus
}

export interface Revision {
  publishTime: string
  generation: number
  change: number | null
  eligible: boolean
  selected: boolean
}

export interface RevisionResponse {
  decisionDate: string
  deliveryStart: string
  cutoff: string
  revisions: Revision[]
}

export interface AccuracyPair {
  decisionDate: string
  deliveryDate: string
  startTime: string
  forecast: number
  actual: number
  publishTime: string
  error: number
}

export interface AccuracyResponse {
  decisionFrom: string
  decisionTo: string
  metrics: { mae: number | null; rmse: number | null; bias: number | null }
  pairs: AccuracyPair[]
  coverage: {
    matchedPairs: number
    excludedPairs: number
    loadedDecisions: number
    requestedDecisions: number
  }
  errorRange: {
    p05: number | null
    p95: number | null
    sampleSize: number
    minimumSample: number
  }
  source: SourceStatus
}
