// مميزات صغيرة: "السعر زاد" · الرسوم البنكية · أيام من غير صرف · "أقدر أشتريها؟" · ملخص الجمعة
import { computed, watch } from 'vue'
import { allTx, spendTx, state, saveSettings, nativeExtra, nextSalaryDate, totalLimit, weekLimit, periodStarts } from './store.js'
import { subscriptions } from './insights.js'
import { safeToSpend, saveFund } from './tools.js'
import { fmt } from './format.js'
import { notify, isNative } from './smsSource.js'

const DAY = 864e5
const startOf = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return +d }

// ===================== السعر زاد =====================
/** اشتراك/فاتورة متكررة آخر مرة اتسحبت بسعر أعلى من اللي قبلها (في آخر ٤٠ يوم) */
export const priceUps = computed(() => {
  const seen = new Set(state.settings.priceSeen || [])
  return subscriptions.value
    .filter((s) => s.change > 0 && Date.now() - s.last.ts < 40 * DAY)
    .map((s) => ({ id: s.key + '|' + s.last.id, name: s.name, now: s.amount, was: s.amount - s.change, up: s.change, pct: s.change / (s.amount - s.change), period: s.period.label, tx: s.last }))
    .filter((p) => !seen.has(p.id))
    .sort((a, b) => b.up - a.up)
})
export function dismissPrice(id) { state.settings.priceSeen = [...(state.settings.priceSeen || []), id].slice(-200); saveSettings() }

// ===================== الرسوم البنكية =====================
const FEE_TYPES = {
  remit: { ic: '🌍', name: 'رسوم الحوالات الدولية', tip: 'ادمج الحوالات الصغيرة في حوالة واحدة كبيرة كل شهر — الرسوم ثابتة تقريبًا مهما كان المبلغ.' },
  fx: { ic: '💱', name: 'رسوم الشراء بعملة أجنبية', tip: 'لما تشتري أونلاين بالدولار أو وانت مسافر، استخدم بطاقة من غير رسوم تحويل عملة.' },
  card: { ic: '💳', name: 'رسوم البطاقات', tip: 'اسأل البنك عن بطاقة من غير رسوم سنوية، والغي البطاقات اللي مش بتستخدمها.' },
  atm: { ic: '🏧', name: 'رسوم السحب', tip: 'اسحب من صرافات بنكك نفسه علشان متدفعش رسوم.' },
  sms: { ic: '✉️', name: 'رسوم الرسايل', tip: 'شوف لو البنك عنده إشعارات من التطبيق ببلاش بدل رسوم الرسايل.' },
  other: { ic: '🏦', name: 'رسوم تانية', tip: 'لو مش فاهم رسم معين، اسأل البنك — أحيانًا بيتشال لو طلبت.' },
}
const feeType = (t) => (/بطاق|تجديد|إصدار|اصدار|سنوي/.test(t.m) ? 'card' : /سحب|صراف|ATM/i.test(t.m) ? 'atm' : /رسائل|رسايل|SMS|نصي/i.test(t.m) ? 'sms' : 'other')
export const fees = computed(() => {
  const from = Date.now() - 365 * DAY
  const items = []
  for (const t of allTx.value) {
    if (t.ts < from) continue
    if (t.k === 'fee') items.push({ type: feeType(t), a: t.a, tx: t })
    if (t.fee) items.push({ type: 'remit', a: t.fee, tx: t })
    if (t.fx) items.push({ type: 'fx', a: t.fx, tx: t })
  }
  const by = {}
  for (const i of items) { const o = (by[i.type] ||= { id: i.type, ...FEE_TYPES[i.type], a: 0, n: 0 }); o.a += i.a; o.n++ }
  const monthFrom = Date.now() - 30 * DAY
  return {
    year: items.reduce((x, i) => x + i.a, 0),
    month: items.filter((i) => i.tx.ts >= monthFrom).reduce((x, i) => x + i.a, 0),
    types: Object.values(by).sort((a, b) => b.a - a.a),
    recent: items.sort((a, b) => b.tx.ts - a.tx.ts).slice(0, 15),
  }
})

// ===================== أيام من غير صرف =====================
export const STREAKS = {
  food: { name: 'أكل برا', cats: ['food', 'delivery'], ic: '🍔' },
  online: { name: 'تسوق أونلاين', cats: ['online'], ic: '📦' },
  any: { name: 'أي مشتريات', cats: null, ic: '🛍️' },
}
export const streak = computed(() => {
  const s = state.settings.streak || {}
  if (s.off) return null
  const target = STREAKS[s.target] ? s.target : 'food'
  const T = STREAKS[target]
  const today = +periodStarts.value.day
  const last = spendTx.value.filter((t) => (T.cats ? T.cats.includes(t.c) : t.k === 'purchase')).reduce((m, t) => Math.max(m, t.ts), 0)
  if (!last) return null // مفيش بيانات كفاية
  const days = Math.round((today - startOf(last)) / DAY) // لو آخر مرة امبارح = ١ (النهارده لسه نضيف)
  const best = Math.max(days, Number((s.best || {})[target]) || 0)
  return { target, ...T, days, best, record: days > 0 && days >= best }
})
// نحفظ أحسن رقم
watch(() => streak.value && [streak.value.target, streak.value.days], () => {
  const st = streak.value
  if (!st) return
  const s = state.settings.streak || {}
  if (st.days > (Number((s.best || {})[st.target]) || 0)) { state.settings.streak = { ...s, best: { ...(s.best || {}), [st.target]: st.days } }; saveSettings() }
})
export function setStreak(patch) { state.settings.streak = { ...(state.settings.streak || {}), ...patch }; saveSettings() }

// ===================== أقدر أشتريها؟ =====================
/** متوسط صرفك في اليوم آخر ٦٠ يوم (من غير الإيجار والحوالات والأقساط) */
const avgDay = computed(() => {
  const from = Date.now() - 60 * DAY
  const s = spendTx.value.filter((t) => t.ts >= from && !['rent', 'bnpl', 'ccpay'].includes(t.c)).reduce((x, t) => x + t.a, 0)
  return s / 60
})
export function affordCheck(price) {
  price = Number(price) || 0
  const sts = safeToSpend.value
  const days = sts.days || 1
  const after = sts.rest - price
  const perNow = Math.max(0, sts.perDay)
  const perAfter = Math.max(0, after / days)
  const noLimit = !totalLimit.value
  const eq = avgDay.value ? price / avgDay.value : 0
  let level, title
  if (noLimit) { level = 'none'; title = 'حدد حد للصرف الأول علشان أقدر أقولك' }
  else if (after < 0) { level = 'over'; title = `هتعدّي حدك بـ ${fmt(-after)} ر.س` }
  else if (perAfter < perNow * 0.6 || perAfter < 30) { level = 'tight'; title = 'تقدر — بس الشهر هيبقى ضيق' }
  else { level = 'ok'; title = 'ماشي، تقدر تشتريها' }
  const ns = nextSalaryDate.value ? +nextSalaryDate.value : null
  const fundMonths = Math.max(2, Math.min(12, Math.ceil(price / Math.max(1, (totalLimit.value || price) * 0.1))))
  return {
    price, level, title, days, perNow, perAfter, after, eqDays: eq,
    salaryIn: ns ? Math.max(1, Math.ceil((ns - Date.now()) / DAY)) : null,
    fund: { months: fundMonths, per: Math.ceil(price / fundMonths) },
  }
}
export function affordToFund(name, price, months) {
  const d = new Date(); d.setMonth(d.getMonth() + months); d.setDate(15)
  saveFund({ icon: '🎁', name: name || 'حاجة نفسي فيها', target: Number(price), due: +d })
}

// ===================== ملخص الجمعة (إشعار من الجزء الأصلي) =====================
/** متوسط صرف الأسبوع (آخر ٨ أسابيع كاملة) + بنود الأسبوع ده — الجزء الأصلي بيكمّل عليهم */
export const weekStats = computed(() => {
  const w0 = +periodStarts.value.week
  const from = w0 - 8 * 7 * DAY
  let past = 0
  const cats = {}
  for (const t of spendTx.value) {
    if (t.ts >= from && t.ts < w0) past += t.a
    else if (t.ts >= w0) cats[t.c] = (cats[t.c] || 0) + t.a
  }
  const oldest = spendTx.value.reduce((m, t) => Math.min(m, t.ts), Infinity)
  const weeks = Math.min(8, Math.floor((w0 - oldest) / (7 * DAY)))
  return { avg: weeks >= 2 ? Math.round(past / weeks) : 0, cats }
})
watch(() => [weekStats.value, state.settings.weeklyOff, weekLimit.value], () => {
  nativeExtra.weekly = { on: !state.settings.weeklyOff, avg: weekStats.value.avg, limit: weekLimit.value || 0 }
  nativeExtra.wkcats = Object.fromEntries(Object.entries(weekStats.value.cats).map(([k, v]) => [k, Math.round(v * 100) / 100]))
}, { immediate: true, deep: true })
export function setWeekly(on) { state.settings.weeklyOff = !on; saveSettings() }

// "السعر زاد" → إشعار مرة واحدة لكل زيادة
watch(priceUps, (list) => {
  if (!isNative || state.status !== 'ready') return
  const done = new Set(state.settings.priceNotified || [])
  const fresh = list.filter((p) => !done.has(p.id) && Date.now() - p.tx.ts < 3 * DAY)
  if (!fresh.length) return
  for (const p of fresh.slice(0, 2)) notify(`📈 ${p.name} زاد سعره`, `بقى ${fmt(p.now)} ر.س بدل ${fmt(p.was)} (+${fmt(p.up)}) ${p.period}`, 7300 + (Math.abs(hashStr(p.id)) % 500)).catch(() => {})
  state.settings.priceNotified = [...done, ...fresh.map((p) => p.id)].slice(-200)
  saveSettings()
})
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h }
