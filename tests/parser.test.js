// اختبارات قراية رسايل البنوك — على رسايل وهمية بنفس شكل الرسايل الحقيقية
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { parseMessages, parseBnplMessages, bankOf } from '../src/lib/parser.js'
import { categorize } from '../src/lib/categories.js'

const F = JSON.parse(fs.readFileSync(new URL('./fixtures/sms.json', import.meta.url), 'utf8'))

describe('رسايل البنوك', () => {
  for (const [i, m] of F.messages.entries()) {
    const label = `${i + 1}. ${m.address} — ${m.expect ? m.expect.k : 'تتجاهل: ' + m.why}`
    it(label, () => {
      // البطاقة الائتمانية بتتعرف من باقي الرسايل، فبنقرا الكل مع بعض ونجيب الرسالة دي
      const all = parseMessages(F.messages, F.profile)
      const t = all.find((x) => x.ts === m.date)
      if (!m.expect) return expect(t).toBeUndefined()
      expect(t, 'الرسالة متقرتش').toBeTruthy()
      const e = m.expect
      expect(t.k).toBe(e.k)
      expect(t.a).toBeCloseTo(e.a, 2)
      if (e.m) expect(t.m).toBe(e.m)
      if (e.card) expect(t.card).toBe(e.card)
      if (e.bal != null) expect(t.bal).toBeCloseTo(e.bal, 2)
      if (e.noBal) expect(t.bal).toBeUndefined()
      if (e.fee != null) expect(t.fee).toBeCloseTo(e.fee, 2)
      if (e.cc) expect(t.cc).toBe(1)
      expect(categorize(t)).toBeTruthy()
    })
  }

  it('الراسل لازم يكون بنك معروف', () => {
    expect(bankOf('AlRajhiBank')).toBe('الراجحي')
    expect(bankOf('  stc bank ')).toBe('STC Bank')
    expect(bankOf('RandomShop')).toBeNull()
  })

  it('مفيش رسالة بتتحسب مرتين', () => {
    const twice = parseMessages([...F.messages, ...F.messages], F.profile)
    expect(twice.length).toBe(parseMessages(F.messages, F.profile).length)
  })
})

describe('رسايل تابي وتمارا', () => {
  const plans = parseBnplMessages(F.bnpl)
  for (const m of F.bnpl.filter((x) => x.expect)) {
    it(`${m.expect.prov} — ${m.expect.store}`, () => {
      const p = plans.find((x) => x.ts === m.date)
      expect(p).toBeTruthy()
      expect(p.prov).toBe(m.expect.prov)
      expect(p.store).toBe(m.expect.store)
      expect(p.total).toBeCloseTo(m.expect.total, 2)
      if (m.expect.n) expect(p.n).toBe(m.expect.n)
    })
  }
  it('كود التحقق مش خطة تقسيط', () => expect(plans.length).toBe(F.bnpl.filter((x) => x.expect).length))
  it('رسايل تابي مش بتتقري كأنها شراء من البنك', () => {
    expect(parseMessages(F.bnpl.map((m) => ({ ...m, address: '__ios__' })), F.profile).length).toBe(0)
  })
})
