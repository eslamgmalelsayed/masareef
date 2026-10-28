import { computed, watch } from 'vue'
import { sym } from './format.js'
import { allTx, state, saveSettings, income, nativeExtra, profile } from './store.js'
import { loanAnswers, isNative } from './smsSource.js'
import { norm, personKey } from './person.js'
import { creditCards } from './credit.js'
import { activePlans } from './insights.js'

const DAY = 864e5
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
export const txHasDebt = (t) => list().some((d) => d.fromTx === t.id) || autoLentTxIds.value.has(t.id)

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
// ===== أي تحويل لشخص = سلفة ليك (تلقائي) — وتقدر تشيل أي تحويل منها =====
// بنجمع التحويلات حسب الشخص، واللي بيرجعهولك (تحويل جاي منه) بيتطرح
export const autoLentOn = computed(() => state.settings.autoLent !== false)
// بنبدأ من آخر ٣٠ يوم قبل ما الميزة تشتغل — مش كل التحويلات القديمة
if (state.settings.autoLentFrom == null) { state.settings.autoLentFrom = Date.now() - 30 * DAY; saveSettings() }
const autoFrom = () => (state.settings.autoLentFrom === 0 ? 0 : state.settings.autoLentFrom || Date.now() - 30 * DAY)
/** من إمتى نعتبر التحويلات سلف: عدد شهور لورا (0 = من أول رسالة) */
export function setAutoLentRange(months) { setS('autoLentFrom', months ? Date.now() - months * 30.44 * DAY : 0); setS('autoLentRange', months) }
export const autoLentRange = computed(() => (state.settings.autoLentRange ?? 1))
// ===== التحويلات لأشخاص: بنسأل بدل ما نفترض =====
// lentYes = تحويلات قلت عليها "سلفة" · lentDismiss = قلت "لا" · lentIgnore = أشخاص منسألش عليهم تاني
const yesSet = computed(() => new Set(state.settings.lentYes || []))
const yesPeople = computed(() => {
  const ids = yesSet.value, s = new Set()
  for (const t of allTx.value) if (ids.has(t.id)) s.add(personKey(t.m))
  return s
})
const MIN_LOAN = 50
// تحويل بيتكرر: نفس الشخص ونفس المبلغ تقريبًا من ٢٠–٤٥ يوم (إيجار، مصروف بيت…) — مش بنسأل عليه
function isRecurring(t, byKey) {
  return (byKey[personKey(t.m)] || []).some((x) => x.id !== t.id && Math.abs(x.a - t.a) <= Math.max(1, t.a * 0.02) && Math.abs(x.ts - t.ts) >= 20 * DAY && Math.abs(x.ts - t.ts) <= 45 * DAY)
}
/** التحويلات اللي مستنية ردك: سلفة ولا لأ؟ (الأحدث الأول) */
export const lentPending = computed(() => {
  if (!autoLentOn.value) return []
  const from = autoFrom()
  const yes = yesSet.value
  const dis = new Set(state.settings.lentDismiss || [])
  const ign = new Set(state.settings.lentIgnore || [])
  const manualTx = new Set(list().map((d) => d.fromTx).filter(Boolean))
  const tr = allTx.value.filter((t) => t.k === 'transfer')
  const byKey = {}
  for (const t of tr) (byKey[personKey(t.m)] ||= []).push(t)
  return tr
    .filter((t) => {
      if (t.ts < from || yes.has(t.id) || dis.has(t.id) || manualTx.has(t.id)) return false
      const k = personKey(t.m)
      if (!k || k === '—' || ign.has(k)) return false
      if (yesPeople.value.has(k)) return true
      // مبالغ صغيرة، أو حد بتحوّله على طول (محل/قهوة بالتحويل)، أو تحويل شهري ثابت → مش بنسأل
      if (t.a < MIN_LOAN) return false
      if ((byKey[k] || []).filter((x) => Math.abs(x.ts - t.ts) <= 30 * DAY).length >= 5) return false
      return !isRecurring(t, byKey)
    })
    .map((t) => ({ tx: t, key: personKey(t.m), likely: yesPeople.value.has(personKey(t.m)) }))
    .sort((a, b) => b.tx.ts - a.tx.ts)
})
/** "أيوه سلفة" */
export function markLoan(txId) {
  setS('lentYes', [...new Set([...(state.settings.lentYes || []), txId])].slice(-2000))
  setS('lentDismiss', (state.settings.lentDismiss || []).filter((x) => x !== txId))
}
/** "لا": ولو ده تاني "لا" لنفس الشخص من غير ولا "أيوه" → منسألش عليه تاني. بيرجّع true لو اتعمل كده */
export function answerNo(t) {
  notLoan(t.id)
  const k = personKey(t.m)
  if (yesPeople.value.has(k)) return false
  const dis = new Set(state.settings.lentDismiss || [])
  const nos = allTx.value.filter((x) => x.k === 'transfer' && dis.has(x.id) && personKey(x.m) === k).length
  if (nos >= 2) { ignorePerson(k); return true }
  return false
}
/** تراجع عن الرد (أيوه/لا) — يرجع يتسأل عليه */
export function unanswer(txId) {
  setS('lentYes', (state.settings.lentYes || []).filter((x) => x !== txId))
  setS('lentDismiss', (state.settings.lentDismiss || []).filter((x) => x !== txId))
}
export function unignorePerson(key) { setS('lentIgnore', (state.settings.lentIgnore || []).filter((k) => k !== key)) }
export { personKey }

export const autoLent = computed(() => {
  if (!autoLentOn.value) return []
  const yes = yesSet.value
  const manualTx = new Set(list().map((d) => d.fromTx).filter(Boolean))
  const by = {}
  for (const t of allTx.value) {
    if (t.k !== 'transfer' || !yes.has(t.id) || manualTx.has(t.id)) continue
    const k = personKey(t.m)
    if (!k || k === '—') continue
    const o = (by[k] ||= { key: k, names: {}, txs: [] })
    o.names[t.m] = (o.names[t.m] || 0) + 1
    o.txs.push(t)
  }
  const extra = state.settings.lentAutoPays || {}
  const closed = state.settings.lentAutoClosed || {}
  return Object.values(by).map((o) => {
    o.txs.sort((a, b) => a.ts - b.ts)
    const ts = o.txs[0].ts
    const name = Object.entries(o.names).sort((a, b) => b[1] - a[1])[0][0]
    const amount = o.txs.reduce((x, t) => x + t.a, 0)
    // اللي رجعلك: تحويلات جاية من نفس الاسم بعد أول سلفة + اللي سجلته بإيدك
    const back = allTx.value.filter((t) => t.k === 'in' && t.ts > ts && personKey(t.m) && personKey(t.m) === o.key).map((t) => ({ ts: t.ts, a: t.a, auto: true, tx: t }))
    const man = (extra[o.key] || []).map((p, i) => ({ ...p, i }))
    const pays = [...man, ...back].sort((a, b) => b.ts - a.ts)
    const paid = pays.reduce((x, p) => x + p.a, 0)
    const left = Math.max(0, amount - paid)
    return { id: 'auto:' + o.key, key: o.key, auto: true, type: 'lent', name, amount, ts, txs: o.txs.slice().reverse(), pays, paid, left, done: !!closed[o.key] || left <= 0.5, remindDays: 30 }
  }).sort((a, b) => b.left - a.left)
})
export const autoLentTxIds = computed(() => new Set(autoLent.value.flatMap((d) => d.txs.map((t) => t.id))))
function setS(k, v) { state.settings[k] = v; saveSettings() }
export function setAutoLent(on) { setS('autoLent', !!on) }
/** "مش سلفة": تحويل واحد */
export function notLoan(txId) {
  setS('lentDismiss', [...new Set([...(state.settings.lentDismiss || []), txId])].slice(-2000))
  if ((state.settings.lentYes || []).includes(txId)) setS('lentYes', state.settings.lentYes.filter((x) => x !== txId))
}
/** متعتبرش أي تحويل للشخص ده سلفة (دلوقتي وبعدين) */
export function ignorePerson(key) {
  setS('lentIgnore', [...new Set([...(state.settings.lentIgnore || []), key])])
  const mine = new Set(allTx.value.filter((t) => personKey(t.m) === key).map((t) => t.id))
  if ((state.settings.lentYes || []).some((x) => mine.has(x))) setS('lentYes', state.settings.lentYes.filter((x) => !mine.has(x)))
}
export function autoLentPay(key, a) { const m = { ...(state.settings.lentAutoPays || {}) }; m[key] = [...(m[key] || []), { ts: Date.now(), a: Number(a) }]; setS('lentAutoPays', m) }
export function autoLentUnpay(key, i) { const m = { ...(state.settings.lentAutoPays || {}) }; m[key] = (m[key] || []).filter((_, k) => k !== i); setS('lentAutoPays', m) }
export function autoLentClose(key, closed = true) { const m = { ...(state.settings.lentAutoClosed || {}) }; if (closed) m[key] = Date.now(); else delete m[key]; setS('lentAutoClosed', m) }

export const lent = computed(() => [...manualDebts.value.filter((d) => d.type === 'lent'), ...autoLent.value])
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
  for (const d of [...manualDebts.value, ...autoLent.value]) {
    if (d.done || (d.auto && d.left < 100)) continue
    if (d.type === 'owe' && Number(d.dueDay)) {
      for (let k = 0; k < 2; k++) {
        const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + k)
        const due = new Date(base.getFullYear(), base.getMonth(), Math.min(Number(d.dueDay), new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()), 9, 0, 0)
        const before = new Date(+due - DAY); before.setHours(10, 0, 0, 0)
        const amt = Number(d.monthly) ? ` — ${fmt(Math.min(d.monthly, d.left))} ${sym()}` : ''
        if (+before > now) out.push({ id: `due-debt-${d.id}-${+before}`, at: +before, title: `💸 قسط ${d.name} بكرة`, text: `متنساش تسدد${amt}` })
        if (+due > now) out.push({ id: `due-debt-${d.id}-${+due}`, at: +due, title: `💸 النهارده ميعاد قسط ${d.name}`, text: `الباقي عليك ${fmt(d.left)} ${sym()}${amt}` })
      }
    }
    if (d.type === 'lent') {
      const at = new Date(d.ts + (Number(d.remindDays) || 30) * DAY); at.setHours(19, 0, 0, 0)
      if (+at > now) out.push({ id: `due-lent-${d.id}`, at: +at, title: `🤝 ${d.name} لسه عليه ${fmt(d.left)} ${sym()}`, text: 'عدّى شهر من ساعة ما سلّفته — تحب تفكّره؟' })
    }
  }
  return out
})
// الجدولة نفسها في tools.js (بتجمع الكريدت + الديون + الزكاة)

/** رسالة لطيفة تفكّر بيها حد بالفلوس اللي عليه */
export function nudgeText(d) {
  return `أهلًا ${d.name.split(' ')[0]} 👋 بفكّرك بس بمبلغ ${fmt(d.left)} ريال اللي سلّفتهولك. لو تقدر ترجّعه الفترة دي يبقى كويس جدًا، ولو محتاج وقت قولّي عادي 🙏`
}


// ===== إشعار "سلفة؟" بزرارين (الجزء الأصلي بيسأل لحظة ما رسالة التحويل توصل) =====
// بنبعتله القواعد: أقل مبلغ، الأشخاص اللي منسألش عليهم، اللي سلّفناهم قبل كده، واللي بنحوّلهم على طول
const nk = (s) => norm(s)
watch(() => [autoLentOn.value, state.settings.lentIgnore, yesPeople.value, allTx.value.length], () => {
  const tr = allTx.value.filter((t) => t.k === 'transfer' && Date.now() - t.ts < 70 * DAY)
  const byKey = {}
  for (const t of tr) (byKey[personKey(t.m)] ||= []).push(t)
  const recent = Date.now() - 30 * DAY
  const freq = Object.entries(byKey).filter(([, l]) => l.filter((t) => t.ts >= recent).length >= 4).map(([k]) => k)
  const recur = []
  for (const [k, l] of Object.entries(byKey)) for (const t of l) if (isRecurring(t, byKey)) recur.push([k, t.a])
  nativeExtra.lent = {
    on: autoLentOn.value, min: MIN_LOAN,
    ignore: state.settings.lentIgnore || [], yes: [...yesPeople.value], freq, recur: recur.slice(0, 100),
    self: (profile().selfNames || []).map(nk).filter((x) => x.length >= 3),
    acc: (profile().accounts || []).map(String).filter((x) => x.length >= 3),
  }
}, { immediate: true, deep: true })

/** الردود اللي جت من الإشعار: بنطابقها بالتحويل (نفس المبلغ + نفس الشخص + في نفس الوقت تقريبًا) */
export function applyLoanInbox() {
  const box = state.settings.loanInbox || []
  if (!box.length) return
  const left = []
  for (const r of box) {
    const t = allTx.value.find((x) => x.k === 'transfer' && Math.abs(x.a - r.a) < 0.01 && Math.abs(x.ts - r.ts) < 20 * 60e3 && (!r.key || personKey(x.m) === r.key))
    if (t) { if (r.yes) markLoan(t.id); else answerNo(t) }
    else if (Date.now() - r.ts < 14 * DAY) left.push(r) // الرسالة لسه ماتقرتش — نستنى
  }
  state.settings.loanInbox = left
  saveSettings()
}
export async function pullLoanAnswers() {
  if (!isNative) return
  const got = await loanAnswers()
  if (got.length) { state.settings.loanInbox = [...(state.settings.loanInbox || []), ...got]; saveSettings() }
  applyLoanInbox()
}
