// القراية الذكية: الشكل، إخفاء البيانات، وتطبيق القالب
import { describe, it, expect } from 'vitest'
import { shapeOf, maskSample, applyTemplate, validTemplate, cleanParty, linesOf } from '../src/lib/shapes.js'
import { parseMessages, setExtraBanks } from '../src/lib/parser.js'
import { setMoney } from '../src/lib/money.js'

const AHLI_1 = 'حوالة صادرة محلية ب10776 SAR\nل*8328 تست ا. الاخ*\n27/10/26 08:07'
const AHLI_2 = 'حوالة صادرة محلية ب750.5 SAR\nل*7777 سامي محمد العلي*\n28/10/26 21:40'

describe('الشكل', () => {
  it('رسايل بنفس القالب = نفس الشكل، حتى لو الأسماء والمبالغ مختلفة', () => {
    expect(shapeOf('الأهلي', AHLI_1).id).toBe(shapeOf('الأهلي', AHLI_2).id)
  })
  it('بنك تاني أو قالب تاني = شكل تاني', () => {
    expect(shapeOf('الراجحي', AHLI_1).id).not.toBe(shapeOf('الأهلي', AHLI_1).id)
    expect(shapeOf('الأهلي', 'شراء انترنت\nمبلغ:SAR 40\nلدى:NOON').id).not.toBe(shapeOf('الأهلي', AHLI_1).id)
  })
})

describe('إخفاء البيانات قبل ما الشكل يطلع', () => {
  const body = 'شراء انترنت\nبطاقة:*6056;مدى\nمن:*8328\nلدى:Riham MITWALLI\nمبلغ:SAR 40.00'
  const m = maskSample(body, () => 0.5)
  it('مفيش اسم ولا رقم حقيقي', () => {
    expect(m).not.toMatch(/Riham|MITWALLI|6056|8328|40\.00/)
    expect(maskSample(AHLI_1, () => 0.5)).not.toMatch(/تست|الاخ|8328|10776/)
  })
  it('الكلمات البنكية والشكل بيفضلوا علشان الموديل يفهم', () => {
    expect(m).toMatch(/^شراء انترنت\nبطاقة:\*5555;مدى\nمن:\*5555\nلدى:X+ X+\nمبلغ:SAR 55\.55$/)
    expect(linesOf(m).length).toBe(linesOf(body).length)
  })
})

describe('تطبيق القالب', () => {
  const T = { kind: 'transfer', amountLine: 0, partyLine: 1 }
  it('بيطلع المبلغ والاسم من مكانهم', () => {
    expect(applyTemplate(T, AHLI_2, 0)).toEqual(['transfer', 750.5, 'سامي محمد العلي', {}])
  })
  it('تحويل لحساب من حساباتك أو باسمك = تحويل لنفسك', () => {
    expect(applyTemplate(T, AHLI_1, 0, { accounts: ['8328'] })[0]).toBe('ignore')
    expect(applyTemplate(T, AHLI_1, 0, { selfNames: ['تست'] })[0]).toBe('ignore')
  })
  it('الحارس: لو سطر المبلغ مفيهوش مبلغ، القالب مايتستخدمش', () => {
    expect(applyTemplate({ kind: 'transfer', amountLine: 2, partyLine: 1 }, AHLI_1, 0)).toBe(null)
  })
  it('قالب بايظ من السيرفر بيترفض', () => {
    expect(validTemplate({ kind: 'hack', amountLine: 0 }, 3)).toBe(false)
    expect(validTemplate({ kind: 'purchase', amountLine: 9 }, 3)).toBe(false)
    expect(validTemplate({ kind: 'ignore' }, 3)).toBe(true)
  })
  it('تنضيف الاسم', () => {
    expect(cleanParty('لدى:NOON.COM').name).toBe('NOON.COM')
    expect(cleanParty('إلى: 9999;مجدي فهمي').name).toBe('مجدي فهمي')
    expect(cleanParty('ل*8328 اسلام ج. السي*')).toEqual({ name: 'اسلام ج. السي', acct: '8328' })
  })
})

describe('القراية الذكية جوه parseMessages', () => {
  setExtraBanks({ newbank: 'بنك جديد' })
  const msg = { address: 'NewBank', date: 1761600000000, body: 'تم خصم مبلغ من حسابك\nالقيمة 85.25 ر.س\nالجهة: مطعم البيك\n2026-10-28' }
  it('رسالة بنك جديد مش مفهومة → بترجع كشكل مجهول نسأل عليه', () => {
    const out = parseMessages([msg], {}, {})
    expect(out.length).toBe(0)
    expect(out.unknown.size).toBe(1)
  })
  it('بعد ما القالب يوصل → بتتقري، ومتعلّمة إنها من القراية الذكية', () => {
    const id = [...parseMessages([msg], {}, {}).unknown.keys()][0]
    const out = parseMessages([msg], {}, { [id]: { kind: 'purchase', amountLine: 1, partyLine: 2 } })
    expect(out.length).toBe(1)
    expect(out[0]).toMatchObject({ k: 'purchase', a: 85.25, m: 'مطعم البيك', ai: 1 })
    expect(out.unknown.size).toBe(0)
  })
  it('من غير قوالب = نفس القراية القديمة بالظبط', () => {
    expect(parseMessages([msg], {}).length).toBe(0)
  })
})

describe('القالب الأوسع + تبليغ الاختلاف', () => {
  it('العملة والرصيد من القالب', () => {
    const b = 'تم خصم\nالمبلغ: 1,250.00 EGP\nالرصيد: 9,800.50\nالتاجر: Carrefour Maadi'
    setMoney('EGP')
    expect(applyTemplate({ kind: 'purchase', amountLine: 1, partyLine: 3, balanceLine: 2, currency: 'EGP' }, b, Date.now())[3]).toEqual({ bal: 9800.5 })
    setMoney('SAR')
  })
  it('القالب قال مبلغ غير القراية القديمة → نثق في القديمة ونبلّغ', () => {
    const msg = { address: 'AlRajhiBank', date: 1761600000000, body: 'شراء انترنت\nبطاقة:*6056;مدى\nلدى:NOON\nمبلغ:SAR 40.00\nفي:22-10-31 13:44' }
    const id = [...parseMessages([msg], {}, {}).unknown.keys()][0]
    const wrong = { [id]: { kind: 'purchase', amountLine: 1, partyLine: 2 } } // سطر البطاقة بدل المبلغ
    const out = parseMessages([msg], {}, wrong)
    expect(out[0].a).toBe(40)
    expect(out[0].ai).toBeUndefined()
    expect(out.mismatch.has(id)).toBe(true)
  })
})

describe('الشكل من الرسالة = الشكل من النسخة المخفية (السيرفر يقدر يتأكد)', () => {
  it.each([
    AHLI_1,
    'شراء انترنت\nبطاقة:*6056;مدى\nمن:*8328\nلدى:Riham MITWALLI\nمبلغ:SAR 40.00\nفي:22-10-31 13:44',
    'عميلنا العزيز،\nتم خصم مبلغ 55.5 ريال من حسابك لدى مطعم البيك\n2026-10-28',
  ])('%s', (b) => {
    expect(shapeOf('X', maskSample(b)).id).toBe(shapeOf('X', b).id)
  })
})

describe('رسالة سطر واحد (بنوك تانية / بلاد تانية)', () => {
  const CIB = 'تم خصم مبلغ 1,250.00 جنيه من حسابك رقم ****4521 لدى CARREFOUR MAADI في 28/10/2026. الرصيد المتاح 9,800.50 جنيه'
  const T = { kind: 'purchase', amountLine: 0, amountAfter: 'مبلغ', partyLine: 0, partyAfter: 'لدى', partyBefore: ' في', balanceLine: 0, balanceAfter: 'الرصيد', currency: 'EGP' }
  it('المبلغ والمحل والرصيد كل واحد من مكانه جوه نفس السطر (لو عايش في مصر)', () => {
    setMoney('EGP')
    expect(applyTemplate(T, CIB, Date.now())).toEqual(['purchase', 1250, 'CARREFOUR MAADI', { bal: 9800.5 }])
    setMoney('SAR')
  })
  it('لو عملة البيت ريال: بيتحوّل، والمبلغ الأصلي بالجنيه محفوظ', () => {
    const r = applyTemplate(T, CIB, Date.now())
    expect(r[1]).toBeCloseTo(1250 / 13, 1) // جدول الاحتياطي: الجنيه = ١/١٣ ريال
    expect(r[3]).toMatchObject({ cur: 'EGP', oa: 1250 })
  })
  it('القالب بيشتغل على النسخة المخفية كمان (السيرفر بيتأكد بيها)', () => {
    const r = applyTemplate(T, maskSample(CIB, () => 0.3), Date.now())
    expect(r[0]).toBe('purchase')
    expect(r[1]).toBeGreaterThan(0)
  })
  it('كلمة مش موجودة في الرسالة = القالب مايتطبقش', () => {
    expect(applyTemplate({ ...T, amountAfter: 'القيمة' }, CIB, Date.now())).toBe(null)
  })
  it('جنيه والمتاح مش بيتخبوا (كلمات بنكية)، والاسم بيتخبى', () => {
    const m = maskSample(CIB, () => 0.3)
    expect(m).toMatch(/جنيه/)
    expect(m).toMatch(/المتاح/)
    expect(m).not.toMatch(/CARREFOUR|MAADI|4521/)
  })
})

describe('ى/ي وأ/ا في الكلمات اللي بتحدد المكان', () => {
  it('"لدي" بتلاقي "لدى"', () => {
    const msg = 'تم خصم مبلغ 1,250.00 جنيه من حسابك لدى CARREFOUR MAADI في 28/10/2026'
    const t = { kind: 'purchase', amountLine: 0, amountAfter: 'مبلغ ', partyLine: 0, partyAfter: 'لدي ', partyBefore: ' في' }
    expect(applyTemplate(t, msg, Date.now())[2]).toBe('CARREFOUR MAADI')
  })
})

describe('عملة البيت بتتعرف لوحدها', async () => {
  const { detectHome, normCur } = await import('../src/lib/money.js')
  const now = Date.now()
  const m = (body, d = 1) => ({ body, date: now - d * 864e5 })
  it('اللي بتصرف بيه أكتر، والراتب بيتحسب أكتر', () => {
    expect(detectHome([m('شراء\nمبلغ:SAR 40'), m('شراء\nمبلغ:SAR 10'), m('تم خصم 100 جنيه')])).toBe('SAR')
    expect(detectHome([m('شراء\nمبلغ:SAR 40'), m('شراء 20 SAR'), m('إيداع راتب 15,000 جنيه')])).toBe('EGP')
  })
  it('رسايل قديمة (أكتر من ٤ شهور) مش بتتحسب — اللي نقل بلد بيتعرف على طول', () => {
    expect(detectHome([m('مبلغ:SAR 40', 200), m('مبلغ:SAR 40', 200), m('تم خصم 100 درهم', 3)])).toBe('AED')
  })
  it('ريال قطري / عماني، ودينار كويتي / بحريني', () => {
    expect(normCur('ريال', ' قطري')).toBe('QAR')
    expect(normCur('دينار', ' بحريني')).toBe('BHD')
    expect(normCur('SR')).toBe('SAR')
  })
})
