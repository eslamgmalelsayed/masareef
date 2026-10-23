<script setup>
import { computed, ref } from 'vue'
import { state, spendTx, allTx, cycles, currentCycle, cycleByCat, nextSalaryDate, avgSalary, income, totalLimit, totalLevel, displayName, effLimits, warnRatio, dayLimit, weekLimit, levelOf } from '../lib/store.js'
import { CAT } from '../lib/categories.js'
import { privacy, setPrivacy, fmt, fmtDate, sum, byCategory, startOfDay, startOfWeek, DAY } from '../lib/format.js'
import BarChart from './BarChart.vue'
import CatBars from './CatBars.vue'
import TxRow from './TxRow.vue'
import UpdateBanner from './UpdateBanner.vue'
import InstallHint from './InstallHint.vue'
import WebImport from './WebImport.vue'
import { isNative } from '../lib/smsSource.js'
import { totals as debtTotals, lentPending } from '../lib/debts.js'
import LoanAsk from './LoanAsk.vue'
import { safeToSpend, activeEvent, zakat } from '../lib/tools.js'
import { commitments, transfers, savings, saveGoal, unusual, dismissFlag, salarySummary, dismissSummary } from '../lib/insights.js'

const emit = defineEmits(['open', 'go'])
const now = new Date()
const since = (d) => spendTx.value.filter((t) => t.d >= d)

const cyc = computed(() => currentCycle.value)
const salary = computed(() => income.value)
const limit = computed(() => totalLimit.value)
const cycleRows = computed(() => since(cyc.value.from))
const spent = computed(() => sum(cycleRows.value))
const left = computed(() => limit.value - spent.value)
const pct = computed(() => (limit.value ? (spent.value / limit.value) * 100 : 0))
const pctSal = computed(() => (salary.value ? (spent.value / salary.value) * 100 : 0))
const today = computed(() => sum(since(startOfDay())))
const week = computed(() => sum(since(startOfWeek())))

// الأيام اللي فاضلة للراتب الجاي، والمسموح تصرفه في اليوم
const daysLeft = computed(() => (nextSalaryDate.value ? Math.max(1, Math.ceil((nextSalaryDate.value - now) / DAY)) : 0))
const perDayAllowed = computed(() => safeToSpend.value.perDay)
const showSafe = ref(false)
const elapsed = computed(() => Math.max(1, (now - cyc.value.from) / DAY))
const projected = computed(() => {
  const total = elapsed.value + daysLeft.value
  return (spent.value / elapsed.value) * total
})
const budget = computed(() => Number(state.settings.budget) || 0)

// نفس الوقت في الراتب اللي فات
const prevSame = computed(() => {
  const list = cycles.value
  const prev = list[list.length - 2]
  if (!prev || !cyc.value.salary) return null
  const to = new Date(Math.min(+prev.from + (now - cyc.value.from), +prev.to))
  const v = sum(spendTx.value.filter((t) => t.d >= prev.from && t.d <= to))
  return v ? { v, diff: ((spent.value - v) / v) * 100, label: prev.label } : null
})

// آخر ٦ رواتب: المصروف كنسبة من الراتب
const last6 = computed(() => {
  const list = cycles.value.slice(-6)
  const cs = getComputedStyle(document.documentElement)
  const accent = cs.getPropertyValue('--accent').trim(), dim = cs.getPropertyValue('--bar-dim').trim()
  const data = list.map((c) => sum(spendTx.value.filter((t) => t.d >= c.from && t.d <= c.to)))
  return {
    labels: list.map((c) => c.short),
    datasets: [
      { label: 'الصرف', data, colors: data.map((_, i) => (i === list.length - 1 ? accent : dim)) },
      { type: 'line', label: 'الراتب', data: list.map((c) => c.salary), color: cs.getPropertyValue('--ink-2').trim() },
    ],
    rates: list.map((c, i) => ({ l: c.short, p: c.salary ? Math.round((1 - data[i] / c.salary) * 100) : 0 })),
  }
})

const limits = computed(() =>
  [
    ...Object.entries(effLimits.value).filter(([, l]) => l > 0).map(([id, limit]) => ({ id, limit, spent: cycleByCat.value[id] || 0, label: CAT[id].icon + ' ' + CAT[id].name })),
    ...(state.settings.groups || []).filter((g) => g.limit).map((g) => ({ id: g.id, limit: g.limit, spent: g.cats.reduce((x, c) => x + (cycleByCat.value[c] || 0), 0), label: g.cats.slice(0, 3).map((c) => CAT[c]?.icon).join('') + ' ' + g.name })),
  ]
    .map((r) => ({ ...r, pct: r.spent / r.limit, lvl: r.spent >= r.limit ? 'over' : r.spent >= warnRatio.value * r.limit ? 'warn' : 'ok' }))
    .sort((a, b) => b.pct - a.pct),
)
const topCats = computed(() => byCategory(cycleRows.value))
const recent = computed(() => allTx.value.filter((t) => t.k !== 'cashAdj').slice(0, 6))
const hello = computed(() => (now.getHours() < 12 ? 'صباح الخير' : 'مساء الخير') + (displayName.value ? ' يا ' + displayName.value : ''))
</script>

<template>
  <div class="view">
    <header class="hd">
      <div>
        <div class="muted sm">{{ fmtDate(now, { weekday: 'long', day: 'numeric', month: 'long' }) }}</div>
        <h1>{{ hello }}</h1>
      </div>
      <button class="eye" :class="{ on: privacy.on }" :title="privacy.on ? 'اظهر المبالغ' : 'اخفي المبالغ'" @click="setPrivacy(!privacy.on)">
        <svg v-if="!privacy.on" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
        <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
      </button>
    </header>

    <UpdateBanner compact />
    <InstallHint dismissible />
    <WebImport v-if="!isNative" compact />

    <section class="hero" :class="totalLevel">
      <div class="row">
        <div class="lbl">{{ cyc.label ? 'صرفت من راتب ' + cyc.label : 'صرفت الشهر ده' }}</div>
        <div class="lbl" v-if="cyc.label">نزل {{ fmtDate(cyc.from, { day: 'numeric', month: 'short' }) }}</div>
      </div>
      <div class="big">{{ fmt(spent) }}<small> ر.س</small></div>
      <template v-if="limit">
        <div v-if="totalLevel === 'over'" class="alert">🔴 عدّيت حد المصروفات بـ {{ fmt(-left) }} ر.س</div>
        <div v-else-if="totalLevel === 'warn'" class="alert">⚠️ قرّبت من الحد — باقي {{ fmt(left) }} ر.س بس</div>
        <div class="track"><i :style="{ width: Math.min(100, pct) + '%' }"></i></div>
        <div class="hint">
          <span><b>{{ Math.round(pct) }}٪</b> من {{ limit === salary ? 'الدخل' : 'الحد' }} ({{ fmt(limit) }})</span>
          <span v-if="left >= 0">باقي <b>{{ fmt(left) }}</b></span>
          <span v-else>زيادة <b>{{ fmt(-left) }}</b></span>
        </div>
        <div v-if="limit !== salary && salary" class="hint sub"><span>{{ Math.round(pctSal) }}٪ من الدخل ({{ fmt(salary) }})</span></div>
        <div class="split3">
          <div :class="'pl ' + levelOf(today, dayLimit)"><div class="lbl">النهارده</div><div class="mid">{{ fmt(today) }}</div><div v-if="dayLimit" class="of">من {{ fmt(dayLimit) }}</div></div>
          <div :class="'pl ' + levelOf(week, weekLimit)"><div class="lbl">الأسبوع ده</div><div class="mid">{{ fmt(week) }}</div><div v-if="weekLimit" class="of">من {{ fmt(weekLimit) }}</div></div>
          <div class="safe" @click="showSafe = !showSafe"><div class="lbl">تقدر تصرف/يوم ⓘ</div><div class="mid">{{ fmt(perDayAllowed) }}</div></div>
        </div>
        <div v-if="showSafe" class="safebox" @click="showSafe = false">
          <div v-for="p in safeToSpend.parts" :key="p.k" class="sr"><span>{{ p.label }}</span><b dir="ltr">{{ p.v < 0 ? '−' : '' }}{{ fmt(Math.abs(p.v)) }}</b></div>
          <div class="sr tot"><span>÷ {{ safeToSpend.days }} يوم للراتب</span><b>{{ fmt(perDayAllowed) }} / يوم</b></div>
        </div>
        <div class="foot" v-if="nextSalaryDate">
          الراتب الجاي تقريبًا {{ fmtDate(nextSalaryDate, { day: 'numeric', month: 'short' }) }} (بعد {{ daysLeft }} يوم) · بالمعدل ده هتقفل على {{ fmt(projected) }} ({{ Math.round((projected / limit) * 100) }}٪ من الحد)
        </div>
      </template>
      <div v-else class="split3">
        <div :class="'pl ' + levelOf(today, dayLimit)"><div class="lbl">النهارده</div><div class="mid">{{ fmt(today) }}</div><div v-if="dayLimit" class="of">من {{ fmt(dayLimit) }}</div></div>
        <div :class="'pl ' + levelOf(week, weekLimit)"><div class="lbl">الأسبوع ده</div><div class="mid">{{ fmt(week) }}</div><div v-if="weekLimit" class="of">من {{ fmt(weekLimit) }}</div></div>
      </div>
    </section>


    <section v-if="activeEvent" class="card note evb" @click="emit('go', 'events')">
      <b>{{ activeEvent.icon }} {{ activeEvent.name }} شغال</b>
      <div class="sm">صرفت <b>{{ fmt(activeEvent.total) }}</b> في {{ activeEvent.days }} {{ activeEvent.days === 1 ? 'يوم' : 'أيام' }} · اضغط علشان تقفله</div>
    </section>

    <section v-if="salarySummary" class="card note sum">
      <button class="x" @click="dismissSummary(salarySummary.id)">×</button>
      <b>💰 ملخص راتب {{ salarySummary.label }}</b>
      <div class="sm">صرفت <b>{{ fmt(salarySummary.spent) }}</b> من {{ fmt(salarySummary.salary) }}<template v-if="salarySummary.saved > 0"> وفضل معاك <b class="good">{{ fmt(salarySummary.saved) }}</b></template><template v-else> — زيادة <b class="bad">{{ fmt(-salarySummary.saved) }}</b></template></div>
      <div class="muted xs">
        <template v-if="salarySummary.top">أكتر بند: {{ CAT[salarySummary.top[0]]?.name }} ({{ fmt(salarySummary.top[1]) }})</template>
        <template v-if="salarySummary.change != null"> · {{ salarySummary.change > 0 ? 'أكتر' : 'أقل' }} {{ Math.abs(Math.round(salarySummary.change * 100)) }}٪ من الراتب اللي قبله</template>
      </div>
    </section>

    <section v-if="lentPending.length" class="card note loan">
      <LoanAsk :p="lentPending[0]" @open="(t) => emit('open', t)" />
      <button v-if="lentPending.length > 1" class="link more" @click="emit('go', 'debts', 'lent')">{{ lentPending.length === 2 ? 'وتحويل تاني مستني ردك' : `و${lentPending.length - 1} تحويلات تانية مستنية ردك` }} ‹</button>
    </section>

    <section v-if="unusual.length" class="card note warn">
      <b>{{ unusual[0].type === 'dup' ? '⚠️ عملية مكررة؟' : '👀 عملية أكبر من عادتك' }}</b>
      <div class="sm">{{ unusual[0].text }} · {{ fmtDate(unusual[0].tx.ts, { day: 'numeric', month: 'short' }) }}</div>
      <div class="nact">
        <button class="ok" @click="dismissFlag(unusual[0].id)">✓ تمام، أنا عارفها</button>
        <button class="link" @click="emit('open', unusual[0].tx)">شوف العملية</button>
      </div>
    </section>

    <section v-if="prevSame" class="card cmp">
      <span class="arrow" :class="prevSame.diff > 0 ? 'up' : 'down'">{{ prevSame.diff > 0 ? '▲' : '▼' }}</span>
      <div>
        <b>{{ Math.abs(Math.round(prevSame.diff)) }}٪ {{ prevSame.diff > 0 ? 'أكتر' : 'أقل' }}</b> من نفس الوقت في راتب {{ prevSame.label }}
        <div class="muted xs">وقتها كنت صارف {{ fmt(prevSame.v) }} ر.س بعد {{ Math.round(elapsed) }} يوم من الراتب</div>
      </div>
    </section>

    <section class="card" v-if="limits.length">
      <div class="row-b"><h2>حدودك للراتب ده</h2><button class="link" @click="emit('go', 'limits')">تعديل ←</button></div>
      <div v-for="r in limits" :key="r.id" class="lrow" :class="r.lvl">
        <div class="lt"><span>{{ r.label }}</span><span class="ln">{{ fmt(r.spent) }} من {{ fmt(r.limit) }}</span></div>
        <div class="lb"><i :style="{ width: Math.min(100, r.pct * 100) + '%' }"></i></div>
      </div>
    </section>
    <button v-else class="card setlim" @click="emit('go', 'limits')">🔔 <span>حط حد يومي أو أسبوعي أو لأي بند وخلّي التطبيق ينبّهك</span><span class="muted">←</span></button>

    <section class="card" v-if="last6.labels.length > 1">
      <div class="row-b"><h2>آخر {{ last6.labels.length }} رواتب</h2><button class="link" @click="emit('go', 'analysis')">التحليل ←</button></div>
      <BarChart :labels="last6.labels" :datasets="last6.datasets" :height="170" />
      <div class="rates">
        <div v-for="r in last6.rates" :key="r.l"><span class="muted xs">{{ r.l }}</span><b :class="r.p >= 0 ? 'good' : 'bad'">{{ r.p }}٪</b></div>
      </div>
      <div class="muted xs" style="text-align: center; margin-top: 4px">نسبة اللي فضل من كل راتب · متوسط الراتب {{ fmt(avgSalary) }}</div>
    </section>

    <section class="card">
      <div class="row-b"><h2>فلوس الراتب ده راحت فين</h2></div>
      <CatBars :rows="topCats" :limit="5" :base="salary" @pick="(c) => emit('go', 'tx', c, { id: 'c0', from: cyc.from, to: now })" />
    </section>

    <section class="card">
      <div class="row-b"><h2>آخر العمليات</h2><button class="link" @click="emit('go', 'tx')">الكل ←</button></div>
      <TxRow v-for="t in recent" :key="t.id" :t="t" @open="emit('open', t)" />
    </section>
  </div>
</template>

<style scoped>
.hero { background: var(--hero); color: var(--hero-ink); border-radius: 24px; padding: 20px; margin-bottom: 12px; position: relative; overflow: hidden }
.hero::after { content: ''; position: absolute; inset: auto -40px -60px auto; width: 180px; height: 180px; border-radius: 50%; background: rgba(255,255,255,.07); pointer-events: none }
.hero { transition: background .3s }
.hero.warn { background: linear-gradient(145deg, #b45309, #92400e) }
.hero.over { background: linear-gradient(145deg, #dc2626, #991b1b) }
.hero.over .big { animation: pulse 1.6s ease-in-out 2 }
@keyframes pulse { 50% { transform: scale(1.04) } }
.alert { background: rgba(255,255,255,.16); border-radius: 12px; padding: 8px 12px; font-size: 13px; font-weight: 600; margin-bottom: 10px }
.hint.sub { margin-top: 2px; opacity: .75 }
.row { display: flex; justify-content: space-between; gap: 8px }
.hero .lbl { font-size: 12.5px; opacity: .82 }
.big { font-size: 40px; font-weight: 700; letter-spacing: -.02em; font-variant-numeric: tabular-nums; line-height: 1.2; margin: 2px 0 10px }
.big small { font-size: 16px; font-weight: 500; opacity: .75 }
.track { height: 8px; background: rgba(255,255,255,.2); border-radius: 99px; overflow: hidden }
.track i { display: block; height: 100%; background: #fff; border-radius: 99px }
.track i.over { background: #fca5a5 }
.hint { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; font-size: 13px; opacity: .92; margin-top: 8px }
.split3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 16px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,.18) }
.pl .of { font-size: 11.5px; opacity: .8 }
.pl.warn .mid { color: #fde68a } .pl.over .mid { color: #fecaca }
.pl.over .of::after { content: ' ⚠️' }
.mid { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums }
.foot { font-size: 11.5px; opacity: .75; margin-top: 12px; line-height: 1.6 }
.cmp { display: flex; gap: 12px; align-items: center; font-size: 14px }
.arrow { width: 36px; height: 36px; border-radius: 12px; display: grid; place-items: center; flex: none; font-size: 13px }
.arrow.up { background: #fee2e2; color: #dc2626 } .arrow.down { background: #dcfce7; color: #15803d }
.rates { display: grid; grid-template-columns: repeat(6, 1fr); text-align: center; margin-top: 8px }
.rates > div { display: flex; flex-direction: column; font-size: 13px }
.cct { display: flex; justify-content: space-between; gap: 8px; font-size: 14px }
.cct b { font-variant-numeric: tabular-nums }
.ccm { display: flex; justify-content: space-between; margin-top: 6px }
.ccm .soon { color: var(--bad); font-weight: 600 }
.lrow { padding: 6px 0 }
.lt { display: flex; justify-content: space-between; gap: 8px; font-size: 14px }
.ln { font-variant-numeric: tabular-nums; font-weight: 600; font-size: 13px }
.lb { height: 6px; background: var(--surface-2); border-radius: 99px; overflow: hidden; margin-top: 6px }
.lb i { display: block; height: 100%; border-radius: 99px; background: var(--good) }
.warn .lb i { background: #f59e0b } .over .lb i { background: var(--bad) } .over .ln { color: var(--bad) }
.setlim { display: flex; gap: 10px; align-items: center; width: 100%; font: inherit; color: var(--ink); text-align: right; cursor: pointer; font-size: 14px }
.setlim span:nth-child(1) { flex: 1 }
.good { color: var(--good) } .bad { color: var(--bad) }
.note { position: relative; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px }
.note .x { position: absolute; top: 8px; left: 10px; border: 0; background: none; color: var(--ink-3); font-size: 20px; cursor: pointer }
.note.warn { border-color: #f59e0b; background: color-mix(in srgb, #f59e0b 8%, var(--surface)) }
.note.sum { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 6%, var(--surface)) }
.note .good { color: var(--good) } .note .bad { color: var(--bad) }
.nact { display: flex; align-items: center; gap: 14px; margin-top: 6px }
.nact .ok { border: 0; border-radius: 12px; padding: 8px 14px; background: var(--accent); color: #fff; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer }
.ntx { border: 0; background: none; padding: 0; font: inherit; font-size: 13.5px; color: inherit; text-align: right; cursor: pointer }
.eye { width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--ink-2); display: grid; place-items: center; cursor: pointer; flex: none; align-self: center }
.eye.on { background: var(--accent); border-color: var(--accent); color: #fff }
.safe { cursor: pointer }
.safebox { margin-top: 12px; background: rgba(255,255,255,.1); border-radius: 14px; padding: 8px 12px; font-size: 12.5px; cursor: pointer }
.safebox .sr { display: flex; justify-content: space-between; padding: 4px 0 }
.safebox .sr b { font-variant-numeric: tabular-nums }
.safebox .tot { border-top: 1px solid rgba(255,255,255,.2); margin-top: 4px; padding-top: 8px; font-weight: 600 }
.note.loan { gap: 8px }
.note .more { align-self: flex-start; font-size: 12.5px; padding: 0 }
.note.evb { border-color: #0369a1; background: color-mix(in srgb, #0369a1 7%, var(--surface)); cursor: pointer }
</style>
