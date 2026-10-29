const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

function loadClient(auth, fetch) {
  const source = readFileSync(path.join(__dirname, '../src/apiClient.ts'), 'utf8')
    .replaceAll('import.meta.env', 'env')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const exports = {}
  new Function('exports', 'require', 'globalThis', 'env', compiled)(
    exports, () => ({ getFirebaseAuth: () => auth }), { fetch }, {},
  )
  return exports
}

test('waits for auth restoration and preserves headers while replacing stale authorization', async () => {
  const events = []
  const auth = {
    currentUser: null,
    async authStateReady() {
      events.push('ready')
      this.currentUser = { async getIdToken() { events.push('token'); return 'id-token' } }
    },
  }
  const original = new Headers({ Authorization: 'Bearer stale', 'Content-Type': 'application/json' })
  const response = { status: 200 }
  const { apiFetch } = loadClient(auth, async (_url, init) => {
    events.push('fetch')
    assert.equal(init.headers.get('Authorization'), 'Bearer id-token')
    assert.equal(init.headers.get('Content-Type'), 'application/json')
    return response
  })
  assert.equal(await apiFetch('/api/data', { headers: original }), response)
  assert.equal(original.get('Authorization'), 'Bearer stale')
  assert.deepEqual(events, ['ready', 'token', 'fetch'])
})

for (const token of [null, undefined, '']) {
  test(`rejects an empty token (${String(token)}) without sending a request`, async () => {
    const { apiFetch, APIAuthenticationError } = loadClient({
      async authStateReady() {},
      currentUser: { async getIdToken() { return token } },
    }, () => assert.fail('Must not send an unauthenticated request'))
    await assert.rejects(apiFetch('/api/data'), APIAuthenticationError)
  })
}

test('rejects signed-out users without sending a request', async () => {
  const { apiFetch, APIAuthenticationError } = loadClient({
    async authStateReady() {}, currentUser: null,
  }, () => assert.fail('Must not send an unauthenticated request'))
  await assert.rejects(apiFetch('/api/data'), APIAuthenticationError)
})

for (const phase of ['initialization', 'token', 'refresh']) {
  test(`propagates ${phase} failures`, async () => {
    let requests = 0
    const failure = new Error('Authentication failed')
    const { apiFetch } = loadClient({
      async authStateReady() { if (phase === 'initialization') throw failure },
      currentUser: {
        async getIdToken(refresh) {
          if (phase === 'token' || refresh) throw failure
          return 'id-token'
        },
      },
    }, async () => { requests++; return { status: 401 } })
    await assert.rejects(apiFetch('/api/data'), error => error === failure)
    assert.equal(requests, phase === 'refresh' ? 1 : 0)
  })
}

test('refreshes once after 401 and never retries indefinitely', async () => {
  const refreshes = []
  const sent = []
  const { apiFetch } = loadClient({
    async authStateReady() {},
    currentUser: {
      async getIdToken(force) { refreshes.push(force); return force ? 'fresh' : 'old' },
    },
  }, async (_url, init) => {
    sent.push(init.headers.get('Authorization'))
    return { status: 401 }
  })
  assert.equal((await apiFetch('/api/data')).status, 401)
  assert.deepEqual(refreshes, [false, true])
  assert.deepEqual(sent, ['Bearer old', 'Bearer fresh'])
})
