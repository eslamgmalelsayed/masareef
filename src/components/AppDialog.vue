<script setup>
import { dialog, answer } from '../lib/dialog.js'
</script>

<template>
  <Transition name="dlg">
    <div v-if="dialog.open" class="scrim" @click.self="answer(null)">
      <div class="box" role="dialog" aria-modal="true">
        <div class="grab"></div>
        <div v-if="dialog.icon" class="ic">{{ dialog.icon }}</div>
        <b v-if="dialog.title" class="t">{{ dialog.title }}</b>
        <p v-if="dialog.text" class="x">{{ dialog.text }}</p>
        <input v-if="dialog.input !== null" v-model="dialog.input" class="in" @keyup.enter="answer('__input')" />
        <div class="opts">
          <button v-for="(o, i) in dialog.options" :key="i" :class="[o.kind || (o.value === null ? 'cancel' : 'plain')]" @click="answer(o.value)">{{ o.label }}</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; background: rgba(15, 23, 20, .5); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); z-index: 300; display: flex; align-items: flex-end; justify-content: center }
.box { width: 100%; max-width: 480px; background: var(--bg); border-radius: 26px 26px 0 0; padding: 10px 18px calc(18px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; align-items: center; text-align: center; box-shadow: 0 -10px 40px rgba(0,0,0,.18) }
.grab { width: 40px; height: 4px; border-radius: 9px; background: var(--line); margin-bottom: 14px }
.ic { width: 56px; height: 56px; border-radius: 18px; background: var(--accent-soft); display: grid; place-items: center; font-size: 26px; margin-bottom: 10px }
.t { font-size: 17px; line-height: 1.5 }
.x { margin: 6px 4px 0; font-size: 14px; color: var(--ink-2); line-height: 1.75 }
.in { width: 100%; box-sizing: border-box; margin-top: 12px; font: inherit; font-size: 15px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); outline: none; text-align: right }
.in:focus { border-color: var(--accent) }
.opts { width: 100%; display: flex; flex-direction: column; gap: 8px; margin-top: 18px }
.opts button { padding: 14px; border-radius: 16px; border: 0; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; transition: transform .1s }
.opts button:active { transform: scale(.98) }
.primary { background: var(--accent); color: #fff }
.danger { background: var(--bad); color: #fff }
.plain { background: var(--surface); color: var(--ink); border: 1px solid var(--line) !important }
.cancel { background: none; color: var(--ink-3); font-weight: 500 !important; padding: 10px !important }
.dlg-enter-active, .dlg-leave-active { transition: opacity .2s }
.dlg-enter-active .box, .dlg-leave-active .box { transition: transform .25s cubic-bezier(.2, .9, .3, 1) }
.dlg-enter-from, .dlg-leave-to { opacity: 0 }
.dlg-enter-from .box, .dlg-leave-to .box { transform: translateY(40px) }
</style>
