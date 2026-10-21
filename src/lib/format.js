export const DAY = 864e5
import { reactive } from 'vue'

// إخفاء المبالغ (لو بتفتح التطبيق قدام حد) — كل الأرقام بتتعرض من fmt/fmt2
export const privacy = reactive({ on: (() => { try { return localStorage.getItem('hideAmounts') === '1' } catch { return false } })() })
export function setPrivacy(v) {
  privacy.on = !!v
  try { localStorage.setItem('hideAmounts', v ? '1' : '0') } catch {}
}
const MASK = '••••'
export const fmt = (n) => (privacy.on ? MASK : Math.round(n || 0).toLocaleString('en-US'))
export const fmt2 = (n) => (privacy.on ? MASK : (n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }))
export const fmtDate = (d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(d).toLocaleDateString('ar-EG-u-nu-latn', opts)
export const monthLabel = (y, m, withYear = false) =>
  new Date(y, m, 1).toLocaleDateString('ar-EG-u-nu-latn', withYear ? { month: 'short', year: '2-digit' } : { month: 'short' })
export const sum = (arr) => arr.reduce((s, t) => s + t.a, 0)

export function startOfDay(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
export function startOfWeek(d = new Date()) { const x = startOfDay(d); x.setDate(x.getDate() - x.getDay()); return x } // الأحد
export function startOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1) }

export function byCategory(rows) {
  const m = {}
  for (const t of rows) m[t.c] = (m[t.c] || 0) + t.a
  return Object.entries(m).sort((a, b) => b[1] - a[1])
}

export function relDay(d) {
  const t = startOfDay(), x = startOfDay(d)
  const diff = Math.round((t - x) / DAY)
  if (diff === 0) return 'النهارده'
  if (diff === 1) return 'امبارح'
  return fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' })
}
