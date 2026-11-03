const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

function loadFirebase(env) {
  const source = readFileSync(path.join(__dirname, '../src/firebase.ts'), 'utf8')
    .replaceAll('import.meta.env', 'env')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const calls = []
  const auth = {}
  const exports = {}
  const modules = {
    'firebase/app': {
      getApps: () => [],
      initializeApp(config) { calls.push(['initialize', config]); return {} },
    },
    'firebase/auth': {
      getAuth: () => auth,
      connectAuthEmulator(instance, url) { calls.push(['emulator', instance, url]) },
    },
  }
  new Function('exports', 'require', 'env', compiled)(exports, name => modules[name], env)
  return { ...exports, calls, auth }
}

test('development connects Auth to the emulator once and shares the configured project', () => {
  const { getFirebaseAuth, calls, auth } = loadFirebase({
    DEV: true,
    VITE_USE_AUTH_EMULATOR: 'true',
    VITE_FIREBASE_PROJECT_ID: 'local-project',
  })
  assert.equal(getFirebaseAuth(), auth)
  assert.equal(getFirebaseAuth(), auth)
  assert.equal(calls.length, 2)
  assert.equal(calls[0][1].projectId, 'local-project')
  assert.equal(calls[0][1].apiKey, 'local-emulator-key')
  assert.deepEqual(calls[1], ['emulator', auth, 'http://127.0.0.1:9099'])
})

test('production never connects to the emulator even if the flag is set', () => {
  const { getFirebaseAuth, calls } = loadFirebase({
    DEV: false,
    VITE_USE_AUTH_EMULATOR: 'true',
    VITE_FIREBASE_API_KEY: 'configured-web-key',
  })
  getFirebaseAuth()
  assert.equal(calls.length, 1)
  assert.equal(calls[0][1].apiKey, 'configured-web-key')
})

test('production without a web API key fails explicitly', () => {
  const { getFirebaseAuth, calls } = loadFirebase({ DEV: false })
  assert.throws(getFirebaseAuth, /VITE_FIREBASE_API_KEY/)
  assert.deepEqual(calls, [])
})

test('local development uses live Auth by default', () => {
  const { getFirebaseAuth, calls } = loadFirebase({
    DEV: true,
    VITE_FIREBASE_API_KEY: 'configured-web-key',
  })
  getFirebaseAuth()
  assert.equal(calls.length, 1)
})
