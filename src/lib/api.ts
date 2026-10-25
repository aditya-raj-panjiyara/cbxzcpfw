import type { AccuracyResponse, DecisionDay, RevisionResponse } from '@/types/wind'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { headers: { Accept: 'application/json' } })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = payload?.detail ?? `The data request failed (${response.status}).`
    throw new Error(typeof message === 'string' ? message : 'The data request failed.')
  }
  return payload as T
}

export function getDecisionDay(decisionDate: string, signal?: AbortSignal) {
  return request<DecisionDay>(`/api/decision-day?decisionDate=${encodeURIComponent(decisionDate)}`).catch((error) => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    throw error
  })
}

export function getRevisions(decisionDate: string, deliveryStart: string) {
  return request<RevisionResponse>(`/api/revisions?decisionDate=${encodeURIComponent(decisionDate)}&deliveryStart=${encodeURIComponent(deliveryStart)}`)
}

export function getAccuracy(params: URLSearchParams) {
  return request<AccuracyResponse>(`/api/accuracy?${params.toString()}`)
}
