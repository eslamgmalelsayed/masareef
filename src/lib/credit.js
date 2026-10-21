import { computed, watch } from 'vue'
import { allTx, state, saveSettings } from './store.js'
import { scheduleReminders, saveCredit } from './smsSource.js'

const DAY = 864e5
const SPEND = new Set(['purchase', 'bill', 'gov', 'fee', 'cash', 'ccxfer'])

export const cardKey = (t) => t.b + '|' + t.card

/** إعدادات البطاقة اللي بتدخلها بإيدك: الاسم، الحد، يوم الكشف، يوم السداد */
export function cardSettings(key) {
  return (state.settings.cards || {})[key] || {}
}
export function saveCardSettings(key, patch) {
  const cards = { ...(state.settings.cards || {}) }
  cards[key] = { ...(cards[key] || {}), ...patch }
  for (const k of Object.keys(cards[key])) if (cards[key][k] === '' || cards[key][k] == null) delete cards[key][k]
  state.settings.cards = cards
  saveSettings()
}

/** أقرب تاريخ جاي (أو النهارده) بيقع في يوم معيّن من الشهر */
function nextDayOfMonth(day, from = new Date()) {
  const f = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const make = (y, m) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()))
  let d = make(f.getFullYear(), f.getMonth())
  if (d < f) d = make(f.getFullYear(), f.getMonth() + 1)
  return d
}
function prevDayOfMonth(day, from = new Date()) {
  const f = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const make = (y, m) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()))
  let d = make(f.getFullYear(), f.getMonth())
  if (d > f) d = make(f.getFullYear(), f.getMonth() - 1)
  return d
}

function median(a) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }

/** كل البطاقات الائتمانية مع حساباتها */
export const creditCards = computed(() => {
  const groups = {}
  for (const t of allTx.value) if (t.cc && t.card && t.k !== 'cashAdj') (groups[cardKey(t)] ||= []).push(t)
  // بطاقات ضفتها بإيدك (مفيش رسايل ليها)
  for (const [k, v] of Object.entries(state.settings.cards || {})) if (v.added && !groups[k]) groups[k] = []
  const now = Date.now()

  return Object.entries(groups).map(([key, list]) => {
    list.sort((a, b) => b.ts - a.ts)
    const s = cardSettings(key)
    const [kb, kc] = key.split('|')
    const withBal = list.filter((t) => t.bal != null)
    const last = withBal[0] || null
    // الحد التقديري: أعلى "متاح" ظهر في آخر سنة، مقرّب لأقرب ١٠٠٠
    const yearBal = withBal.filter((t) => now - t.ts < 365 * DAY).map((t) => t.bal)
    const inferred = yearBal.length ? Math.max(1000, Math.round(Math.max(...yearBal) / 1000) * 1000) : 0
    const limit = Number(s.limit) || inferred
    const alertPct = s.alertPct === 0 ? 0 : Number(s.alertPct) || 80 // 0 = التنبيه مقفول

    // المستحق دلوقتي: من آخر نقطة نعرفها — رصيد في رسالة البنك، أو رصيد كتبته إنت بإيدك (الأحدث يكسب)
    // وبعدها: نطرح اللي اتسدد ونزوّد اللي اتصرف من غير رصيد في الرسالة
    let outstanding = null, base = null
    const man = s.manual && s.manual.ts ? s.manual : null
    if (man && (!last || man.ts >= last.ts)) {
      const owed = man.type === 'owed' ? Number(man.v) : limit ? limit - Number(man.v) : null
      if (owed != null) base = { ts: man.ts, owed, src: 'manual' }
    } else if (last && limit) base = { ts: last.ts, owed: limit - last.bal, src: 'sms' }
    if (base) {
      outstanding = base.owed
      for (const t of list) {
        if (t.ts <= base.ts) break
        if (t.k === 'ccpay') outstanding -= t.a
        else if (SPEND.has(t.k) && (t.bal == null || base.src === 'manual')) outstanding += t.a
      }
    }
    const util = limit && outstanding != null ? Math.max(0, outstanding) / limit : null

    // ميعاد السداد: اللي حددته، أو اليوم اللي بتسدد فيه عادةً
    const pays = list.filter((t) => t.k === 'ccpay')
    const usualPayDay = median(pays.slice(0, 12).map((t) => t.d.getDate()))
    const dueDay = Number(s.dueDay) || 0
    const stmtDay = Number(s.stmtDay) || 0
    const nextDue = dueDay ? nextDayOfMonth(dueDay) : null
    const daysToDue = nextDue ? Math.round((nextDue - new Date(new Date().toDateString())) / DAY) : null

    // الكشف: من آخر يوم كشف لحد النهارده، والكشف اللي قبله
    let cur = null, prev = null
    if (stmtDay) {
      const curStart = prevDayOfMonth(stmtDay)
      const prevStart = prevDayOfMonth(stmtDay, new Date(+curStart - DAY))
      const sum = (a, b) => list.filter((t) => t.d >= a && t.d < b && SPEND.has(t.k)).reduce((x, t) => x + t.a, 0)
      cur = { from: curStart, spent: sum(curStart, new Date(now + DAY)) }
      prev = { from: prevStart, to: curStart, spent: sum(prevStart, curStart) }
      prev.paid = pays.filter((t) => t.d >= curStart).reduce((x, t) => x + t.a, 0)
    }

    // آخر ٦ شهور: اتصرف واتسدد
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); const a = new Date(d.getFullYear(), d.getMonth() - i, 1), b = new Date(d.getFullYear(), d.getMonth() - i + 1, 1)
      const inM = list.filter((t) => t.d >= a && t.d < b)
      months.push({
        label: a.toLocaleDateString('ar-EG-u-nu-latn', { month: 'short' }),
        spent: inM.filter((t) => SPEND.has(t.k)).reduce((x, t) => x + t.a, 0),
        paid: inM.filter((t) => t.k === 'ccpay').reduce((x, t) => x + t.a, 0),
      })
    }

    const year = list.filter((t) => now - t.ts < 365 * DAY)
    const fxYear = year.reduce((x, t) => x + (t.fx || 0), 0)
    const fxCount = year.filter((t) => t.fx).length

    return {
      key, bank: kb, card: kc, alertPct, name: s.name || `${kb} ••${kc}`, added: !!s.added,
      list, limit, inferred, limitIsInferred: !s.limit && !!inferred,
      avail: last ? { v: last.bal, ts: last.ts } : null, outstanding, util, base, manual: man,
      dueDay, stmtDay, usualPayDay, nextDue, daysToDue, cur, prev, months, fxYear, fxCount,
      lastUse: list.length ? list[0].ts : (man ? man.ts : now),
    }
  })
    // البطاقات اللي اتستخدمت في آخر ٦ شهور بس (القديمة اللي اتقفلت متظهرش)
    .filter((c) => c.added || now - c.lastUse < 180 * DAY)
    .sort((a, b) => b.list.length - a.list.length)
})

export const utilLevel = (u) => (u == null ? '' : u < 0.3 ? 'ok' : u < 0.7 ? 'warn' : 'over')

/** تذكيرات ميعاد السداد (قبلها بـ ٣ أيام + يومها) — بتتبعت للجزء الأصلي يجدولها */
export const dueReminders = computed(() => {
  const out = []
  const fmt = (n) => Math.round(n || 0).toLocaleString('en-US')
  for (const c of creditCards.value) {
    if (!c.nextDue) continue
    for (let k = 0; k < 2; k++) {
      const due = k === 0 ? c.nextDue : nextDayOfMonth(c.dueDay, new Date(+c.nextDue + DAY))
      const owe = c.outstanding > 0 ? ` — المستحق تقريبًا ${fmt(c.outstanding)} ر.س` : ''
      const before = new Date(+due - 3 * DAY); before.setHours(10, 0, 0, 0)
      const onDay = new Date(due); onDay.setHours(9, 0, 0, 0)
      if (before > Date.now()) out.push({ id: `due-${c.card}-${+before}`, at: +before, title: `💳 سداد ${c.name} بعد ٣ أيام`, text: `آخر موعد ${due.toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' })}${owe}` })
      if (onDay > Date.now()) out.push({ id: `due-${c.card}-${+onDay}`, at: +onDay, title: `💳 النهارده آخر يوم لسداد ${c.name}`, text: `متنساش تسدد علشان متدفعش غرامة${owe}` })
    }
  }
  return out
})

/** بطاقة ائتمانية جديدة بإيدك (لبنك مش بيبعت رسايل أو مش مدعوم) */
export function addManualCard({ name, bank, card, limit, owed, dueDay }) {
  const key = (bank || 'يدوي') + '|' + (String(card || '').slice(-4) || Date.now().toString().slice(-4))
  saveCardSettings(key, { added: true, name, limit: Number(limit) || '', dueDay: Number(dueDay) || '', manual: owed !== '' && owed != null ? { type: 'owed', v: Number(owed), ts: Date.now() } : undefined })
  return key
}
export function removeCard(key) {
  const cards = { ...(state.settings.cards || {}) }
  delete cards[key]
  state.settings.cards = cards
  saveSettings()
}

// كل ما المواعيد أو المبالغ تتغيّر، نعيد جدولة التذكيرات
let lastSig = ''
watch(dueReminders, (items) => {
  const sig = JSON.stringify(items.map((x) => [x.id, x.text]))
  if (sig === lastSig) return
  lastSig = sig
  scheduleReminders(items)
}, { immediate: true })

// المستحق والحد ونسبة التنبيه لكل بطاقة → الجزء الأصلي (بيكمّل الحساب من الرسايل الجديدة)
let lastCC = ''
watch(creditCards, (cards) => {
  const out = {}
  for (const c of cards) if (c.limit && c.outstanding != null && /^\d{4}$/.test(c.card)) out[c.card] = { name: c.name, owed: Math.round(c.outstanding * 100) / 100, limit: c.limit, pct: c.alertPct }
  const sig = JSON.stringify(out)
  if (sig === lastCC) return
  lastCC = sig
  saveCredit(out)
}, { immediate: true })
