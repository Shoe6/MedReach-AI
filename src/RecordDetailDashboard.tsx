// Record-level detail panel used by DataReviewScreen. Reacts to a record selected
// from the flagged-records table below it (MA-62).
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

  const providerName = `${text(selectedRecord.first_name)} ${text(selectedRecord.last_name)}`.trim()
    || text(selectedRecord.provider_id) || text(selectedRecord.npi) || 'Unknown provider'
  const npi = text(selectedRecord.npi) || text(selectedRecord.NPI) || 'Unknown'
  const payerName = text(selectedRecord.payer_name) || text(selectedRecord.payerName) || 'Not reported'
  const email = text(selectedRecord.email) || text(selectedRecord.email_address)
  const phone = text(selectedRecord.phone) || text(selectedRecord.phone_number)
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
        {!email && badge('Missing email', '#991B1B', '#FEE2E2')}
        {!phone && badge('Missing phone', '#991B1B', '#FEE2E2')}
        {!isAnomaly && !isDuplicate && email && phone && badge('No open flags', '#1B5E3B', '#E8F5EF')}
      </div>

      <div className="grid grid-cols-2 gap-3 text-[12px]" style={{ color: '#1A1A2E' }}>
        <div><span className="font-semibold">Payer:</span> {payerName}</div>
        <div><span className="font-semibold">Email:</span> {email || 'Not on file'}</div>
        <div><span className="font-semibold">Phone:</span> {phone || 'Not on file'}</div>
        <div><span className="font-semibold">Dedup status:</span> {text(selectedRecord.deduplication_status) || (isDuplicate ? 'Merged' : 'Unique')}</div>
      </div>
    </div>
  )
}
