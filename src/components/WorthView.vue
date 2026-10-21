<script setup>
import { computed, ref } from 'vue'
import { balances, assets, saveAssets, netWorth, bankHistory } from '../lib/tools.js'
import { state, saveSettings } from '../lib/store.js'
import { fmt, fmtDate } from '../lib/format.js'

const emit = defineEmits(['back', 'go'])
const N = computed(() => netWorth.value)
const ex = computed(() => new Set(state.settings.nwExclude || []))
function toggleBank(b) {
  const s = new Set(state.settings.nwExclude || [])
  s.has(b) ? s.delete(b) : s.add(b)
  state.settings.nwExclude = [...s]
  saveSettings()
}
const nA = ref({ name: '', v: '' })
function addAsset() {
  if (!nA.value.name.trim() || !Number(nA.value.v)) return
  saveAssets([...assets.value, { name: nA.value.name.trim(), v: Number(nA.value.v) }])
  nA.value = { name: '', v: '' }
}
function setAsset(i, v) { const a = [...assets.value]; a[i] = { ...a[i], v: Number(v) || 0 }; saveAssets(a) }
function delAsset(i) { saveAssets(assets.value.filter((_, k) => k !== i)) }
const maxH = computed(() => Math.max(1, ...bankHistory.value.map((h) => Math.abs(h.nw ?? h.v))))
</script>

<template>
  <div class="view">
    <header class="hd sub">
      <button class="back" @click="emit('back')">→</button>
      <h1>صافي ثروتك</h1>
      <span style="width: 38px"></span>
    </header>

    <section class="hero2" :class="{ neg: N.net < 0 }">
      <span class="lbl">اللي تملكه − اللي عليك</span>
      <b dir="ltr">{{ N.net < 0 ? '−' : '' }}{{ fmt(Math.abs(N.net)) }}<small> ر.س</small></b>
      <div class="split">
        <div><span class="lbl">في البنوك</span><b>{{ fmt(N.bank) }}</b></div>
        <div><span class="lbl">حاجات تانية + ليك</span><b>{{ fmt(N.other + N.recv) }}</b></div>
        <div><span class="lbl">عليك</span><b>{{ fmt(N.debt) }}</b></div>
      </div>
    </section>

    <section class="card">
      <h2>أرصدة حساباتك <small class="muted">(آخر رصيد في الرسايل)</small></h2>
      <div v-if="!balances.length" class="empty">مفيش أرصدة في الرسايل — البنك لازم يكتب "الرصيد" في الرسالة</div>
      <label v-for="b in balances" :key="b.b" class="row">
        <input type="checkbox" :checked="!ex.has(b.b)" @change="toggleBank(b.b)" />
        <span class="nm">{{ b.b }}<small class="muted"> · {{ fmtDate(b.ts, { day: 'numeric', month: 'short' }) }}</small><small v-if="Date.now() - b.ts > 30 * 864e5" class="old"> قديم</small></span>
        <b :class="{ off: ex.has(b.b) }">{{ fmt(b.v) }}</b>
      </label>
      <p class="muted xs foot">بعض البنوك مش بتكتب الرصيد في رسايل الشراء — لو حساب مش ظاهر أو رصيده قديم، شيل علامته واكتب رصيده الحالي تحت في "حاجات تانية".</p>
    </section>

    <section class="card">
      <h2>حاجات تانية تملكها</h2>
      <div v-for="(a, i) in assets" :key="i" class="row">
        <span class="nm">{{ a.name }}</span>
        <input class="v" type="number" inputmode="numeric" :value="a.v" @change="(e) => setAsset(i, e.target.value)" />
        <button class="x" @click="delAsset(i)">×</button>
      </div>
      <div class="addrow">
        <input v-model="nA.name" placeholder="كاش، دهب، استثمار…" />
        <input v-model="nA.v" type="number" inputmode="numeric" placeholder="القيمة" />
        <button @click="addAsset">ضيف</button>
      </div>
      <div class="links">
        <button class="link xs" @click="emit('go', 'debts')">الديون ({{ fmt(N.debt) }} عليك · {{ fmt(N.recv) }} ليك) ←</button>
      </div>
    </section>

    <section class="card" v-if="bankHistory.length > 1">
      <h2>آخر كل راتب</h2>
      <div v-for="h in bankHistory" :key="h.id" class="hrow">
        <span class="m">{{ h.label }}</span>
        <span class="bar"><i :class="{ neg: (h.nw ?? h.v) < 0 }" :style="{ width: Math.min(100, (Math.abs(h.nw ?? h.v) / maxH) * 100) + '%' }"></i></span>
        <b dir="ltr">{{ (h.nw ?? h.v) < 0 ? '−' : '' }}{{ fmt(Math.abs(h.nw ?? h.v)) }}</b>
      </div>
      <p class="muted xs foot">الرواتب القديمة = رصيد البنوك بس. من دلوقتي بنسجل صافي الثروة كامل كل راتب.</p>
    </section>
  </div>
</template>

<style scoped>
.hero2 { background: var(--hero); color: var(--hero-ink); border-radius: 22px; padding: 18px; margin-bottom: 12px }
.hero2.neg { background: linear-gradient(145deg, #7c2d12, #9a3412); color: #fff }
.hero2 .lbl { display: block; font-size: 12.5px; opacity: .82 }
.hero2 > b { display: block; font-size: 32px; font-weight: 700; font-variant-numeric: tabular-nums; text-align: right }
.hero2 small { font-size: 14px; opacity: .8; font-weight: 500 }
.split { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.2) }
.split b { font-size: 16px; font-variant-numeric: tabular-nums }
h2 { font-size: 15.5px; margin: 0 0 8px }
h2 small { font-size: 11.5px; font-weight: 400 }
.row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 14px }
.row input[type=checkbox] { width: 18px; height: 18px; accent-color: var(--accent) }
.row .nm { flex: 1 }
.row b { font-variant-numeric: tabular-nums }
.row b.off { opacity: .4; text-decoration: line-through }
.row .v { width: 100px; font: inherit; font-size: 14px; padding: 6px 8px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); text-align: center }
.x { border: 0; background: none; color: var(--ink-3); font-size: 20px; cursor: pointer }
.addrow { display: flex; gap: 6px; margin-top: 10px }
.addrow input { flex: 1; min-width: 0; font: inherit; font-size: 14px; padding: 9px 10px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); outline: none }
.addrow input[type=number] { flex: .6 }
.addrow button { border: 0; border-radius: 12px; padding: 0 14px; background: var(--accent); color: #fff; font: inherit; font-weight: 600; cursor: pointer }
.links { margin-top: 10px }
.hrow { display: flex; align-items: center; gap: 10px; padding: 7px 0; font-size: 13.5px }
.hrow .m { width: 58px; flex: none; color: var(--ink-2) }
.bar { flex: 1; height: 10px; background: var(--surface-2); border-radius: 99px; overflow: hidden }
.bar i { display: block; height: 100%; border-radius: 99px; background: var(--accent) }
.bar i.neg { background: var(--bad) }
.hrow b { width: 70px; text-align: left; font-variant-numeric: tabular-nums }
.foot { margin: 8px 0 0; line-height: 1.6 }
.old { color: #d97706; font-size: 11px }
.empty { padding: 14px 0 }
</style>
