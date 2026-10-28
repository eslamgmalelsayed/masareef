import { computed, watch } from 'vue'
import { allTx, spendTx, state, saveSettings, cycles, currentCycle, nextSalaryDate, income, totalLimit, cycleSpent, cycleDays } from './store.js'
import { commitments, transfers, saveGoal } from './insights.js'
import { owedOpen, lent, debtReminders } from './debts.js'
import { fmt, sym } from './format.js'
import { dueReminders } from './credit.js'
import { scheduleReminders } from './smsSource.js'

const DAY = 864e5
const addMonths = (ts, n) => { const d = new Date(ts); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return +d }
const monthsUntil = (ts) => { const a = new Date(), b = new Date(ts); return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() >= a.getDate() ? 0 : -1) }
const daysLeft = () => (nextSalaryDate.value ? Math.max(1, Math.ceil((nextSalaryDate.value - Date.now()) / DAY)) : Math.max(1, Math.round(cycleDays.value - (Date.now() - currentCycle.value.from) / DAY)))
const uid = (p) => p + Date.now().toString(36)
function setList(key, arr) { state.settings[key] = arr; saveSettings() }

// ===================== صناديق المصاريف السنوية =====================
// تجديد الإقامة، رحلة مصر، العيد، التأمين… بتحدد المبلغ والميعاد، والتطبيق يقولك تحط كام كل راتب
export const funds = computed(() => (state.settings.funds || []).map((f) => {
  const saved = (f.adds || []).reduce((x, a) => x + a.a, 0)
  const left = Math.max(0, f.target - saved)
  const months = Math.max(1, monthsUntil(f.due) + 1)
  const perCycle = left / months
  const thisCycle = (f.adds || []).filter((a) => a.ts >= +currentCycle.value.from).reduce((x, a) => x + a.a, 0)
  return { ...f, saved, left, months, perCycle, thisCycle, needNow: Math.max(0, perCycle - thisCycle), due_passed: f.due < Date.now(), pct: f.target ? Math.min(1, saved / f.target) : 0 }
}).sort((a, b) => a.due - b.due))
export const fundsNeedNow = computed(() => funds.value.filter((f) => !f.due_passed).reduce((x, f) => x + f.needNow, 0))
export function saveFund(f) {
  const arr = [...(state.settings.funds || [])]
  const i = arr.findIndex((x) => x.id === f.id)
  if (i >= 0) arr[i] = { ...arr[i], ...f }
  else {
    // اللي كان معاك قبل ما تعمل الصندوق مش بيتحسب على الراتب ده
    const adds = f.initial ? [{ ts: +currentCycle.value.from - 1000, a: Number(f.initial) }] : []
    delete f.initial
    arr.push({ adds, ...f, id: uid('f_') })
  }
  setList('funds', arr)
}
export function fundAdd(id, a) { setList('funds', (state.settings.funds || []).map((f) => (f.id === id ? { ...f, adds: [...(f.adds || []), { ts: Date.now(), a: Number(a) }] } : f))) }
export function fundRenew(id) { setList('funds', (state.settings.funds || []).map((f) => (f.id === id ? { ...f, due: addMonths(f.due, 12), adds: [] } : f))) }
export function deleteFund(id) { setList('funds', (state.settings.funds || []).filter((f) => f.id !== id)) }

// ===================== صندوق الطوارئ =====================
// فلوس على جنب تكفي مصاريفك كام شهر لو حصل حاجة (شغل، علاج، عربية…)
const spentBetween = (a, b) => spendTx.value.filter((t) => t.d >= a && t.d <= b).reduce((x, t) => x + t.a, 0)
export const emergency = computed(() => {
  const e = state.settings.emergency || {}
  const months = Number(e.months) || 3
  const done = cycles.value.filter((c) => !c.current).slice(-3)
  const monthly = done.length ? done.reduce((x, c) => x + spentBetween(c.from, c.to) * (30.44 / Math.max(20, c.days)), 0) / done.length : cycleSpent.value
  const suggested = Math.ceil((monthly * months) / 500) * 500
  const target = Number(e.target) || suggested
  const adds = e.adds || []
  const saved = adds.reduce((x, a) => x + a.a, 0)
  const left = Math.max(0, target - saved)
  const speed = Number(e.speed) || 12 // يكتمل في كام شهر
  const perCycle = Number(e.perCycle) || (left ? Math.ceil(left / speed / 50) * 50 : 0)
  const thisCycle = adds.filter((a) => a.ts >= +currentCycle.value.from && a.a > 0).reduce((x, a) => x + a.a, 0)
  const on = !!e.on || !!adds.length || !!e.target
  return {
    on, months, monthly, suggested, target, saved, left, speed, perCycle, thisCycle,
    // مش بيتطرح من "تقدر تصرف/يوم" غير لما تفعّله انت
    needNow: on && left > 0 ? Math.max(0, Math.min(left, perCycle) - thisCycle) : 0,
    covers: monthly ? saved / monthly : 0, pct: target ? Math.min(1, saved / target) : 0,
    history: [...adds].sort((a, b) => b.ts - a.ts),
  }
})
export function saveEmergency(patch) { state.settings.emergency = { ...(state.settings.emergency || {}), on: true, ...patch }; saveSettings() }
export function emergencyAdd(a, note = '') {
  const e = state.settings.emergency || {}
  saveEmergency({ adds: [...(e.adds || []), { ts: Date.now(), a: Number(a), note }] })
}

// ===================== خطة الحوالات =====================
export const remit = computed(() => {
  const r = state.settings.remit || {}
  const T = transfers.value
  const target = Number(r.target) || 0
  const rate = Number(r.rate) || 0 // جنيه لكل ريال (بتكتبه انت)
  const year = allTx.value.filter((t) => t.k === 'intl' && Date.now() - t.ts < 365 * DAY)
  const withFee = year.filter((t) => t.fee)
  const avgFee = withFee.length ? withFee.reduce((x, t) => x + t.fee, 0) / withFee.length : 0
  // لو كنت جمعت الحوالات في حوالة واحدة كل شهر
  const months = new Set(year.map((t) => t.d.getFullYear() * 12 + t.d.getMonth())).size
  const extra = Math.max(0, year.length - months)
  const byBank = {}
  for (const t of year) { const o = (byBank[t.b] ||= { b: t.b, n: 0, a: 0, fee: 0 }); o.n++; o.a += t.a; o.fee += t.fee || 0 }
  return {
    target, rate, sent: T.cycle, left: Math.max(0, target - T.cycle), pct: target ? Math.min(1, T.cycle / target) : 0,
    avgFee, feePct: T.year ? T.fees / T.year : 0, mergeSave: extra * avgFee, extraCount: extra,
    banks: Object.values(byBank).map((o) => ({ ...o, avgFee: o.n ? o.fee / o.n : 0, feePct: o.a ? o.fee / o.a : 0 })).sort((a, b) => b.a - a.a),
  }
})
export function saveRemit(patch) { state.settings.remit = { ...(state.settings.remit || {}), ...patch }; saveSettings() }

// ===================== تقدر تصرف كام في اليوم (بجد) =====================
// الحد − اللي صرفته − الالتزامات اللي جاية قبل الراتب − باقي حوالة الشهر − الصناديق − الادخار
export const safeToSpend = computed(() => {
  const inc = income.value
  const lim = totalLimit.value
  const goal = saveGoal.value
  const base = goal ? Math.min(lim || Infinity, inc - goal) : lim
  const ns = nextSalaryDate.value ? +nextSalaryDate.value : Date.now() + 30 * DAY
  const upcoming = commitments.value.upcoming.filter((u) => u.at < ns).reduce((x, u) => x + u.a, 0)
  const includeT = state.settings.includeTransfers
  const remitLeft = remit.value.target ? Math.max(0, remit.value.target - transfers.value.cycle) : 0
  const parts = [
    { k: 'base', label: goal ? 'الحد بعد الادخار' : 'حد الراتب', v: base },
    { k: 'spent', label: 'صرفت', v: -cycleSpent.value },
    { k: 'up', label: 'أقساط واشتراكات قبل الراتب', v: -upcoming },
    { k: 'remit', label: 'باقي حوالة الشهر', v: -remitLeft },
    { k: 'funds', label: 'الصناديق', v: -fundsNeedNow.value },
    { k: 'emergency', label: 'صندوق الطوارئ', v: -emergency.value.needNow },
  ].filter((p) => p.k === 'base' || p.k === 'spent' || p.v)
  const rest = parts.reduce((x, p) => x + p.v, 0)
  const days = daysLeft()
  return { parts, rest, days, perDay: base ? Math.max(0, rest / days) : 0, includeT }
})

// ===================== أرصدة الحسابات وصافي الثروة =====================
/** آخر رصيد ظهر لكل بنك/محفظة (من غير الكريدت) */
export const balances = computed(() => {
  const by = {}
  for (const t of allTx.value) {
    if (t.bal == null || t.cc) continue
    const o = by[t.b]
    if (!o || t.ts > o.ts) by[t.b] = { b: t.b, v: t.bal, ts: t.ts }
  }
  return Object.values(by).filter((o) => Date.now() - o.ts < 400 * DAY).sort((a, b) => b.v - a.v)
})
// أنواع الممتلكات: الزكاة افتراضيًا على الكاش والدهب والاستثمار — مش على البيت والعربية اللي بتستخدمهم
export const ASSET_TYPES = [
  { id: 'cash', ic: '💵', t: 'كاش', zakat: true },
  { id: 'gold', ic: '🪙', t: 'دهب', zakat: true },
  { id: 'invest', ic: '📈', t: 'أسهم واستثمار', zakat: true },
  { id: 'property', ic: '🏠', t: 'عقار / أرض', zakat: false },
  { id: 'car', ic: '🚗', t: 'عربية', zakat: false },
  { id: 'other', ic: '📦', t: 'حاجة تانية', zakat: false },
]
/** قيمة الدهب بتتحسب من الجرامات × سعر الجرام اللي في صفحة الزكاة */
export const assetValue = (a) => (a.type === 'gold' && Number(a.grams) && Number((state.settings.zakat || {}).gram) ? Number(a.grams) * Number(state.settings.zakat.gram) : Number(a.v) || 0)
export const assets = computed(() => (state.settings.assets || []).map((a) => ({ ...a, value: assetValue(a), zk: a.zakat ?? (ASSET_TYPES.find((t) => t.id === (a.type || 'other'))?.zakat ?? true) })))
export function saveAssets(arr) { setList('assets', arr.map(({ value, zk, ...a }) => a)) }

export const netWorth = computed(() => {
  const ex = new Set(state.settings.nwExclude || [])
  const bank = balances.value.filter((b) => !ex.has(b.b)).reduce((x, b) => x + b.v, 0)
  const other = assets.value.reduce((x, a) => x + a.value, 0)
  const recv = lent.value.filter((d) => !d.done).reduce((x, d) => x + d.left, 0)
  const debt = owedOpen.value.reduce((x, d) => x + d.left, 0)
  return { bank, other, recv, debt, net: bank + other + recv - debt }
})
// لقطة لكل راتب علشان تشوف صافي ثروتك بيتغير إزاي
watch(() => [netWorth.value.net, currentCycle.value.id], ([v, id]) => {
  if (!id || !Number.isFinite(v) || state.status !== 'ready') return
  const h = { ...(state.settings.nwHist || {}) }
  if (h[id] === Math.round(v)) return
  h[id] = Math.round(v)
  const keys = Object.keys(h).sort().slice(-12)
  state.settings.nwHist = Object.fromEntries(keys.map((k) => [k, h[k]]))
  saveSettings()
})
/** رصيد البنوك آخر كل راتب (من الرسايل) */
export const bankHistory = computed(() => cycles.value.slice(-6).map((c) => {
  const end = +c.to
  const by = {}
  for (const t of allTx.value) if (t.bal != null && !t.cc && t.ts <= end && (!by[t.b] || t.ts > by[t.b].ts)) by[t.b] = t
  return { id: c.id, label: c.short || c.label, v: Object.values(by).reduce((x, t) => x + t.bal, 0), nw: (state.settings.nwHist || {})[c.id] }
}))

// ===================== الزكاة =====================
// النصاب = ٨٥ جرام دهب عيار ٢٤ — سعر الجرام بتكتبه انت. الحول = سنة هجرية (٣٥٤ يوم)
export const zakat = computed(() => {
  const z = state.settings.zakat || {}
  const gram = Number(z.gram) || 0
  const nisab = gram * 85
  const bank = netWorth.value.bank
  const extra = assets.value.filter((a) => a.zk).reduce((x, a) => x + a.value, 0)
  const recv = z.withLent ? netWorth.value.recv : 0
  const debt = z.minusDebt ? netWorth.value.debt : 0
  const base = Math.max(0, bank + extra + recv - debt)
  let due = null
  if (z.hawl) { due = Number(z.hawl); while (due < Date.now() - DAY) due += 354 * DAY }
  return { gram, nisab, bank, extra, recv, debt, base, reached: nisab ? base >= nisab : null, amount: nisab && base >= nisab ? base * 0.025 : 0, due, hawl: z.hawl || null }
})
export function saveZakat(patch) { state.settings.zakat = { ...(state.settings.zakat || {}), ...patch }; saveSettings() }

// ===================== السفر والمناسبات =====================
export const events = computed(() => (state.settings.events || []).map((e) => {
  const to = e.to || Date.now()
  const rows = spendTx.value.filter((t) => t.ts >= e.from && t.ts <= to)
  const byCat = {}
  for (const t of rows) byCat[t.c] = (byCat[t.c] || 0) + t.a
  const days = Math.max(1, Math.ceil((to - e.from) / DAY))
  const total = rows.reduce((x, t) => x + t.a, 0)
  return { ...e, active: !e.to, rows, total, days, perDay: total / days, byCat: Object.entries(byCat).sort((a, b) => b[1] - a[1]) }
}).sort((a, b) => b.from - a.from))
export const activeEvent = computed(() => events.value.find((e) => e.active) || null)
export function startEvent(e) {
  const arr = (state.settings.events || []).map((x) => (x.to || e.to ? x : { ...x, to: Date.now() }))
  arr.push({ id: uid('e_'), from: Date.now(), to: null, ...e })
  setList('events', arr)
}
export function saveEvent(e) { setList('events', (state.settings.events || []).map((x) => (x.id === e.id ? { ...x, ...e } : x))) }
export function stopEvent(id) { saveEvent({ id, to: Date.now() }) }
export function deleteEvent(id) { setList('events', (state.settings.events || []).filter((x) => x.id !== id)) }

// ===================== تذكير الزكاة =====================
export const zakatReminders = computed(() => {
  const d = zakat.value.due
  if (!d) return []
  const out = []
  const before = new Date(d - 3 * DAY); before.setHours(10, 0, 0, 0)
  const on = new Date(d); on.setHours(9, 0, 0, 0)
  const amt = zakat.value.amount ? ` — تقريبًا ${Math.round(zakat.value.amount).toLocaleString('en-US')} ${sym()}` : ''
  if (+before > Date.now()) out.push({ id: 'due-zakat-' + +before, at: +before, title: '🕌 الزكاة بعد ٣ أيام', text: 'افتح مصاريفي وراجع الحساب' + amt })
  if (+on > Date.now()) out.push({ id: 'due-zakat-' + +on, at: +on, title: '🕌 النهارده ميعاد الزكاة', text: 'الحول كمل' + amt })
  return out
})

// ===== جدولة كل التذكيرات مرة واحدة: الكريدت + الديون + الزكاة =====
let lastSig = ''
watch([dueReminders, debtReminders, zakatReminders], ([a, b, c]) => {
  const items = [...a, ...b, ...c]
  const sig = JSON.stringify(items.map((x) => [x.id, x.text]))
  if (sig === lastSig) return
  lastSig = sig
  scheduleReminders(items)
}, { immediate: true })
