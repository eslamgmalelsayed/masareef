<script setup>
import { toolsList } from '../lib/toolsList.js'

const emit = defineEmits(['back', 'go'])
const tools = toolsList
</script>

<template>
  <div class="view">
    <header class="hd sub">
      <button class="back" @click="emit('back')">→</button>
      <h1>أدوات الفلوس</h1>
      <span style="width: 38px"></span>
    </header>
    <div class="grid">
      <button v-for="x in tools" :key="x.id" class="tool" @click="emit('go', x.id)">
        <span class="ic">{{ x.ic }}</span>
        <b>{{ x.t }}</b>
        <small>{{ x.s }}</small>
      </button>
    </div>
  </div>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px }
.tool { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 14px; min-height: 112px; border-radius: 18px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font: inherit; text-align: right; cursor: pointer }
.tool:active { transform: scale(.98) }
.ic { font-size: 24px; margin-bottom: 4px }
.tool b { font-size: 14.5px; line-height: 1.35 }
.tool small { font-size: 12px; color: var(--ink-3); line-height: 1.45 }
</style>
