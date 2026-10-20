import { reactive, computed, watch } from 'vue'
import { parseMessages, messagesFromXml, messagesFromJson, BANKS, detectProfile } from './parser.js'
import { categorize, merchantKey, TRANSFER_CATS, RULES, CATEGORIES } from './categories.js'
import { isNative, readSms, saveNativeConfig } from './smsSource.js'

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) { console.warn('storage', e) } },
}

const DEFAULT_SETTINGS = {
  name: '', // فاضي = الاسم اللي اتعرف عليه من الرسايل
  selfNames: '', // فاضي = تلقائي
  accounts: '', // فاضي = تلقائي
  budget: 0,
  includeTransfers: false,
  limits: {}, // catId -> حد لكل راتب بالريال
  theme: 'light', // light | dark | auto
  income: '', // الدخل الشهري (٠ = ناخده من رسالة الراتب)
  totalLimit: '', // حد إجمالي المصروفات لكل راتب (٠ = نفس الدخل)
  totalAlert: true,
  salaryDay: '', // فاضي = تلقائي من رسايل الراتب
  v: 2,
}

// النسخ القديمة كانت بتحفظ أسماء وأرقام حسابات ثابتة — نمسحها مرة واحدة ونخليها تلقائي
const saved = LS.get('settings', {})
if (!saved.v) { saved.name = ''; saved.selfNames = ''; saved.accounts = ''; saved.v = 2 }

export const state = reactive({
  settings: { ...DEFAULT_SETTINGS, ...saved },
  detected: LS.get('detected', { accounts: [], selfNames: [], displayName: '' }),
  overrides: LS.get('overrides', {}),
  smsTx: [],
  importedTx: LS.get('importedTx', []),
  manualTx: LS.get('manualTx', []), // مصاريف بتضيفها بإيدك
  status: 'idle', // idle | loading | ready | denied | error
  error: '',
  lastSync: LS.get('lastSync', 0),
})

export function saveSettings() { LS.set('settings', state.settings) }

const split = (s) => String(s || '').split(/[,،\n]/).map((x) => x.trim()).filter(Boolean)
/** القيم اللي بتكتبها بإيدك ليها الأولوية، وإلا اللي اتعرف عليه تلقائيًا */
function profile() {
  const names = split(state.settings.selfNames), accs = split(state.settings.accounts)
  return {
    selfNames: names.length ? names : state.detected.selfNames,
    accounts: accs.length ? accs : state.detected.accounts,
  }
}
export const displayName = computed(() => state.settings.name || state.detected.displayName || '')

function learnProfile(messages, merge = false) {
  const d = detectProfile(messages)
  if (!d.accounts.length && !d.selfNames.length) return
  const u = (a, b) => [...new Set([...(merge ? a : []), ...b])]
  state.detected = {
    accounts: u(state.detected.accounts, d.accounts),
    selfNames: u(state.detected.selfNames, d.selfNames),
    displayName: d.displayName || state.detected.displayName,
  }
  LS.set('detected', state.detected)
}

let rawSms = []

export async function syncSms() {
  if (!isNative) { state.status = 'ready'; return }
  state.status = 'loading'
  state.error = ''
  try {
    rawSms = await readSms(Object.keys(BANKS))
    learnProfile(rawSms)
    state.smsTx = parseMessages(rawSms, profile())
    state.lastSync = Date.now()
    LS.set('lastSync', state.lastSync)
    state.status = 'ready'
  } catch (e) {
    const msg = String(e && (e.message || e))
    state.status = /denied|permission/i.test(msg) ? 'denied' : 'error'
    state.error = msg
  }
}

/** re-parse after the user changes their name / account numbers */
export function reparse() {
  if (rawSms.length) state.smsTx = parseMessages(rawSms, profile())
}

export async function importFile(file) {
  const text = await file.text()
  const msgs = /^\s*[[{]/.test(text) ? messagesFromJson(text) : messagesFromXml(text)
  learnProfile(msgs, true)
  const tx = parseMessages(msgs, profile())
  const byId = new Map(state.importedTx.map((t) => [t.id, t]))
  tx.forEach((t) => byId.set(t.id, t))
  state.importedTx = [...byId.values()].sort((a, b) => b.ts - a.ts)
  LS.set('importedTx', state.importedTx)
  return tx.length
}

export function clearImported() {
  state.importedTx = []
  LS.set('importedTx', [])
}

export function setCategory(tx, catId) {
  if (tx.k === 'manual') { const m = state.manualTx.find((x) => x.id === tx.id); if (m) saveManual({ ...m, cat: catId }); return }
  const key = merchantKey(tx.m)
  if (!key) return
  state.overrides = { ...state.overrides, [key]: catId }
  LS.set('overrides', state.overrides)
}
export function resetOverrides() {
  state.overrides = {}
  LS.set('overrides', {})
}

/** كل العمليات بعد الدمج والتصنيف */
export const allTx = computed(() => {
  const byId = new Map()
  for (const t of state.importedTx) byId.set(t.id, t)
  for (const t of state.smsTx) byId.set(t.id, t)
  const ov = state.overrides
  const out = [...byId.values()].map((t) => ({ ...t, c: categorize(t, ov), d: new Date(t.ts) }))
  for (const t of state.manualTx) {
    out.push({ ...t, c: t.cat, d: new Date(t.ts) })
    // لو دفعته كاش من فلوس سحبتها، نطرحه من "سحب نقدي" علشان ميتحسبش مرتين
    if (t.fromCash) out.push({ id: t.id + ':adj', ts: t.ts, a: -t.a, k: 'cashAdj', m: t.m, b: t.b, c: 'cash', d: new Date(t.ts) })
  }
  return out.sort((a, b) => b.ts - a.ts)
})

/** إضافة أو تعديل مصروف يدوي */
export function saveManual(entry) {
  const t = {
    id: entry.id || 'm:' + Date.now().toString(36),
    ts: entry.ts || Date.now(),
    a: Math.round(Math.abs(Number(entry.a) || 0) * 100) / 100,
    k: 'manual',
    m: (entry.m || '').trim() || 'مصروف يدوي',
    b: entry.fromCash ? 'كاش' : 'يدوي',
    cat: entry.cat || 'other',
    fromCash: !!entry.fromCash,
  }
  if (!t.a) return null
  const list = state.manualTx.filter((x) => x.id !== t.id)
  list.push(t)
  state.manualTx = list
  LS.set('manualTx', list)
  return t
}
export function deleteManual(id) {
  state.manualTx = state.manualTx.filter((x) => x.id !== id)
  LS.set('manualTx', state.manualTx)
}

const OUT_KINDS = new Set(['purchase', 'transfer', 'intl', 'cash', 'bill', 'gov', 'fee', 'manual', 'cashAdj'])

/** العمليات اللي بتتحسب كمصروف حسب إعداد التحويلات */
export const spendTx = computed(() =>
  allTx.value.filter((t) => OUT_KINDS.has(t.k) && (state.settings.includeTransfers || !TRANSFER_CATS.has(t.c))),
)
const DAYMS = 864e5
export const OUT = OUT_KINDS

/**
 * دورات الراتب: كل دورة من يوم نزول الراتب لحد قبل الراتب اللي بعده.
 * لو نزل أكتر من إيداع راتب في خلال ١٠ أيام بيتحسبوا راتب واحد.
 */
export const cycles = computed(() => {
  const sal = allTx.value.filter((t) => t.k === 'salary').sort((a, b) => a.ts - b.ts)
  const groups = []
  for (const t of sal) {
    const g = groups[groups.length - 1]
    if (g && t.ts - g.ts < 10 * DAYMS) g.salary += t.a
    else groups.push({ ts: t.ts, salary: t.a })
  }
  const now = Date.now()
  return groups.map((g, i) => {
    const next = groups[i + 1]
    const from = new Date(g.ts)
    const to = new Date(next ? next.ts - 1 : now)
    const mid = new Date(g.ts + 15 * DAYMS) // الشهر اللي الراتب ده بيغطيه
    return {
      id: String(g.ts),
      i,
      from,
      to,
      current: !next,
      salary: g.salary,
      label: mid.toLocaleDateString('ar-EG-u-nu-latn', { month: 'long' }),
      short: mid.toLocaleDateString('ar-EG-u-nu-latn', { month: 'short' }),
      year: mid.getFullYear(),
      days: Math.max(1, Math.round(((next ? next.ts : now) - g.ts) / DAYMS)),
    }
  })
})

/** الدورة الحالية — ولو مفيش راتب لسه، الشهر الحالي */
export const currentCycle = computed(() => {
  const c = cycles.value
  if (c.length) return c[c.length - 1]
  const n = new Date()
  const from = new Date(n.getFullYear(), n.getMonth(), 1)
  return { id: String(+from), i: 0, from, to: n, current: true, salary: 0, label: '', days: n.getDate() }
})
export const lastSalary = computed(() => currentCycle.value.salary)
export const avgSalary = computed(() => {
  const c = cycles.value.slice(-6)
  return c.length ? c.reduce((s, x) => s + x.salary, 0) / c.length : 0
})
/**
 * الراتب الجاي: نفس يوم الشهر اللي الراتب بينزل فيه عادةً (الوسيط لآخر ٦ رواتب)،
 * ولو جه جمعة أو سبت بنقدّمه للخميس — زي ما البنوك في السعودية بتعمل.
 */
export const salaryDay = computed(() => {
  if (Number(state.settings.salaryDay) >= 1) return Math.min(31, Number(state.settings.salaryDay))
  const days = cycles.value.slice(-6).map((c) => c.from.getDate()).sort((a, b) => a - b)
  return days.length ? days[Math.floor(days.length / 2)] : 0
})
export const nextSalaryDate = computed(() => {
  const c = cycles.value
  if (!c.length) return null
  const last = c[c.length - 1].from
  const day = salaryDay.value
  let d = new Date(last.getFullYear(), last.getMonth() + 1, Math.min(day, 28))
  if (d - last < 20 * DAYMS) d = new Date(last.getFullYear(), last.getMonth() + 2, Math.min(day, 28))
  if (d.getDay() === 5) d = new Date(+d - DAYMS) // جمعة → خميس
  if (d.getDay() === 6) d = new Date(+d - 2 * DAYMS) // سبت → خميس
  return d
})

/** قيمة الراتب المكافئة لأي فترة (بالتناسب مع الأيام اللي بتغطيها من كل دورة) */
export function salaryFor(from, to) {
  let s = 0
  for (const c of cycles.value) {
    const cTo = c.current ? new Date(Math.max(+c.to, +c.from + 30 * DAYMS)) : c.to
    const a = Math.max(+from, +c.from), b = Math.min(+to, +cTo)
    if (b > a) s += (c.salary * (b - a)) / (cTo - c.from)
  }
  return s
}

/** مصروف الدورة الحالية لكل بند (شامل التحويلات — الحد بيتحسب على البند نفسه) */
export const cycleByCat = computed(() => {
  const start = currentCycle.value.from
  const m = {}
  for (const t of allTx.value) if (OUT_KINDS.has(t.k) && t.d >= start) m[t.c] = (m[t.c] || 0) + t.a
  return m
})

/** الدخل المعتمد: اللي في الإعدادات، وإلا آخر راتب نزل */
export const income = computed(() => Number(state.settings.income) || currentCycle.value.salary || 0)
/** حد إجمالي المصروفات للراتب ده (افتراضيًا = الدخل) */
export const totalLimit = computed(() => Number(state.settings.totalLimit) || income.value)
/** إجمالي مصروفات الراتب ده (حسب إعداد التحويلات) */
export const cycleSpent = computed(() => {
  const start = currentCycle.value.from
  return spendTx.value.filter((t) => t.d >= start).reduce((s, t) => s + t.a, 0)
})
/** حالة الحد: ok | warn (٨٠٪+) | over */
export const totalLevel = computed(() => {
  const l = totalLimit.value
  if (!l) return 'ok'
  return cycleSpent.value > l ? 'over' : cycleSpent.value >= 0.8 * l ? 'warn' : 'ok'
})

export function setLimit(catId, value) {
  const v = Math.max(0, Math.round(Number(value) || 0))
  const limits = { ...state.settings.limits }
  if (v) limits[catId] = v
  else delete limits[catId]
  state.settings.limits = limits
  saveSettings()
}

/** بنبعت للـ Java كل اللي محتاجه علشان يحسب لوحده لما توصل رسالة والتطبيق مقفول */
function pushNativeConfig() {
  saveNativeConfig({
    cycle: currentCycle.value.id,
    totals: { ...cycleByCat.value, __total: cycleSpent.value },
    limits: { ...(state.settings.limits || {}), ...(state.settings.totalAlert !== false && totalLimit.value ? { __total: totalLimit.value } : {}) },
    names: { ...Object.fromEntries(CATEGORIES.map((c) => [c.id, c.name])), __total: 'إجمالي المصروفات' },
    rules: RULES.map(([c, rx]) => [c, rx.source]),
    overrides: state.overrides,
    senders: Object.keys(BANKS),
  })
}
let pushTimer = null
watch(
  () => [state.status, state.settings.limits, state.settings.income, state.settings.totalLimit, state.settings.totalAlert, state.settings.includeTransfers, state.overrides, state.smsTx.length, state.importedTx.length, state.manualTx],
  () => {
    if (state.status !== 'ready') return
    clearTimeout(pushTimer)
    pushTimer = setTimeout(pushNativeConfig, 400)
  },
  { deep: true },
)

export const incomeTx = computed(() => allTx.value.filter((t) => t.k === 'salary' || t.k === 'in'))

/** الثيم: فاتح افتراضيًا */
function applyTheme() {
  try { document.documentElement.dataset.theme = state.settings.theme || 'light' } catch {}
}
applyTheme()
watch(() => state.settings.theme, applyTheme)
