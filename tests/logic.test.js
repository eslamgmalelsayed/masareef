// اختبارات الحسابات: الاشتراكات، الأقساط، الكريدت، الديون، الحدود، والخصوصية
import { describe, it, expect, beforeEach } from 'vitest'
import { state, allTx, effLimits, cycles, setCategory, clearOverride, levelOf } from '../src/lib/store.js'
import { merchantKey } from '../src/lib/categories.js'
import { subscriptions, bnplPlans, unusual } from '../src/lib/insights.js'
import { creditCards } from '../src/lib/credit.js'
import { simulate, manualDebts, saveDebt, lent, autoLent, notLoan, ignorePerson, totals, setAutoLentRange, lentPending, markLoan, answerNo } from '../src/lib/debts.js'
import { safeToSpend, funds, saveFund, emergency, zakat, netWorth, saveAssets } from '../src/lib/tools.js'
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
  state.settings = { ...state.settings, limits: {}, rollover: false, debts: [], funds: [], emergency: {}, income: '', saveGoal: '', remit: {}, assets: [], zakat: {}, cards: {}, subsHidden: [], flagsSeen: [], autoLent: true, autoLentFrom: NOW - 30 * DAY, lentDismiss: [], lentYes: [], lentIgnore: [], lentAutoPays: {}, lentAutoClosed: {} }
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

describe('التحويل لشخص: بنسأل بدل ما نفترض إنه سلفة', () => {
  it('أي تحويل جديد مش بيتحسب دين لوحده — بيستنى ردك', () => {
    state.smsTx = [tx(10, 'transfer', 300, 'SAMIR'), tx(3, 'transfer', 50, 'K FAHMY')]
    expect(autoLent.value.length).toBe(0)
    expect(totals.value.lent).toBe(0)
    expect(lentPending.value.map((p) => p.tx.m)).toEqual(['K FAHMY', 'SAMIR']) // الأحدث الأول
  })
  it('"أيوه سلفة" بتدخل الديون، واللي رجّعه بيتطرح', () => {
    state.smsTx = [tx(10, 'transfer', 300, 'SAMIR'), tx(5, 'transfer', 200, 'SAMIR'), tx(2, 'in', 100, 'SAMIR'), tx(3, 'transfer', 50, 'K FAHMY')]
    markLoan(state.smsTx[0].id); markLoan(state.smsTx[1].id)
    const s = autoLent.value.find((d) => d.name === 'SAMIR')
    expect(s.amount).toBe(500)
    expect(s.left).toBe(400)
    expect(totals.value.lent).toBe(400)
    expect(lentPending.value.map((p) => p.tx.m)).toEqual(['K FAHMY'])
  })
  it('"لا" مرتين لنفس الشخص = منسألش عليه تاني', () => {
    state.smsTx = [tx(12, 'transfer', 700, 'LANDLORD'), tx(6, 'transfer', 900, 'LANDLORD'), tx(1, 'transfer', 400, 'LANDLORD')]
    expect(answerNo(state.smsTx[0])).toBe(false)
    expect(lentPending.value.length).toBe(2)
    expect(answerNo(state.smsTx[1])).toBe(true)
    expect(lentPending.value.length).toBe(0)
  })
  it('شخص سلّفته قبل كده: "لا" مش بتوقف السؤال عنه، وبنقترح "سلفة"', () => {
    state.smsTx = [tx(12, 'transfer', 70, 'SAMIR'), tx(6, 'transfer', 90, 'SAMIR'), tx(1, 'transfer', 40, 'SAMIR')]
    markLoan(state.smsTx[0].id)
    expect(answerNo(state.smsTx[1])).toBe(false)
    expect(lentPending.value[0].likely).toBe(true)
  })
  it('التحويل اللي بيتكرر كل شهر بنفس المبلغ (إيجار/مصروف) مش بنسأل عليه', () => {
    setAutoLentRange(3)
    state.smsTx = [tx(62, 'transfer', 1500, 'RENT GUY'), tx(31, 'transfer', 1500, 'RENT GUY'), tx(1, 'transfer', 1500, 'RENT GUY'), tx(2, 'transfer', 200, 'FRIEND')]
    expect(lentPending.value.map((p) => p.tx.m)).toEqual(['FRIEND'])
  })
  it('مبالغ صغيرة أو حد بتحوّله على طول (محل بالتحويل) مش بنسأل عليهم', () => {
    state.smsTx = [tx(1, 'transfer', 15, 'TINY'), ...[2, 4, 6, 8, 10].map((d) => tx(d, 'transfer', 120, 'COFFEE GUY')), tx(3, 'transfer', 300, 'FRIEND')]
    expect(lentPending.value.map((p) => p.tx.m)).toEqual(['FRIEND'])
  })
  it('"مش سلفة" بيشيل التحويل، و"مش سلف" بيشيل الشخص كله', () => {
    state.smsTx = [tx(10, 'transfer', 300, 'SAMIR'), tx(5, 'transfer', 200, 'SAMIR'), tx(3, 'transfer', 50, 'K FAHMY')]
    state.smsTx.forEach((t) => markLoan(t.id))
    notLoan(state.smsTx[0].id)
    expect(autoLent.value.find((d) => d.name === 'SAMIR').amount).toBe(200)
    ignorePerson(autoLent.value.find((d) => d.name === 'K FAHMY').key)
    expect(lent.value.some((d) => d.name === 'K FAHMY')).toBe(false)
    expect(lentPending.value.some((p) => p.tx.m === 'K FAHMY')).toBe(false)
  })
  it('الأسئلة: آخر شهر افتراضيًا، وتقدر توسّعها لحد "الكل"', () => {
    state.smsTx = [tx(60, 'transfer', 1000, 'OLD'), tx(400, 'transfer', 300, 'OLD')]
    expect(lentPending.value.length).toBe(0)
    setAutoLentRange(3)
    expect(lentPending.value.length).toBe(1)
    setAutoLentRange(0)
    expect(lentPending.value.length).toBe(2)
  })
})

describe('نقل محل لبند تاني (مش لازم يتلغي)', () => {
  it('النقل بيفضل بعد ما الرسايل تتقري من جديد (تحديث / سحب للتحديث)', () => {
    state.overrides = {}
    state.smsTx = [tx(3, 'purchase', 20, 'ROKON RAIDAN')]
    expect(allTx.value[0].c).toBe('shop') // محل مش معروف → تسوق ومحلات
    setCategory(allTx.value[0], 'grocery')
    state.smsTx = [tx(3, 'purchase', 20, 'ROKON RAIDAN'), tx(1, 'purchase', 15, 'ROKON RAIDAN')] // قراية جديدة = objects جديدة
    expect(allTx.value.every((t) => t.c === 'grocery')).toBe(true)
    clearOverride(merchantKey('ROKON RAIDAN'))
    expect(allTx.value[0].c).toBe('shop')
    setCategory(allTx.value[0], 'other') // وتقدر ترجّعه أخرى بإيدك
    expect(allTx.value[0].c).toBe('other')
    state.overrides = {}
  })
  it('النقل اليدوي أقوى من القواعد التلقائية', () => {
    state.smsTx = [tx(1, 'purchase', 30, 'PANDA')]
    expect(allTx.value[0].c).toBe('grocery')
    setCategory(allTx.value[0], 'food')
    expect(allTx.value[0].c).toBe('food')
    state.overrides = {}
  })
  it('مفتاح المحل ثابت — لو اتغيّر، كل النقل اللي عملته يضيع', () => {
    // لو الاختبار ده فشل: متغيّرش merchantKey (أو اعمل migration للـ overrides)
    expect(['ROKON RAIDAN', 'noon.com', 'TAP * Anthropic', 'PAYPAL *SPOTIFY', 'سوبر ماركت الأمانة', 'AL HAMMAD'].map(merchantKey))
      .toEqual(['ROKONRAID', 'NOONCOM', 'ANTHROPIC', 'SPOTIFY', 'سوبرماركت', 'ALHAMMAD'])
  })
})

describe('مجموعات البنود', () => {
  it('كل بند ليه مجموعة واحدة بالظبط', async () => {
    const { CATEGORIES, GROUPS, GROUP_OF } = await import('../src/lib/categories.js')
    for (const c of CATEGORIES.filter((x) => !x.hidden)) expect(GROUP_OF[c.id], c.id).toBeTruthy()
    const all = GROUPS.flatMap((g) => g.cats)
    expect(new Set(all).size).toBe(all.length)
    expect(GROUPS.find((g) => g.id === 'g_shop').cats).toEqual(expect.arrayContaining(['shop', 'online', 'clothes']))
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

describe('نسبة التنبيه', () => {
  it('افتراضيًا ٨٠٪، وبتتغير، و٠ = لما تعدّي بس', () => {
    expect(levelOf(80, 100)).toBe('warn')
    state.settings.warnPct = 90
    expect(levelOf(85, 100)).toBe('ok')
    expect(levelOf(90, 100)).toBe('warn')
    state.settings.warnPct = 0
    expect(levelOf(99, 100)).toBe('ok')
    expect(levelOf(101, 100)).toBe('over')
    delete state.settings.warnPct
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

describe('الممتلكات والزكاة', () => {
  it('الدهب بالجرام، والعربية مش عليها زكاة', () => {
    state.settings.zakat = { gram: 400 }
    saveAssets([{ type: 'gold', name: 'دهب', grams: 100 }, { type: 'car', name: 'عربية', v: 50000 }, { type: 'cash', name: 'كاش', v: 10000 }])
    expect(netWorth.value.other).toBe(40000 + 50000 + 10000)
    expect(zakat.value.extra).toBe(50000) // الدهب + الكاش بس
    expect(zakat.value.reached).toBe(true) // النصاب ٨٥ × ٤٠٠ = ٣٤٬٠٠٠
    expect(zakat.value.amount).toBeCloseTo(50000 * 0.025, 2)
  })
})

describe('إخفاء المبالغ', () => {
  it('fmt بيخفي الأرقام', () => {
    expect(fmt(1234)).toBe('1,234')
    setPrivacy(true)
    expect(fmt(1234)).toBe('••••')
  })
})
