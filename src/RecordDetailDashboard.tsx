// Record-level detail panel used by DataReviewScreen. Reacts to a record selected
// from the flagged-records table below it (MA-62).
import { hasReviewField, reviewName, reviewValue } from './dataReview'

interface RecordDetailDashboardProps {
  records: Record<string, unknown>[]
  selectedRecord: Record<string, unknown> | null
  onSelectRecord: (record: Record<string, unknown> | null) => void
}

const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value)).trim()

const isTrueValue = (value: unknown) =>
  value === true || value === -1 || ['true', '1', 'merged'].includes(String(value).toLowerCase())

export default function RecordDetailDashboard({ records, selectedRecord, onSelectRecord }: RecordDetailDashboardProps) {
  if (!selectedRecord) {
    return (
      <div className="mb-6 p-4 rounded-[8px] border text-center" style={{ borderColor: '#CBD5E0', background: '#F7FAFC' }}>
        <p className="text-[13px] font-semibold" style={{ color: '#4A5568' }}>No record selected</p>
        <p className="text-[12px] mt-1" style={{ color: '#4A5568' }}>
          Click a record name in the table below to view its detail here. ({records.length.toLocaleString()} records loaded)
        </p>
      </div>
    )
  }

  const providerName = reviewName(selectedRecord, records.indexOf(selectedRecord))
  const npi = reviewValue(selectedRecord, 'npi') || 'Unknown'
  const payerName = text(selectedRecord.payer_name) || text(selectedRecord.payerName) || 'Not reported'
  const email = reviewValue(selectedRecord, 'email')
  const phone = reviewValue(selectedRecord, 'phone')
  const emailSupplied = hasReviewField(records, 'email')
  const phoneSupplied = hasReviewField(records, 'phone')
  const isAnomaly = selectedRecord.anomaly_flag === -1 || selectedRecord.anomaly_flag === '-1' || isTrueValue(selectedRecord.is_anomaly)
  const isDuplicate = isTrueValue(selectedRecord.is_duplicate) || isTrueValue(selectedRecord.merged_from_sources) || selectedRecord.deduplication_status === 'merged'

  const badge = (label: string, color: string, bg: string) => (
    <span className="inline-flex items-center text-[11px] font-semibold px-[10px] py-[3px] rounded-[20px]" style={{ background: bg, color }}>
      {label}
    </span>
  )

  return (
    <div className="mb-6 p-4 rounded-[8px] border" style={{ borderColor: '#CBD5E0', background: 'white' }}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h4 className="text-[15px] font-bold" style={{ color: '#1B3A6B' }}>{providerName}</h4>
          <p className="text-[11px] mono" style={{ color: '#4A5568' }}>NPI: {npi}</p>
        </div>
        <button className="text-[11px] font-semibold hover:underline" style={{ color: '#2E86AB' }} onClick={() => onSelectRecord(null)}>
          Clear selection
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {isAnomaly && badge('Statistical outlier', '#991B1B', '#FEE2E2')}
        {isDuplicate && badge('Duplicate', '#92400E', '#FEF3C7')}
        {emailSupplied && !email && badge('Missing email', '#991B1B', '#FEE2E2')}
        {phoneSupplied && !phone && badge('Missing phone', '#991B1B', '#FEE2E2')}
      </div>

      <div className="grid grid-cols-2 gap-3 text-[12px]" style={{ color: '#1A1A2E' }}>
        <div><span className="font-semibold">Payer:</span> {payerName}</div>
        <div><span className="font-semibold">Email:</span> {email || (emailSupplied ? 'Not on file' : 'Not supplied')}</div>
        <div><span className="font-semibold">Phone:</span> {phone || (phoneSupplied ? 'Not on file' : 'Not supplied')}</div>
        <div><span className="font-semibold">Dedup status:</span> {text(selectedRecord.deduplication_status) || (isDuplicate ? 'Merged' : 'Unique')}</div>
      </div>
    </div>
  )
}
