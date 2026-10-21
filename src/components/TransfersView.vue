<script setup>
import { computed, ref } from 'vue'
import { transfers } from '../lib/insights.js'
import { fmt, fmtDate } from '../lib/format.js'

const emit = defineEmits(['back', 'open'])
const T = computed(() => transfers.value)
const open = ref('')
const maxM = computed(() => Math.max(1, ...T.value.months.map((m) => m.v)))
</script>

<template>
  <div class="view">
    <header class="hd sub">
      <button class="back" @click="emit('back')">→</button>
      <h1>الحوالات الدولية</h1>
      <span style="width: 38px"></span>
    </header>

    <div v-if="!T.count" class="card empty"><b>🌍</b>مفيش حوالات دولية في آخر سنة</div>
    <template v-else>
      <section class="hero2">
        <span class="lbl">بعت في آخر ١٢ شهر</span>
        <b>{{ fmt(T.year) }}<small> ر.س</small></b>
        <div class="split">
          <div><span class="lbl">الراتب ده</span><b>{{ fmt(T.cycle) }}</b></div>
          <div><span class="lbl">متوسط الشهر</span><b>{{ fmt(T.year / 12) }}</b></div>
          <div><span class="lbl">رسوم دفعتها</span><b>{{ fmt(T.fees) }}</b></div>
        </div>
      </section>

      <section class="card">
        <h2>آخر ٦ شهور</h2>
        <div class="bars">
          <div v-for="m in T.months" :key="m.label" class="bcol">
            <small class="v">{{ m.v ? fmt(m.v / 1000) + 'k' : '' }}</small>
            <i :style="{ height: Math.max(3, (m.v / maxM) * 100) + '%' }"></i>
            <small>{{ m.label }}</small>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>لمين بتبعت</h2>
        <div v-for="p in T.people" :key="p.key" class="person">
          <button class="prow" @click="open = open === p.key ? '' : p.key">
            <span class="av">{{ p.name.trim().charAt(0).toUpperCase() }}</span>
            <span class="mid">
              <span class="nm">{{ p.name }}</span>
              <span class="muted xs">{{ p.count }} حوالة في السنة · آخر واحدة {{ fmtDate(p.last, { day: 'numeric', month: 'short' }) }}<template v-if="p.fees"> · رسوم {{ fmt(p.fees) }}</template></span>
            </span>
            <span class="amt"><b>{{ fmt(p.year) }}</b><small class="muted" v-if="p.cycle">الراتب ده {{ fmt(p.cycle) }}</small></span>
          </button>
          <div v-if="open === p.key" class="hist">
            <button v-for="t in p.list.slice(0, 12)" :key="t.id" class="hrow" @click="emit('open', t)">
              <span class="muted">{{ fmtDate(t.ts, { day: 'numeric', month: 'short', year: 'numeric' }) }} · {{ t.b }}</span><b>{{ fmt(t.a) }}</b>
            </button>
          </div>
        </div>
        <p class="muted xs foot">الأسماء المتشابهة (أو نفس رقم الحساب) بتتجمع كشخص واحد.</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.hero2 { background: var(--hero); color: var(--hero-ink); border-radius: 22px; padding: 18px; margin-bottom: 12px }
.hero2 .lbl { display: block; font-size: 12.5px; opacity: .8 }
.hero2 > b { font-size: 32px; font-weight: 700; font-variant-numeric: tabular-nums }
.hero2 small { font-size: 14px; opacity: .8; font-weight: 500 }
.split { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.18) }
.split b { font-size: 17px; font-variant-numeric: tabular-nums }
h2 { font-size: 15.5px; margin: 0 0 10px }
.bars { display: flex; align-items: flex-end; gap: 8px; height: 130px }
.bcol { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 4px }
.bcol i { width: 100%; max-width: 34px; border-radius: 8px 8px 3px 3px; background: var(--accent); opacity: .85 }
.bcol small { font-size: 11px; color: var(--ink-3) }
.bcol .v { font-variant-numeric: tabular-nums }
.person { border-bottom: 1px solid var(--line) }
.person:last-of-type { border-bottom: 0 }
.prow { display: flex; align-items: center; gap: 12px; width: 100%; padding: 11px 0; border: 0; background: none; font: inherit; color: inherit; text-align: right; cursor: pointer }
.av { width: 40px; height: 40px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; font-weight: 700; flex: none }
.mid { flex: 1; min-width: 0; display: flex; flex-direction: column }
.nm { font-size: 14.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; unicode-bidi: plaintext; text-align: right }
.amt { display: flex; flex-direction: column; align-items: flex-end }
.amt b { font-size: 16px; font-variant-numeric: tabular-nums }
.amt small { font-size: 11px }
.hist { background: var(--surface-2); border-radius: 12px; padding: 4px 12px; margin-bottom: 10px }
.hrow { display: flex; justify-content: space-between; width: 100%; padding: 8px 0; border: 0; border-bottom: 1px solid var(--line); background: none; font: inherit; font-size: 13px; color: inherit; cursor: pointer }
.hrow:last-child { border-bottom: 0 }
.hrow b { font-variant-numeric: tabular-nums }
.foot { margin: 8px 0 0 }
</style>
