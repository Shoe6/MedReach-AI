const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const source = readFileSync(path.join(__dirname, '../src/dataReview.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const helpers = {}
new Function('exports', compiled)(helpers)
const { contactFlags, npiOutcome, reviewName, reviewScores, reviewValue } = helpers

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
  assert.equal(scores.quality, 100)
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
  assert.equal(scores.quality, 50)
  assert.equal(scores.quality, Math.round((scores.npiPoints + scores.contactPoints + scores.duplicatePoints + scores.outlierPoints) * 10) / 10)
  assert.equal(reviewScores([]).quality, 0)
})

test('small completeness penalties do not round to a perfect score', () => {
  const records = Array.from({ length: 100 }, (_, index) => ({ NPI: '1234567890', npi_status: 'Active', phone: index === 0 ? '' : '5551234567' }))
  assert.equal(reviewScores(records).quality, 99.8)
})