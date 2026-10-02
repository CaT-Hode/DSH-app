/** DeepSeek's published rates, checked 2026-09-30. Values are per million tokens. */
export const PRICING_SOURCE = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/'
export const PRICING_CHECKED_AT = '2026-09-30'
const rates = {
  'deepseek-flash': { USD: [0.003, 0.15, 0.6], CNY: [0.02, 1, 4] },
  'deepseek-v4-pro': { USD: [0.022, 0.66, 1.98], CNY: [0.15, 4.5, 13.5] },
}
const aliases = { 'deepseek-v4-flash': 'deepseek-flash', 'deepseek-v4-flash-vision-exp': 'deepseek-flash' }
// Chinese public holidays, State Council notice 国办发明电〔2025〕7号.
// https://www.beijing.gov.cn/zhengce/zhengcefagui/202511/t20251104_4258873.html
const holidays = { 2026: [[1, 1, 3], [2, 15, 23], [4, 4, 6], [5, 1, 5], [6, 19, 21], [9, 25, 27], [10, 1, 7]] }

export function officialPriceOf(model, time) {
  const canonical = aliases[model] ?? model
  if (!Object.hasOwn(rates, canonical) || !Number.isFinite(time)) return
  const beijing = new Date(time + 8 * 3600_000)
  const year = beijing.getUTCFullYear(), month = beijing.getUTCMonth() + 1, day = beijing.getUTCDate()
  const calendarKnown = Object.hasOwn(holidays, year)
  const holiday = holidays[year]?.some(([m, first, last]) => m === month && day >= first && day <= last)
  const weekday = beijing.getUTCDay()
  const minute = beijing.getUTCHours() * 60 + beijing.getUTCMinutes()
  const peak = weekday >= 1 && weekday <= 5 && !holiday && ((minute >= 540 && minute < 720) || (minute >= 840 && minute < 1080))
  const tier = values => ({ cacheHit: values[0] * (peak ? 2 : 1), cacheMiss: values[1] * (peak ? 2 : 1), output: values[2] * (peak ? 2 : 1) })
  return { ...tier(rates[canonical].USD), cny: tier(rates[canonical].CNY), source: 'deepseek-official',
    model: canonical, tier: peak ? 'peak' : 'off-peak', calendarKnown, checkedAt: PRICING_CHECKED_AT, url: PRICING_SOURCE }
}

export function officialPricing(time = Date.now()) {
  return { source: PRICING_SOURCE, checkedAt: PRICING_CHECKED_AT, timeZone: 'Asia/Shanghai',
    models: Object.keys(rates).map(model => ({ model, ...officialPriceOf(model, time) })) }
}
