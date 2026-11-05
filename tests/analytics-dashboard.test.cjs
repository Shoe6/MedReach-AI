const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')
const React = require('react')

const payload = {
  company_id: 'company & one',
  quality_trends: [
    { date: '2026-11-02', quality_score: 95.5, record_count: 12 },
    { date: '2026-11-01', quality_score: 80, record_count: 10 },
  ],
  specialty_distribution: [{ specialty: 'Cardiology', count: 22, percentage: 100 }],
  geographic_coverage: [{ state: 'CA', count: 22, percentage: 100 }],
}

function load(fetch) {
  const states = []
  const effects = []
  const requests = []
  let slot = 0
  const react = {
    ...React,
    useState(initial) {
      const index = slot++
      if (!(index in states)) states[index] = initial
      return [states[index], value => {
        states[index] = typeof value === 'function' ? value(states[index]) : value
      }]
    },
    useEffect(effect) { effects.push(effect) },
  }
  const modules = {
    react,
    'react/jsx-runtime': require('react/jsx-runtime'),
    recharts: Object.fromEntries(['ResponsiveContainer', 'LineChart', 'Line', 'CartesianGrid', 'XAxis', 'YAxis', 'Tooltip']
      .map(name => [name, name])),
    './apiClient': {
      API_BASE_URL: '',
      async apiFetch(...args) { requests.push(args); return fetch(...args) },
    },
  }
  const source = readFileSync(path.join(__dirname, '../src/AnalyticsDashboard.tsx'), 'utf8')
  const compiled = ts.transpileModule(source + '\nexport { parseAnalytics };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const app = {}
  new Function('exports', 'require', compiled)(app, name => modules[name])
  return {
    ...app, requests,
    render(companyId = payload.company_id) {
      slot = 0
      effects.length = 0
      return app.default({ companyId })
    },
    effect() { return effects[0]() },
  }
}

function expand(node) {
  if (Array.isArray(node)) return node.map(expand)
  if (!React.isValidElement(node)) return node
  if (typeof node.type === 'function') return expand(node.type(node.props))
  return React.cloneElement(node, {}, expand(node.props.children))
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

test('fetches the encoded company endpoint and renders all three metrics', async () => {
  const app = load(async () => Response.json(payload))
  assert.match(text(app.render()), /Loading analytics/)
  app.effect()
  await settle()
  const tree = expand(app.render())
  assert.equal(app.requests[0][0], '/api/companies/company%20%26%20one/analytics')
  assert.ok(app.requests[0][1].signal instanceof AbortSignal)
  assert.match(text(tree), /Cardiology/)
  assert.match(text(tree), /CA/)
  assert.match(text(tree), /95.5/)
  assert.match(text(tree), /100\.00\s*%/)
  const chart = elements(tree).find(node => node.type === 'LineChart')
  assert.deepEqual(chart.props.data.map(point => point.date), ['2026-11-01', '2026-11-02'])
})

for (const status of [401, 403, 404, 503]) {
  test(`HTTP ${status} shows server detail and supports retry`, async () => {
    let attempts = 0
    const app = load(async () => ++attempts === 1
      ? Response.json({ detail: 'Request denied' }, { status })
      : Response.json(payload))
    app.render()
    app.effect()
    await settle()
    const error = app.render()
    assert.match(text(error), new RegExp(String(status)))
    assert.match(text(error), /Request denied/)
    elements(error).find(node => node.type === 'button').props.onClick()
    app.render()
    app.effect()
    await settle()
    assert.doesNotMatch(text(expand(app.render())), /Unable to load analytics/)
    assert.equal(attempts, 2)
  })
}

test('valid empty arrays render actual empty dataset states', async () => {
  const app = load(async () => Response.json({
    quality_trends: [], specialty_distribution: [], geographic_coverage: [],
  }))
  app.render()
  app.effect()
  await settle()
  const tree = expand(app.render())
  assert.match(text(tree), /No dated quality records/)
  assert.match(text(tree), /No\s+specialty distribution\s+data/)
  assert.match(text(tree), /No\s+geographic coverage\s+data/)
})

for (const invalid of [
  {},
  { ...payload, company_id: 'another-company' },
  { ...payload, quality_trends: [{ date: 'bad-date', quality_score: 101, record_count: 0 }] },
  { ...payload, geographic_coverage: [{ state: 'CA', count: -1, percentage: 100 }] },
  { ...payload, specialty_distribution: null },
]) {
  test(`rejects invalid payload: ${JSON.stringify(invalid).slice(0, 100)}`, () => {
    assert.throws(() => load().parseAnalytics(invalid, payload.company_id))
  })
}

test('cancelled stale response cannot replace the next company data', async () => {
  let finish
  const app = load(async url => url.includes('old-company')
    ? new Promise(resolve => { finish = resolve })
    : Response.json({ ...payload, company_id: 'new-company' }))
  app.render('old-company')
  const cleanup = app.effect()
  cleanup()
  assert.equal(app.requests[0][1].signal.aborted, true)
  app.render('new-company')
  app.effect()
  await settle()
  finish(Response.json({ ...payload, company_id: 'old-company', quality_trends: [] }))
  await settle()
  const chart = elements(expand(app.render('new-company'))).find(node => node.type === 'LineChart')
  assert.equal(chart.props.data.length, 2)
})

test('network failures and malformed JSON surface errors', async () => {
  for (const fetch of [
    async () => { throw new Error('Network disconnected') },
    async () => new Response('not JSON'),
  ]) {
    const app = load(fetch)
    app.render()
    app.effect()
    await settle()
    assert.match(text(app.render()), /Unable to load analytics/)
  }
})
