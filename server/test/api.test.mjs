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
globalThis.Netlify = { env: { get: (k) => ({ GEMINI_API_KEY: 'test' })[k] } }
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
