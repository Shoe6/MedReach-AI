const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')
const React = require('react')
const uploadBaseUrl = 'https://medreach-ai-894235176706.us-east1.run.app'

const source = readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8')
const compiled = ts.transpileModule(source + '\nexport { UploadScreen, canUploadData };', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
}).outputText

function harness({ role = 'admin', companyId = 'real-company', authLoading = false, fetch } = {}) {
  const states = []
  const refs = []
  const effects = []
  const contexts = []
  const requests = []
  const toasts = []
  const navigations = []
  let slot = 0
  let refSlot = 0
  let listener
  const react = {
    ...React,
    createContext(value) {
      const context = { value, Provider: 'provider' }
      contexts.push(context)
      return context
    },
    useContext: context => context.value,
    useState(initial) {
      const index = slot++
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
      return [states[index], value => {
        states[index] = typeof value === 'function' ? value(states[index]) : value
      }]
    },
    useRef(current) {
      const index = refSlot++
      return refs[index] || (refs[index] = { current })
    },
    useEffect(effect) { effects.push(effect) },
  }
  const storageUploads = []
  class XHR {
    upload = {}
    status = 200
    open(method, url) { storageUploads.push([method, url]) }
    setRequestHeader() {}
    send() { this.onload() }
    abort() { this.onabort?.() }
  }
  const modules = {
    react,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-router-dom': { useNavigate: () => value => navigations.push(value), useLocation: () => ({ pathname: '/upload' }) },
    'firebase/auth': { onIdTokenChanged(_auth, callback) { listener = callback; return () => {} } },
    './firebase': { getFirebaseAuth: () => ({}) },
    './apiClient': {
      API_BASE_URL: '',
      UPLOAD_API_BASE_URL: uploadBaseUrl,
      async apiFetch(...args) {
        requests.push(args)
        if (fetch) return fetch(...args)
        return new Response(JSON.stringify(args[0].endsWith('generate-url')
          ? { upload_url: 'https://storage.example.test/upload' } : {}))
      },
    },
  }
  const app = {}
  new Function('exports', 'require', 'XMLHttpRequest', compiled)(app, name => modules[name] || {}, XHR)
  contexts[0].value.role = role
  contexts[1].value = { user: { uid: 'user-1' }, companyId, authLoading, companyError: null }
  return {
    ...app, states, contexts, requests, toasts, navigations, storageUploads,
    render(component = 'UploadScreen') {
      slot = 0
      refSlot = 0
      effects.length = 0
      return app[component]({ onNavigate: screen => navigations.push(screen), showToast: (...args) => toasts.push(args) })
    },
    flushEffects() { effects.splice(0).forEach(effect => effect()) },
    notifyUser(user) { listener(user) },
  }
}

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!React.isValidElement(node)) return []
  return [node, ...elements(node.props.children)]
}

function text(node) {
  if (Array.isArray(node)) return node.map(text).join(' ')
  if (React.isValidElement(node)) return text(node.props.children)
  return typeof node === 'string' || typeof node === 'number' ? String(node) : ''
}

const settle = () => new Promise(resolve => setImmediate(resolve))
const file = { name: 'providers.csv', size: 12, type: 'text/csv', async text() { return 'NPI\n1234567890' } }
function selectFile(tree) {
  elements(tree).find(node => node.props.type === 'file').props.onChange({
    target: { files: [file] }, currentTarget: { value: file.name },
  })
}

for (const role of ['editor', 'admin', 'super-admin']) {
  test(`${role} can upload with both requests scoped to the real encoded company`, async () => {
    const app = harness({ role, companyId: 'company & one' })
    assert.equal(app.canUploadData(role), true)
    const tree = app.render()
    assert.doesNotMatch(text(tree), /Unauthorized/)
    selectFile(tree)
    await settle()
    assert.deepEqual(app.requests.map(([url]) => url), [
      `${uploadBaseUrl}/api/companies/company%20%26%20one/uploads/generate-url`,
      `${uploadBaseUrl}/api/companies/company%20%26%20one/records/merge`,
    ])
    assert.deepEqual(app.storageUploads, [['PUT', 'https://storage.example.test/upload']])
    assert.deepEqual(app.navigations, ['data-review'])
  })
}

for (const role of ['viewer', null, undefined]) {
  test(`${role} cannot browse/drop files and sees the UI role restriction`, () => {
    const app = harness()
    app.contexts[0].value.role = role
    const tree = app.render()
    assert.equal(app.canUploadData(role), false)
    assert.match(text(tree), /Unauthorized: Editor role required/)
    assert.equal(elements(tree).some(node => node.props.type === 'file' || node.props.onDrop), false)
    assert.equal(app.requests.length, 0)
  })
}

test('drop handler uses the same real company as file selection', async () => {
  const app = harness({ companyId: 'drop-company' })
  const zone = elements(app.render()).find(node => node.props.onDrop)
  zone.props.onDrop({ preventDefault() {}, dataTransfer: { files: [file] } })
  await settle()
  assert.equal(app.requests.length, 2)
  assert.ok(app.requests.every(([url]) => url.startsWith(`${uploadBaseUrl}/api/companies/drop-company/`)))
})

test('a server 403 preserves its detail without mislabeling the UI role', async () => {
  const app = harness({ fetch: async () => new Response('Company scope mismatch', { status: 403 }) })
  selectFile(app.render())
  await settle()
  const tree = app.render()
  assert.match(text(tree), /Upload denied by server/)
  assert.match(text(tree), /Company scope mismatch/)
  assert.doesNotMatch(text(tree), /Unauthorized: Editor role required/)
  assert.equal(app.navigations.length, 0)
  app.contexts[0].value.role = 'editor'
  app.render()
  assert.doesNotMatch(text(app.render()), /Upload denied by server/)
})

for (const authLoading of [true, false]) {
  test(`missing company never uploads to a demo fallback (loading=${authLoading})`, async () => {
    const app = harness({ companyId: null, authLoading })
    const tree = app.render()
    if (authLoading) {
      assert.equal(elements(tree).some(node => node.props.type === 'file'), false)
    } else {
      selectFile(tree)
    }
    await settle()
    assert.equal(app.requests.length, 0)
    assert.equal(app.toasts.length, authLoading ? 0 : 1)
    assert.doesNotMatch(text(app.render()), /Unauthorized/)
  })
}

test('account provider loads the authenticated company and ignores stale account results', async () => {
  let finishOld
  const app = harness({
    fetch: async () => new Response(JSON.stringify({ company_id: 'signed-company' })),
  })
  app.render('default')
  app.flushEffects()
  app.notifyUser({ uid: 'old-user', getIdTokenResult: () => new Promise(resolve => { finishOld = resolve }) })
  app.notifyUser({ uid: 'new-user', async getIdTokenResult() { return { claims: { role: 'editor' } } } })
  await settle()
  finishOld({ claims: { role: 'admin' } })
  await settle()
  const providers = elements(app.render('default'))
  const auth = providers.find(node => node.props.value?.companyId === 'signed-company')
  assert.ok(auth)
  assert.equal(auth.props.value.user.uid, 'new-user')
  assert.equal(auth.props.value.authLoading, false)
  assert.ok(providers.some(node => node.props.value?.role === 'editor'))
  assert.deepEqual(app.requests.map(([url]) => url), ['/api/auth/context'])
})

test('account provider prefers signed company claims and normalizes roles', async () => {
  const app = harness()
  app.render('default')
  app.flushEffects()
  app.notifyUser({ uid: 'user-1', async getIdTokenResult() {
    return { claims: { role: ' Admin ', company_id: 'claimed-company' } }
  } })
  await settle()
  const providers = elements(app.render('default'))
  assert.ok(providers.some(node => node.props.value?.companyId === 'claimed-company'))
  assert.ok(providers.some(node => node.props.value?.role === 'admin'))
  assert.equal(app.requests.length, 0)
})
