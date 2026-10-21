<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

// اسحب الشاشة لتحت وانت في أول الصفحة → تحديث
const props = defineProps({ onRefresh: Function, disabled: Boolean })
const TRIGGER = 72
const pull = ref(0)
const busy = ref(false)
let y0 = null, x0 = 0, active = false, armedBuzz = false

function start(e) {
  if (props.disabled || busy.value || e.touches.length !== 1 || window.scrollY > 0 || document.querySelector('.scrim, .lock')) { y0 = null; return }
  y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; active = false; armedBuzz = false
}
function move(e) {
  if (y0 == null) return
  const dy = e.touches[0].clientY - y0, dx = e.touches[0].clientX - x0
  if (!active) {
    if (dy < 8 || Math.abs(dx) > dy || window.scrollY > 0) { if (dy < -4 || Math.abs(dx) > 12) y0 = null; return }
    active = true
  }
  pull.value = Math.min(130, dy * 0.5) // مقاومة خفيفة زي التطبيقات
  if (pull.value >= TRIGGER && !armedBuzz) { armedBuzz = true; try { navigator.vibrate?.(8) } catch {} }
  if (pull.value < TRIGGER) armedBuzz = false
  if (e.cancelable) e.preventDefault()
}
async function end() {
  if (y0 == null) return
  y0 = null
  if (!active) return
  active = false
  if (pull.value >= TRIGGER) {
    busy.value = true
    pull.value = 56
    const t = Date.now()
    try { await props.onRefresh?.() } catch {}
    await new Promise((r) => setTimeout(r, Math.max(0, 600 - (Date.now() - t))))
    busy.value = false
  }
  pull.value = 0
}

onMounted(() => {
  window.addEventListener('touchstart', start, { passive: true })
  window.addEventListener('touchmove', move, { passive: false })
  window.addEventListener('touchend', end)
  window.addEventListener('touchcancel', end)
})
onBeforeUnmount(() => {
  window.removeEventListener('touchstart', start)
  window.removeEventListener('touchmove', move)
  window.removeEventListener('touchend', end)
  window.removeEventListener('touchcancel', end)
})
</script>

<template>
  <div class="ptr" :class="{ busy, ready: pull >= TRIGGER, moving: pull && !busy }" :style="{ transform: `translate(-50%, ${pull - 48}px)`, opacity: Math.min(1, pull / 40) }" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" :style="{ transform: busy ? '' : `rotate(${pull * 3.2}deg)` }">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 4v5h-5" />
    </svg>
  </div>
</template>

<style scoped>
.ptr {
  position: fixed; top: calc(env(safe-area-inset-top, 0px) + 8px); left: 50%; z-index: 60;
  width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center;
  background: var(--surface); color: var(--ink-3); border: 1px solid var(--line);
  box-shadow: 0 4px 14px rgba(0, 0, 0, .12); pointer-events: none;
  transition: transform .25s ease, opacity .25s ease, color .15s;
}
.ptr.moving { transition: color .15s }
.ptr.ready, .ptr.busy { color: var(--accent) }
.ptr.busy svg { animation: spin .8s linear infinite }
@keyframes spin { to { transform: rotate(360deg) } }
</style>
