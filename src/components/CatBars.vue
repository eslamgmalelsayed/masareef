<script setup>
import { computed } from 'vue'
import { CAT, GROUP } from '../lib/categories.js'
import { fmt } from '../lib/format.js'

const props = defineProps({ rows: Array, limit: { type: Number, default: 99 }, base: { type: Number, default: 0 }, top: { type: Number, default: 0 } }) // rows: [[catId, amount]]
const emit = defineEmits(['pick'])
const total = computed(() => props.base || props.rows.reduce((s, r) => s + r[1], 0) || 1)
const M = (id) => CAT[id] || GROUP[id] || { name: id, icon: '•', color: '#94a3b8' }
const max = computed(() => props.top || (props.rows[0] ? props.rows[0][1] : 1))
</script>

<template>
  <div class="cats">
    <button v-for="[id, v] in rows.slice(0, limit)" :key="id" class="cat" @click="emit('pick', id)">
      <span class="ic" :style="{ background: M(id).color + '1f', color: M(id).color }">{{ M(id).icon }}</span>
      <span class="body">
        <span class="top">
          <span class="nm">{{ M(id).name }}<small v-if="GROUP[id]" class="cnt"> · {{ GROUP[id].cats.length }} بنود</small></span>
          <span class="v">{{ fmt(v) }} <small>{{ ((v / total) * 100).toFixed(0) }}٪</small></span>
        </span>
        <span class="bar"><i :style="{ width: (v / max) * 100 + '%', background: M(id).color }"></i></span>
      </span>
    </button>
    <p v-if="!rows.length" class="empty">مفيش مصاريف في الفترة دي</p>
  </div>
</template>

<style scoped>
.cats { display: flex; flex-direction: column; gap: 4px }
.cat { display: flex; align-items: center; gap: 12px; padding: 8px 4px; border: 0; background: none; font: inherit; color: inherit; text-align: right; border-radius: 12px; cursor: pointer; width: 100% }
.cat:active { background: var(--surface-2) }
.ic { width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; font-size: 17px; flex: none }
.body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px }
.top { display: flex; justify-content: space-between; gap: 8px; font-size: 14px }
.nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.cnt { color: var(--ink-3); font-size: 11.5px }
.v { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap }
.v small { color: var(--ink-3); font-weight: 400; font-size: 12px; margin-right: 4px }
.bar { height: 5px; background: var(--surface-2); border-radius: 99px; overflow: hidden }
.bar i { display: block; height: 100%; border-radius: 99px }
.empty { color: var(--ink-3); font-size: 14px; text-align: center; margin: 12px 0 }
</style>
