<<<<<<< HEAD
import { useEffect, useState } from 'react'

interface RecordDetailDashboardProps {
  records: Record<string, unknown>[]
  selectedRecord?: Record<string, unknown> | null
  onSelectRecord?: (record: Record<string, unknown>) => void
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10.7 10.7 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-3.2 4.3M6.2 6.2C2.9 8.5 1 12 1 12s4 8 11 8a10.8 10.8 0 0 0 3.5-.6" />
    </svg>
  )
}

export default function RecordDetailDashboard({ records, selectedRecord: selectedRecordProp, onSelectRecord }: RecordDetailDashboardProps) {
  const [visible, setVisible] = useState({ email: false, phone: false })
  const [selectedRecord, setSelectedRecord] = useState<Record<string, unknown> | null>(selectedRecordProp || records[0] || null)
  const [piiActions, setPiiActions] = useState<Record<string, 'Anonymized' | 'Removed' | 'Overridden'>>({})
  const safeRecords = Array.isArray(records) ? records : []

  useEffect(() => {
    setSelectedRecord(selectedRecordProp || records[0] || null)
  }, [records, selectedRecordProp])

  const hasAnomaly = (record: Record<string, unknown>) => record.anomaly_flag === -1 || record.anomaly_flag === '-1' || record.is_anomaly === true || record.is_anomaly === 'true'
  const hasDuplicate = (record: Record<string, unknown>) => record.is_duplicate === true || record.is_duplicate === 'true' || record.merged_from_sources === true || record.merged_from_sources === 'true' || record.deduplication_status === 'merged' || record.duplicate_status === true || record.duplicate_status === 'true' || record.duplicate_status === 'duplicate' || record.duplicate_status === 'merged'
  const record = selectedRecord || {}
  const first = (key: string) => String(record[key] ?? '')
  const isAnomaly = hasAnomaly(record)
  const metadata = (record.sunshine_metadata || {}) as Record<string, unknown>
  const piiRows = safeRecords.flatMap((item, index) => {
    const recordId = String(item.record_id || item.npi || index)
    const missingFields = []
    if (!String(item.email || '').trim()) missingFields.push({ field: 'Email', key: `${recordId}:email` })
    if (!String(item.phone || '').trim()) missingFields.push({ field: 'Phone', key: `${recordId}:phone` })
    return missingFields.map(({ field, key }) => ({ item, field, key, originalRecord: item }))
  })
  const currentRecordFlags = piiRows.filter(({ item }) => String(item.npi) === String(selectedRecord?.npi))
  const selectedEmail = String(selectedRecord?.email ?? '').trim()
  const selectedPhone = String(selectedRecord?.phone ?? '').trim()
  const selectedPrescriptionVolume = String(selectedRecord?.prescription_volume ?? '').trim()
  const selectRecord = (nextRecord: Record<string, unknown>) => {
    setSelectedRecord(nextRecord)
    onSelectRecord?.(nextRecord)
  }
  const updatePiiAction = (key: string, action: 'Anonymized' | 'Removed' | 'Overridden') => {
    setPiiActions(current => ({ ...current, [key]: action }))
  }
  const toggle = (field: 'email' | 'phone') => setVisible(current => ({ ...current, [field]: !current[field] }))
  const mask = (value: string | undefined, field: 'email' | 'phone') => {
    if (!value) return 'Not provided'
    if (visible[field]) return value
    if (field === 'phone') return `(***) ***-${value.replace(/\D/g, '').slice(-4)}`
    const [name, domain] = value.split('@')
    return `${name.slice(0, 1)}***@${domain || 'masked'}`
  }

  return (
    <section className="w-full max-w-6xl mx-auto px-4 py-6" aria-label="Provider record detail">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#2E86AB]">Record detail / stakeholder view</p>
          <h1 className="text-3xl font-bold text-[#1A1A2E] mt-1">{first('first_name')} {first('last_name')}</h1>
          <p className="text-sm text-[#4A5568] mt-1">{first('specialty')} <span className="mx-2 text-[#CBD5E0]">•</span> <span className="font-mono">{first('npi') || 'No NPI'}</span></p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="px-3 py-1.5 rounded-full bg-[#E8F5EF] text-[#1B5E3B] text-xs font-bold">NPI {first('npi_status') || 'Unvalidated'}</span>
          {hasDuplicate(record) && <span className="px-3 py-1.5 rounded-full bg-[#EBF4FA] text-[#1B3A6B] text-xs font-bold">Merged from multiple sources</span>}
        </div>
      </div>

      {isAnomaly && (
        <div className="border-l-4 border-[#C0392B] bg-[#FFF5F5] p-4 mb-5" role="alert">
          <div className="flex items-center gap-2 text-[#991B1B] font-bold text-sm"><span aria-hidden="true">!</span> AI anomaly detected</div>
          <p className="text-sm text-[#6B1F1F] mt-1">{first('anomaly_explanation') || 'This record differs materially from its peer group.'}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-5">
        <div className="bg-white border border-[#CBD5E0] rounded-lg p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-[#1B3A6B]">Identity & contact</h2><span className="text-[11px] text-[#4A5568]">Role-based visibility</span></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><p className="text-[11px] uppercase font-bold text-[#718096]">Provider ID</p><p className="font-mono text-sm mt-1">{first('record_id') || 'Unknown'}</p></div>
            <div><p className="text-[11px] uppercase font-bold text-[#718096]">NPI</p><p className="font-mono text-sm mt-1">{first('npi') || 'Not provided'}</p></div>
            <div><p className="text-[11px] uppercase font-bold text-[#718096]">Prescription volume</p><p className="font-mono text-sm mt-1">{selectedPrescriptionVolume || 'Not provided'}</p></div>
            <div className="sm:col-span-2"><p className="text-[11px] uppercase font-bold text-[#718096]">Email</p><div className="flex items-center gap-2 mt-1"><p className="text-sm">{mask(selectedEmail || undefined, 'email')}</p><button type="button" onClick={() => toggle('email')} className="p-1.5 text-[#2E86AB] hover:bg-[#EBF4FA] rounded" aria-label={`${visible.email ? 'Hide' : 'Show'} email`} title={`${visible.email ? 'Hide' : 'Show'} email`}><EyeIcon open={visible.email} /></button></div></div>
            <div className="sm:col-span-2"><p className="text-[11px] uppercase font-bold text-[#718096]">Phone</p><div className="flex items-center gap-2 mt-1"><p className="text-sm">{mask(selectedPhone || undefined, 'phone')}</p><button type="button" onClick={() => toggle('phone')} className="p-1.5 text-[#2E86AB] hover:bg-[#EBF4FA] rounded" aria-label={`${visible.phone ? 'Hide' : 'Show'} phone`} title={`${visible.phone ? 'Hide' : 'Show'} phone`}><EyeIcon open={visible.phone} /></button></div></div>
          </div>
        </div>

        <div className="space-y-5">
          {(record.sunshine_act_flag === true || record.sunshine_act_flag === 'true') && <div className="bg-[#FFFBEB] border border-[#F6C453] rounded-lg p-5"><h2 className="text-lg font-bold text-[#92400E]">Financial relationship</h2><p className="text-2xl font-bold text-[#78350F] mt-2">${Number(metadata.total_amount_usd || 0).toLocaleString()}</p><p className="text-xs text-[#92400E] mt-1">Sunshine Act aggregate</p><div className="mt-3 text-xs text-[#78350F]"><p><b>Payers:</b> {Array.isArray(metadata.pharmaceutical_companies) ? metadata.pharmaceutical_companies.join(', ') : 'Not provided'}</p><p className="mt-1"><b>Relationships:</b> {Array.isArray(metadata.relationship_types) ? metadata.relationship_types.join(', ') : 'Not provided'}</p></div></div>}
          <div className="bg-[#F7FAFC] border border-[#CBD5E0] rounded-lg p-5"><h2 className="text-lg font-bold text-[#1B3A6B]">Pipeline state</h2><div className="flex flex-wrap gap-2 mt-3"><span className="text-xs font-bold px-2.5 py-1 bg-[#E8F5EF] text-[#1B5E3B] rounded">Validated identity</span>{hasDuplicate(record) && <span className="text-xs font-bold px-2.5 py-1 bg-[#FEE2E2] text-[#991B1B] rounded">Duplicate detected</span>}<span className="text-xs font-bold px-2.5 py-1 bg-[#EBF4FA] text-[#1B3A6B] rounded">Audit ready</span></div></div>
        </div>
      </div>

      <div className="bg-white border border-[#CBD5E0] rounded-lg p-5 shadow-sm mt-5"><h2 className="text-lg font-bold text-[#1B3A6B] mb-3">Flagged records</h2><div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-b border-[#CBD5E0] text-[11px] uppercase text-[#718096]"><th className="py-2 pr-4">Provider</th><th className="py-2 pr-4">NPI</th><th className="py-2 pr-4">Field</th><th className="py-2 pr-4">PII type</th><th className="py-2 pr-4">Severity</th><th className="py-2 pr-4">Null %</th><th className="py-2">Action</th></tr></thead><tbody>{currentRecordFlags.map(({ item, field, key }) => { const action = piiActions[key]; return <tr key={key} className="border-b border-[#EDF2F7] text-sm"><td className="py-2 pr-4">{String(item.record_id || `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'Unknown')}</td><td className="py-2 pr-4 font-mono">{String(item.npi || 'Missing')}</td><td className="py-2 pr-4">{field}</td><td className="py-2 pr-4">Personal Identifier</td><td className="py-2 pr-4">High</td><td className="py-2 pr-4">100% null</td><td className="py-2"><div className="flex gap-1">{action ? <span className="text-xs font-semibold text-[#1B5E3B]">{action}</span> : <><button type="button" onClick={() => updatePiiAction(key, 'Anonymized')} className="text-xs font-semibold text-[#1B3A6B] hover:underline">Anonymize</button><button type="button" onClick={() => updatePiiAction(key, 'Removed')} className="text-xs font-semibold text-[#991B1B] hover:underline">Remove</button><button type="button" onClick={() => updatePiiAction(key, 'Overridden')} className="text-xs font-semibold text-[#4A5568] hover:underline">Override</button></>}</div></td></tr> })}</tbody></table></div></div>
    </section>
  )
}
=======
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
>>>>>>> a77b270ac3a9e97d97c8f81d798513e0ea71dd55
