const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

function loadSearch(auth, fetch) {
  const source = readFileSync(path.join(__dirname, '../src/nlpSearch.ts'), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const exports = {}
  new Function('exports', 'require', 'globalThis', compiled)(
    exports,
    () => ({ getFirebaseAuth: () => auth }),
    { fetch },
  )
  return exports
}

test('NLP requests await auth restoration and send the current Firebase ID token', async () => {
  const events = []
  const auth = {
    currentUser: null,
    async authStateReady() {
      events.push('ready')
      this.currentUser = { async getIdToken() { events.push('token'); return 'fresh-id-token' } }
    },
  }
  const response = { status: 200 }
  const { searchDataset } = loadSearch(auth, async (url, options) => {
    events.push('fetch')
    assert.equal(url, 'http://localhost:8010/api/dataset/nlp-search')
    assert.equal(options.method, 'POST')
    assert.deepEqual(options.headers, {
      'Content-Type': 'application/json',
      Authorization: 'Bearer fresh-id-token',
    })
    assert.deepEqual(JSON.parse(options.body), { query: 'cardiologists', dataset_id: 'providers.csv' })
    return response
  })
  assert.equal(await searchDataset('http://localhost:8010', 'cardiologists', 'providers.csv'), response)
  assert.deepEqual(events, ['ready', 'token', 'fetch'])
})

test('signed-out users get an authentication error without sending a request', async () => {
  const { searchDataset, NLPAuthenticationError } = loadSearch(
    { currentUser: null, async authStateReady() {} },
    () => assert.fail('Must not send unauthenticated requests'),
  )
  await assert.rejects(searchDataset('', 'x', 'providers.csv'), NLPAuthenticationError)
})

test('token refresh failures are authentication errors, not network errors', async () => {
  const { searchDataset, NLPAuthenticationError } = loadSearch({
    async authStateReady() {},
    currentUser: { async getIdToken() { throw new Error('Session expired') } },
  }, () => assert.fail('Must not send a request after token failure'))
  await assert.rejects(searchDataset('', 'x', 'providers.csv'), error => {
    assert.ok(error instanceof NLPAuthenticationError)
    assert.equal(error.message, 'Session expired')
    return true
  })
})
