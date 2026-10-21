<script setup>
import { toast, hideToast } from '../lib/toast.js'
function undo() { const u = toast.undo; hideToast(); u && u() }
</script>

<template>
  <Transition name="tst">
    <div v-if="toast.text" :key="toast.id" class="toast" role="status">
      <span>{{ toast.text }}</span>
      <button v-if="toast.undo" @click="undo">تراجع</button>
    </div>
  </Transition>
</template>

<style scoped>
.toast { position: fixed; z-index: 400; left: 16px; right: 16px; bottom: calc(84px + env(safe-area-inset-bottom)); max-width: 520px; margin: 0 auto; background: var(--ink); color: var(--bg); border-radius: 14px; padding: 12px 14px; font-size: 13.5px; line-height: 1.6; display: flex; align-items: center; justify-content: space-between; gap: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.2) }
.toast button { border: 0; background: none; color: #5eead4; font: inherit; font-weight: 700; cursor: pointer; white-space: nowrap }
.tst-enter-active, .tst-leave-active { transition: opacity .2s, transform .2s }
.tst-enter-from, .tst-leave-to { opacity: 0; transform: translateY(10px) }
</style>
