/** Model prices live in the official Models settings page: one row per configured route, with optional
 * peak/off-peak tiers. The route list comes from the live model catalog, so the picker only offers models
 * this deployment actually serves. */

const MODEL_PRICE_FIELDS = [['cacheMiss', 'input'], ['cacheHit', 'cache'], ['cacheWrite', 'write'], ['output', 'output']]
const blankRates = () => Object.fromEntries(MODEL_PRICE_FIELDS.map(([key]) => [key, '']))
const rateNumbers = rates => Object.fromEntries(MODEL_PRICE_FIELDS.map(([key]) => [key, Number(rates?.[key])]))

/** Every `provider:model` route the running deployment currently advertises. */
export function catalogRoutes(catalog) {
  const routes = []
  for (const group of catalog?.groups ?? [])
    for (const model of group.models ?? []) routes.push({
      route: `${group.id}:${model.id}`, provider: group.id, model: model.id,
      name: model.name || model.id, providerName: group.name || group.id,
    })
  return routes.sort((left, right) => left.route.localeCompare(right.route))
}

function priceTiersOf(entry, price) {
  if (!price) return [{ ...entry, tier: 'none', mode: 'none', rates: null, source: null }]
  if (price.mode === 'tiered' && price.offPeak && price.peak) return [
    { ...entry, tier: 'off', mode: 'tiered', rates: price.offPeak, source: price.source },
    { ...entry, tier: 'peak', mode: 'tiered', rates: price.peak, source: price.source },
  ]
  return [{ ...entry, tier: 'flat', mode: 'single', rates: price.offPeak ?? price, source: price.source }]
}

/** Table rows: one per (catalog route, tier), then any priced route the catalog no longer advertises. */
export function priceRows(catalog, priceBook) {
  const priced = new Map((priceBook ?? []).map(row => [`${row.provider}:${row.model}`, row]))
  const rows = []
  for (const entry of catalogRoutes(catalog)) {
    rows.push(...priceTiersOf(entry, priced.get(entry.route) ?? null))
    priced.delete(entry.route)
  }
  for (const price of priced.values()) rows.push(...priceTiersOf({
    route: `${price.provider}:${price.model}`, provider: price.provider, model: price.model,
    name: price.model, providerName: price.provider, missing: true,
  }, price))
  return rows
}

/** The host's accepted price payload for one route. */
export function pricePatch(route, mode, rates) {
  const index = route.indexOf(':')
  const provider = index < 0 ? route : route.slice(0, index)
  const model = index < 0 ? '' : route.slice(index + 1)
  return mode === 'tiered'
    ? { provider, model, offPeak: rateNumbers(rates?.offPeak), peak: rateNumbers(rates?.peak) }
    : { provider, model, ...rateNumbers(rates?.offPeak) }
}

/** Whole-hour Beijing windows such as "09:00-12:00, 14:00-18:00"; null when the text is unusable. */
export function parsePeakWindows(text) {
  const windows = []
  for (const part of String(text ?? '').split(/[,，;；]/)) {
    const value = part.trim()
    if (!value) continue
    const match = /^(\d{1,2}):?(\d{2})?\s*[-–—~至]\s*(\d{1,2}):?(\d{2})?$/.exec(value)
    if (!match) return null
    const start = Number(match[1]), end = Number(match[3])
    if ((match[2] ?? '00') !== '00' || (match[4] ?? '00') !== '00') return null
    if (!(start >= 0 && start < end && end <= 24)) return null
    windows.push({ start, end })
  }
  return windows
}

export function formatPeakWindows(windows) {
  return (windows ?? []).map(window => `${String(window.start).padStart(2, '0')}:00-${String(window.end).padStart(2, '0')}:00`).join(', ')
}

export function parsePeakHolidays(text) {
  const dates = [...new Set(String(text ?? '').split(/[,，;；\s]+/).map(value => value.trim()).filter(Boolean))]
  return dates.every(date => /^\d{4}-\d{2}-\d{2}$/.test(date)) ? dates : null
}

export default function createModelPricesClient(require) {
  const NS = 'dshAppModelPrices'
  const dictionaries = {
    zh: {
      title: '模型价格', intro: '为当前已配置的模型填写价格（美元 / 百万 Token）。开启波峰/波谷后，波峰时段按高峰价，其余时间与周末、节假日按低谷价。',
      loading: '正在读取模型与价格…',
      model: '提供商与模型', billing: '计费方式', flat: '单一价格', tiered: '波峰/波谷', off: '低谷', peak: '高峰',
      input: '未缓存输入', cache: '缓存读取', write: '缓存写入', output: '输出', unset: '未配置', missing: '已不在当前模型列表',
      editTitle: '编辑价格', save: '保存价格', remove: '删除价格', saved: '价格已保存。', removed: '已删除该模型的价格。',
      peakTitle: '波峰波谷时段', enablePeak: '启用波峰/波谷价格', windows: '波峰时段（北京时间整点）', holidays: '节假日（北京时间）',
      savePeak: '保存波峰波谷', peakSaved: '波峰波谷设置已保存。', noModels: '当前没有已配置的模型。',
      invalidRate: '价格必须是非负数字。', invalidPeak: '时段请写成 09:00-12:00，节假日请写成 2026-10-01。',
      requestFailed: message => `操作失败：${message}`, readFailed: message => `读取失败：${message}`,
    },
    en: {
      title: 'Model prices', intro: 'Price the models this deployment serves (USD per million tokens). With peak/off-peak on, peak windows bill the peak rates and everything else — weekends and holidays included — bills the off-peak rates.',
      loading: 'Loading models and prices…',
      model: 'Provider and model', billing: 'Billing', flat: 'Flat price', tiered: 'Peak / off-peak', off: 'Off-peak', peak: 'Peak',
      input: 'Uncached input', cache: 'Cache read', write: 'Cache write', output: 'Output', unset: 'Not priced', missing: 'No longer served',
      editTitle: 'Edit price', save: 'Save price', remove: 'Delete price', saved: 'Price saved.', removed: 'Price deleted.',
      peakTitle: 'Peak windows', enablePeak: 'Enable peak / off-peak prices', windows: 'Peak hours (Beijing, whole hours)', holidays: 'Holidays (Beijing dates)',
      savePeak: 'Save peak windows', peakSaved: 'Peak settings saved.', noModels: 'No models are configured yet.',
      invalidRate: 'Prices must be nonnegative numbers.', invalidPeak: 'Write windows as 09:00-12:00 and holidays as 2026-10-01.',
      requestFailed: message => `Failed: ${message}`, readFailed: message => `Could not read: ${message}`,
    },
  }
  const React = require('react')
  const { createElement: h, useEffect, useMemo, useState } = React

  const post = async body => {
    const response = await fetch('/dsh-app/cost/settings', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`)
  }

  function ModelPrices({ t, remote }) {
    const [catalog, setCatalog] = useState(null)
    const [book, setBook] = useState(null)
    const [failure, setFailure] = useState(null)
    const [revision, setRevision] = useState(0)
    const [route, setRoute] = useState('')
    const [mode, setMode] = useState('single')
    const [rates, setRates] = useState(() => ({ offPeak: blankRates(), peak: blankRates() }))
    const [peakDraft, setPeakDraft] = useState({ enabled: false, windows: '', holidays: '' })
    const [status, setStatus] = useState(null)

    useEffect(() => {
      let live = true
      setFailure(null)
      Promise.all([
        remote?.session?.modelCatalog?.().then(value => value?.value ?? value).catch(error => ({ error })),
        fetch('/dsh-app/cost.json', { cache: 'no-store' }).then(response => response.json()).catch(error => ({ error })),
      ]).then(([catalogResult, summary]) => {
        if (!live) return
        const problem = catalogResult?.error ?? summary?.error
        if (problem) setFailure(String(problem.message ?? problem))
        setCatalog(catalogResult?.error ? { groups: [] } : catalogResult ?? { groups: [] })
        setBook(summary?.error ? { priceBook: [], peak: null } : summary)
        setPeakDraft({
          enabled: summary?.peak?.enabled === true,
          windows: formatPeakWindows(summary?.peak?.windows),
          holidays: (summary?.peak?.holidays ?? []).join(', '),
        })
      })
      return () => { live = false }
    }, [revision])

    const rows = useMemo(() => priceRows(catalog, book?.priceBook), [catalog, book])
    const options = useMemo(() => {
      const seen = new Map()
      for (const row of rows) if (!seen.has(row.route)) seen.set(row.route, row)
      return [...seen.values()]
    }, [rows])
    const priced = useMemo(() => new Map((book?.priceBook ?? []).map(row => [`${row.provider}:${row.model}`, row])), [book])

    const select = value => {
      setRoute(value)
      setStatus(null)
      const price = priced.get(value)
      setMode(price?.mode === 'tiered' ? 'tiered' : 'single')
      const fill = source => Object.fromEntries(MODEL_PRICE_FIELDS.map(([key]) => [key, Number.isFinite(source?.[key]) ? String(source[key]) : '']))
      setRates({ offPeak: fill(price?.offPeak ?? price), peak: fill(price?.peak) })
    }
    useEffect(() => { if (!route && options.length) select(options[0].route) }, [options, route])

    const current = priced.get(route) ?? null
    const edit = (tier, key, value) => setRates(state => ({ ...state, [tier]: { ...state[tier], [key]: value } }))
    const run = async (action, done) => {
      setStatus(null)
      try { await action(); await done(); setRevision(value => value + 1) }
      catch (error) { setStatus({ kind: 'error', text: t('requestFailed', { message: error.message }) }) }
    }
    const save = () => {
      const offPeak = rateNumbers(rates.offPeak), peak = rateNumbers(rates.peak)
      const values = mode === 'tiered' ? [...Object.values(offPeak), ...Object.values(peak)] : Object.values(offPeak)
      if (values.some(value => !Number.isFinite(value) || value < 0)) { setStatus({ kind: 'error', text: t('invalidRate') }); return }
      void run(() => post({ pricing: [pricePatch(route, mode, rates)] }), async () => setStatus({ kind: 'ok', text: t('saved') }))
    }
    const remove = () => {
      const index = route.indexOf(':')
      void run(() => post({ pricing: [{ provider: route.slice(0, index), model: route.slice(index + 1), remove: true }] }),
        async () => setStatus({ kind: 'ok', text: t('removed') }))
    }
    const savePeak = () => {
      const windows = parsePeakWindows(peakDraft.windows), holidays = parsePeakHolidays(peakDraft.holidays)
      if (!windows || !holidays) { setStatus({ kind: 'error', text: t('invalidPeak') }); return }
      void run(() => post({ peak: { enabled: peakDraft.enabled, windows, holidays } }), async () => setStatus({ kind: 'ok', text: t('peakSaved') }))
    }

    const loading = !catalog || !book
    const field = (tier, key, label, required) => h('label', { className: 'dsh-app-price-field' },
      h('span', null, label),
      h('input', { type: 'number', min: '0', step: 'any', value: rates[tier][key], required: required || undefined,
        onChange: event => edit(tier, key, event.currentTarget.value) }))

    return h('section', { className: 'dsh-app-price-section', 'aria-label': t('title'), 'aria-busy': loading || undefined },
      h('h2', null, t('title')),
      h('p', { className: 'dsh-app-price-intro' }, t('intro')),
      loading ? h('p', { className: 'dsh-app-price-note', role: 'status' }, t('loading')) : null,
      failure ? h('p', { className: 'dsh-app-price-error', role: 'alert' }, t('readFailed', { message: failure })) : null,
      !loading && !rows.length ? h('p', { className: 'dsh-app-price-note' }, t('noModels')) : null,
      !loading && rows.length ? h('table', { className: 'dsh-app-price-table' },
        h('thead', null, h('tr', null,
          h('th', null, t('model')), h('th', null, t('billing')),
          h('th', null, t('input')), h('th', null, t('cache')), h('th', null, t('write')), h('th', null, t('output')))),
        h('tbody', null, rows.map((row, index) => h('tr', { key: `${row.route}-${row.tier}-${index}` },
          h('td', null, h('span', { className: 'dsh-app-price-route' }, row.route),
            row.missing ? h('span', { className: 'dsh-app-price-chip', 'data-tone': 'muted' }, t('missing')) : null,
            row.tier === 'none' ? h('span', { className: 'dsh-app-price-chip', 'data-tone': 'warn' }, t('unset')) : null),
          h('td', null, row.tier === 'none' ? h('span', { className: 'dsh-app-price-chip', 'data-tone': 'muted' }, t('unset'))
            : h('span', { className: 'dsh-app-price-chip', 'data-tone': row.tier === 'peak' ? 'peak' : row.tier === 'off' ? 'off' : 'flat' },
              t(row.tier === 'peak' ? 'peak' : row.tier === 'off' ? 'off' : 'flat'))),
          ...MODEL_PRICE_FIELDS.map(([key]) => h('td', null, row.rates && Number.isFinite(row.rates[key]) ? String(row.rates[key]) : '—')))))) : null,
      !loading && options.length ? h('div', { className: 'dsh-app-price-editor' },
        h('h3', null, t('editTitle')),
        h('div', { className: 'dsh-app-price-fields' },
          h('label', { className: 'dsh-app-price-field' }, h('span', null, t('model')),
            h('select', { value: route, onChange: event => select(event.currentTarget.value) },
              ...options.map(option => h('option', { key: option.route, value: option.route },
                `${option.route}${priced.has(option.route) ? '' : ` — ${t('unset')}`}`)))),
          h('label', { className: 'dsh-app-price-field' }, h('span', null, t('billing')),
            h('select', { value: mode, onChange: event => setMode(event.currentTarget.value) },
              h('option', { value: 'single' }, t('flat')), h('option', { value: 'tiered' }, t('tiered'))))),
        h('fieldset', { className: 'dsh-app-price-tier' }, h('legend', null, t('off')),
          h('div', { className: 'dsh-app-price-fields dsh-app-price-rates' },
            ...MODEL_PRICE_FIELDS.map(([key, name]) => field('offPeak', key, t(name), mode !== 'tiered')))),
        mode === 'tiered' ? h('fieldset', { className: 'dsh-app-price-tier' }, h('legend', null, t('peak')),
          h('div', { className: 'dsh-app-price-fields dsh-app-price-rates' },
            ...MODEL_PRICE_FIELDS.map(([key, name]) => field('peak', key, t(name))))) : null,
        h('div', { className: 'dsh-app-price-actions' },
          h('button', { type: 'button', className: 'dsh-app-price-primary', onClick: save }, t('save')),
          h('button', { type: 'button', className: 'dsh-app-price-danger', disabled: !current, onClick: remove }, t('remove')))) : null,
      !loading ? h('div', { className: 'dsh-app-price-peak' },
        h('h3', null, t('peakTitle')),
        h('label', { className: 'dsh-app-price-toggle' },
          h('input', { type: 'checkbox', checked: peakDraft.enabled,
            onChange: event => setPeakDraft(state => ({ ...state, enabled: event.currentTarget.checked })) }),
          h('span', null, t('enablePeak'))),
        h('div', { className: 'dsh-app-price-fields' },
          h('label', { className: 'dsh-app-price-field' }, h('span', null, t('windows')),
            h('input', { type: 'text', value: peakDraft.windows, placeholder: '09:00-12:00, 14:00-18:00',
              onChange: event => setPeakDraft(state => ({ ...state, windows: event.currentTarget.value })) })),
          h('label', { className: 'dsh-app-price-field' }, h('span', null, t('holidays')),
            h('input', { type: 'text', value: peakDraft.holidays, placeholder: '2026-10-01',
              onChange: event => setPeakDraft(state => ({ ...state, holidays: event.currentTarget.value })) }))),
        h('div', { className: 'dsh-app-price-actions' },
          h('button', { type: 'button', className: 'dsh-app-price-primary', onClick: savePeak }, t('savePeak')))) : null,
      status ? h('p', { className: status.kind === 'error' ? 'dsh-app-price-error' : 'dsh-app-price-ok', role: 'status' }, status.text) : null)
  }

  return { NS, dictionaries, ModelPrices }
}
