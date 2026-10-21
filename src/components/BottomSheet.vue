<script setup>
import { ref } from 'vue'

// كل النوافذ اللي بتطلع من تحت: عنوان + × في سطر لوحده، اسحب لتحت تقفل،
// ومش بتاخد الشاشة كلها علشان تقدر تقفلها بضغطة فوقها
const props = defineProps({ title: String, maxh: { type: String, default: '82vh' } })
const emit = defineEmits(['close'])
const dy = ref(0)
let y0 = null
function ts(e) { y0 = e.touches[0].clientY }
function tm(e) { if (y0 != null) dy.value = Math.max(0, e.touches[0].clientY - y0) }
function te() { if (dy.value > 70) emit('close'); dy.value = 0; y0 = null }
</script>

<template>
  <Transition name="bs" appear>
    <div class="scrim" @click.self="emit('close')">
      <div class="sheet" :style="[{ maxHeight: maxh }, dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : null]">
        <div class="drag" @touchstart.passive="ts" @touchmove.passive="tm" @touchend="te">
          <div class="grab"></div>
          <div class="head">
            <slot name="head"><b class="t">{{ title }}</b></slot>
            <button class="x" aria-label="اقفل" @click="emit('close')">×</button>
          </div>
        </div>
        <div class="body"><slot /></div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; z-index: 60; background: rgba(15, 23, 20, .45); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); display: flex; align-items: flex-end }
.sheet { width: 100%; max-width: 560px; margin: 0 auto; display: flex; flex-direction: column; background: var(--bg); border-radius: 26px 26px 0 0; box-shadow: 0 -10px 40px rgba(0,0,0,.15); transition: transform .26s cubic-bezier(.2, .9, .3, 1) }
.drag { padding: 10px 16px 6px; touch-action: none; flex: none }
.grab { width: 40px; height: 4px; border-radius: 9px; background: var(--line); margin: 0 auto 10px }
.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 34px }
.t { font-size: 16px; line-height: 1.4 }
.x { flex: none; width: 34px; height: 34px; border-radius: 50%; border: 0; background: var(--surface-2); color: var(--ink-2); font-size: 20px; line-height: 1; display: grid; place-items: center; cursor: pointer }
.body { overflow-y: auto; overscroll-behavior: contain; padding: 4px 16px calc(18px + env(safe-area-inset-bottom)) }
.bs-enter-active, .bs-leave-active { transition: opacity .2s }
.bs-enter-from, .bs-leave-to { opacity: 0 }
.bs-enter-from .sheet, .bs-leave-to .sheet { transform: translateY(60px) }
</style>
