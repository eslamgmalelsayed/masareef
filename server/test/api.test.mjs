// اختبار السيرفر من غير نت: Gemini والتخزين متقلّدين
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mem = new Map()
vi.mock('@netlify/blobs', () => ({
  getStore: () => ({
    async get(k, o) { const v = mem.get(k); return v == null ? null : o?.type === 'json' ? JSON.parse(v) : v },
    async setJSON(k, v) { mem.set(k, JSON.stringify(v)) },
    async set(k, v, o) { if (o?.onlyIfNew && mem.has(k)) return { modified: false }; mem.set(k, v); return { modified: true } },
    async delete(k) { mem.delete(k) },
    list({ prefix, paginate }) {
      const page = { blobs: [...mem.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }
      return paginate ? (async function* () { yield page })() : Promise.resolve(page)
    },
  }),
}))
let seenPrompt = ''
let geminiCalls = 0
const ENV = { GEMINI_API_KEY: 'test' }
globalThis.Netlify = { env: { get: (k) => ENV[k] } }
globalThis.fetch = vi.fn(async (url, init) => {
  geminiCalls++
  seenPrompt = JSON.parse(init.body).contents[0].parts[0].text
  const out = { kind: 'transfer', amountLine: 0, partyLine: 1, balanceLine: null, currency: 'SAR' }
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }))
})

const { default: learn } = await import('../netlify/functions/learn.mjs')
const { default: confirm } = await import('../netlify/functions/confirm.mjs')
const { default: report } = await import('../netlify/functions/report.mjs')
const { default: build } = await import('../netlify/functions/build-catalog.mjs')
const { default: catalog } = await import('../netlify/functions/catalog.mjs')
const { shapeOf, maskSample } = await import('../../src/lib/shapes.js')

const REAL = 'حوالة صادرة محلية ب10776 SAR\nل*8328 اسلام ج. السيد*\n27/10/26 08:07'
const id = shapeOf('الأهلي', REAL).id
const post = (fn, b) => fn(new Request('https://x/api', { method: 'POST', body: JSON.stringify(b) }))

describe('سيرفر القراية الذكية', () => {
  beforeEach(() => { geminiCalls = 0 })
  it('بيتعلم الشكل مرة واحدة — والمرة التانية من الكاش من غير Gemini', async () => {
    const r1 = await (await post(learn, { id, bank: 'الأهلي', sample: maskSample(REAL) })).json()
    expect(r1.template).toMatchObject({ kind: 'transfer', amountLine: 0, partyLine: 1 })
    expect(geminiCalls).toBe(1)
    const r2 = await (await post(learn, { id, bank: 'الأهلي', sample: maskSample(REAL) })).json()
    expect(r2.template.kind).toBe('transfer')
    expect(geminiCalls).toBe(1)
  })
  it('حتى لو التطبيق بعت الرسالة الحقيقية بالغلط: السيرفر بيخفيها تاني قبل Gemini والتخزين', async () => {
    mem.clear()
    await post(learn, { id, bank: 'الأهلي', sample: REAL })
    expect(seenPrompt).not.toMatch(/اسلام|السيد|8328|10776/)
    expect([...mem.values()].join()).not.toMatch(/اسلام|السيد|8328|10776/)
  })
  it('شكل مش مطابق للـ id → مرفوض', async () => {
    const r = await post(learn, { id: 'abcd1234', bank: 'الأهلي', sample: maskSample(REAL) })
    expect(r.status).toBe(400)
  })
  it('موبايلين أكدوا → يدخل المكتبة · موبايلين بلّغوا → يطلع منها', async () => {
    await post(confirm, { id, device: 'A' })
    await post(confirm, { id, device: 'A' }) // نفس الموبايل مرتين = تأكيد واحد
    await build()
    expect(Object.keys((await (await catalog(new Request('https://x/api/catalog'))).json()).templates)).toEqual([])
    await post(confirm, { id, device: 'B' })
    await build()
    expect((await (await catalog(new Request('https://x/api/catalog'))).json()).templates[id].kind).toBe('transfer')
    await post(report, { id, device: 'A', got: 'amount' })
    await post(report, { id, device: 'B', got: 'amount' })
    await build()
    expect((await (await catalog(new Request('https://x/api/catalog'))).json()).templates[id]).toBeUndefined()
    // بعد البلاغ: نفس الشكل بيتعلم من جديد (مع التلميح)
    await post(learn, { id, bank: 'الأهلي', sample: maskSample(REAL), hint: { kind: 'transfer', amountLine: 0 } })
    expect(geminiCalls).toBe(1)
    expect(seenPrompt).toMatch(/WRONG/)
  })
})

describe('بلّغ عن مشكلة / اقترح ميزة', async () => {
  const { default: feedback } = await import('../netlify/functions/feedback.mjs')
  it('بيتبعت لفورم Netlify بالحقول الصح', async () => {
    let sent = null
    globalThis.fetch = vi.fn(async (url, init) => { sent = { url: String(url), body: new URLSearchParams(init.body) }; return new Response('ok') })
    const r = await feedback(new Request('https://masareef-api.netlify.app/api/feedback', { method: 'POST', body: JSON.stringify({ type: 'bug', message: 'الشاشة بتعلق', contact: 'a@b.com', app: 'b35', device: 'Android 15; SM-S931B' }) }), { site: { url: 'https://masareef-api.netlify.app' } })
    expect(r.status).toBe(200)
    expect(sent.url).toBe('https://masareef-api.netlify.app/__forms.html')
    expect(sent.body.get('form-name')).toBe('feedback')
    expect(sent.body.get('message')).toBe('الشاشة بتعلق')
  })
  it('رسالة فاضية أو نوع غريب = مرفوض', async () => {
    const bad = (b) => feedback(new Request('https://x/api/feedback', { method: 'POST', body: JSON.stringify(b) }), {})
    expect((await bad({ type: 'bug', message: '' })).status).toBe(400)
    expect((await bad({ type: 'hack', message: 'hello there' })).status).toBe(400)
  })
})

describe('تنضيف الكلمات اللي بتحدد المكان', async () => {
  const { cleanAnchor } = await import('../lib/gemini.mjs')
  it('الأرقام والنجوم بتتشال وبيفضل الكلام بس', () => {
    expect(cleanAnchor('partyAfter', 'حسابك رقم ****0011 لدى ')).toBe(' لدى ')
    expect(cleanAnchor('amountBefore', ' جنيه من حسابك رقم ****0011')).toBe(' جنيه من حسابك رقم ')
    expect(cleanAnchor('amountAfter', 'مبلغ ')).toBe('مبلغ ')
    expect(cleanAnchor('partyAfter', '****0011')).toBe(null)
  })
  it('القالب بعد التنضيف بيقرا الرسالة المصرية صح', async () => {
    const { applyTemplate } = await import('../../src/lib/shapes.js')
    const raw = { kind: 'purchase', amountLine: 0, partyLine: 0, balanceLine: 0, currency: 'EGP', amountAfter: 'مبلغ ', amountBefore: ' جنيه', partyAfter: 'حسابك رقم ****0011 لدى ', partyBefore: ' في ', balanceAfter: 'الرصيد المتاح ', balanceBefore: ' جنيه' }
    const t = { ...raw }
    for (const k of ['amountAfter', 'amountBefore', 'partyAfter', 'partyBefore', 'balanceAfter', 'balanceBefore']) t[k] = cleanAnchor(k, raw[k])
    const msg = 'تم خصم مبلغ 1,250.00 جنيه من حسابك رقم ****4521 لدى CARREFOUR MAADI في 28/10/2026. الرصيد المتاح 9,800.50 جنيه'
    expect(applyTemplate(t, msg, Date.now())).toEqual(['purchase', 1250, 'CARREFOUR MAADI', { bal: 9800.5, cur: 'EGP' }])
  })
})

describe('السقف اليومي لـ Gemini', () => {
  it('بعد السقف: شكل جديد بيستنى (429)، والأشكال المتخزنة بترجع عادي', async () => {
    mem.clear(); ENV.GEMINI_DAILY_CAP = '1'
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ kind: 'transfer', amountLine: 0, partyLine: 1, balanceLine: null, currency: 'SAR' }) }] } }] })))
    expect((await post(learn, { id, bank: 'الأهلي', sample: maskSample(REAL) })).status).toBe(200)
    const other = 'حوالة واردة محلية ب500 SAR\nمن*1234 سامي*\n27/10/26 08:07'
    const r = await post(learn, { id: shapeOf('الأهلي', other).id, bank: 'الأهلي', sample: maskSample(other) })
    expect(r.status).toBe(429)
    expect((await post(learn, { id, bank: 'الأهلي', sample: maskSample(REAL) })).status).toBe(200) // من الكاش
    delete ENV.GEMINI_DAILY_CAP
  })
})
