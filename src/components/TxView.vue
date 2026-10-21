<script setup>
import { computed, ref, watch } from 'vue'
import { allTx, state } from '../lib/store.js'
import { CAT, CATEGORIES, TRANSFER_CATS } from '../lib/categories.js'
import { fmt, relDay, startOfDay } from '../lib/format.js'
import TxRow from './TxRow.vue'
import DateRange from './DateRange.vue'

const props = defineProps({ cat: String, range: Object, bank: String })
const emit = defineEmits(['open'])
const q = ref('')
const bankF = ref(props.bank || '')
const ccOnly = ref(false)
const cat = ref(props.cat || '')
const kind = ref(props.bank ? 'all' : 'out') // out | in | all
const shown = ref(60)
const range = ref(props.range || null)
const showDates = ref(!!props.range)
watch(() => props.cat, (v) => { cat.value = v || ''; shown.value = 60 })
watch([q, cat, kind, range, ccOnly], () => (shown.value = 60))

const OUT = new Set(['purchase', 'transfer', 'intl', 'cash', 'bill', 'gov', 'fee', 'manual'])
const rows = computed(() => {
  let r = allTx.value.filter((t) => t.k !== 'cashAdj')
  if (bankF.value) r = r.filter((t) => t.b === bankF.value)
  if (ccOnly.value) r = r.filter((t) => t.cc)
  if (showDates.value && range.value && range.value.id !== 'all') r = r.filter((t) => t.d >= range.value.from && t.d <= range.value.to)
  if (kind.value === 'out') r = r.filter((t) => OUT.has(t.k))
  else if (kind.value === 'in') r = r.filter((t) => ['salary', 'in', 'refund'].includes(t.k))
  if (cat.value) r = r.filter((t) => t.c === cat.value)
  else if (kind.value === 'out' && !state.settings.includeTransfers) r = r.filter((t) => !TRANSFER_CATS.has(t.c))
  const s = q.value.trim().toLowerCase()
  if (s) r = r.filter((t) => t.m.toLowerCase().includes(s) || CAT[t.c].name.includes(s) || t.b.toLowerCase().includes(s))
  return r
})
const total = computed(() => rows.value.reduce((s, t) => s + t.a, 0))
const groups = computed(() => {
  const g = []
  let cur = null
  for (const t of rows.value.slice(0, shown.value)) {
    const k = +startOfDay(t.d)
    if (!cur || cur.k !== k) { cur = { k, label: relDay(t.d), items: [], sum: 0 }; g.push(cur) }
    cur.items.push(t)
    if (OUT.has(t.k)) cur.sum += t.a
  }
  return g
})
const usedCats = computed(() => CATEGORIES.filter((c) => !c.hidden && allTx.value.some((t) => t.c === c.id)))
</script>

<template>
  <div class="view">
    <header class="hd"><h1>العمليات</h1></header>
    <div class="search">
      <input v-model="q" type="search" placeholder="ابحث باسم المحل أو الشخص…" />
      <button class="cal" :class="{ on: showDates }" @click="showDates = !showDates" aria-label="فلتر التاريخ">📅</button>
    </div>
    <DateRange v-if="showDates" v-model="range" :presets="['all', 'c0', 'c1', 'c3', 'custom']" style="margin-top: 10px" />
    <div class="seg">
      <button :class="{ on: kind === 'out' }" @click="kind = 'out'">مصاريف</button>
      <button :class="{ on: kind === 'in' }" @click="kind = 'in'; cat = ''">دخل ومسترد</button>
      <button :class="{ on: kind === 'all' }" @click="kind = 'all'">الكل</button>
    </div>
    <div class="pills scroll" v-if="kind !== 'in'">
      <button class="pill" :class="{ on: ccOnly }" @click="ccOnly = !ccOnly">💳 كريدت بس</button>
      <button class="pill" :class="{ on: !cat }" @click="cat = ''">كل البنود</button>
      <button v-for="c in usedCats" :key="c.id" class="pill" :class="{ on: cat === c.id }" @click="cat = cat === c.id ? '' : c.id">{{ c.icon }} {{ c.name }}</button>
    </div>
    <div v-if="bankF" class="bankchip">🏦 {{ bankF }} <button class="link" @click="bankF = ''">✕</button></div>
    <div class="muted sm summary">{{ rows.length.toLocaleString('en-US') }} عملية · {{ fmt(total) }} ر.س</div>

    <section v-for="g in groups" :key="g.k" class="card day">
      <div class="dh"><span>{{ g.label }}</span><span v-if="g.sum" class="muted">{{ fmt(g.sum) }} ر.س</span></div>
      <TxRow v-for="t in g.items" :key="t.id" :t="t" @open="emit('open', t)" />
    </section>
    <button v-if="rows.length > shown" class="more" @click="shown += 100">عرض المزيد</button>
    <p v-if="!rows.length" class="muted" style="text-align: center; margin-top: 40px">مفيش عمليات</p>
  </div>
</template>

<style scoped>
.search { display: flex; gap: 8px }
.cal { flex: none; width: 48px; border-radius: 14px; border: 1px solid var(--line); background: var(--surface); font-size: 18px; cursor: pointer }
.cal.on { background: var(--accent-soft); border-color: var(--accent) }
.search input { flex: 1; min-width: 0; font: inherit; font-size: 15px; padding: 12px 16px; border-radius: 14px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); outline: none }
.search input:focus { border-color: var(--accent) }
.seg { display: grid; grid-template-columns: repeat(3, 1fr); background: var(--surface-2); border-radius: 12px; padding: 3px; margin: 10px 0 }
.seg button { border: 0; background: none; font: inherit; font-size: 13.5px; padding: 8px; border-radius: 10px; color: var(--ink-2); cursor: pointer }
.seg button.on { background: var(--surface); color: var(--ink); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,.08) }
.bankchip { display: inline-flex; gap: 8px; align-items: center; background: var(--accent-soft); border-radius: 99px; padding: 5px 12px; font-size: 13px; margin: 0 4px 6px }
.summary { margin: 4px 4px 10px }
.day { padding-top: 10px; padding-bottom: 4px }
.dh { display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; color: var(--ink-2); padding-bottom: 2px }
.more { display: block; margin: 8px auto 0; font: inherit; border: 1px solid var(--line); background: var(--surface); color: var(--ink); padding: 10px 22px; border-radius: 99px; cursor: pointer }
</style>
