<script setup>
import { computed, ref } from 'vue'
import { fees } from '../lib/extras.js'
import { fmt, fmt2, fmtDate } from '../lib/format.js'

const emit = defineEmits(['back', 'open'])
const F = computed(() => fees.value)
const open = ref('')
</script>

<template>
  <div class="view">
    <header class="hd sub">
      <button class="back" @click="emit('back')">→</button>
      <h1>الرسوم البنكية</h1>
      <span style="width: 38px"></span>
    </header>

    <section class="hero2">
      <span class="lbl">دفعت رسوم في آخر سنة</span>
      <b>{{ fmt(F.year) }}<small> {{ $money.sym }}</small></b>
      <span class="lbl">آخر ٣٠ يوم: {{ fmt(F.month) }} {{ $money.sym }}</span>
    </section>

    <section v-if="F.types.length" class="card">
      <button v-for="t in F.types" :key="t.id" class="ty" @click="open = open === t.id ? '' : t.id">
        <span class="ic">{{ t.ic }}</span>
        <span class="mid"><b>{{ t.name }}</b><small class="muted">{{ t.n }} مرة</small></span>
        <b class="amt">{{ fmt(t.a) }}</b>
        <span v-if="open === t.id" class="tip">💡 {{ t.tip }}</span>
      </button>
    </section>
    <p v-else class="muted sm intro">مفيش رسوم ظهرت في رسايلك آخر سنة 👏</p>

    <section v-if="F.recent.length" class="card">
      <h2>آخر الرسوم</h2>
      <button v-for="(i, k) in F.recent" :key="k" class="row" @click="emit('open', i.tx)">
        <span class="muted xs">{{ fmtDate(i.tx.ts, { day: 'numeric', month: 'short' }) }}</span>
        <span class="mid nm">{{ i.type === 'remit' ? 'حوالة لـ ' + i.tx.m : i.type === 'fx' ? 'عملة أجنبية · ' + i.tx.m : i.tx.m }}</span>
        <b>{{ fmt2(i.a) }}</b>
      </button>
    </section>
  </div>
</template>

<style scoped>
.intro { margin: 4px 6px 12px; line-height: 1.7 }
.hero2 { background: linear-gradient(145deg, #475569, #1e293b); color: #fff; border-radius: 22px; padding: 18px; margin-bottom: 12px }
.hero2 .lbl { display: block; font-size: 12.5px; opacity: .85 }
.hero2 > b { display: block; font-size: 32px; font-weight: 700; font-variant-numeric: tabular-nums }
.hero2 small { font-size: 14px; opacity: .8; font-weight: 500 }
.ty { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; width: 100%; padding: 11px 0; border: 0; border-bottom: 1px solid var(--line); background: none; font: inherit; color: inherit; text-align: right; cursor: pointer }
.ty:last-child { border-bottom: 0 }
.ic { width: 40px; height: 40px; border-radius: 12px; background: var(--surface-2); display: grid; place-items: center; font-size: 18px; flex: none }
.mid { flex: 1; min-width: 0; display: flex; flex-direction: column }
.mid b { font-size: 14.5px; font-weight: 500 }
.amt { font-size: 16px; font-variant-numeric: tabular-nums }
.tip { flex-basis: 100%; font-size: 13px; line-height: 1.7; background: var(--accent-soft); color: var(--ink); border-radius: 12px; padding: 9px 12px }
h2 { margin-bottom: 4px }
.row { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 0; border: 0; border-bottom: 1px solid var(--line); background: none; font: inherit; color: inherit; text-align: right; cursor: pointer; font-size: 13.5px }
.row:last-child { border-bottom: 0 }
.row .xs { width: 52px; flex: none }
.nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; unicode-bidi: plaintext; text-align: right }
.row b { font-variant-numeric: tabular-nums }
</style>
