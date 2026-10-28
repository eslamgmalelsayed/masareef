// القراية الذكية (شغالة دايمًا): بتاخد الأشكال اللي مالهاش قالب، وتطلب قالبها من السيرفر
// (بنسخة مخفية البيانات بس)، وتبلّغ لو قالب طلع غلط. القراية نفسها بتفضل جوه الموبايل.
import { reactive } from 'vue'
import { state, setSmartHook, setTemplates, reparse, setFxRates, addBanks, dismissBank } from './store.js'
import { KNOWN_NAMES } from './parser.js'
import { showToast } from './toast.js'
import { maskSample, linesOf, validTemplate, applyTemplate, shapeOf } from './shapes.js'
import { amount } from './parser.js'

export const API = 'https://masareef-api.netlify.app'
const BATCH = 25 // أقصى عدد أشكال نسأل عليها في المرة
const RETRY = 864e5 // شكل فشل → نجرّب تاني بعد يوم
const CATALOG_EVERY = 12 * 36e5

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v) } catch { return d } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} },
}
export const smart = reactive({ learned: Object.keys(state.tpls || {}).length, waiting: 0, busy: false, error: '', lastSync: LS.get('smartSync', 0) })

function deviceId() {
  let d = LS.get('dev', '')
  if (!d) { d = Math.random().toString(36).slice(2) + Date.now().toString(36); LS.set('dev', d) }
  return d
}

const pending = new Map() // id → { bank, body, n, hint? }
const tried = LS.get('tplTried', {})
const bad = LS.get('tplBad', {}) // قوالب طلعت غلط هنا — منقبلهاش تاني
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** بعد كل قراية: الأشكال المجهولة تدخل الطابور، والقالب اللي اختلف يتشال ويتبلّغ */
function onParsed(out) {
  const now = Date.now()
  for (const u of out.unknown?.values?.() || []) {
    if (tried[u.id] && now - tried[u.id] < RETRY) continue
    const p = pending.get(u.id)
    if (p) p.n = Math.max(p.n, u.n)
    else pending.set(u.id, { ...u })
  }
  for (const m of out.mismatch?.values?.() || []) {
    if (!state.tpls[m.id]) continue
    const tpls = { ...state.tpls }
    bad[m.id] = tpls[m.id]
    LS.set('tplBad', bad)
    delete tpls[m.id]
    setTemplates(tpls)
    report(m)
    pending.set(m.id, { ...m, n: 1, hint: hintFrom(m) })
  }
  // نسخة مخفية من كل شكل (مش الرسالة الحقيقية) — علشان زرار "اتقرت غلط؟" يقدر يطلب يتعلم من جديد
  if (out.samples?.size) {
    const sm = LS.get('shapeSamples', {})
    let n = 0
    for (const [id, x] of out.samples) if (!sm[id]) { sm[id] = { bank: x.bank, sample: maskSample(x.body) }; n++ }
    if (n) LS.set('shapeSamples', sm)
  }
  smart.waiting = pending.size
  if (pending.size) schedule()
}
setSmartHook(onParsed)

/**
 * "الرسالة دي اتقرت غلط": بنشيل قالب الشكل (لو موجود) ونبلّغ، ونطلب يتعلم من جديد بالتصحيح بتاعك.
 * fix: { k: النوع الصح } أو { hide: true } (مش عملية)
 */
export function reportWrong(t, fix = {}) {
  const sm = LS.get('shapeSamples', {})[t.sh]
  if (!t.sh || !sm) return false
  const tpl = state.tpls[t.sh]
  if (tpl) {
    bad[t.sh] = tpl
    LS.set('tplBad', bad)
    const tpls = { ...state.tpls }
    delete tpls[t.sh]
    setTemplates(tpls)
  }
  api('/api/report', { id: t.sh, device: deviceId(), got: 'user' }).catch(() => {})
  delete tried[t.sh]
  pending.set(t.sh, { id: t.sh, bank: sm.bank, body: sm.sample, n: 99, hint: { kind: fix.hide ? 'ignore' : fix.k || t.k, amountLine: null } })
  smart.waiting = pending.size
  setTimeout(run, 2500) // بعد ما البلاغ يوصل
  return true
}

/** القراية القديمة قالت إيه — بنبعت مكان المبلغ ونوع العملية بس (مفيش بيانات) */
function hintFrom(m) {
  if (!m.want) return null
  const ls = linesOf(m.body)
  const amountLine = ls.findIndex((l) => Math.abs((amount(l, Date.now()) || -1) - m.want[1]) < 0.01)
  return { kind: m.want[0], amountLine: amountLine >= 0 ? amountLine : null }
}

let timer = null
function schedule() { clearTimeout(timer); timer = setTimeout(run, 1500) }

async function api(path, body) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 20000)
  try {
    const r = await fetch(API + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal } : { signal: ctrl.signal })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return await r.json()
  } finally { clearTimeout(t) }
}

/** قالب جه من السيرفر: لازم يكون سليم، ويقرا رسالة الموبايل نفسها صح */
function acceptLocal(tpl, item) {
  if (bad[item.id] && same(bad[item.id], tpl)) return false
  if (!validTemplate(tpl, linesOf(item.body).length)) return false
  if (tpl.kind === 'ignore') return true
  return !!applyTemplate(tpl, item.body, Date.now(), {})
}

async function run() {
  if (smart.busy) return
  smart.busy = true
  smart.error = ''
  let added = 0
  try {
    // ١) المكتبة المشتركة (قوالب اتأكدت عند كذا مستخدم)
    if (Date.now() - smart.lastSync > CATALOG_EVERY) {
      const cat = await api('/api/catalog')
      const tpls = { ...state.tpls }
      for (const [id, t] of Object.entries(cat.templates || {})) if (!tpls[id] && validTemplate(t, 99) && !(bad[id] && same(bad[id], t))) { tpls[id] = t; added++ }
      setTemplates(tpls)
      smart.lastSync = Date.now()
      LS.set('smartSync', smart.lastSync)
      for (const id of Object.keys(cat.templates || {})) pending.delete(id)
    }
    // ٢) الأشكال اللي لسه مالهاش قالب — الأكتر تكرارًا الأول
    const batch = [...pending.values()].filter((p) => !state.tpls[p.id]).sort((a, b) => b.n - a.n).slice(0, BATCH)
    const dev = deviceId()
    for (const item of batch) {
      pending.delete(item.id)
      tried[item.id] = Date.now()
      try {
        const sample = maskSample(item.body)
        if (shapeOf(item.bank, sample).id !== item.id) continue // أمان: لازم الشكل يطلع هو هو من النسخة المخفية
        const res = await api('/api/learn', { id: item.id, bank: item.bank, sample, hint: item.hint || null, device: dev })
        if (res.template && acceptLocal(res.template, item)) {
          setTemplates({ ...state.tpls, [item.id]: res.template })
          added++
          api('/api/confirm', { id: item.id, device: dev }).catch(() => {})
        }
      } catch (e) {
        smart.error = String(e.message || e)
        if (/429/.test(smart.error)) { pending.set(item.id, item); delete tried[item.id]; break } // السقف اليومي للسيرفر — نستنى
      }
    }
    LS.set('tplTried', tried)
  } catch (e) {
    smart.error = String(e.message || e)
  } finally {
    smart.busy = false
    smart.learned = Object.keys(state.tpls).length
    smart.waiting = pending.size
  }
  if (added) reparse() // القوالب الجديدة تتطبّق على طول
  if (pending.size) setTimeout(schedule, /429/.test(smart.error) ? 60 * 6e4 : smart.error ? 10 * 6e4 : 30000) // الباقي بعد شوية (ولو مفيش نت: بعد ١٠ دقايق)
}

function report(m) {
  api('/api/report', { id: m.id, device: deviceId(), got: m.got == null ? 'fail' : String(m.got) === 'ignore' ? 'ignore' : 'amount' }).catch(() => {})
}

/**
 * البنوك والمحافظ بتتضاف لوحدها: أي راسل بيبعت رسايل شكلها عمليات مالية بنسأل عليه السيرفر
 * (اسم الراسل + رسالة واحدة مخفية البيانات). النتيجة متخزنة عند الكل، فبنك معروف مش بيتسأل عليه تاني.
 */
export async function autoBanks() {
  const decided = LS.get('bankAuto', {})
  const add = [], no = []
  for (const b of (state.bankSuggestions || []).slice(0, 12)) {
    const k = b.address.toLowerCase()
    if (decided[k]) continue
    if (KNOWN_NAMES[k]) { decided[k] = { bank: true, name: KNOWN_NAMES[k] }; add.push([b.address, KNOWN_NAMES[k]]); continue }
    if (!b.sample) continue
    try {
      const r = await api('/api/sender', { sender: b.address, sample: maskSample(b.sample) })
      decided[k] = { bank: !!r.bank, name: r.name }
      if (r.bank) add.push([b.address, r.name]); else no.push(b.address)
    } catch { break } // مفيش نت / السقف — نكمّل المرة الجاية
  }
  LS.set('bankAuto', decided)
  for (const a of no) dismissBank(a)
  if (add.length) {
    showToast('🏦 لقيت ' + (add.length === 1 ? 'حساب جديد: ' + add[0][1] : add.length + ' حسابات جديدة: ' + add.map((x) => x[1]).join('، ')) + ' — واتضاف لوحده')
    await addBanks(add)
  }
}

/** أسعار العملات: مرة في اليوم (لو مفيش نت → الجدول الاحتياطي) */
async function refreshRates() {
  const fx = LS.get('fx', null)
  if (fx && Date.now() - fx.at < 864e5) return
  try { const r = await api('/api/rates'); if (r.toUsd) setFxRates(r.toUsd) } catch {}
}
setTimeout(refreshRates, 4000)

/** تشغيل يدوي (سحب للتحديث) */
export function smartNow() { smart.lastSync = 0; schedule() }
