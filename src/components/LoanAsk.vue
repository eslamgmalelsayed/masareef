<script setup>
// سؤال واحد: "حوّلت ٥٠٠ لـ أحمد — سلفة؟" [أيوه] [لا]
import { markLoan, answerNo, unanswer, unignorePerson } from '../lib/debts.js'
import { showToast } from '../lib/toast.js'
import { fmt, fmtDate } from '../lib/format.js'

const props = defineProps({ p: Object, flat: Boolean })
const emit = defineEmits(['open'])
const first = (m) => String(m || '').replace(/[,،]?\s*\d+\s*$/, '').trim()

function yes() {
  const t = props.p.tx
  markLoan(t.id)
  showToast(`🤝 اتسجلت سلفة على ${first(t.m)}`, () => unanswer(t.id))
}
function no() {
  const t = props.p.tx, key = props.p.key
  const stopped = answerNo(t)
  showToast(stopped ? `✓ مش هسألك على تحويلاتك لـ ${first(t.m)} تاني` : '✓ تمام، مش سلفة', () => { unanswer(t.id); if (stopped) unignorePerson(key) })
}
</script>

<template>
  <div class="la" :class="{ flat }">
    <button class="txt" @click="emit('open', p.tx)">
      <span class="who">💸 حوّلت <b>{{ fmt(p.tx.a) }}</b> لـ <bdi>{{ first(p.tx.m) }}</bdi></span>
      <small class="muted">{{ fmtDate(p.tx.ts, { day: 'numeric', month: 'short' }) }} · سلفة؟</small>
    </button>
    <div class="btns">
      <button :class="p.likely ? 'pri' : 'sec'" @click="yes">أيوه</button>
      <button class="sec" @click="no">لا</button>
    </div>
  </div>
</template>

<style scoped>
.la { display: flex; align-items: center; gap: 10px }
.la.flat { padding: 10px 0; border-bottom: 1px solid var(--line) }
.txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; border: 0; background: none; padding: 0; font: inherit; color: inherit; text-align: right; cursor: pointer }
.who { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.who b { font-variant-numeric: tabular-nums }
small { font-size: 12px }
.btns { display: flex; gap: 6px; flex: none }
.btns button { border: 0; border-radius: 11px; padding: 8px 14px; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; min-width: 52px }
.pri { background: var(--accent); color: #fff }
.sec { background: var(--surface-2); color: var(--ink) }
</style>
