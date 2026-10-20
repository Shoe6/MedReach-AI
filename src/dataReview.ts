export const REVIEW_FIELDS = {
  firstName: ['first_name', 'firstName', 'Provider First Name'],
  lastName: ['last_name', 'lastName', 'Provider Last Name'],
  npi: ['npi', 'NPI'],
  email: ['email', 'email_address', 'Email', 'Email Address'],
  phone: ['phone', 'phone_number', 'Telephone Number', 'Phone', 'Phone Number'],
} as const

type ReviewRecord = Record<string, unknown>
type ReviewField = keyof typeof REVIEW_FIELDS

export function reviewValue(record: ReviewRecord, field: ReviewField): string {
  for (const key of REVIEW_FIELDS[field]) {
    const value = record[key]
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim()
  }
  return ''
}

export function hasReviewField(records: ReviewRecord[], field: ReviewField): boolean {
  return records.some(record => REVIEW_FIELDS[field].some(key => Object.prototype.hasOwnProperty.call(record, key)))
}

export function reviewName(record: ReviewRecord, index: number): string {
  return `${reviewValue(record, 'firstName')} ${reviewValue(record, 'lastName')}`.trim()
    || String(record.provider_name || record.provider_id || reviewValue(record, 'npi') || `Record ${index + 1}`)
}

export function npiOutcome(record: ReviewRecord): 'valid' | 'invalid' | 'pending' {
  if (!/^\d{10}$/.test(reviewValue(record, 'npi'))) return 'invalid'
  const status = String(record.npi_status || record.validation_status || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (['active', 'valid'].includes(status)) return 'valid'
  if (['invalid', 'invalid_npi', 'deactivated', 'inactive', 'not_found', 'notfound', 'mismatch'].includes(status)) return 'invalid'
  return 'pending'
}

export function contactFlags(records: ReviewRecord[]) {
  const emailSupplied = hasReviewField(records, 'email')
  const phoneSupplied = hasReviewField(records, 'phone')
  return records.flatMap((record, index) => {
    const missingFields: string[] = []
    if (emailSupplied && !reviewValue(record, 'email')) missingFields.push('Email')
    if (phoneSupplied && !reviewValue(record, 'phone')) missingFields.push('Phone')
    return missingFields.length ? [{
      id: index, record: reviewName(record, index), field: missingFields.join(', '),
      type: 'Missing contact information', severity: 'High', nullPct: 100, originalRecord: record,
    }] : []
  })
}

export function privacyFlags(records: ReviewRecord[]) {
  return records.flatMap((record, index) => {
    const detections = Array.isArray(record.pii_detections)
      ? record.pii_detections.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      : []
    const flagged = record.pii_flagged === true || ['true', '1'].includes(String(record.pii_flagged).toLowerCase())
    if (!flagged && detections.length === 0) return []
    const types = [...new Set(detections.map(item => String(item.entity_type || item.type || 'Sensitive identifier')))]
    const fields = [...new Set(detections.map(item => String(item.field || item.field_name || '')).filter(Boolean))]
    return [{
      id: index, record: reviewName(record, index), field: fields.join(', ') || 'Detected content',
      type: types.join(', ') || 'PII / PHI', severity: 'High', nullPct: 0, originalRecord: record,
    }]
  })
}

export function reviewScores(records: ReviewRecord[]) {
  const isTrue = (value: unknown) => value === true || value === -1 || ['true', '1', 'merged'].includes(String(value).toLowerCase())
  const total = records.length
  const contacts = contactFlags(records).length
  const privacy = privacyFlags(records).length
  const invalidNpis = records.filter(record => npiOutcome(record) === 'invalid').length
  const pendingNpis = records.filter(record => npiOutcome(record) === 'pending').length
  const outliers = records.filter(record => record.anomaly_flag === -1 || record.anomaly_flag === '-1' || isTrue(record.is_anomaly)).length
  const duplicates = records.filter(record => isTrue(record.is_duplicate) || isTrue(record.merged_from_sources) || record.deduplication_status === 'merged').length
  const points = (count: number, weight: number) => total ? weight * (1 - count / total) : 0
  const npiPoints = points(invalidNpis, 20)
  const contactPoints = points(contacts, 20)
  const duplicatePoints = points(duplicates, 20)
  const outlierPoints = points(outliers, 20)
  const privacyPoints = points(privacy, 20)
  return {
    total, contacts, privacy, invalidNpis, pendingNpis, outliers, duplicates,
    npiPoints, contactPoints, duplicatePoints, outlierPoints, privacyPoints,
    quality: Math.round((npiPoints + contactPoints + duplicatePoints + outlierPoints + privacyPoints) * 10) / 10,
  }
}