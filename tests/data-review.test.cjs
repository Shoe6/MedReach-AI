const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const source = readFileSync(path.join(__dirname, '../src/dataReview.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const helpers = {}
new Function('exports', compiled)(helpers)
const { contactFlags, npiOutcome, privacyFlags, reviewName, reviewScores, reviewValue } = helpers

test('CMS names and telephone numbers use their source columns', () => {
  const record = { NPI: '1234567890', 'Provider First Name': 'Test', 'Provider Last Name': 'Provider', 'Telephone Number': '5551234567' }
  assert.equal(reviewName(record, 0), 'Test Provider')
  assert.equal(reviewValue(record, 'phone'), '5551234567')
  assert.equal(reviewValue(record, 'npi'), '1234567890')
  assert.deepEqual(contactFlags([record]), [])
})

test('missing values in supplied columns group into one record row', () => {
  const records = [{ email: '', phone: '' }, { email_address: 'test@example.com', phone_number: '' }, { email: 'test@example.com', phone: '5551234567' }]
  const flags = contactFlags(records)
  assert.equal(flags.length, 2)
  assert.deepEqual(flags.map(flag => flag.field), ['Email, Phone', 'Phone'])
  assert.equal(flags[0].originalRecord, records[0])
  assert.equal(new Set(flags.map(flag => flag.id)).size, 2)
})

test('absent email and payer columns do not create quality errors', () => {
  const records = [{ NPI: '1234567890', npi_status: 'Active', 'Telephone Number': '5551234567', pii_flagged: true }]
  const scores = reviewScores(records)
  assert.equal(scores.contacts, 0)
  assert.equal(scores.invalidNpis, 0)
  assert.equal(scores.privacyPoints, 0)
  assert.equal(scores.quality, 80)
})

test('offline and unknown NPI checks are pending, not invalid', () => {
  for (const status of ['unvalidated_offline', 'pending', 'unknown', '']) {
    assert.equal(npiOutcome({ NPI: '1234567890', npi_status: status }), 'pending')
  }
  assert.equal(npiOutcome({ NPI: '123', npi_status: 'Active' }), 'invalid')
  assert.equal(npiOutcome({ NPI: '1234567890', npi_status: 'Deactivated' }), 'invalid')
  const scores = reviewScores([{ NPI: '1234567890', npi_status: 'unvalidated_offline' }])
  assert.equal(scores.pendingNpis, 1)
  assert.equal(scores.invalidNpis, 0)
})

test('overall score equals weighted category total to one decimal place', () => {
  const scores = reviewScores([
    { NPI: '1234567890', npi_status: 'Active', phone: '5551234567' },
    { NPI: '1234567891', npi_status: 'Deactivated', phone: '', anomaly_flag: -1, is_duplicate: true },
  ])
  assert.equal(scores.quality, 60)
  assert.equal(scores.quality, Math.round((scores.npiPoints + scores.contactPoints + scores.duplicatePoints + scores.outlierPoints + scores.privacyPoints) * 10) / 10)
  assert.equal(reviewScores([]).quality, 0)
})

test('small completeness penalties do not round to a perfect score', () => {
  const records = Array.from({ length: 100 }, (_, index) => ({ NPI: '1234567890', npi_status: 'Active', phone: index === 0 ? '' : '5551234567' }))
  assert.equal(reviewScores(records).quality, 99.8)
})

test('privacy detections deduct only from the dedicated 20-point bucket', () => {
  const records = [
    { NPI: '1234567890', npi_status: 'Active', pii_flagged: false, pii_detections: [{ entity_type: 'US_SSN' }, { entity_type: 'MEDICAL_RECORD_NUMBER' }] },
    { NPI: '1234567891', npi_status: 'Active', pii_flagged: 'false', pii_detections: [] },
  ]
  const scores = reviewScores(records)
  assert.equal(scores.privacy, 1)
  assert.equal(scores.privacyPoints, 10)
  assert.equal(scores.contactPoints, 20)
  assert.equal(scores.quality, 90)
  const flags = privacyFlags(records)
  assert.equal(flags.length, 1)
  assert.equal(flags[0].type, 'US_SSN, MEDICAL_RECORD_NUMBER')
  assert.equal(flags[0].originalRecord, records[0])
})

test('all five categories retain 20 points for clean records', () => {
  const scores = reviewScores([{ NPI: '1234567890', npi_status: 'Active' }])
  for (const key of ['npiPoints', 'contactPoints', 'duplicatePoints', 'outlierPoints', 'privacyPoints']) assert.equal(scores[key], 20)
  assert.equal(scores.quality, 100)
})