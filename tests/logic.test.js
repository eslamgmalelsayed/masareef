// اختبارات الحسابات: الاشتراكات، الأقساط، الكريدت، الديون، الحدود، والخصوصية
import { describe, it, expect, beforeEach } from 'vitest'
import { state, allTx, spendTx, incomeTx, effLimits, cycles, setCategory, clearOverride, levelOf, setSelfTx, setTxCat, setTxFix } from '../src/lib/store.js'
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
  state.settings = { ...state.settings, limits: {}, rollover: false, debts: [], funds: [], emergency: {}, income: '', saveGoal: '', remit: {}, assets: [], zakat: {}, cards: {}, subsHidden: [], flagsSeen: [], autoLent: true, autoLentFrom: NOW - 30 * DAY, lentDismiss: [], lentYes: [], selfTx: [], notSelfTx: [], loanInbox: [], lentIgnore: [], lentAutoPays: {}, lentAutoClosed: {} }
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

describe('المميزات الجديدة', () => {
  it('"السعر زاد": اشتراك شهري آخر مرة اتسحب بسعر أعلى', async () => {
    const { priceUps, dismissPrice } = await import('../src/lib/extras.js')
    state.settings.priceSeen = []
    state.smsTx = [tx(95, 'purchase', 100, 'STC'), tx(65, 'purchase', 100, 'STC'), tx(35, 'purchase', 100, 'STC'), tx(4, 'purchase', 115, 'STC')]
    const p = priceUps.value.find((x) => x.name === 'STC')
    expect(p).toBeTruthy()
    expect(p.up).toBe(15)
    expect(p.was).toBe(100)
    dismissPrice(p.id)
    expect(priceUps.value.some((x) => x.name === 'STC')).toBe(false)
  })
  it('الرسوم البنكية: رسوم البطاقة + رسوم الحوالات + رسوم العملة الأجنبية', async () => {
    const { fees } = await import('../src/lib/extras.js')
    state.smsTx = [tx(20, 'fee', 11.5, 'رسوم تجديد بطاقة صراف'), tx(10, 'intl', 500, 'MONA', { fee: 17.25 }), tx(5, 'purchase', 90, 'NETFLIX', { fx: 2.1 }), tx(400, 'fee', 50, 'رسوم قديمة')]
    const F = fees.value
    expect(F.year).toBeCloseTo(30.85, 2)
    expect(F.month).toBeCloseTo(30.85, 2)
    expect(F.types.map((t) => t.id)).toEqual(['remit', 'card', 'fx'])
  })
  it('أيام من غير أكل برا: بيعد من آخر مرة، وبيحفظ أحسن رقم', async () => {
    const { streak, setStreak } = await import('../src/lib/extras.js')
    state.settings.streak = {}
    state.smsTx = [tx(4.2, 'purchase', 30, 'MCDONALDS', { c: 'food' }), tx(1, 'purchase', 200, 'PANDA', { c: 'grocery' })]
    // tx() مش بيحدد البند، فبنستنى التصنيف التلقائي: ماكدونالدز = أكل برا
    expect(allTx.value.find((t) => t.m === 'MCDONALDS').c).toMatch(/food|delivery/)
    expect(streak.value.days).toBeGreaterThanOrEqual(4)
    expect(streak.value.best).toBe(streak.value.days)
    setStreak({ target: 'any' })
    expect(streak.value.days).toBe(1)
    setStreak({ off: true })
    expect(streak.value).toBe(null)
    state.settings.streak = {}
  })
  it('أقدر أشتريها؟ ماشي / ضيقة / هتعدّي', async () => {
    const { affordCheck } = await import('../src/lib/extras.js')
    state.settings.totalLimit = 6000
    state.smsTx = [tx(40, 'salary', 10000, 'راتب'), tx(2, 'purchase', 1000, 'PANDA')]
    expect(affordCheck(100).level).toBe('ok')
    expect(affordCheck(1e6).level).toBe('over')
    expect(affordCheck(1e6).title).toContain('هتعدّي')
    const r = affordCheck(100)
    expect(r.perAfter).toBeLessThan(r.perNow)
    state.settings.totalLimit = ''
  })
  it('رد "سلفة؟" من الإشعار بيتطبّق على التحويل الصح — ولو الرسالة لسه ماتقرتش بيستنى', async () => {
    const { applyLoanInbox, lentPending: lp } = await import('../src/lib/debts.js')
    state.smsTx = [tx(1, 'transfer', 300, 'SAMIR'), tx(1, 'transfer', 300, 'OTHER')]
    const t = state.smsTx[0]
    state.settings.loanInbox = [{ yes: true, a: 300, key: 'samir', ts: t.ts + 60e3 }, { yes: false, a: 77, key: 'x', ts: Date.now() }]
    applyLoanInbox()
    expect(autoLent.value.find((d) => d.name === 'SAMIR').amount).toBe(300)
    expect(lp.value.map((p) => p.tx.m)).toEqual(['OTHER'])
    expect(state.settings.loanInbox.length).toBe(1) // اللي ملقيناش تحويله لسه مستني
  })
})

describe('تحويل بين حساباتك', () => {
  it('صادرة من بنك + واردة لبنك تاني بنفس المبلغ في خلال ساعة = مش مصروف ولا دخل', () => {
    state.smsTx = [tx(1, 'transfer', 10776, '—', { b: 'الأهلي' }), { ...tx(1, 'in', 10776, '', { b: 'الراجحي' }), ts: NOW - DAY + 6 * 60e3 }, tx(3, 'transfer', 500, 'SAMIR', { b: 'الأهلي' })]
    const self = allTx.value.filter((t) => t.k === 'self')
    expect(self.length).toBe(2)
    expect(self[0].m).toBe('بين حساباتك')
    expect(spendTx.value.some((t) => t.a === 10776)).toBe(false)
    expect(incomeTx.value.some((t) => t.a === 10776)).toBe(false)
    expect(lentPending.value.map((p) => p.tx.m)).toEqual(['SAMIR'])
  })
  it('من غير رسالة واردة: تقدر تعلّم عليها بإيدك — وتتراجع', () => {
    state.smsTx = [tx(1, 'transfer', 3000, '—', { b: 'الأهلي' })]
    const t = allTx.value[0]
    expect(t.k).toBe('transfer')
    setSelfTx(t, true)
    expect(allTx.value[0].k).toBe('self')
    setSelfTx(allTx.value[0], false)
    expect(allTx.value[0].k).toBe('transfer')
  })
  it('نفس البنك، أو فرق وقت كبير، أو تحويل لحد باسمه = مش تحويل بين حساباتك', () => {
    state.smsTx = [tx(1, 'transfer', 700, '*8328', { b: 'الأهلي' }), tx(1, 'in', 700, '', { b: 'الأهلي' }), tx(5, 'transfer', 900, '—', { b: 'الأهلي' }), tx(2, 'in', 900, '', { b: 'الراجحي' }), tx(8, 'transfer', 2301, 'محمد محمود', { b: 'الأهلي' }), tx(8, 'in', 2301, '', { b: 'STC Pay' })]
    expect(allTx.value.filter((t) => t.k === 'self').length).toBe(0)
  })
})

describe('بند لعملية واحدة بس', () => {
  it('حوالة كهربا لشخص: العملية دي بس تروح فواتير، والباقي يفضل تحويلات', () => {
    state.overrides = {}; state.txCats = {}
    state.smsTx = [tx(1, 'transfer', 300, 'على ابراهيم حسن'), tx(9, 'transfer', 500, 'على ابراهيم حسن')]
    setCategory(allTx.value[0], 'bills', true)
    expect(allTx.value[0].c).toBe('bills')
    expect(allTx.value[1].c).toBe('transfer')
    setTxCat(allTx.value[0].id, null)
    expect(allTx.value[0].c).toBe('transfer')
  })
  it('لو نقلت الشخص كله غلط: تخلي العملية دي بس وترجّع الباقي', () => {
    state.overrides = {}; state.txCats = {}
    state.smsTx = [tx(1, 'transfer', 300, 'على ابراهيم حسن'), tx(9, 'transfer', 500, 'على ابراهيم حسن')]
    setCategory(allTx.value[0], 'bills')
    expect(allTx.value.every((t) => t.c === 'bills')).toBe(true)
    setTxCat(allTx.value[0].id, 'bills'); clearOverride(merchantKey('على ابراهيم حسن'))
    expect(allTx.value.map((t) => t.c)).toEqual(['bills', 'transfer'])
    state.overrides = {}; state.txCats = {}
  })
})

describe('"الرسالة دي اتقرت غلط؟"', () => {
  it('النوع الصح بيتطبّق على طول، و"مش عملية" بتختفي — وتقدر تتراجع', () => {
    state.settings.txFix = {}
    state.smsTx = [tx(1, 'transfer', 300, 'STORE X'), tx(2, 'purchase', 50, 'PROMO')]
    const [a, b] = state.smsTx
    setTxFix(a.id, { k: 'purchase' })
    expect(allTx.value.find((t) => t.id === a.id).k).toBe('purchase')
    setTxFix(b.id, { hide: true })
    expect(allTx.value.some((t) => t.id === b.id)).toBe(false)
    setTxFix(b.id, null)
    expect(allTx.value.some((t) => t.id === b.id)).toBe(true)
    state.settings.txFix = {}
  })
})

describe('المراجع الذكي', async () => {
  const { findings, answer, unanswer } = await import('../src/lib/review.js')
  beforeEach(() => { state.settings.reviewSeen = []; state.settings.refundLinks = {} })
  it('تحويل لحد باسمه + نفس المبلغ وصل بنك تاني في نفس الساعة → تحويل لنفسك؟', () => {
    state.smsTx = [tx(1, 'transfer', 2000, 'AHMED ALI', { b: 'الأهلي' }), { ...tx(1, 'in', 2000, 'X', { b: 'الراجحي' }), ts: NOW - DAY + 600e3 }]
    const f = findings.value.find((x) => x.type === 'self')
    expect(f).toBeTruthy()
    answer(f, true)
    expect(allTx.value.filter((t) => t.k === 'self').length).toBeGreaterThan(0)
    expect(findings.value.some((x) => x.type === 'self')).toBe(false)
  })
  it('استرداد بنفس مبلغ شراء → لو أيوه الشراء مبقاش مصروف — وتقدر تتراجع', () => {
    state.smsTx = [tx(10, 'purchase', 349, 'NOON'), tx(2, 'refund', 349, 'NOON')]
    const f = findings.value.find((x) => x.type === 'refund')
    expect(f.other.m).toBe('NOON')
    answer(f, true)
    expect(spendTx.value.some((t) => t.a === 349)).toBe(false)
    unanswer(f)
    expect(spendTx.value.some((t) => t.a === 349)).toBe(true)
  })
  it('فلوس داخلة من حد حوّلتله قبل كده → رجّعلك سلفة؟ (أيوه = بتتحسب سلفة ورجعت)', () => {
    state.smsTx = [tx(20, 'transfer', 1000, 'SAMIR'), tx(2, 'in', 1000, 'SAMIR')]
    const f = findings.value.find((x) => x.type === 'loan')
    answer(f, true)
    const d = autoLent.value.find((x) => x.name === 'SAMIR')
    expect(d.left).toBe(0)
  })
  it('استرداد ١ ريال (تحقق من الكارت) مش بيتسأل عليه', () => {
    state.smsTx = [tx(10, 'purchase', 1, 'AMAZON'), tx(9, 'refund', 1, 'AMAZON')]
    expect(findings.value.length).toBe(0)
  })
})

describe('اسأل التطبيق: اللي بيطلع أرقام مجمّعة بس', async () => {
  const { askContext } = await import('../src/lib/ask.js')
  it('أسماء المحلات أيوه، أسماء الأشخاص لأ', () => {
    state.smsTx = [tx(40, 'salary', 10000, 'راتب'), tx(3, 'purchase', 120, 'NOON'), tx(2, 'transfer', 900, 'AHMED SECRET'), tx(1, 'in', 300, 'MONA PRIVATE')]
    const c = JSON.stringify(askContext())
    expect(c).toContain('NOON')
    expect(c).not.toMatch(/AHMED|SECRET|MONA|PRIVATE/)
    expect(askContext().transfers_this_cycle.to_people).toBe(900)
  })
})
