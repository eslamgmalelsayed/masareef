import { computed, watch } from 'vue'
import { allTx, spendTx, state, saveSettings, cycles, currentCycle, nextSalaryDate, income, totalLimit, cycleSpent, cycleDays, nativeExtra } from './store.js'
import { merchantKey } from './categories.js'

const DAY = 864e5
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
const addMonths = (ts, n) => { const d = new Date(ts); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return +d }

// ===================== الاشتراكات المتكررة =====================
// أي تاجر بيسحب نفس المبلغ تقريبًا كل أسبوع/شهر/سنة. البنود دي مش اشتراكات حتى لو اتكررت.
const NOT_SUB = new Set(['grocery', 'food', 'delivery', 'transport', 'cash', 'transfer', 'intl', 'bnpl', 'ccpay', 'fee', 'online', 'clothes'])
// البنود دي كفاية فيها عمليتين بس (فواتير واشتراكات بطبيعتها متكررة)
const BILL_LIKE = new Set(['subs', 'telecom', 'bills', 'rent', 'health', 'edu'])
const PERIODS = [
  { id: 'weekly', days: 7, tol: 2, m: 0, label: 'كل أسبوع' },
  { id: 'monthly', days: 30.44, tol: 5, m: 1, label: 'كل شهر' },
  { id: 'quarterly', days: 91, tol: 10, m: 3, label: 'كل ٣ شهور' },
  { id: 'semi', days: 182, tol: 15, m: 6, label: 'كل ٦ شهور' },
  { id: 'yearly', days: 365, tol: 20, m: 12, label: 'كل سنة' },
]
const nextOf = (ts, p) => (p.m ? addMonths(ts, p.m) : ts + 7 * DAY)

export const subscriptions = computed(() => {
  const now = Date.now()
  const hidden = new Set(state.settings.subsHidden || [])
  const by = {}
  for (const t of allTx.value) {
    if (!['purchase', 'bill'].includes(t.k) || NOT_SUB.has(t.c) || now - t.ts > 800 * DAY) continue
    const k = merchantKey(t.m)
    if (k) (by[k] ||= []).push(t)
  }
  const out = []
  for (const [mk, all] of Object.entries(by)) {
    if (all.length < 2) continue
    // نقسم عمليات التاجر لمجموعات حسب المبلغ (نفس التاجر ممكن يبقى له فاتورتين مختلفتين)
    const clusters = []
    for (const t of [...all].sort((a, b) => b.ts - a.ts)) {
      const c = clusters.find((x) => Math.abs(t.a - x.ref) <= Math.max(3, x.ref * 0.25))
      if (c) c.list.push(t)
      else clusters.push({ ref: t.a, list: [t] })
    }
    const found = []
    for (const c of clusters) {
      const series = c.list.sort((a, b) => a.ts - b.ts)
      const min = BILL_LIKE.has(series[0].c) ? 2 : 3
      if (series.length < min) continue
      const gaps = []
      for (let i = 1; i < series.length; i++) gaps.push((series[i].ts - series[i - 1].ts) / DAY)
      const g = median(gaps)
      const p = PERIODS.find((x) => Math.abs(g - x.days) <= x.tol)
      if (!p) continue
      if (gaps.filter((x) => Math.abs(x - p.days) <= p.tol * 1.6).length / gaps.length < 0.6) continue
      const last = series[series.length - 1]
      if (now - last.ts > p.days * DAY * 1.5 + 5 * DAY) continue // وقف
      let next = nextOf(last.ts, p)
      while (next < now - DAY) next = nextOf(next, p)
      found.push({ key: mk + '|' + Math.round(c.ref), mk, name: last.m, c: last.c, amount: last.a, period: p, last, next, count: series.length, monthly: (last.a * 30.44) / p.days, list: series })
    }
    // نفس التاجر ونفس المدة بمبلغين = السعر اتغيّر — نسيب الأحدث ونقول كان كام
    for (const f of found.sort((a, b) => b.last.ts - a.last.ts)) {
      const older = clusters.map((c) => c.list).flat().filter((t) => t.ts < f.list[0].ts && Math.abs(t.a - f.amount) > Math.max(1, f.amount * 0.05)).sort((a, b) => b.ts - a.ts)[0]
      const dup = out.find((o) => o.mk === f.mk && o.period.id === f.period.id)
      if (dup) continue
      const prev = f.list[f.list.length - 2]
      f.change = prev && Math.abs(f.amount - prev.a) > Math.max(1, prev.a * 0.05) ? f.amount - prev.a : older && f.list.length <= 3 && f.period.id === 'monthly' && f.list[0].ts - older.ts < 45 * DAY ? f.amount - older.a : 0
      if (!hidden.has(f.key) && !hidden.has(f.mk)) out.push(f)
    }
  }
  return out.sort((a, b) => b.monthly - a.monthly)
})
export function hideSubscription(key) {
  state.settings.subsHidden = [...new Set([...(state.settings.subsHidden || []), key])]
  saveSettings()
}

// ===================== أقساط تابي وتمارا =====================
// من رسايل تابي/تمارا نعرف المبلغ والمتجر، ومن رسايل البنك نعرف اتدفع كام قسط.
export const bnplPlans = computed(() => {
  const now = Date.now()
  const raw = [...state.bnplSms, ...state.importedBnpl]
  const seen = new Set()
  const plans = raw.filter((p) => { const k = p.prov + p.store + p.total + Math.round(p.ts / DAY); if (seen.has(k)) return false; seen.add(k); return true }).sort((a, b) => a.ts - b.ts)
  const charges = { tabby: [], tamara: [] }
  for (const t of allTx.value) {
    if (t.k !== 'purchase') continue
    if (/tabby|تابي/i.test(t.m)) charges.tabby.push(t)
    else if (/tamara|تمارا/i.test(t.m)) charges.tamara.push(t)
  }
  charges.tabby.sort((a, b) => a.ts - b.ts); charges.tamara.sort((a, b) => a.ts - b.ts)
  const used = new Set()
  const close = (a, b) => Math.abs(a - b) <= 0.05
  const out = []
  for (const p of plans) {
    const ch = charges[p.prov].filter((t) => !used.has(t.id) && t.ts >= p.ts - 3 * DAY)
    let n = p.n
    if (!n) {
      // تابي مش بيقول عدد الأقساط — نعرفه من أول قسط اتسحب من البطاقة
      const first = ch.filter((t) => t.ts <= p.ts + 4 * DAY)
      n = [4, 3, 6, 2, 12].find((k) => first.some((t) => close(t.a, p.total / k))) || 4
    }
    const inst = Math.round((p.total / n) * 100) / 100
    const paid = []
    for (const t of ch) {
      if (paid.length >= n) break
      if (!close(t.a, inst)) continue
      if (paid.length && t.ts - paid[paid.length - 1].ts < 18 * DAY) continue
      paid.push(t); used.add(t.id)
    }
    const lastTs = paid.length ? paid[paid.length - 1].ts : null
    const next = paid.length >= n ? null : paid.length === 0 ? (p.due && p.due > now ? p.due : p.ts) : (paid.length === 1 && p.due ? p.due : addMonths(lastTs, 1))
    // لو الموعد عدّى بكتير ومفيش قسط اتسحب، غالبًا اتدفع من مكان تاني — نعتبرها خلصت
    const stale = next && now - next > 40 * DAY
    out.push({
      id: p.prov + p.ts, prov: p.prov, provName: p.prov === 'tabby' ? 'تابي' : 'تمارا', store: p.store, total: p.total, n, inst,
      paid: paid.length, left: Math.max(0, n - paid.length), remaining: Math.max(0, n - paid.length) * inst,
      ts: p.ts, next, done: paid.length >= n || stale, estimated: !p.n && !paid.length,
    })
  }
  return out.reverse()
})
export const activePlans = computed(() => bnplPlans.value.filter((p) => !p.done))

/** الالتزامات: اللي عليك في الـ ٣٠ يوم الجايين، واللي محجوز من الراتب الجاي */
export const commitments = computed(() => {
  const now = Date.now()
  const in30 = now + 30 * DAY
  const ns = nextSalaryDate.value ? +nextSalaryDate.value : now + 30 * DAY
  const upcoming = []
  for (const p of activePlans.value) {
    let d = p.next
    for (let i = 0; i < p.left && d; i++, d = addMonths(d, 1)) upcoming.push({ kind: 'bnpl', name: `${p.provName} · ${p.store}`, a: p.inst, at: d, ref: p })
  }
  for (const s of subscriptions.value) {
    let d = s.next
    for (let i = 0; i < 14 && d < ns + 31 * DAY; i++) { upcoming.push({ kind: 'sub', name: s.name, a: s.amount, at: d, ref: s }); d = nextOf(d, s.period) }
  }
  upcoming.sort((a, b) => a.at - b.at)
  const sum = (l) => l.reduce((x, y) => x + y.a, 0)
  const next30 = upcoming.filter((u) => u.at <= in30)
  const fromNext = upcoming.filter((u) => u.at >= ns && u.at < ns + 30.44 * DAY)
  return {
    upcoming: upcoming.filter((u) => u.at <= Math.max(in30, ns + 30.44 * DAY)),
    next30: sum(next30), nextSalary: sum(fromNext),
    subsMonthly: subscriptions.value.reduce((x, s) => x + s.monthly, 0),
    bnplLeft: activePlans.value.reduce((x, p) => x + p.remaining, 0),
  }
})

// ===================== مصروف غريب =====================
// نفس المبلغ من نفس المكان مرتين في خلال ربع ساعة، أو عملية أكبر بكتير من عادتك مع نفس التاجر
export const unusual = computed(() => {
  const now = Date.now()
  const seen = new Set(state.settings.flagsSeen || [])
  const list = spendTx.value.filter((t) => t.k === 'purchase').sort((a, b) => a.ts - b.ts)
  const hist = {}
  const out = []
  for (let i = 0; i < list.length; i++) {
    const t = list[i]
    const k = merchantKey(t.m)
    const h = (hist[k] ||= [])
    if (now - t.ts < 30 * DAY && t.c !== 'bnpl') {
      const prev = list[i - 1]
      if (prev && merchantKey(prev.m) === k && Math.abs(prev.a - t.a) < 0.01 && t.ts - prev.ts < 15 * 60e3) {
        out.push({ id: 'dup' + t.id, type: 'dup', tx: t, text: `اتسحب ${fmt(t.a)} ر.س من ${t.m} مرتين ورا بعض — اتأكد إنها مش مكررة` })
      } else if (h.length >= 3) {
        const m = median(h)
        if (t.a >= 150 && t.a >= 3 * m) out.push({ id: 'big' + t.id, type: 'big', tx: t, text: `${fmt(t.a)} ر.س في ${t.m} — عادتك هناك حوالي ${fmt(m)}` })
      }
    }
    h.push(t.a)
  }
  return out.filter((f) => !seen.has(f.id)).reverse()
})
export function dismissFlag(id) {
  state.settings.flagsSeen = [...(state.settings.flagsSeen || []), id].slice(-300)
  saveSettings()
}
const fmt = (n) => Math.round(n || 0).toLocaleString('en-US')

/** متوسط كل تاجر — للجزء الأصلي علشان ينبهك على العملية الغريبة والتطبيق مقفول */
export const merchantMedians = computed(() => {
  const by = {}
  for (const t of spendTx.value) if (t.k === 'purchase' && t.c !== 'bnpl' && Date.now() - t.ts < 400 * DAY) { const k = merchantKey(t.m); if (k) (by[k] ||= []).push(t.a) }
  return Object.fromEntries(Object.entries(by).filter(([, l]) => l.length >= 3).sort((a, b) => b[1].length - a[1].length).slice(0, 300).map(([k, l]) => [k, Math.round(median(l) * 100) / 100]))
})

// ===================== الحوالات الدولية =====================
function personOf(name) {
  const raw = String(name || '').trim()
  const digits = (raw.match(/(\d{4})\s*$/) || [])[1] || ''
  const clean = raw.replace(/[*,،]?\s*\d+\s*$/, '').replace(/[*]/g, '').trim()
  const first = clean.split(/\s+/)[0]?.toLowerCase() || ''
  return { raw, clean, first, digits }
}
export const transfers = computed(() => {
  const now = Date.now()
  const tx = allTx.value.filter((t) => t.k === 'intl')
  const ps = tx.map((t) => ({ t, p: personOf(t.m) }))
  const byDigits = {}
  for (const { p } of ps) if (p.first && p.digits && !byDigits[p.digits]) byDigits[p.digits] = p.first
  const people = {}
  for (const { t, p } of ps) {
    const key = p.first && p.first !== '—' ? p.first : byDigits[p.digits] || 'غير معروف'
    const o = (people[key] ||= { key, names: {}, total: 0, year: 0, cycle: 0, fees: 0, count: 0, last: 0, list: [] })
    if (p.clean && p.clean !== '—') o.names[p.clean] = (o.names[p.clean] || 0) + 1
    o.list.push(t)
    if (now - t.ts < 365 * DAY) o.count++
    o.total += t.a
    if (now - t.ts < 365 * DAY) { o.year += t.a; o.fees += t.fee || 0 }
    if (t.d >= currentCycle.value.from) o.cycle += t.a
    o.last = Math.max(o.last, t.ts)
  }
  const list = Object.values(people).map((o) => {
    const names = Object.entries(o.names).sort((a, b) => b[0].length - a[0].length)
    return { ...o, name: names.length ? names[0][0] : 'بدون اسم', list: o.list.sort((a, b) => b.ts - a.ts) }
  }).filter((o) => o.year > 0).sort((a, b) => b.year - a.year)
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); const a = new Date(d.getFullYear(), d.getMonth() - i, 1), b = new Date(d.getFullYear(), d.getMonth() - i + 1, 1)
    months.push({ label: a.toLocaleDateString('ar-EG-u-nu-latn', { month: 'short' }), v: tx.filter((t) => t.d >= a && t.d < b).reduce((x, t) => x + t.a, 0) })
  }
  const year = tx.filter((t) => now - t.ts < 365 * DAY)
  return {
    people: list, months,
    year: year.reduce((x, t) => x + t.a, 0),
    fees: year.reduce((x, t) => x + (t.fee || 0), 0),
    count: year.length,
    cycle: tx.filter((t) => t.d >= currentCycle.value.from).reduce((x, t) => x + t.a, 0),
  }
})

// ===================== الادخار =====================
const spentIn = (a, b) => spendTx.value.filter((t) => t.d >= a && t.d <= b).reduce((x, t) => x + t.a, 0)
export const saveGoal = computed(() => Number(state.settings.saveGoal) || 0)
export const savings = computed(() => {
  const cyc = currentCycle.value
  const inc = income.value
  const elapsed = Math.max(1, (Date.now() - cyc.from) / DAY)
  const projectedSpend = Math.max(cycleSpent.value, (cycleSpent.value / elapsed) * cycleDays.value)
  const history = cycles.value.filter((c) => !c.current).slice(-6).map((c) => {
    const spent = spentIn(c.from, c.to)
    return { id: c.id, label: c.short || c.label, salary: c.salary, spent, saved: c.salary - spent }
  })
  const daysLeft = nextSalaryDate.value ? Math.max(1, Math.ceil((nextSalaryDate.value - Date.now()) / DAY)) : Math.max(1, Math.round(cycleDays.value - elapsed))
  const budget = saveGoal.value ? Math.min(totalLimit.value || Infinity, inc - saveGoal.value) : totalLimit.value
  return {
    goal: saveGoal.value, income: inc,
    soFar: inc - cycleSpent.value, projected: inc - projectedSpend,
    onTrack: saveGoal.value ? inc - projectedSpend >= saveGoal.value : null,
    perDay: budget ? Math.max(0, (budget - cycleSpent.value) / daysLeft) : 0,
    daysLeft, history,
    avgSaved: history.length ? history.reduce((x, h) => x + h.saved, 0) / history.length : 0,
  }
})

// ===================== ملخص الراتب اللي فات =====================
export const salarySummary = computed(() => {
  const c = cycles.value
  if (c.length < 2) return null
  const cur = c[c.length - 1], prev = c[c.length - 2]
  if (Date.now() - cur.from > 4 * DAY || state.settings.summarySeen === cur.id) return null
  const rows = spendTx.value.filter((t) => t.d >= prev.from && t.d <= prev.to)
  const spent = rows.reduce((x, t) => x + t.a, 0)
  const by = {}
  for (const t of rows) by[t.c] = (by[t.c] || 0) + t.a
  const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0]
  let before = null
  if (c.length >= 3) { const pp = c[c.length - 3]; before = spentIn(pp.from, pp.to) }
  return { id: cur.id, label: prev.label, salary: prev.salary, spent, saved: prev.salary - spent, top, change: before ? (spent - before) / before : null }
})
export function dismissSummary(id) { state.settings.summarySeen = id; saveSettings() }

// متوسط كل تاجر → الجزء الأصلي (تنبيه العملية الغريبة والتطبيق مقفول)
let lastUsual = ''
watch(merchantMedians, (m) => {
  const sig = JSON.stringify(m)
  if (sig === lastUsual) return
  lastUsual = sig
  nativeExtra.usual = m
}, { immediate: true })
