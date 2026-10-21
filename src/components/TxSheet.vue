<script setup>
import { ask, choose } from '../lib/dialog.js'
import { computed } from 'vue'
import { CAT, CATEGORIES, merchantKey } from '../lib/categories.js'
import CatPicker from './CatPicker.vue'
import { allTx, setCategory, deleteManual } from '../lib/store.js'
import { fmt2, fmt, fmtDate } from '../lib/format.js'
import { debtFromTx, txHasDebt, autoLentTxIds, notLoan, autoLent, ignorePerson } from '../lib/debts.js'
import { unusual, dismissFlag } from '../lib/insights.js'

const props = defineProps({ t: Object })
const emit = defineEmits(['close', 'edit', 'go'])
const KIND = { purchase: 'شراء', transfer: 'تحويل لشخص', intl: 'حوالة دولية', cash: 'سحب نقدي', bill: 'سداد فاتورة', gov: 'مدفوعات حكومية', fee: 'رسوم', refund: 'استرداد', salary: 'راتب', in: 'تحويل وارد', manual: 'مصروف يدوي', ccpay: 'سداد بطاقة ائتمانية', ccxfer: 'سداد بطاقة بنك تاني بالكريدت' }
const isOut = computed(() => !['refund', 'salary', 'in', 'ccpay', 'ccxfer'].includes(props.t.k))
const same = computed(() => {
  if (props.t.k === 'manual') return { n: 0, a: 0 }
  const k = merchantKey(props.t.m)
  const r = allTx.value.filter((x) => merchantKey(x.m) === k && x.k === props.t.k)
  return { n: r.length, a: r.reduce((s, x) => s + x.a, 0) }
})
function pick(id) { setCategory(props.t, id); emit('close') }
// لو العملية دي عليها تنبيه (مكررة / أكبر من عادتك) — نعرضه هنا ونقفله من هنا
const flag = computed(() => unusual.value.find((f) => f.tx.id === props.t.id) || null)
function okFlag() { dismissFlag(flag.value.id); emit('close') }
const canDebt = computed(() => ['transfer', 'intl', 'in'].includes(props.t.k))
const hasDebt = computed(() => txHasDebt(props.t))
const isAutoLoan = computed(() => autoLentTxIds.value.has(props.t.id))
// الحوالة دي بس، ولا كل تحويلاتي للشخص ده؟
async function notLoanAsk() {
  const d = autoLent.value.find((x) => x.txs.some((t) => t.id === props.t.id))
  const v = d && d.txs.length > 1 ? await choose({ icon: '🤝', title: 'مش سلفة', text: `${fmt(props.t.a)} ر.س لـ ${d.name}`, options: [
    { label: 'الحوالة دي بس', value: 'one', kind: 'primary' },
    { label: `كل تحويلاتي لـ ${d.name}`, value: 'all' },
    { label: 'إلغاء', value: null },
  ] }) : 'one'
  if (v === 'one') notLoan(props.t.id)
  else if (v === 'all') ignorePerson(d.key)
}
function markDebt() { debtFromTx(props.t); emit('close'); emit('go', 'debts') }
async function del() { if (await ask('تمسح المصروف ده؟', { yes: 'امسح', danger: true })) { deleteManual(props.t.id); emit('close') } }
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <div class="sheet">
      <div class="grab"></div>
      <div class="head">
        <span class="ic" :style="{ background: CAT[t.c].color + '1f', color: CAT[t.c].color }">{{ CAT[t.c].icon }}</span>
        <div class="mid">
          <div class="nm">{{ t.m }}</div>
          <div class="muted sm">{{ KIND[t.k] }} · {{ t.b }} · {{ fmtDate(t.d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }}</div>
        </div>
      </div>
      <div class="amt">{{ isOut ? '' : '+' }}{{ fmt2(t.a) }} <small>ر.س</small></div>
      <div class="muted sm" v-if="same.n > 1" style="text-align: center">{{ same.n }} عملية مع نفس المكان · إجمالي {{ fmt(same.a) }} ر.س</div>

      <div v-if="flag" class="flag">
        <b>{{ flag.type === 'dup' ? '⚠️ ممكن تكون مكررة' : '👀 أكبر من عادتك' }}</b>
        <span class="sm">{{ flag.text }}</span>
        <div class="fact">
          <button class="ok" @click="okFlag">✓ تمام، أنا عارفها</button>
          <span v-if="flag.type === 'dup'" class="muted xs">لو اتسحبت غلط كلّم البنك</span>
        </div>
      </div>

      <button v-if="canDebt && !hasDebt" class="debt" @click="markDebt">{{ t.k === 'in' ? '🤝 دي سلفة اتسلفتها (ضيفها لـ عليّا)' : '🤝 دي سلفة (ضيفها لـ ليّا)' }}</button>
      <div v-else-if="isAutoLoan" class="autoloan"><span>🤝 محسوبة سلفة ليك (ليّا)</span><button @click="notLoanAsk">مش سلفة</button></div>
      <div v-else-if="hasDebt" class="muted xs" style="text-align: center; margin-top: 10px">✓ متسجلة في الديون</div>

      <template v-if="isOut">
        <h3>غيّر البند</h3>
        <div class="muted xs" style="margin-bottom: 10px" v-if="t.k !== 'manual'">هيتطبّق على كل عمليات «{{ t.m }}»</div>
        <CatPicker :selected="t.c" :exclude="['ccpay']" @pick="pick" />
      </template>
      <div v-if="t.k === 'manual'" class="mact">
        <button class="ed" @click="emit('edit', t)">✏️ تعديل</button>
        <button class="dl" @click="del">🗑 مسح</button>
      </div>
      <button class="close" @click="emit('close')">تمام</button>
    </div>
  </div>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 50; display: flex; align-items: flex-end; animation: fade .2s }
.sheet { background: var(--bg); width: 100%; max-height: 88vh; overflow-y: auto; border-radius: 24px 24px 0 0; padding: 10px 16px calc(20px + env(safe-area-inset-bottom)); animation: up .25s ease-out }
.grab { width: 40px; height: 4px; border-radius: 9px; background: var(--line); margin: 0 auto 14px }
.head { display: flex; gap: 12px; align-items: center }
.ic { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; font-size: 20px; flex: none }
.mid { min-width: 0 }
.nm { font-weight: 600; font-size: 16px; word-break: break-word }
.amt { font-size: 34px; font-weight: 700; text-align: center; margin: 16px 0 4px; font-variant-numeric: tabular-nums }
.amt small { font-size: 15px; color: var(--ink-3); font-weight: 500 }
h3 { font-size: 15px; margin: 22px 0 2px }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px }
.cbtn { display: flex; align-items: center; gap: 8px; padding: 10px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font: inherit; font-size: 13px; text-align: right; cursor: pointer }
.cbtn.on { border-color: var(--accent); background: var(--accent-soft) }
.ci { font-size: 16px }
.mact { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 16px }
.mact button { padding: 12px; border-radius: 14px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font: inherit; cursor: pointer }
.mact .dl { color: var(--bad) }
.close { width: 100%; margin-top: 16px; padding: 13px; border-radius: 14px; border: 0; background: var(--ink); color: var(--bg); font: inherit; font-weight: 600; cursor: pointer }
@keyframes up { from { transform: translateY(40%) } }
@keyframes fade { from { opacity: 0 } }
.debt { display: block; width: 100%; margin-top: 12px; padding: 11px; border-radius: 14px; border: 1px dashed var(--accent); background: var(--accent-soft); color: var(--accent); font: inherit; font-weight: 600; cursor: pointer }
.flag { margin-top: 12px; border: 1px solid #f59e0b; background: color-mix(in srgb, #f59e0b 9%, var(--surface)); border-radius: 14px; padding: 12px; display: flex; flex-direction: column; gap: 4px }
.fact { display: flex; align-items: center; gap: 10px; margin-top: 6px; flex-wrap: wrap }
.fact .ok { border: 0; border-radius: 12px; padding: 9px 14px; background: var(--accent); color: #fff; font: inherit; font-weight: 600; cursor: pointer }
.autoloan { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 12px; padding: 10px 12px; border-radius: 14px; background: var(--accent-soft); color: var(--accent); font-size: 13.5px; font-weight: 500 }
.autoloan button { border: 0; border-radius: 10px; padding: 7px 12px; background: var(--surface); color: var(--ink-2); font: inherit; font-size: 12.5px; cursor: pointer }
</style>
