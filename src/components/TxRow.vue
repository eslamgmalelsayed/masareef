<script setup>
import { CAT } from '../lib/categories.js'
import { fmt2 } from '../lib/format.js'
defineProps({ t: Object })
defineEmits(['open'])
const time = (d) => d.toLocaleTimeString('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit' })
</script>

<template>
  <button class="row" @click="$emit('open', t)">
    <span class="ic" :style="{ background: CAT[t.c].color + '1f', color: CAT[t.c].color }">{{ t.k === 'refund' || t.k === 'salary' || t.k === 'in' ? '↩︎' : CAT[t.c].icon }}</span>
    <span class="mid">
      <span class="nm">{{ t.m }}</span>
      <span class="meta">{{ t.k === 'salary' ? 'راتب' : t.k === 'in' ? 'وارد' : t.k === 'refund' ? 'استرداد' : CAT[t.c].name + (t.k === 'manual' ? ' ✍️' : '') }} · {{ t.b }} · {{ time(t.d) }}</span>
    </span>
    <span class="amt" :class="{ plus: ['refund', 'salary', 'in'].includes(t.k) }">{{ ['refund', 'salary', 'in'].includes(t.k) ? '+' : '' }}{{ fmt2(t.a) }}</span>
  </button>
</template>

<style scoped>
.row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 0; border: 0; background: none; font: inherit; color: inherit; text-align: right; cursor: pointer; border-bottom: 1px solid var(--line) }
.row:last-child { border-bottom: 0 }
.ic { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; font-size: 17px; flex: none }
.mid { flex: 1; min-width: 0; display: flex; flex-direction: column }
.nm { font-size: 14.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.meta { font-size: 12px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.amt { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; font-size: 15px }
.amt.plus { color: var(--good) }
</style>
