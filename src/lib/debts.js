import { computed } from 'vue'
import { allTx, state, saveSettings, income } from './store.js'
import { creditCards } from './credit.js'
import { activePlans } from './insights.js'

const DAY = 864e5
const norm = (s) => String(s || '').toLowerCase().replace(/[\s,،.*\-_]/g, '')
const fmt = (n) => Math.round(n || 0).toLocaleString('en-US')

/**
 * الديون اللي بتضيفها بإيدك — settings.debts:
 * { id, type: 'owe' (عليّا) | 'lent' (ليّا), name, amount, ts, monthly?, dueDay?, rate? (٪ سنوي), match? (اسم في التحويل), note?, pays: [{ts, a}], closed? }
 */
const list = () => state.settings.debts || []
function persist(arr) { state.settings.debts = arr; saveSettings() }

export function saveDebt(d) {
  const arr = [...list()]
  const i = arr.findIndex((x) => x.id === d.id)
  if (i >= 0) arr[i] = { ...arr[i], ...d }
  else arr.push({ pays: [], ts: Date.now(), ...d, id: 'd_' + Date.now().toString(36) })
  persist(arr)
}
export function deleteDebt(id) { persist(list().filter((d) => d.id !== id)) }
export function addPayment(id, a, ts = Date.now()) {
  persist(list().map((d) => (d.id === id ? { ...d, pays: [...(d.pays || []), { ts, a: Number(a) }] } : d)))
}
export function removePayment(id, idx) {
  persist(list().map((d) => (d.id === id ? { ...d, pays: d.pays.filter((_, i) => i !== idx) } : d)))
}

/** من تفاصيل تحويل: "دي سلفة" (حوّلت لحد) أو "اتسلفتها" (حد حوّلك) */
export function debtFromTx(t) {
  const out = t.k === 'transfer' || t.k === 'intl'
  const first = String(t.m || '').replace(/[,،]?\s*\d+\s*$/, '').trim()
  saveDebt({ type: out ? 'lent' : 'owe', name: first || t.m, amount: t.a, ts: t.ts, match: first.split(/\s+/)[0] || '', fromTx: t.id })
}
export const txHasDebt = (t) => list().some((d) => d.fromTx === t.id)

// تحويلات بتسدد الدين تلقائيًا: لو كتبت اسم الشخص زي ما بيظهر في رسالة البنك
function autoPays(d) {
  if (!d.match || norm(d.match).length < 3) return []
  const key = norm(d.match)
  const kinds = d.type === 'owe' ? ['transfer', 'intl'] : ['in']
  return allTx.value
    .filter((t) => kinds.includes(t.k) && t.ts > d.ts + 60e3 && t.id !== d.fromTx && norm(t.m).includes(key))
    .map((t) => ({ ts: t.ts, a: t.a, auto: true, tx: t }))
}

export const manualDebts = computed(() => list().map((d) => {
  const pays = [...(d.pays || []).map((p, i) => ({ ...p, i })), ...autoPays(d)].sort((a, b) => b.ts - a.ts)
  const paid = pays.reduce((x, p) => x + p.a, 0)
  const left = Math.max(0, Number(d.amount) - paid)
  return { ...d, pays, paid, left, done: d.closed || left <= 0.5 }
}))

/** كل اللي عليك: يدوي + الكريدت + تابي/تمارا */
export const owed = computed(() => {
  const ex = new Set(state.settings.debtExclude || [])
  const out = manualDebts.value.filter((d) => d.type === 'owe').map((d) => ({
    key: d.id, kind: 'manual', name: d.name, left: d.left, total: Number(d.amount), paid: d.paid, done: d.done,
    min: Number(d.monthly) || 0, rate: Number(d.rate) || 0, dueDay: Number(d.dueDay) || 0, ref: d,
  }))
  for (const c of creditCards.value) {
    if (ex.has(c.key) || !(c.outstanding > 1)) continue
    out.push({ key: c.key, kind: 'card', name: '💳 ' + c.name, left: c.outstanding, total: c.limit || c.outstanding, paid: 0, done: false,
      min: Math.max(100, Math.round(c.outstanding * 0.05)), minEst: true, rate: Number((state.settings.cards || {})[c.key]?.rate) || 0, dueDay: c.dueDay, ref: c })
  }
  for (const p of activePlans.value) {
    if (ex.has(p.id)) continue
    out.push({ key: p.id, kind: 'bnpl', name: `${p.provName} · ${p.store}`, left: p.remaining, total: p.total, paid: p.total - p.remaining, done: false,
      min: p.inst, rate: 0, fixed: true, ref: p })
  }
  return out
})
export const owedOpen = computed(() => owed.value.filter((d) => !d.done && d.left > 0))
export const lent = computed(() => manualDebts.value.filter((d) => d.type === 'lent'))
export const totals = computed(() => {
  const o = owedOpen.value
  const minSum = o.reduce((x, d) => x + Math.min(d.min || 0, d.left), 0)
  return {
    owed: o.reduce((x, d) => x + d.left, 0),
    min: minSum,
    ratio: income.value ? minSum / income.value : null, // نسبة الأقساط من الدخل
    lent: lent.value.filter((d) => !d.done).reduce((x, d) => x + d.left, 0),
  }
})
export function excludeDebt(key) {
  state.settings.debtExclude = [...new Set([...(state.settings.debtExclude || []), key])]
  saveSettings()
}

/**
 * محاكاة السداد شهر بشهر.
 * كل دين بياخد قسطه الأدنى، والمبلغ الزيادة + أقساط الديون اللي خلصت بتروح للدين اللي عليه الدور:
 * snowball = الأصغر الأول، avalanche = الأعلى فايدة الأول.
 */
export function simulate(debts, extra = 0, method = 'snowball', rollover = true) {
  const ds = debts.map((d) => ({ key: d.key, name: d.name, bal: d.left, min: Math.max(1, d.min || d.left * 0.05), r: (d.rate || 0) / 1200, fixed: d.fixed, end: null, interest: 0 }))
  const budget = ds.reduce((x, d) => x + d.min, 0) + Number(extra || 0)
  const curve = [ds.reduce((x, d) => x + d.bal, 0)]
  let m = 0
  while (ds.some((d) => d.bal > 0.5) && m < 360) {
    m++
    for (const d of ds) if (d.bal > 0) { const i = d.bal * d.r; d.bal += i; d.interest += i }
    let pool = rollover ? budget : ds.reduce((x, d) => x + (d.bal > 0 ? d.min : 0), 0) + Number(extra || 0)
    for (const d of ds) if (d.bal > 0) { const p = Math.min(d.bal, d.min); d.bal -= p; pool -= p }
    const order = ds.filter((d) => d.bal > 0.5 && !d.fixed).sort((a, b) => (method === 'avalanche' ? b.r - a.r || a.bal - b.bal : a.bal - b.bal))
    for (const d of order) { if (pool <= 0) break; const p = Math.min(d.bal, pool); d.bal -= p; pool -= p }
    for (const d of ds) if (d.bal <= 0.5 && d.end == null) { d.bal = 0; d.end = m }
    curve.push(ds.reduce((x, d) => x + Math.max(0, d.bal), 0))
  }
  return { months: m, capped: m >= 360, debts: ds, interest: ds.reduce((x, d) => x + d.interest, 0), curve, budget }
}

// ===== التذكيرات: مواعيد الكريدت + أقساط الديون + متابعة اللي ليك =====
export const debtReminders = computed(() => {
  const out = []
  const now = Date.now()
  for (const d of manualDebts.value) {
    if (d.done) continue
    if (d.type === 'owe' && Number(d.dueDay)) {
      for (let k = 0; k < 2; k++) {
        const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + k)
        const due = new Date(base.getFullYear(), base.getMonth(), Math.min(Number(d.dueDay), new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()), 9, 0, 0)
        const before = new Date(+due - DAY); before.setHours(10, 0, 0, 0)
        const amt = Number(d.monthly) ? ` — ${fmt(Math.min(d.monthly, d.left))} ر.س` : ''
        if (+before > now) out.push({ id: `due-debt-${d.id}-${+before}`, at: +before, title: `💸 قسط ${d.name} بكرة`, text: `متنساش تسدد${amt}` })
        if (+due > now) out.push({ id: `due-debt-${d.id}-${+due}`, at: +due, title: `💸 النهارده ميعاد قسط ${d.name}`, text: `الباقي عليك ${fmt(d.left)} ر.س${amt}` })
      }
    }
    if (d.type === 'lent') {
      const at = new Date(d.ts + (Number(d.remindDays) || 30) * DAY); at.setHours(19, 0, 0, 0)
      if (+at > now) out.push({ id: `due-lent-${d.id}`, at: +at, title: `🤝 ${d.name} لسه عليه ${fmt(d.left)} ر.س`, text: 'عدّى شهر من ساعة ما سلّفته — تحب تفكّره؟' })
    }
  }
  return out
})
// الجدولة نفسها في tools.js (بتجمع الكريدت + الديون + الزكاة)

/** رسالة لطيفة تفكّر بيها حد بالفلوس اللي عليه */
export function nudgeText(d) {
  return `أهلًا ${d.name.split(' ')[0]} 👋 بفكّرك بس بمبلغ ${fmt(d.left)} ريال اللي سلّفتهولك. لو تقدر ترجّعه الفترة دي يبقى كويس جدًا، ولو محتاج وقت قولّي عادي 🙏`
}
