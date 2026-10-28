import { reactive, computed, watch, ref } from 'vue'
import { parseMessages, messagesFromXml, messagesFromJson, messagesFromText, BANKS, detectProfile, BNPL_SENDERS, parseBnplMessages, setExtraBanks, KNOWN_NAMES } from './parser.js'
import { categorize, merchantKey, TRANSFER_CATS, RULES, CATEGORIES } from './categories.js'
import { isNative, readSms, saveNativeConfig, listSenders } from './smsSource.js'
import { privacy, money } from './format.js'
import { detectHome, setMoney, SYM } from './money.js'

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
  dayLimit: '', // حد الصرف اليومي (فاضي = بدون)
  weekLimit: '', // حد الصرف الأسبوعي — الأسبوع بيبدأ الأحد
  periodBase: '', // day | week | month — الحد اللي كتبته بإيدك، والباقي محسوب منه
  periodValue: '',
  groups: [], // [{id, name, cats: [catId], limit}] — حد واحد لأكتر من بند
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
  txCats: LS.get('txCats', {}), // بند لعملية واحدة بس (id → بند) — بيغلب على بند المحل/الشخص
  smsTx: [],
  importedTx: LS.get('importedTx', []),
  manualTx: LS.get('manualTx', []), // مصاريف بتضيفها بإيدك
  webMsgs: LS.get('webMsgs', []), // نسخة الويب: رسايل بنك ملزوقة بإيدك
  bnplSms: [], // خطط تابي/تمارا من رسايلهم
  bankSuggestions: [], // بنوك جديدة لقيناها
  importedBnpl: LS.get('importedBnpl', []),
  status: 'idle', // idle | loading | ready | denied | error
  error: '',
  lastSync: LS.get('lastSync', 0),
})

export function saveSettings() { LS.set('settings', state.settings) }
setExtraBanks(state.settings.extraBanks)
const allSenders = () => [...Object.keys(BANKS), ...Object.keys(state.settings.extraBanks || {})]

/** بنك جديد: راسلين بيبعتوا رسايل شكلها عمليات بنكية ومش في القائمة */
export async function findNewBanks() {
  const dismissed = new Set(state.settings.bankDismiss || [])
  const list = await listSenders([...allSenders(), ...BNPL_SENDERS])
  state.bankSuggestions = list.filter((x) => !dismissed.has(x.address.toLowerCase())).sort((a, b) => b.n - a.n)
}
export function addBank(address, name) {
  const k = address.trim().toLowerCase()
  state.settings.extraBanks = { ...(state.settings.extraBanks || {}), [k]: name || KNOWN_NAMES[k] || address }
  setExtraBanks(state.settings.extraBanks)
  state.bankSuggestions = state.bankSuggestions.filter((x) => x.address.toLowerCase() !== k)
  saveSettings()
  syncSms()
}
export function dismissBank(address) {
  state.settings.bankDismiss = [...(state.settings.bankDismiss || []), address.toLowerCase()]
  state.bankSuggestions = state.bankSuggestions.filter((x) => x.address.toLowerCase() !== address.toLowerCase())
  saveSettings()
}
export function removeBank(k) {
  const m = { ...(state.settings.extraBanks || {}) }
  delete m[k]
  state.settings.extraBanks = m
  setExtraBanks(m)
  saveSettings()
  syncSms()
}

const split = (s) => String(s || '').split(/[,،\n]/).map((x) => x.trim()).filter(Boolean)
/** القيم اللي بتكتبها بإيدك ليها الأولوية، وإلا اللي اتعرف عليه تلقائيًا */
export function profile() {
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

// ===== عملة البيت: بتتعرف لوحدها من الرسايل (حتى لو بتعيش/بتصرف في أكتر من بلد) =====
state.homeCur = LS.get('homeCur', 'SAR')
function applyMoney() {
  const fx = LS.get('fx', null)
  setMoney(state.homeCur, fx && fx.toUsd)
  money.cur = state.homeCur
  money.sym = SYM[state.homeCur] || state.homeCur
}
applyMoney()
export function setFxRates(toUsd) { LS.set('fx', { at: Date.now(), toUsd }); applyMoney() }
function learnHome(msgs) {
  const h = detectHome(msgs)
  if (h && h !== state.homeCur) { state.homeCur = h; LS.set('homeCur', h); applyMoney() }
}

let rawSms = [] // null = العمليات جت من الكاش والرسايل القديمة مش في الذاكرة

// ===== القراية الذكية: القوالب (من المكتبة المشتركة + اللي اتعلمت على الموبايل ده) =====
state.tpls = LS.get('tpls', {})
let smartHook = null
/** smart.js بيسجّل هنا علشان ياخد الأشكال المجهولة والاختلافات بعد كل قراية */
export function setSmartHook(fn) { smartHook = fn }
export function setTemplates(map) { state.tpls = map; LS.set('tpls', map) }
function parseAll(raw) {
  const out = parseMessages(raw, profile(), state.tpls)
  if (smartHook) { try { smartHook(out) } catch {} }
  return out
}

export async function syncSms(full = false) {
  if (!isNative) {
    // نسخة الويب (آيفون PWA): الرسايل اللي اتلزقت بإيدك هي "صندوق الرسايل"
    rawSms = state.webMsgs
    if (rawSms.length) { learnProfile(rawSms, true); learnHome(rawSms); state.smsTx = parseAll(rawSms); state.bnplSms = parseBnplMessages(rawSms) }
    state.status = 'ready'
    return
  }
  state.status = 'loading'
  state.error = ''
  try {
    const senders = [...allSenders(), ...BNPL_SENDERS]
    const isBnpl = (m) => BNPL_SENDERS.includes(String(m.address || '').trim().toLowerCase())
    const C = full ? null : LS.get('parseCache', null)
    const sig = cacheSig(senders)
    // فيه رسايل قديمة لسه مالهاش قالب؟ قراية كاملة مرة في اليوم علشان القراية الذكية تتعلمها
    const stale = C && ((C.unknown?.length && Date.now() - (C.fullAt || 0) > 864e5) || Date.now() - (C.fullAt || 0) > 7 * 864e5) // + قراية كاملة كل أسبوع (لو نقلت بلد، عملة البيت تتعرف)
    if (C && C.sig === sig && C.maxDate && !stale) {
      // ===== كاش: العمليات القديمة متخزنة — بنقرا بس الرسايل الجديدة =====
      const fresh = await readSms(senders, C.maxDate)
      const freshBank = fresh.filter((m) => !isBnpl(m))
      learnProfile(freshBank, true)
      const newTx = freshBank.length ? parseAll(freshBank) : []
      const byId = new Map(C.tx.map((t) => [t.id, t]))
      for (const t of newTx) byId.set(t.id, t)
      state.smsTx = [...byId.values()].sort((a, b) => b.ts - a.ts)
      state.bnplSms = mergeBnpl(C.bnpl, parseBnplMessages(fresh))
      rawSms = null // الرسايل القديمة مش في الذاكرة — أي قراية من جديد هتعمل قراية كاملة
      saveCache(sig, Math.max(C.maxDate, ...fresh.map((m) => Number(m.date) || 0)), C.unknown.concat([...(newTx.unknown?.keys?.() || [])]), C.fullAt)
    } else {
      // ===== قراية كاملة (أول مرة، أو حاجة اتغيرت) =====
      const all = await readSms(senders)
      rawSms = all.filter((m) => !isBnpl(m))
      learnHome(rawSms)
      state.bnplSms = parseBnplMessages(all.filter(isBnpl).concat(rawSms))
      learnProfile(rawSms)
      const out = parseAll(rawSms)
      state.smsTx = out
      saveCache(cacheSig(senders), all.reduce((m, x) => Math.max(m, Number(x.date) || 0), 0), [...(out.unknown?.keys?.() || [])], Date.now())
    }
    state.lastSync = Date.now()
    LS.set('lastSync', state.lastSync)
    state.status = 'ready'
  } catch (e) {
    const msg = String(e && (e.message || e))
    state.status = /denied|permission/i.test(msg) ? 'denied' : 'error'
    state.error = msg
  }
}

// ===== كاش القراية =====
// اتغيّر أي حاجة من دي → قراية كاملة مرة واحدة: نسخة القراية، اسمك وحساباتك، البنوك، أو عدد القوالب
const PARSER_V = 'p3'
function cacheSig(senders) {
  return [PARSER_V, state.homeCur, JSON.stringify(profile()), senders.slice().sort().join(','), Object.keys(state.tpls || {}).length].join('|')
}
function saveCache(sig, maxDate, unknown, fullAt) {
  LS.set('parseCache', { sig, maxDate, fullAt, tx: state.smsTx.map(({ d, c, ...t }) => t), bnpl: state.bnplSms, unknown: [...new Set(unknown)].slice(-2000) })
}
function mergeBnpl(a = [], b = []) {
  const seen = new Set(a.map((o) => JSON.stringify(o)))
  return [...a, ...b.filter((o) => !seen.has(JSON.stringify(o)))].sort((x, y) => x.ts - y.ts)
}

/** نسخة الويب: إضافة رسالة بنك ملزوقة. بيرجّع العملية اللي اتفهمت منها (أو null) */
export function addWebMessage(body) {
  const text = String(body || '').trim()
  if (!text) return { added: false, tx: null }
  if (state.webMsgs.some((m) => m.body === text)) return { added: false, dup: true, tx: null }
  const msg = { address: '__ios__', body: text, date: Date.now() }
  const tx = parseMessages([msg], profile(), state.tpls)[0] || null
  if (tx) tx.c = categorize(tx, state.overrides)
  state.webMsgs = [...state.webMsgs, msg]
  LS.set('webMsgs', state.webMsgs)
  rawSms = state.webMsgs
  learnProfile(rawSms, true)
  state.smsTx = parseAll(rawSms)
  state.bnplSms = parseBnplMessages(rawSms)
  return { added: true, tx }
}

/** re-parse after the user changes their name / account numbers */
export function reparse() {
  if (!isNative) { if (rawSms.length) state.smsTx = parseAll(rawSms); return }
  if (rawSms && rawSms.length) { state.smsTx = parseAll(rawSms); return }
  return syncSms(true) // الرسايل القديمة مش في الذاكرة (جت من الكاش) → قراية كاملة
}

export async function importFile(file) {
  const text = await file.text()
  const msgs = /^\s*[[{]/.test(text) ? messagesFromJson(text) : /<smses|<sms\s/.test(text) ? messagesFromXml(text) : messagesFromText(text)
  learnProfile(msgs, true)
  const tx = parseAll(msgs)
  const byId = new Map(state.importedTx.map((t) => [t.id, t]))
  tx.forEach((t) => byId.set(t.id, t))
  state.importedTx = [...byId.values()].sort((a, b) => b.ts - a.ts)
  LS.set('importedTx', state.importedTx)
  const plans = parseBnplMessages(msgs)
  if (plans.length) {
    const seen = new Set(state.importedBnpl.map((p) => p.prov + p.store + p.total + p.ts))
    state.importedBnpl = [...state.importedBnpl, ...plans.filter((p) => !seen.has(p.prov + p.store + p.total + p.ts))]
    LS.set('importedBnpl', state.importedBnpl)
  }
  return tx.length
}

export function clearImported() {
  state.importedTx = []
  LS.set('importedTx', [])
  state.importedBnpl = []
  LS.set('importedBnpl', [])
}

export function setCategory(tx, catId, only = false) {
  if (tx.k === 'manual') { const m = state.manualTx.find((x) => x.id === tx.id); if (m) saveManual({ ...m, cat: catId }); return }
  if (only) return setTxCat(tx.id, catId)
  if (state.txCats[tx.id]) setTxCat(tx.id, null) // نقلت المحل كله → العملية دي تمشي معاه
  const key = merchantKey(tx.m)
  if (!key) return
  state.overrides = { ...state.overrides, [key]: catId }
  LS.set('overrides', state.overrides)
}
/** بند للعملية دي بس (null = رجّعها لبند المحل/الشخص) */
export function setTxCat(id, catId) {
  const o = { ...state.txCats }
  if (catId) o[id] = catId
  else delete o[id]
  state.txCats = o
  LS.set('txCats', o)
}
/** تراجع عن نقل محل لبند (يرجع للتصنيف التلقائي) */
export function clearOverride(key) {
  const o = { ...state.overrides }
  delete o[key]
  state.overrides = o
  LS.set('overrides', state.overrides)
}
export function resetOverrides() {
  state.overrides = {}
  LS.set('overrides', {})
}

/** كل العمليات بعد الدمج والتصنيف */
/**
 * تحويل بين حساباتك: حوالة صادرة من بنك + حوالة واردة لبنك تاني بنفس المبلغ في خلال ساعة
 * (أو انت قلت عليها كده بإيدك). بتتحول لـ k = 'self' — مش مصروف ولا دخل.
 */
const SELF_WIN = 60 * 60e3
function markSelf(list) {
  const mine = new Set(state.settings.selfTx || [])
  const not = new Set(state.settings.notSelfTx || [])
  const ins = list.filter((t) => t.k === 'in' && !not.has(t.id))
  const used = new Set()
  for (const t of list) {
    if (not.has(t.id)) continue
    if (mine.has(t.id) && ['transfer', 'in', 'intl'].includes(t.k)) { t.k = 'self'; continue }
    // بس لو التحويل مفيهوش اسم شخص (— أو رقم حساب) — التحويل لحد باسمه ممكن يصادف وارد بنفس المبلغ
    if (t.k !== 'transfer' || /[A-Za-z\u0600-\u06FF]{3}/.test(t.m || '')) continue
    const m = ins.find((x) => !used.has(x.id) && x.b !== t.b && Math.abs(x.ts - t.ts) <= SELF_WIN && Math.abs(x.a - t.a) <= 1)
    if (!m) continue
    used.add(m.id)
    t.k = 'self'; t.pair = m.id
    m.k = 'self'; m.pair = t.id
  }
  for (const t of list) if (t.k === 'self') { t.c = 'self'; if (!t.m || t.m === '—') t.m = 'بين حساباتك' }
}
/** "دي بين حساباتي" / "لا، مش بين حساباتي" */
export function setSelfTx(t, on) {
  const ids = [t.id, ...(t.pair ? [t.pair] : [])]
  const rm = (k) => (state.settings[k] || []).filter((x) => !ids.includes(x))
  if (on) { state.settings.selfTx = [...rm('selfTx'), t.id].slice(-500); state.settings.notSelfTx = rm('notSelfTx') }
  else { state.settings.notSelfTx = [...rm('notSelfTx'), ...ids].slice(-500); state.settings.selfTx = rm('selfTx') }
  saveSettings()
}

export const allTx = computed(() => {
  const byId = new Map()
  for (const t of state.importedTx) byId.set(t.id, t)
  for (const t of state.smsTx) byId.set(t.id, t)
  const ov = state.overrides
  const one = state.txCats
  const out = [...byId.values()].map((t) => ({ ...t, c: one[t.id] || categorize(t, ov), d: new Date(t.ts), ...(one[t.id] ? { one: 1 } : {}) }))
  markSelf(out)
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
/** صرف كل بند في الراتب اللي فات */
export const prevCycleByCat = computed(() => {
  const c = cycles.value
  if (c.length < 2) return null
  const p = c[c.length - 2]
  const m = {}
  for (const t of allTx.value) if (OUT_KINDS.has(t.k) && t.d >= p.from && t.d <= p.to) m[t.c] = (m[t.c] || 0) + t.a
  return m
})
/** حدود البنود الفعلية: لو الترحيل شغال، الباقي (أو الزيادة) من الراتب اللي فات بيتنقل */
export const effLimits = computed(() => {
  const L = state.settings.limits || {}
  const prev = prevCycleByCat.value
  if (!state.settings.rollover || !prev) return L
  return Object.fromEntries(Object.entries(L).map(([k, v]) => [k, Math.max(0, Math.round(v + (v - (prev[k] || 0))))]))
})

export const cycleByCat = computed(() => {
  const start = currentCycle.value.from
  const m = {}
  for (const t of allTx.value) if (OUT_KINDS.has(t.k) && t.d >= start) m[t.c] = (m[t.c] || 0) + t.a
  return m
})

/** الدخل المعتمد: اللي في الإعدادات، وإلا آخر راتب نزل */
export const income = computed(() => Number(state.settings.income) || currentCycle.value.salary || 0)
/** عدد أيام دورة الراتب الحالية (من الراتب للراتب الجاي) — علشان نحوّل بين اليومي والشهري */
export const cycleDays = computed(() => {
  const from = new Date(currentCycle.value.from); from.setHours(0, 0, 0, 0)
  const to = nextSalaryDate.value ? new Date(nextSalaryDate.value) : null
  if (to) to.setHours(0, 0, 0, 0)
  const d = to ? Math.round((to - from) / DAYMS) : 30
  return d >= 20 && d <= 40 ? d : 30
})
/**
 * حد الصرف: بتكتب واحد بس (يومي أو أسبوعي أو شهري) والباقي بيتحسب منه.
 * لو مكتبتش حاجة: الشهري = الدخل.
 */
export const periodBase = computed(() => {
  const s = state.settings
  if (s.periodBase && Number(s.periodValue)) return { k: s.periodBase, v: Number(s.periodValue) }
  if (Number(s.totalLimit)) return { k: 'month', v: Number(s.totalLimit) } // إعدادات النسخ القديمة
  if (Number(s.dayLimit)) return { k: 'day', v: Number(s.dayLimit) }
  if (Number(s.weekLimit)) return { k: 'week', v: Number(s.weekLimit) }
  return income.value ? { k: 'month', v: income.value, auto: true } : null
})
const perDay = computed(() => {
  const b = periodBase.value
  if (!b) return 0
  return b.k === 'day' ? b.v : b.k === 'week' ? b.v / 7 : b.v / cycleDays.value
})
/** حد إجمالي المصروفات للراتب ده (افتراضيًا = الدخل) */
export const totalLimit = computed(() => (periodBase.value?.k === 'month' ? periodBase.value.v : Math.round(perDay.value * cycleDays.value)))
export function setPeriodLimit(k, value) {
  const v = Math.max(0, Math.round(Number(value) || 0))
  Object.assign(state.settings, { periodBase: v ? k : '', periodValue: v || '', totalLimit: '', dayLimit: '', weekLimit: '' })
  saveSettings()
}
/** إجمالي مصروفات الراتب ده (حسب إعداد التحويلات) */
export const cycleSpent = computed(() => {
  const start = currentCycle.value.from
  return spendTx.value.filter((t) => t.d >= start).reduce((s, t) => s + t.a, 0)
})
// النهارده والأسبوع ده — بيتحدّثوا كل دقيقة علشان اليوم الجديد يبدأ من صفر
const tick = ref(Date.now())
setInterval(() => { tick.value = Date.now() }, 60e3)
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { tick.value = Date.now() })
const pad2 = (n) => String(n).padStart(2, '0')
const dayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
export const periodStarts = computed(() => {
  const d = new Date(tick.value); d.setHours(0, 0, 0, 0)
  const w = new Date(d); w.setDate(w.getDate() - w.getDay())
  return { day: d, week: w }
})
export const daySpent = computed(() => spendTx.value.filter((t) => t.d >= periodStarts.value.day).reduce((s, t) => s + t.a, 0))
export const weekSpent = computed(() => spendTx.value.filter((t) => t.d >= periodStarts.value.week).reduce((s, t) => s + t.a, 0))
export const dayLimit = computed(() => (periodBase.value?.k === 'day' ? periodBase.value.v : Math.round(perDay.value)))
export const weekLimit = computed(() => (periodBase.value?.k === 'week' ? periodBase.value.v : Math.round(perDay.value * 7)))
/** نسبة التنبيه الأول (افتراضيًا ٨٠٪) — 0 = تنبيه لما تعدّي الحد بس */
export const warnPct = computed(() => (state.settings.warnPct === 0 ? 0 : Number(state.settings.warnPct) || 80))
export const warnRatio = computed(() => (warnPct.value ? warnPct.value / 100 : Infinity))
export const levelOf = (spent, limit) => (!limit ? '' : spent > limit ? 'over' : spent >= warnRatio.value * limit ? 'warn' : 'ok')

/** حالة الحد: ok | warn (٨٠٪+) | over */
export const totalLevel = computed(() => {
  const l = totalLimit.value
  if (!l) return 'ok'
  return cycleSpent.value > l ? 'over' : cycleSpent.value >= warnRatio.value * l ? 'warn' : 'ok'
})

/** حدود مجمّعة: أكتر من بند تحت حد واحد (مثلًا تسوق أونلاين + ملابس) */
export function saveGroup(g) {
  const list = [...(state.settings.groups || [])]
  const i = list.findIndex((x) => x.id === g.id)
  if (i >= 0) list[i] = g
  else list.push({ ...g, id: 'g_' + Date.now().toString(36) })
  state.settings.groups = list
  saveSettings()
}
export function deleteGroup(id) {
  state.settings.groups = (state.settings.groups || []).filter((g) => g.id !== id)
  saveSettings()
}

export function setLimit(catId, value) {
  const v = Math.max(0, Math.round(Number(value) || 0))
  const limits = { ...state.settings.limits }
  if (v) limits[catId] = v
  else delete limits[catId]
  state.settings.limits = limits
  saveSettings()
}

/** حاجات زيادة للجزء الأصلي بتتسجل من ملفات تانية (زي متوسط كل تاجر) */
export const nativeExtra = reactive({})

/** بنبعت للـ Java كل اللي محتاجه علشان يحسب لوحده لما توصل رسالة والتطبيق مقفول */
function pushNativeConfig() {
  saveNativeConfig({
    cycle: currentCycle.value.id,
    totals: { ...cycleByCat.value, __total: cycleSpent.value, __day: daySpent.value, __week: weekSpent.value },
    limits: {
      ...effLimits.value,
      ...Object.fromEntries((state.settings.groups || []).filter((g) => g.limit && g.cats.length).map((g) => [g.id, g.limit])),
      ...(state.settings.totalAlert !== false && totalLimit.value ? { __total: totalLimit.value } : {}),
      ...(state.settings.totalAlert !== false && dayLimit.value ? { __day: dayLimit.value } : {}),
      ...(state.settings.totalAlert !== false && weekLimit.value ? { __week: weekLimit.value } : {}),
    },
    groups: Object.fromEntries((state.settings.groups || []).map((g) => [g.id, g.cats])),
    periodKeys: { __day: dayKey(periodStarts.value.day), __week: dayKey(periodStarts.value.week) },
    names: { ...Object.fromEntries(CATEGORIES.map((c) => [c.id, c.name])), __total: 'إجمالي المصروفات', __day: 'الصرف اليومي', __week: 'الصرف الأسبوعي', ...Object.fromEntries((state.settings.groups || []).map((g) => [g.id, g.name])) },
    rules: RULES.map(([c, rx]) => [c, rx.source]),
    overrides: state.overrides,
    senders: allSenders().map((x) => x.toLowerCase()),
    warnPct: warnPct.value,
    money: { home: state.homeCur, toUsd: (LS.get('fx', null) || {}).toUsd || null },
    widget: { day: dayLimit.value, cycle: totalLimit.value, daySpent: daySpent.value, cycleSpent: cycleSpent.value, hide: privacy.on },
    ...nativeExtra,
  })
}
let pushTimer = null
watch(
  () => [state.status, state.txCats, nativeExtra, privacy.on, state.settings.extraBanks, state.settings.rollover, state.settings.warnPct, state.settings.limits, state.settings.groups, state.settings.income, state.settings.totalLimit, state.settings.totalAlert, state.settings.dayLimit, state.settings.weekLimit, state.settings.periodBase, state.settings.periodValue, cycleDays.value, periodStarts.value.day.getTime(), state.settings.includeTransfers, state.overrides, state.smsTx.length, state.importedTx.length, state.manualTx, state.webMsgs],
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
