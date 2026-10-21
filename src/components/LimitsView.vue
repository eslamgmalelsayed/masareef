<script setup>
import { computed, ref } from 'vue'
import { state, allTx, cycleByCat, setLimit, cycles, lastSalary, saveSettings, daySpent, weekSpent, cycleSpent, income, levelOf, periodBase, setPeriodLimit, dayLimit, weekLimit, totalLimit, cycleDays } from '../lib/store.js'
import { CATEGORIES } from '../lib/categories.js'
import { isNative, requestNotifications, notify } from '../lib/smsSource.js'
import { fmt, DAY } from '../lib/format.js'

const emit = defineEmits(['back'])
const notifOk = ref(null)
const OUT = new Set(['purchase', 'transfer', 'intl', 'cash', 'bill', 'gov', 'fee', 'manual', 'cashAdj'])

// متوسط الصرف لكل راتب على آخر ٣ رواتب مكتملة — علشان يساعدك تختار حد واقعي
const avg3 = computed(() => {
  const done = cycles.value.filter((c) => !c.current).slice(-3)
  const m = {}
  if (done.length) {
    for (const t of allTx.value) if (OUT.has(t.k) && t.d >= done[0].from && t.d <= done[done.length - 1].to) m[t.c] = (m[t.c] || 0) + t.a
    for (const k in m) m[k] /= done.length
  } else {
    const from = Date.now() - 91 * DAY
    for (const t of allTx.value) if (OUT.has(t.k) && t.ts >= from) m[t.c] = (m[t.c] || 0) + t.a
    for (const k in m) m[k] = (m[k] / 91) * 30.44
  }
  return m
})
const salPct = (v) => (lastSalary.value ? Math.round((v / lastSalary.value) * 100) + '٪ من الراتب' : '')

const rows = computed(() =>
  CATEGORIES.filter((c) => !c.hidden).map((c) => ({ ...c, spent: cycleByCat.value[c.id] || 0, avg: avg3.value[c.id] || 0, limit: state.settings.limits?.[c.id] || 0 }))
    .sort((a, b) => b.avg - a.avg),
)
const level = (r) => (!r.limit ? '' : r.spent >= r.limit ? 'over' : r.spent >= 0.8 * r.limit ? 'warn' : 'ok')

// حدود الصرف: بتكتب واحد بس والباقي بيتحسب منه (اليومي × ٧ = الأسبوعي، اليومي × أيام الراتب = الشهري)
const NAMES = { day: 'اليومي', week: 'الأسبوعي', month: 'الشهري' }
const periods = computed(() => {
  const b = periodBase.value
  const from = !b ? '' : b.auto ? 'محسوب من دخلك' : 'محسوب من ' + NAMES[b.k]
  return [
    { k: 'day', icon: '☀️', name: 'الصرف اليومي', when: 'كل يوم', spent: daySpent.value, limit: dayLimit.value },
    { k: 'week', icon: '📅', name: 'الصرف الأسبوعي', when: 'من الأحد للسبت', spent: weekSpent.value, limit: weekLimit.value },
    { k: 'month', icon: '💰', name: 'الصرف الشهري (لكل راتب)', when: cycleDays.value + ' يوم للراتب ده', spent: cycleSpent.value, limit: totalLimit.value },
  ].map((p) => ({ ...p, own: b && !b.auto && b.k === p.k, note: b && !b.auto && b.k === p.k ? 'الحد اللي كتبته' : from }))
})
async function setPeriod(p, e) {
  const v = Number(e.target.value) || 0
  setPeriodLimit(p.k, v)
  if (v && state.settings.totalAlert === false) { state.settings.totalAlert = true; saveSettings() }
  if (v && isNative && notifOk.value !== true) notifOk.value = await requestNotifications()
}
function toggleAlert(e) { state.settings.totalAlert = e.target.checked; saveSettings() }

async function change(r, e) {
  const v = e.target.value
  setLimit(r.id, v)
  if (Number(v) > 0 && isNative && notifOk.value !== true) notifOk.value = await requestNotifications()
}
function suggest(r) {
  const v = Math.ceil(r.avg / 50) * 50
  if (v) change(r, { target: { value: v } })
}
</script>

<template>
  <div class="view">
    <header class="hd">
      <button class="back" @click="emit('back')">→</button>
      <h1>الحدود والتنبيهات</h1>
      <span></span>
    </header>
    <p class="muted sm intro">
      حط حد للصرف اليومي أو الأسبوعي أو لكل راتب، أو لأي بند، وهيوصلك إشعار لما توصل <b>٨٠٪</b> ولما <b>تعدّي الحد</b> — حتى لو التطبيق مقفول، أول ما توصل رسالة الشراء من البنك.
    </p>
    <div v-if="notifOk === false" class="warnbox">الإشعارات مقفولة للتطبيق — افتحها من إعدادات الموبايل ← التطبيقات ← مصاريفي ← الإشعارات</div>

    <h2 class="sec">حدود الصرف</h2>
    <p class="muted xs sec-note">اكتب حد واحد بس، والاتنين التانيين بيتحسبوا منه لوحدهم.</p>
    <section class="card">
      <div v-for="p in periods" :key="p.k" class="lim" :class="state.settings.totalAlert !== false ? levelOf(p.spent, p.limit) : ''">
        <div class="top">
          <span class="ic pi">{{ p.icon }}</span>
          <div class="mid">
            <div class="nm">{{ p.name }}</div>
            <div class="muted xs">{{ p.when }} · صرفت {{ fmt(p.spent) }}</div>
          </div>
          <label class="inp" :class="{ own: p.own }">
            <input type="number" inputmode="numeric" min="0" step="10" :value="p.own ? p.limit : ''" :placeholder="p.limit ? fmt(p.limit) : 'بدون حد'" @change="(e) => setPeriod(p, e)" />
            <small v-if="p.limit">{{ p.note }}</small>
          </label>
        </div>
        <template v-if="p.limit && state.settings.totalAlert !== false">
          <div class="bar"><i :style="{ width: Math.min(100, (p.spent / p.limit) * 100) + '%' }"></i></div>
          <div class="xs stat">
            <span v-if="p.spent <= p.limit">باقي {{ fmt(p.limit - p.spent) }} ر.س</span>
            <span v-else>عدّيت الحد بـ {{ fmt(p.spent - p.limit) }} ر.س</span>
            <span>{{ Math.round((p.spent / p.limit) * 100) }}٪</span>
          </div>
        </template>
      </div>
      <label class="sw2">
        <span>نبّهني عند ٨٠٪ ولما أعدّي أي حد منهم</span>
        <input type="checkbox" :checked="state.settings.totalAlert !== false" @change="toggleAlert" />
      </label>
    </section>

    <h2 class="sec">حدود البنود (لكل راتب)</h2>
    <section class="card">
      <div v-for="r in rows" :key="r.id" class="lim" :class="level(r)">
        <div class="top">
          <span class="ic" :style="{ background: r.color + '1f', color: r.color }">{{ r.icon }}</span>
          <div class="mid">
            <div class="nm">{{ r.name }}</div>
            <div class="muted xs">
              الراتب ده {{ fmt(r.spent) }}
              <template v-if="r.avg"> · متوسطك {{ fmt(r.avg) }}/راتب</template>
            </div>
          </div>
          <label class="inp">
            <input type="number" inputmode="numeric" min="0" step="50" :value="r.limit || ''" placeholder="بدون حد" @change="(e) => change(r, e)" />
          </label>
        </div>
        <template v-if="r.limit">
          <div class="bar"><i :style="{ width: Math.min(100, (r.spent / r.limit) * 100) + '%' }"></i></div>
          <div class="xs stat">
            <span v-if="r.spent < r.limit">باقي {{ fmt(r.limit - r.spent) }} ر.س</span>
            <span v-else>عدّيت الحد بـ {{ fmt(r.spent - r.limit) }} ر.س</span>
            <span>{{ Math.round((r.spent / r.limit) * 100) }}٪ · الحد = {{ salPct(r.limit) }}</span>
          </div>
        </template>
        <button v-else-if="r.avg >= 50" class="link xs sug" @click="suggest(r)">اقترح حد ({{ fmt(Math.ceil(r.avg / 50) * 50) }})</button>
      </div>
    </section>

    <button v-if="isNative" class="test" @click="notify('إشعارات مصاريفي شغالة ✅', 'هيوصلك تنبيه لما توصل ٨٠٪ وعند تخطي أي حد', 4242).catch(() => {})">🔔 جرّب إشعار</button>
    <p class="muted xs" style="text-align: center; margin: 14px 20px">حدود البنود والشهري بتبدأ من جديد مع نزول كل راتب، واليومي كل يوم، والأسبوعي كل أحد. اكتب ٠ أو امسح الرقم علشان تلغي الحد.</p>
  </div>
</template>

<style scoped>
.hd { align-items: center }
.sec { font-size: 15px; margin: 6px 4px 8px }
.pi { background: var(--surface-2) }
.sec-note { margin: -4px 4px 8px }
.inp { display: flex; flex-direction: column; align-items: center; gap: 2px }
.inp small { font-size: 10.5px; color: var(--ink-3); white-space: nowrap }
.inp.own small { color: var(--accent) }
.inp:not(.own) input::placeholder { font-weight: 600; font-size: 15px; color: var(--ink-3) }
.sw2 { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 12px; font-size: 13.5px }
.sw2 input { width: 20px; height: 20px; accent-color: var(--accent) }
.back { width: 38px; height: 38px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font-size: 18px; cursor: pointer }
.intro { margin: -4px 4px 12px; line-height: 1.7 }
.intro b { color: var(--ink); font-weight: 600 }
.warnbox { background: #fef3c7; color: #92400e; border-radius: 14px; padding: 12px 14px; font-size: 13px; margin-bottom: 12px }
.lim { padding: 12px 0; border-bottom: 1px solid var(--line) }
.lim:last-child { border-bottom: 0 }
.top { display: flex; align-items: center; gap: 12px }
.ic { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; font-size: 17px; flex: none }
.mid { flex: 1; min-width: 0 }
.nm { font-size: 14.5px; font-weight: 500 }
.inp input { width: 96px; font: inherit; font-size: 15px; font-weight: 600; text-align: center; padding: 9px 6px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); outline: none; font-variant-numeric: tabular-nums }
.inp input:focus { border-color: var(--accent) }
.inp input::placeholder { font-weight: 400; font-size: 12.5px; color: var(--ink-3) }
.bar { height: 6px; background: var(--surface-2); border-radius: 99px; overflow: hidden; margin-top: 10px }
.bar i { display: block; height: 100%; border-radius: 99px; background: var(--good) }
.warn .bar i { background: #f59e0b }
.over .bar i { background: var(--bad) }
.stat { display: flex; justify-content: space-between; color: var(--ink-3); margin-top: 4px }
.over .stat { color: var(--bad) }
.sug { margin: 6px 50px 0 0 }
.test { display: block; width: 100%; padding: 13px; border-radius: 14px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font: inherit; font-weight: 500; cursor: pointer }
</style>
