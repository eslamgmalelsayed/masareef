<script setup>
import { computed, ref, watch } from 'vue'
import { cycles, currentCycle, allTx } from '../lib/store.js'
import { fmtDate } from '../lib/format.js'

/** فلتر الفترة: مبني على دورات الراتب + فترة مخصصة من تاريخ لتاريخ */
const props = defineProps({ modelValue: Object, presets: { type: Array, default: () => ['c0', 'c1', 'c3', 'c6', 'c12', 'all', 'custom'] } })
const emit = defineEmits(['update:modelValue'])

const iso = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10) }
const first = computed(() => (allTx.value.length ? allTx.value[allTx.value.length - 1].d : new Date()))

const LABELS = { c0: 'الراتب ده', c1: 'الراتب اللي فات', c3: 'آخر ٣ رواتب', c6: 'آخر ٦ رواتب', c12: 'آخر ١٢ راتب', all: 'الكل', custom: 'تاريخ مخصص' }
const id = ref(props.modelValue?.id || props.presets[0])
const cFrom = ref(iso(props.modelValue?.id === 'custom' ? props.modelValue.from : Date.now() - 30 * 864e5))
const cTo = ref(iso(props.modelValue?.id === 'custom' ? props.modelValue.to : Date.now()))

function resolve() {
  const cs = cycles.value
  const now = new Date()
  const cyc = (n) => { const list = cs.slice(-n); return list.length ? { from: list[0].from, to: now, n: list.length } : null }
  let r
  switch (id.value) {
    case 'c0': r = { from: currentCycle.value.from, to: now, n: 1 }; break
    case 'c1': { const c = cs[cs.length - 2]; r = c ? { from: c.from, to: c.to, n: 1 } : { from: currentCycle.value.from, to: now, n: 1 }; break }
    case 'c3': r = cyc(3); break
    case 'c6': r = cyc(6); break
    case 'c12': r = cyc(12); break
    case 'all': r = { from: first.value, to: now }; break
    case 'custom': {
      const f = new Date(cFrom.value + 'T00:00:00'), t = new Date(cTo.value + 'T23:59:59')
      r = f <= t ? { from: f, to: t } : { from: t, to: f }
      break
    }
  }
  if (!r) r = { from: first.value, to: now }
  emit('update:modelValue', { id: id.value, label: LABELS[id.value], ...r })
}
watch([id, cFrom, cTo, () => cycles.value.length, () => allTx.value.length], resolve, { immediate: true })
</script>

<template>
  <div class="dr">
    <div class="pills scroll">
      <button v-for="p in presets" :key="p" class="pill" :class="{ on: id === p }" @click="id = p">{{ p === 'custom' ? '📅 ' : '' }}{{ LABELS[p] }}</button>
    </div>
    <div v-if="id === 'custom'" class="custom">
      <label><span>من</span><input type="date" v-model="cFrom" :min="iso(first)" :max="cTo" /></label>
      <label><span>إلى</span><input type="date" v-model="cTo" :min="cFrom" :max="iso(new Date())" /></label>
    </div>
    <div v-if="modelValue" class="muted sm range">{{ fmtDate(modelValue.from) }} – {{ fmtDate(modelValue.to) }}</div>
  </div>
</template>

<style scoped>
.custom { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 4px 0 8px }
.custom label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--ink-3) }
.custom input { font: inherit; font-size: 14px; padding: 9px 10px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); width: 100%; min-width: 0 }
.range { margin: 0 4px 10px }
</style>
