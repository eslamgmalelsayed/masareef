<script setup>
import { computed } from 'vue'
import { GROUPS, CAT } from '../lib/categories.js'

// اختيار البند: مقسّم مجموعات (تسوق، أكل، بيت…) وكل الأزرار نفس المقاس
const props = defineProps({ selected: String, exclude: { type: Array, default: () => [] }, suggest: String })
const emit = defineEmits(['pick'])
const groups = computed(() => GROUPS.map((g) => ({ ...g, cats: g.cats.filter((c) => CAT[c] && !props.exclude.includes(c)) })).filter((g) => g.cats.length))
</script>

<template>
  <div class="picker">
    <button v-if="suggest" class="cb sug" @click="emit('pick', suggest)"><span>{{ CAT[suggest].icon }}</span><span class="n">{{ CAT[suggest].name }}</span><small>مقترح</small></button>
    <div v-for="g in groups" :key="g.id" class="grp">
      <div class="gh">{{ g.icon }} {{ g.name }}</div>
      <div class="grid">
        <button v-for="c in g.cats" :key="c" class="cb" :class="{ on: c === selected }" @click="emit('pick', c)">
          <span>{{ CAT[c].icon }}</span><span class="n">{{ CAT[c].name }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.picker { display: flex; flex-direction: column; gap: 10px }
.gh { font-size: 12px; color: var(--ink-3); font-weight: 600; margin: 0 2px 5px }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px }
.cb { display: flex; align-items: center; gap: 7px; min-height: 42px; padding: 0 10px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--ink); font: inherit; font-size: 13px; text-align: right; cursor: pointer; min-width: 0 }
.cb .n { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.cb.on { border-color: var(--accent); background: var(--accent-soft); font-weight: 600 }
.cb.sug { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600 }
.cb.sug small { font-size: 10.5px; opacity: .85 }
</style>
