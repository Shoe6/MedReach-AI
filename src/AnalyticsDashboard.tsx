import { useEffect, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts'
import { API_BASE_URL, apiFetch } from './apiClient'

interface QualityTrend {
  date: string
  quality_score: number
  record_count: number
}

interface Distribution {
  label: string
  count: number
  percentage: number
}

interface Analytics {
  quality_trends: QualityTrend[]
  specialty_distribution: Distribution[]
  geographic_coverage: Distribution[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isPercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
}

function parseAnalytics(value: unknown, companyId: string): Analytics {
  if (!isObject(value)) throw new Error('Invalid analytics response: expected an object.')
  if (value.company_id !== undefined && value.company_id !== companyId) {
    throw new Error('Analytics response belongs to a different company.')
  }
  if (!Array.isArray(value.quality_trends)) {
    throw new Error('Invalid analytics response: quality_trends must be an array.')
  }
  const quality_trends = value.quality_trends.map((point: unknown) => {
    if (!isObject(point) || typeof point.date !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(point.date)
      || !Number.isFinite(Date.parse(point.date))
      || !isPercent(point.quality_score) || !isCount(point.record_count)) {
      throw new Error('Invalid analytics response: malformed quality trend.')
    }
    return { date: point.date, quality_score: point.quality_score, record_count: point.record_count }
  }).sort((a, b) => a.date.localeCompare(b.date))

  const distribution = (items: unknown, field: string): Distribution[] => {
    if (!Array.isArray(items)) throw new Error(`Invalid analytics response: ${field} distribution must be an array.`)
    return items.map((item: unknown) => {
      if (!isObject(item) || typeof item[field] !== 'string' || !item[field].trim()
        || !isCount(item.count) || !isPercent(item.percentage)) {
        throw new Error(`Invalid analytics response: malformed ${field} distribution.`)
      }
      return { label: item[field], count: item.count, percentage: item.percentage }
    })
  }

  return {
    quality_trends,
    specialty_distribution: distribution(value.specialty_distribution, 'specialty'),
    geographic_coverage: distribution(value.geographic_coverage, 'state'),
  }
}

async function fetchAnalytics(companyId: string, signal: AbortSignal): Promise<Analytics> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/companies/${encodeURIComponent(companyId)}/analytics`,
    { signal },
  )
  if (!response.ok) {
    const body = await response.text()
    let detail = body
    try {
      const error: unknown = JSON.parse(body)
      if (isObject(error) && typeof error.detail === 'string') detail = error.detail
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
    }
    throw new Error(`Analytics request failed (${response.status})${detail ? `: ${detail}` : '.'}`)
  }
  return parseAnalytics(await response.json(), companyId)
}

function DistributionTable({ title, label, rows }: {
  title: string; label: string; rows: Distribution[]
}) {
  return (
    <section className="bg-white rounded-[8px] border border-[#CBD5E0] p-4 min-w-0">
      <h3 className="text-[15px] font-bold text-[#1B3A6B] mb-4">{title}</h3>
      {rows.length === 0 ? <p className="text-[13px] text-[#718096]">No {title.toLowerCase()} data available.</p> : (
        <div className="overflow-auto max-h-96">
          <table className="data-table w-full border-collapse">
            <thead><tr><th>{label}</th><th>HCP records</th><th>Coverage</th></tr></thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{row.count.toLocaleString()}</td>
                  <td>{row.percentage.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default function AnalyticsDashboard({ companyId }: { companyId: string }) {
  const [data, setData] = useState<Analytics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      setError(null)
      setData(null)
      try {
        const result = await fetchAnalytics(companyId, controller.signal)
        if (!controller.signal.aborted) setData(result)
      } catch (failure) {
        if (!controller.signal.aborted) {
          setError(failure instanceof Error ? failure.message : 'Unable to load analytics.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [companyId, attempt])

  if (loading) {
    return (
      <div role="status" aria-busy="true" className="flex items-center gap-3 p-8 text-[#1B3A6B]">
        <span aria-hidden="true" className="w-5 h-5 rounded-full border-2 border-[#CBD5E0] border-t-[#2E86AB] animate-spin" />
        Loading analytics...
      </div>
    )
  }
  if (error || !data) {
    return (
      <div role="alert" className="rounded-[8px] border border-red-200 bg-red-50 p-4">
        <p className="font-bold text-[#C0392B]">Unable to load analytics</p>
        <p className="text-[13px] mt-1 whitespace-pre-wrap">{error || 'No analytics response received.'}</p>
        <button type="button" className="mt-3 text-[13px] font-bold text-[#1B3A6B] underline"
          onClick={() => setAttempt(value => value + 1)}>Retry</button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-[8px] border border-[#CBD5E0] p-4">
        <h3 className="text-[15px] font-bold text-[#1B3A6B] mb-2">Quality trends</h3>
        <p className="text-[12px] text-[#718096] mb-4">Daily quality scores for dated record cohorts, not historical whole-dataset snapshots.</p>
        {data.quality_trends.length === 0 ? (
          <p className="text-[13px] text-[#718096]">No dated quality records available.</p>
        ) : (
          <>
            <div className="h-64 min-w-0" aria-label="Quality score trend chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.quality_trends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EDF2F7" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="linear" dataKey="quality_score" name="Quality score (%)" stroke="#2E86AB" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <details className="text-[12px] mt-3">
              <summary className="cursor-pointer text-[#1B3A6B]">View quality trend data</summary>
              <table className="data-table w-full border-collapse mt-2">
                <thead><tr><th>Date (UTC)</th><th>HCP records</th><th>Quality score</th></tr></thead>
                <tbody>{data.quality_trends.map(point => (
                  <tr key={point.date}><td>{point.date}</td><td>{point.record_count.toLocaleString()}</td><td>{point.quality_score}%</td></tr>
                ))}</tbody>
              </table>
            </details>
          </>
        )}
      </section>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DistributionTable title="Specialty distribution" label="Specialty" rows={data.specialty_distribution} />
        <DistributionTable title="Geographic coverage" label="State / region" rows={data.geographic_coverage} />
      </div>
    </div>
  )
}
