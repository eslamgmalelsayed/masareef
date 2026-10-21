// اختبارات الحسابات: الاشتراكات، الأقساط، الكريدت، الديون، الحدود، والخصوصية
import { describe, it, expect, beforeEach } from 'vitest'
import { state, allTx, effLimits, cycles } from '../src/lib/store.js'
import { subscriptions, bnplPlans, unusual } from '../src/lib/insights.js'
import { creditCards } from '../src/lib/credit.js'
import { simulate, manualDebts, saveDebt } from '../src/lib/debts.js'
import { safeToSpend, funds, saveFund, emergency } from '../src/lib/tools.js'
import { fmt, setPrivacy } from '../src/lib/format.js'

const DAY = 864e5
const NOW = Date.now()
let n = 0
const tx = (daysAgo, k, a, m, extra = {}) => ({ id: 't' + n++, ts: NOW - daysAgo * DAY, a, k, m, b: 'الراجحي', ...extra })

beforeEach(() => {
  state.smsTx = []
  state.importedTx = []
  state.manualTx = []
  state.bnplSms = []
  state.importedBnpl = []
  state.status = 'ready'
  state.settings = { ...state.settings, limits: {}, rollover: false, debts: [], funds: [], emergency: {}, income: '', saveGoal: '', remit: {}, cards: {}, subsHidden: [], flagsSeen: [] }
  setPrivacy(false)
})

describe('الاشتراكات المتكررة', () => {
  it('بتلقط اشتراك شهري ثابت', () => {
    state.smsTx = [90, 60, 30, 1].map((d) => tx(d, 'purchase', 88.4, 'ANTHROPIC'))
    const s = subscriptions.value.find((x) => x.name === 'ANTHROPIC')
    expect(s).toBeTruthy()
    expect(s.period.id).toBe('monthly')
    expect(s.next).toBeGreaterThan(NOW)
  })
  it('مش بتعتبر السوبر ماركت اشتراك', () => {
    state.smsTx = [90, 60, 30, 1].map((d) => tx(d, 'purchase', 50, 'PANDA'))
    expect(subscriptions.value.length).toBe(0)
  })
})

describe('أقساط تابي', () => {
  it('بتعرف عدد الأقساط من أول قسط وبتعدّ اللي اتدفع', () => {
    state.bnplSms = [{ prov: 'tabby', store: 'SHOP', total: 300, ts: NOW - 40 * DAY }]
    state.smsTx = [tx(40, 'purchase', 100, 'TABBY'), tx(10, 'purchase', 100, 'TABBY')]
    const p = bnplPlans.value[0]
    expect(p.n).toBe(3)
    expect(p.paid).toBe(2)
    expect(p.remaining).toBeCloseTo(100, 2)
    expect(p.done).toBe(false)
  })
})

describe('البطاقة الائتمانية', () => {
  it('الحد = أول متاح + اللي اتصرف قبله، والمستحق بيتحسب صح', () => {
    state.smsTx = [
      tx(30, 'purchase', 500, 'SHOP A', { card: '9999', cc: 1, bal: 9500 }),
      tx(5, 'purchase', 200, 'SHOP B', { card: '9999', cc: 1, bal: 9300 }),
    ]
    const c = creditCards.value.find((x) => x.card === '9999')
    expect(c.limit).toBe(10000)
    expect(c.outstanding).toBeCloseTo(700, 2)
  })
  it('الحد اللي بتكتبه بإيدك ليه الأولوية', () => {
    state.smsTx = [tx(5, 'purchase', 200, 'SHOP', { card: '9999', cc: 1, bal: 11800 })]
    state.settings.cards = { 'الراجحي|9999': { limit: 15000 } }
    expect(creditCards.value[0].outstanding).toBeCloseTo(3200, 2)
  })
})

describe('خطة سداد الديون', () => {
  const debts = [
    { key: 'small', name: 'صغير', left: 1000, min: 100, rate: 0 },
    { key: 'costly', name: 'فايدته عالية', left: 5000, min: 200, rate: 24 },
  ]
  it('الأصغر الأول بيخلّص الصغير الأول', () => {
    const r = simulate(debts, 500, 'snowball')
    expect(r.debts.find((d) => d.key === 'small').end).toBeLessThan(r.debts.find((d) => d.key === 'costly').end)
  })
  it('الأغلى فايدة الأول بيوفر فوايد', () => {
    expect(simulate(debts, 500, 'avalanche').interest).toBeLessThan(simulate(debts, 500, 'snowball').interest)
  })
  it('الدفع الزيادة بيقصّر المدة', () => {
    expect(simulate(debts, 500).months).toBeLessThan(simulate(debts, 0, 'snowball', false).months)
  })
  it('تحويل جايلك من الشخص بيتحسب إنه رجّع جزء', () => {
    saveDebt({ type: 'lent', name: 'أحمد', amount: 1000, ts: NOW - 20 * DAY, match: 'AHMED' })
    state.smsTx = [tx(5, 'in', 400, 'AHMED ALI')]
    expect(manualDebts.value[0].left).toBeCloseTo(600, 2)
  })
})

describe('الحدود', () => {
  it('ترحيل الحدود بيزوّد الباقي من الراتب اللي فات', () => {
    state.smsTx = [tx(45, 'salary', 9000, 'راتب'), tx(15, 'salary', 9000, 'راتب'), tx(30, 'purchase', 300, 'ALBAIK')]
    state.settings.limits = { food: 500 }
    expect(cycles.value.length).toBe(2)
    expect(allTx.value.find((t) => t.m === 'ALBAIK').c).toBe('food')
    expect(effLimits.value.food).toBe(500)
    state.settings.rollover = true
    expect(effLimits.value.food).toBe(700)
  })
})

describe('تقدر تصرف/يوم', () => {
  it('النتيجة = مجموع البنود، ومش بالسالب', () => {
    state.settings.income = 9000
    state.smsTx = [tx(2, 'purchase', 1200, 'SHOP')]
    const s = safeToSpend.value
    expect(s.rest).toBeCloseTo(s.parts.reduce((x, p) => x + p.v, 0), 5)
    expect(s.perDay).toBeGreaterThanOrEqual(0)
  })
  it('الصناديق وصندوق الطوارئ بيتطرحوا منه', () => {
    state.settings.income = 9000
    const before = safeToSpend.value.rest
    saveFund({ icon: '🛂', name: 'إقامة', target: 1200, due: NOW + 200 * DAY })
    expect(funds.value[0].needNow).toBeGreaterThan(0)
    expect(safeToSpend.value.rest).toBeLessThan(before)
    state.settings.emergency = { months: 3, target: 6000, adds: [], perCycle: 500 }
    expect(emergency.value.needNow).toBe(500)
    expect(safeToSpend.value.parts.some((p) => p.k === 'emergency')).toBe(true)
  })
})

describe('تنبيه العملية الغريبة', () => {
  it('نفس المبلغ من نفس المكان مرتين ورا بعض', () => {
    const t1 = tx(1, 'purchase', 45, 'STARBUCKS'), t2 = { ...tx(1, 'purchase', 45, 'STARBUCKS'), ts: t1.ts + 60e3 }
    state.smsTx = [t1, t2]
    expect(unusual.value.some((f) => f.type === 'dup')).toBe(true)
  })
})

describe('إخفاء المبالغ', () => {
  it('fmt بيخفي الأرقام', () => {
    expect(fmt(1234)).toBe('1,234')
    setPrivacy(true)
    expect(fmt(1234)).toBe('••••')
  })
})
