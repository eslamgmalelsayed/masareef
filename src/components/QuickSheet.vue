<script setup>
import { toolsList } from '../lib/toolsList.js'

// زرار +: إضافة مصروف + كل أدوات الفلوس في مكان واحد
const emit = defineEmits(['close', 'add', 'go'])
import BottomSheet from './BottomSheet.vue'
const tools = toolsList
</script>

<template>
  <BottomSheet title="إضافة" maxh="66vh" @close="emit('close')">
    <div class="adds">
      <button class="add main" @click="emit('add', {})"><span>✍️</span>ضيف مصروف</button>
    </div>
    <div class="lbl">أدوات الفلوس</div>
    <div class="grid">
      <button v-for="x in tools" :key="x.id" class="tool" @click="emit('go', x.id)">
        <span class="ic">{{ x.ic }}</span>
        <b>{{ x.t }}</b>
        <small>{{ x.s }}</small>
      </button>
    </div>
  </BottomSheet>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; z-index: 60; background: rgba(15, 23, 20, .45); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); display: flex; align-items: flex-end }
.sheet { width: 100%; max-width: 560px; margin: 0 auto; max-height: 66vh; overflow-y: auto; background: var(--bg); border-radius: 26px 26px 0 0; padding: 10px 14px calc(16px + env(safe-area-inset-bottom)) }
.drag { margin: -10px -14px 0; padding: 10px 14px 0; touch-action: none }
.grab { width: 40px; height: 4px; border-radius: 9px; background: var(--line); margin: 0 auto 10px }
.head { display: flex; align-items: center; justify-content: space-between; margin: 0 4px 10px }
.head b { font-size: 16px }
.x { width: 34px; height: 34px; border-radius: 50%; border: 0; background: var(--surface-2); color: var(--ink-2); font-size: 20px; line-height: 1; display: grid; place-items: center; cursor: pointer }
.adds { display: grid; grid-template-columns: 1fr; gap: 8px }
.add { display: flex; align-items: center; justify-content: center; gap: 8px; height: 48px; padding: 0 10px; white-space: nowrap; border-radius: 16px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font: inherit; font-size: 14.5px; font-weight: 600; cursor: pointer }
.add span { font-size: 18px }
.add.main { background: var(--accent); border-color: var(--accent); color: #fff }
.lbl { font-size: 12.5px; color: var(--ink-3); font-weight: 600; margin: 12px 4px 8px }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px }
.tool { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 6px 8px; min-height: 84px; border-radius: 16px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font: inherit; text-align: center; cursor: pointer }
.tool:active { transform: scale(.97) }
.ic { font-size: 20px; margin-bottom: 1px }
.tool b { font-size: 12.5px; line-height: 1.35 }
.tool small { font-size: 10.5px; color: var(--ink-3); line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden }
.qs-enter-active, .qs-leave-active { transition: opacity .2s }
.qs-enter-active .sheet, .qs-leave-active .sheet { transition: transform .26s cubic-bezier(.2, .9, .3, 1) }
.qs-enter-from, .qs-leave-to { opacity: 0 }
.qs-enter-from .sheet, .qs-leave-to .sheet { transform: translateY(60px) }
</style>
