// "اسأل التطبيق": الحسابات بتتعمل على الموبايل، واللي بيطلع = سؤالك + أرقام مجمّعة (من غير عمليات ولا أسماء أشخاص)
import { spendTx, allTx, cycles, currentCycle, cycleByCat, cycleSpent, totalLimit, dayLimit, weekLimit, income, state } from './store.js'
import { CAT } from './categories.js'
import { subscriptions, savings } from './insights.js'
import { totals as debtTotals } from './debts.js'
import { fees } from './extras.js'
import { money } from './format.js'
import { API } from './smart.js'

const DAY = 864e5
const r0 = (v) => Math.round(v || 0)
const byCat = (rows) => {
  const o = {}
  for (const t of rows) { const n = CAT[t.c]?.name || t.c; o[n] = (o[n] || 0) + t.a }
  return Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => [k, r0(v)]))
}

/** ملخص أرقام بس — مفيش أسماء أشخاص (التحويلات بتتجمع من غير أسماء) */
export function askContext() {
  const cc = currentCycle.value
  const sp = spendTx.value
  const inCycle = sp.filter((t) => t.d >= cc.from)
  // أكتر المحلات (شراء بس — أسماء محلات مش أشخاص)
  const shops = {}
  for (const t of inCycle) if (t.k === 'purchase' || t.k === 'bill') { const o = (shops[t.m] ||= { n: 0, a: 0 }); o.n++; o.a += t.a }
  const last12 = cycles.value.slice(-12).map((c) => {
    const rows = sp.filter((t) => t.d >= c.from && t.d <= c.to)
    return { month: c.label + ' ' + c.year, salary: r0(c.salary), spent: r0(rows.reduce((x, t) => x + t.a, 0)), top: byCat(rows) }
  })
  const now = Date.now()
  const daily = []
  for (let i = 29; i >= 0; i--) {
    const d0 = new Date(now - i * DAY); d0.setHours(0, 0, 0, 0)
    const d1 = +d0 + DAY
    daily.push(r0(sp.filter((t) => t.ts >= +d0 && t.ts < d1).reduce((x, t) => x + t.a, 0)))
  }
  return {
    currency: money.cur, today: new Date().toISOString().slice(0, 10),
    current_cycle: { started: cc.from.toISOString().slice(0, 10), salary: r0(cc.salary || income.value), spent: r0(cycleSpent.value), limit: r0(totalLimit.value), day_limit: r0(dayLimit.value), week_limit: r0(weekLimit.value), by_category: byCat(inCycle) },
    top_shops_this_cycle: Object.entries(shops).sort((a, b) => b[1].a - a[1].a).slice(0, 15).map(([name, o]) => ({ name, times: o.n, total: r0(o.a) })),
    transfers_this_cycle: (() => { const tr = allTx.value.filter((t) => t.d >= cc.from); const s = (k) => r0(tr.filter((t) => t.k === k).reduce((x, t) => x + t.a, 0)); return { to_people: s('transfer'), international: s('intl'), counted_as_spending: !!state.settings.includeTransfers } })(),
    last_cycles: last12,
    last_30_days_daily_spend: daily,
    subscriptions: subscriptions.value.slice(0, 15).map((s) => ({ name: s.name, every: s.period.label, amount: r0(s.amount) })),
    debts: { i_owe: r0(debtTotals.value.owed), owed_to_me: r0(debtTotals.value.lent) },
    savings: { avg_left_per_salary: r0(savings.value.avgSaved), goal: r0(state.settings.saveGoal) },
    bank_fees_last_year: r0(fees.value.year),
    transactions_count: allTx.value.length,
  }
}

export async function askApp(question) {
  const r = await fetch(API + '/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: question.slice(0, 300), ctx: askContext() }) })
  if (r.status === 429) throw new Error('limit')
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return (await r.json()).answer
}
