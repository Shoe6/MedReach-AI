import { useState, useEffect, ReactNode } from 'react'

// ─── COLOR PALETTE (matches App.tsx) ──────────────────────────────────────────
const C = {
  navy: '#1B3A6B',
  corpBlue: '#2E86AB',
  teal: '#028090',
  success: '#2D6A4F',
  warning: '#E67E22',
  danger: '#C0392B',
  darkText: '#1A1A2E',
  midText: '#718096',
  border: '#CBD5E0',
  lightTint: '#EBF4FA',
}

// ─── ICONS (subset from App.tsx) ──────────────────────────────────────────────
const Icon = {
  spinner: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <path d="M21 12a9 9 0 11-6.219-8.56"/>
    </svg>
  ),
  users: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  alertTriangle: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  checkCircle: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  ),
}

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface DashboardMetrics {
  company_id: string
  total_healthcare_professionals: number
  data_health_score: number
  unresolved_validation_flags: number
  last_updated: string
}

interface ExecutiveMetricCardsProps {
  companyId: string
  apiBaseUrl?: string
}

// ─── SKELETON LOADER ──────────────────────────────────────────────────────────
function MetricSkeleton() {
  return (
    <div className="bg-white rounded-[8px] border border-[#CBD5E0] p-4 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="h-3 w-24 bg-[#E2E8F0] rounded"></div>
        <div className="h-4 w-4 bg-[#E2E8F0] rounded"></div>
      </div>
      <div className="h-10 w-32 bg-[#E2E8F0] rounded mb-2"></div>
      <div className="h-3 w-40 bg-[#E2E8F0] rounded"></div>
    </div>
  )
}

// ─── METRIC CARD COMPONENT ────────────────────────────────────────────────────
function MetricCard({
  label,
  value,
  subtitle,
  color,
  icon,
}: {
  label: string
  value: string | number
  subtitle: string
  color: string
  icon: ReactNode
}) {
  return (
    <div className="bg-white rounded-[8px] border border-[#CBD5E0] p-4 transition-all hover:shadow-md">
      <div className="flex items-start justify-between mb-3">
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: C.midText }}>
          {label}
        </span>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="text-[32px] font-bold leading-none mb-1" style={{ fontFamily: 'Calibri, Georgia, serif', color }}>
        {value}
      </div>
      <p className="text-[11px]" style={{ color: C.midText }}>
        {subtitle}
      </p>
    </div>
  )
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export function ExecutiveMetricCards({
  companyId,
  apiBaseUrl = 'http://localhost:8000',
}: ExecutiveMetricCardsProps) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch metrics on component mount
  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await globalThis.fetch(
          `${apiBaseUrl}/api/companies/${encodeURIComponent(companyId)}/dashboard_metrics`
        )
        
        if (!response.ok) {
          throw new Error(`Failed to fetch metrics: ${response.statusText}`)
        }
        
        const data: DashboardMetrics = await response.json()
        setMetrics(data)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        setError(errorMessage)
        globalThis.console.error('Failed to fetch dashboard metrics:', err)
      } finally {
        setLoading(false)
      }
    }

    if (companyId) {
      fetchMetrics()
    }
  }, [companyId, apiBaseUrl])

  // Show skeleton loaders while loading
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8" aria-busy="true" aria-label="Loading executive metrics">
        <MetricSkeleton />
        <MetricSkeleton />
        <MetricSkeleton />
      </div>
    )
  }

  // Show error state
  if (error || !metrics) {
    return (
      <div className="bg-white rounded-[8px] border border-[#FEE2E2] p-6 mb-8">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#FEE2E2', color: C.danger }}>
            {Icon.alertTriangle}
          </div>
          <div>
            <p className="text-[14px] font-bold mb-1" style={{ color: C.danger }}>
              Unable to load executive metrics
            </p>
            <p className="text-[12px]" style={{ color: C.darkText }}>
              {error || 'No data available for this company.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Format the health score with appropriate styling
  const healthScoreColor = 
    metrics.data_health_score >= 80 ? C.success :
    metrics.data_health_score >= 65 ? C.warning :
    C.danger

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {/* Total Healthcare Professionals */}
      <MetricCard
        label="Total Processed Healthcare Professionals"
        value={metrics.total_healthcare_professionals.toLocaleString()}
        subtitle="Across all uploads and validations"
        color={C.navy}
        icon={Icon.users}
      />

      {/* Data Health Score */}
      <MetricCard
        label="Company-Wide Data Health Score"
        value={`${Math.round(metrics.data_health_score)}%`}
        subtitle={
          metrics.data_health_score >= 80
            ? '✓ Excellent data quality'
            : metrics.data_health_score >= 65
            ? '⚠ Good quality, improvements needed'
            : '✕ Quality below target threshold'
        }
        color={healthScoreColor}
        icon={
          metrics.data_health_score >= 80 ? Icon.checkCircle :
          metrics.data_health_score >= 65 ? Icon.alertTriangle :
          Icon.alertTriangle
        }
      />

      {/* Unresolved Validation Flags */}
      <MetricCard
        label="Unresolved Validation Flags"
        value={metrics.unresolved_validation_flags}
        subtitle={
          metrics.unresolved_validation_flags === 0
            ? 'All data issues resolved'
            : `${metrics.unresolved_validation_flags} issues require attention`
        }
        color={metrics.unresolved_validation_flags === 0 ? C.success : C.danger}
        icon={metrics.unresolved_validation_flags === 0 ? Icon.checkCircle : Icon.alertTriangle}
      />
    </div>
  )
}

export default ExecutiveMetricCards
