<script setup>
import { computed, ref } from 'vue'
import { spendTx, cycles, salaryFor, allTx, totalLimit, income } from '../lib/store.js'
import { CAT, merchantKey } from '../lib/categories.js'
import { fmt, fmtDate, sum, byCategory, DAY } from '../lib/format.js'
import BarChart from './BarChart.vue'
import CatBars from './CatBars.vue'
import DateRange from './DateRange.vue'

const emit = defineEmits(['go'])
const range = ref(null)
const R = computed(() => range.value || { from: new Date(Date.now() - 30 * DAY), to: new Date() })

const rows = computed(() => spendTx.value.filter((t) => t.d >= R.value.from && t.d <= R.value.to))
const days = computed(() => Math.max(1, Math.round((R.value.to - R.value.from) / DAY)))
const total = computed(() => sum(rows.value))
const salary = computed(() => salaryFor(R.value.from, R.value.to))
// الحد للفترة: حد الراتب ده لو الفترة = الراتب ده، وإلا الدخل بالتناسب
const limitFor = computed(() => {
  if (range.value?.id === 'c0') return totalLimit.value
  return income.value && salary.value && totalLimit.value !== income.value ? salary.value * (totalLimit.value / income.value) : salary.value
})
const level = computed(() => (!limitFor.value ? '' : total.value > limitFor.value ? 'over' : total.value >= 0.8 * limitFor.value && range.value?.id === 'c0' ? 'warn' : ''))
const pctOfSalary = computed(() => (salary.value ? (total.value / salary.value) * 100 : 0))
const saved = computed(() => salary.value - total.value)
const cats = computed(() => byCategory(rows.value))
const cs = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim()

// مقارنة بالراتب اللي فات في نفس عدد الأيام
const compare = computed(() => {
  if (!range.value || !['c0', 'c1'].includes(range.value.id)) return null
  const list = cycles.value
  const idx = range.value.id === 'c0' ? list.length - 1 : list.length - 2
  const prev = list[idx - 1]
  if (!prev) return null
  const elapsed = R.value.to - R.value.from
  const to = new Date(Math.min(+prev.from + elapsed, +prev.to))
  const prevTotal = sum(spendTx.value.filter((t) => t.d >= prev.from && t.d <= to))
  if (!prevTotal) return null
  return { prevTotal, diff: ((total.value - prevTotal) / prevTotal) * 100, label: prev.label }
})

// الصرف لكل راتب (أو أسبوعيًا لو الفترة قصيرة) مع خط الراتب
const chart = computed(() => {
  const top = cats.value.slice(0, 5).map((x) => x[0])
  const inRange = cycles.value.filter((c) => c.to >= R.value.from && c.from <= R.value.to)
  const byCycle = inRange.length >= 2
  let buckets
  if (byCycle) {
    buckets = inRange.map((c) => ({ from: c.from, to: c.to, label: c.short + (inRange.length > 12 ? ' ' + String(c.year).slice(2) : ''), salary: c.salary }))
  } else {
    buckets = []
    for (let w = +R.value.from; w <= +R.value.to; w += 7 * DAY) buckets.push({ from: new Date(w), to: new Date(Math.min(w + 7 * DAY - 1, +R.value.to)), label: fmtDate(w, { day: 'numeric', month: 'short' }) })
  }
  const series = Object.fromEntries([...top, 'rest'].map((c) => [c, Array(buckets.length).fill(0)]))
  for (const t of rows.value) {
    const i = buckets.findIndex((b) => t.d >= b.from && t.d <= b.to)
    if (i >= 0) series[top.includes(t.c) ? t.c : 'rest'][i] += t.a
  }
  const ds = Object.entries(series).map(([c, data]) => ({ label: c === 'rest' ? 'الباقي' : CAT[c].name, data, color: c === 'rest' ? cs('--bar-dim') : CAT[c].color }))
  if (byCycle) ds.push({ type: 'line', label: 'الراتب', data: buckets.map((b) => b.salary), color: cs('--ink-2') })
  return { byCycle, labels: buckets.map((b) => b.label), datasets: ds }
})

const merchants = computed(() => {
  const m = {}
  for (const t of rows.value) {
    const k = merchantKey(t.m) || t.m
    ;(m[k] ||= { n: t.m, a: 0, c: 0, cat: t.c }).a += t.a
    m[k].c++
  }
  return Object.values(m).sort((a, b) => b.a - a.a).slice(0, 10)
})

const dow = computed(() => {
  const names = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']
  const s = Array(7).fill(0), cnt = Array(7).fill(0)
  for (let d = new Date(R.value.from); d <= R.value.to; d = new Date(+d + DAY)) cnt[d.getDay()]++
  rows.value.forEach((t) => (s[t.d.getDay()] += t.a))
  const avg = s.map((v, i) => v / Math.max(1, cnt[i]))
  const mx = Math.max(...avg)
  return { labels: names, datasets: [{ label: 'متوسط', data: avg, colors: avg.map((v) => (v === mx ? cs('--accent') : cs('--bar-dim'))) }], top: names[avg.indexOf(mx)] }
})
const pctSal = (v) => (salary.value ? Math.round((v / salary.value) * 100) + '٪ من الراتب' : '')
</script>

<template>
  <div class="view">
    <header class="hd"><h1>التحليل</h1></header>
    <DateRange v-model="range" />

    <section class="hero" :class="level">
      <div class="lbl">صرفت في الفترة دي</div>
      <div class="big">{{ fmt(total) }}<small> ر.س</small></div>
      <div v-if="level === 'over'" class="alert">🔴 المصروفات عدّت الحد ({{ fmt(limitFor) }}) بـ {{ fmt(total - limitFor) }} ر.س</div>
      <template v-if="salary">
        <div class="track"><i :style="{ width: Math.min(100, pctOfSalary) + '%' }" :class="{ over: pctOfSalary > 100 }"></i></div>
        <div class="hint">
          <span><b>{{ Math.round(pctOfSalary) }}٪</b> من الراتب ({{ fmt(salary) }})</span>
          <span>{{ saved >= 0 ? 'وفّرت' : 'زيادة عن الراتب' }} {{ fmt(Math.abs(saved)) }}</span>
        </div>
      </template>
      <div v-else class="hint"><span>مفيش راتب نزل في الفترة دي</span></div>
      <div v-if="compare" class="cmp" :class="compare.diff > 0 ? 'up' : 'down'">
        {{ compare.diff > 0 ? '▲' : '▼' }} {{ Math.abs(Math.round(compare.diff)) }}٪ عن نفس الوقت في راتب {{ compare.label }} ({{ fmt(compare.prevTotal) }})
      </div>
    </section>

    <section class="kpis">
      <div class="kpi"><div class="muted sm">في اليوم</div><div class="num">{{ fmt(total / days) }}</div><div class="muted xs">{{ salary ? ((total / days / (salary / days)) * 100).toFixed(0) + '٪ من الراتب اليومي' : '' }}</div></div>
      <div class="kpi"><div class="muted sm">في الأسبوع</div><div class="num">{{ fmt((total / days) * 7) }}</div><div class="muted xs">{{ rows.length }} عملية</div></div>
    </section>

    <section class="card">
      <h2>{{ chart.byCycle ? 'الصرف مع كل راتب' : 'الصرف أسبوعيًا' }}</h2>
      <div class="muted sm" v-if="chart.byCycle" style="margin-bottom: 4px">الخط المتقطع = الراتب</div>
      <BarChart :labels="chart.labels" :datasets="chart.datasets" stacked legend :height="260" />
    </section>

    <section class="card">
      <h2>أكتر المصاريف فين</h2>
      <div class="muted sm" style="margin-bottom: 6px">النسبة من الراتب · دوس على بند تشوف عملياته</div>
      <CatBars :rows="cats" :base="salary || 0" @pick="(c) => emit('go', 'tx', c, range)" />
    </section>

    <section class="card">
      <h2>أكتر الأماكن</h2>
      <div v-for="(m, i) in merchants" :key="i" class="mrow">
        <span class="dot" :style="{ background: CAT[m.cat].color }"></span>
        <span class="mn">{{ m.n }}</span>
        <span class="muted xs">{{ m.c }} مرة</span>
        <span class="ma">{{ fmt(m.a) }}</span>
      </div>
      <p v-if="!merchants.length" class="muted sm">مفيش عمليات</p>
    </section>

    <section class="card">
      <h2>أكتر يوم بتصرف فيه: {{ dow.top }}</h2>
      <div class="muted sm" style="margin-bottom: 8px">متوسط الصرف لكل يوم في الأسبوع</div>
      <BarChart :labels="dow.labels" :datasets="dow.datasets" :height="170" />
    </section>
  </div>
</template>

<style scoped>
.hero { background: var(--hero); color: var(--hero-ink); border-radius: 22px; padding: 18px 18px 16px; margin-bottom: 12px }
.lbl { font-size: 13px; opacity: .85 }
.hero.warn { background: linear-gradient(145deg, #b45309, #92400e) }
.hero.over { background: linear-gradient(145deg, #dc2626, #991b1b) }
.alert { background: rgba(255,255,255,.16); border-radius: 12px; padding: 8px 12px; font-size: 13px; font-weight: 600; margin-bottom: 10px }
.big { font-size: 36px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.2; margin: 2px 0 10px }
.big small { font-size: 15px; font-weight: 500; opacity: .75 }
.track { height: 8px; background: rgba(255,255,255,.2); border-radius: 99px; overflow: hidden }
.track i { display: block; height: 100%; background: #fff; border-radius: 99px }
.track i.over { background: #fca5a5 }
.hint { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; font-size: 12.5px; opacity: .9; margin-top: 8px }
.cmp { margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,.18); font-size: 12.5px }
.kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px }
.kpi { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 14px 16px }
.num { font-size: 24px; font-weight: 700; font-variant-numeric: tabular-nums }
.mrow { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 14px }
.mrow:last-child { border-bottom: 0 }
.dot { width: 8px; height: 8px; border-radius: 3px; flex: none }
.mn { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.ma { font-weight: 600; font-variant-numeric: tabular-nums; min-width: 60px; text-align: left }
</style>
