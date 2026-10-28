<script setup>
// المراجع الذكي: حاجات لقاها بمقارنة العمليات ببعض ومحتاجة تأكيدك
import BottomSheet from './BottomSheet.vue'
import { findings, answer, unanswer } from '../lib/review.js'
import { showToast } from '../lib/toast.js'
import { fmtDate } from '../lib/format.js'

const emit = defineEmits(['close', 'open'])
const IC = { self: '🔁', refund: '↩️', loan: '🤝' }
const YES = { self: 'أيوه، لنفسي', refund: 'أيوه، تخصه', loan: 'أيوه، سلفة ورجعت' }
function reply(f, ok) {
  answer(f, ok)
  showToast(ok ? '✓ اتسجّل' : '✓ تمام', () => unanswer(f))
  if (!findings.value.length) emit('close')
}
</script>

<template>
  <BottomSheet title="🕵️ المراجع الذكي" @close="emit('close')">
    <p class="muted sm intro">قارنت عملياتك ببعض ولقيت دول — أكّد أو ارفض، وأنا أظبط الحسابات.</p>
    <div v-for="f in findings" :key="f.id" class="f">
      <button class="txt" @click="emit('open', f.tx)">
        <span class="ic">{{ IC[f.type] }}</span>
        <span class="mid"><bdi>{{ f.text }}</bdi><small class="muted">{{ fmtDate(f.tx.ts, { day: 'numeric', month: 'short' }) }} · {{ f.tx.b }}</small></span>
      </button>
      <div class="btns">
        <button class="pri" @click="reply(f, true)">{{ YES[f.type] }}</button>
        <button class="sec" @click="reply(f, false)">لا</button>
      </div>
    </div>
    <p v-if="!findings.length" class="muted sm" style="text-align: center">مفيش حاجة محتاجة تأكيدك دلوقتي 👌</p>
  </BottomSheet>
</template>

<style scoped>
.intro { margin: 0 0 10px; line-height: 1.7 }
.f { padding: 12px 0; border-bottom: 1px solid var(--line) }
.f:last-of-type { border-bottom: 0 }
.txt { display: flex; gap: 10px; align-items: flex-start; width: 100%; border: 0; background: none; padding: 0; font: inherit; color: inherit; text-align: right; cursor: pointer }
.ic { width: 36px; height: 36px; border-radius: 11px; background: var(--surface-2); display: grid; place-items: center; font-size: 17px; flex: none }
.mid { display: flex; flex-direction: column; gap: 3px; font-size: 14px; line-height: 1.6 }
small { font-size: 12px }
.btns { display: flex; gap: 6px; margin-top: 8px; padding-right: 46px }
.btns button { border: 0; border-radius: 11px; padding: 8px 14px; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer }
.pri { background: var(--accent); color: #fff }
.sec { background: var(--surface-2); color: var(--ink) }
</style>
