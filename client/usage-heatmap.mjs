const tokenCount = row => ['input', 'cacheRead', 'cacheWrite', 'output'].reduce((sum, key) => sum + (Number.isFinite(row?.[key]) ? row[key] : 0), 0)

const weekdayName = key => { const [year, month, day] = key.split('-').map(Number); return new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: 'short' }) }

/** Twenty-one cells: one column per weekday (Monday first) and one row per eight-hour slice. */
function weekCells(summary, today) {
  const hour = summary?.activity?.hour ?? 23, segment = Math.floor(hour / 8)
  return Array.from({ length: 21 }, (_, index) => {
    const column = Math.floor(index / 3), slice = index % 3, entry = summary?.week?.[column]
    const date = entry?.date ?? today, start = slice * 8
    const future = !entry || date > today || (date === today && start > hour)
    return { key: `${date}-${slice}`, current: date === today && slice === segment,
      future, unknown: !summary || (!future && (entry?.unlocatedTokens ?? 0) > 0),
      parts: [{ label: `${date} ${weekdayName(date)} ${String(start).padStart(2, '0')}:00–${String(start + 8).padStart(2, '0')}:00`, ...(entry?.buckets?.[slice] ?? {}) }] }
  })
}

/** Exactly 24 hourly, 21 weekly or 30 monthly cells. The last month cell includes day 31. */
export function activityCells(summary, period = 'today') {
  const date = summary?.activity?.date ?? summary?.date ?? new Date().toLocaleDateString('en-CA')
  const month = date.slice(0, 7), day = Number(date.slice(8, 10))
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
  const rows = period === 'month' ? Array.from({ length: 30 }, (_, index) => {
    const number = index + 1, dates = number > daysInMonth ? [] : [number, ...(number === 30 && daysInMonth === 31 ? [31] : [])]
    const parts = dates.map(number => { const key = `${month}-${String(number).padStart(2, '0')}`; return { label: key, ...(summary?.days?.find(row => row.date === key) ?? {}), future: number > day } })
    return { key: `${month}-${number}`, parts, future: !parts.length || parts.every(row => row.future), current: dates.includes(day), unknown: !summary }
  }) : period === 'week' ? weekCells(summary, date) : Array.from({ length: 24 }, (_, hour) => ({ key: `${date}-${hour}`, current: hour === summary?.activity?.hour,
    future: hour > (summary?.activity?.hour ?? 23), unknown: !summary || (summary.activity?.unlocatedTokens > 0 && hour <= summary.activity.hour),
    parts: [{ label: `${String(hour).padStart(2, '0')}:00–${String(hour + 1).padStart(2, '0')}:00`, ...(summary?.activity?.hours?.[hour] ?? {}) }] }))
  const maximum = Math.max(1, ...rows.map(row => row.parts.reduce((sum, part) => sum + tokenCount(part), 0)))
  return rows.map(row => { const tokens = row.parts.reduce((sum, part) => sum + tokenCount(part), 0); return { ...row, tokens, level: tokens ? Math.min(4, Math.max(1, Math.ceil(Math.sqrt(tokens / maximum) * 4))) : 0 } })
}

export default function createUsageHeatmapClient(require) {
  const React = require('react'), { createPortal } = require('react-dom')
  const { createElement: h, useRef, useState, useId, useEffect } = React
  function UsageHeatmap({ summary, period, onOpen, t }) {
    const cells = activityCells(summary, period), columns = period === 'month' ? 10 : period === 'week' ? 7 : 8, rows = 3
    const gridRef = useRef(null), tooltipId = useId()
    const [active, setActive] = useState(0), [hover, setHover] = useState(null)
    useEffect(() => { setActive(value => Math.min(value, cells.length - 1)); setHover(null) }, [period])
    const format = value => new Intl.NumberFormat(undefined).format(value ?? 0)
    const description = cell => cell.parts.map(part => `${part.label} · ${format(tokenCount(part))} Token`).join('\n')
    const show = (index, target) => {
      const rect = target.getBoundingClientRect()
      setHover({ index, left: Math.max(8, Math.min(rect.left, window.innerWidth - 252)), bottom: window.innerHeight - rect.top + 9 })
    }
    /** Cell order runs down a column first, then on to the next column. */
    const rowIndexes = row => Array.from({ length: columns }, (_, column) => column * rows + row).filter(index => cells[index])
    const keydown = event => {
      const next = ({ ArrowRight: active + rows, ArrowLeft: active - rows, ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: cells.length - 1 })[event.key]
      if (next === undefined) return
      event.preventDefault()
      const index = Math.max(0, Math.min(cells.length - 1, next))
      setActive(index)
      gridRef.current?.querySelector(`[data-usage-cell="${index}"]`)?.focus()
    }
    const selected = hover && cells[hover.index]
    return h('div', { className: 'dsh-app-mini-usage', 'data-usage-period': period },
      h('div', { key: period, ref: gridRef, className: 'dsh-app-usage-grid', role: 'grid', 'aria-label': t(period === 'month' ? 'monthTokens' : period === 'week' ? 'weekTokens' : 'hourlyTokens'), 'aria-rowcount': rows, 'aria-colcount': columns, onKeyDown: keydown, onMouseLeave: () => setHover(null) },
        Array.from({ length: rows }, (_, row) => h('div', { key: row, role: 'row', className: 'dsh-app-usage-grid-row', style: { gridTemplateColumns: `repeat(${columns}, 1fr)` } },
          rowIndexes(row).map(index => {
            const cell = cells[index]
            return h('button', { key: cell.key, type: 'button', role: 'gridcell', tabIndex: active === index ? 0 : -1,
              'data-usage-cell': index, 'data-level': cell.level, 'data-future': cell.future || undefined, 'data-current': cell.current || undefined,
              'aria-label': `${description(cell) || t('noDay')}${cell.unknown ? ` · ${t('unknownHours')}` : ''}`,
              'aria-describedby': hover?.index === index ? tooltipId : undefined,
              onFocus: event => { setActive(index); show(index, event.currentTarget) }, onBlur: () => setHover(null),
              onMouseEnter: event => show(index, event.currentTarget), onClick: () => { setHover(null); onOpen?.() } })
          })))),
      selected ? createPortal(h('div', { id: tooltipId, className: 'dsh-app-usage-tooltip', role: 'tooltip', style: { left: hover.left, bottom: hover.bottom } },
        !selected.parts.length ? h('strong', {}, t('noDay')) : null,
        selected.parts.map(part => h('div', { key: part.label, className: 'dsh-app-usage-tooltip-part' }, h('strong', {}, part.label),
          h('span', {}, `${format(tokenCount(part))} Token${part.future ? ` · ${t('futureUsage')}` : ''}`),
          h('small', {}, `${t('usageInput')} ${format(part.input)} · ${t('usageCache')} ${format((part.cacheRead ?? 0) + (part.cacheWrite ?? 0))} · ${t('usageOutput')} ${format(part.output)}`))),
        h('small', {}, summary?.timeZone ?? ''), selected.unknown ? h('small', {}, t('unknownHours')) : null), document.body) : null)
  }
  return { UsageHeatmap }
}
