<script setup>
import BottomSheet from './BottomSheet.vue'
import { ask, choose } from '../lib/dialog.js'
import { computed, ref } from 'vue'
import { CAT, CATEGORIES, merchantKey } from '../lib/categories.js'
import CatPicker from './CatPicker.vue'
import { allTx, state, setCategory, setTxCat, clearOverride, deleteManual, setSelfTx, setTxFix } from '../lib/store.js'
import { reportWrong } from '../lib/smart.js'
import { showToast } from '../lib/toast.js'
import { fmt2, fmt, fmtDate, sym } from '../lib/format.js'
import { debtFromTx, txHasDebt, autoLentTxIds, notLoan, autoLent, ignorePerson, lentPending, markLoan, answerNo, unanswer, unignorePerson } from '../lib/debts.js'
import { unusual, dismissFlag } from '../lib/insights.js'
import { SYM } from '../lib/money.js'

const props = defineProps({ t: Object })
const emit = defineEmits(['close', 'edit', 'go'])
const KIND = { purchase: 'شراء', transfer: 'تحويل لشخص', intl: 'حوالة دولية', cash: 'سحب نقدي', bill: 'سداد فاتورة', gov: 'مدفوعات حكومية', fee: 'رسوم', refund: 'استرداد', salary: 'راتب', in: 'تحويل وارد', manual: 'مصروف يدوي', ccpay: 'سداد بطاقة ائتمانية', ccxfer: 'سداد بطاقة بنك تاني بالكريدت', self: 'تحويل بين حساباتك', refunded: 'شراء اتردّت فلوسه' }
const isOut = computed(() => !['refund', 'salary', 'in', 'ccpay', 'ccxfer', 'self', 'refunded'].includes(props.t.k))
const same = computed(() => {
  if (props.t.k === 'manual') return { n: 0, a: 0 }
  const k = merchantKey(props.t.m)
  const r = allTx.value.filter((x) => merchantKey(x.m) === k && x.k === props.t.k)
  return { n: r.length, a: r.reduce((s, x) => s + x.a, 0) }
})
// تغيير البند: الشاشة بتفضل مفتوحة والاختيار بيتغير قدامك
// العملية دي بس ولا كل عمليات المحل/الشخص؟ (التحويلات: افتراضيًا العملية دي بس)
const scope = ref(props.t.one || ['transfer', 'intl', 'in'].includes(props.t.k) ? 'one' : 'all')
const showScope = computed(() => props.t.k !== 'manual' && same.value.n > 1)
function pick(id) {
  const t = props.t
  if (id === t.c) return
  const prev = t.c
  if (showScope.value && scope.value === 'one') {
    const was = state.txCats[t.id] || null
    setCategory(t, id, true)
    showToast(`✓ العملية دي بس اتنقلت لـ ${CAT[id].name}`, () => setTxCat(t.id, was))
    return
  }
  const n = t.k === 'manual' ? 1 : same.value.n
  setCategory(t, id)
  showToast(`✓ ${t.k === 'manual' ? 'المصروف' : n > 1 ? `كل عمليات ${t.m} (${n})` : t.m} اتنقلت لـ ${CAT[id].name}`, () => setCategory(t, prev))
}
// المحل/الشخص كله متنقل لبند — تقدر تخلي العملية دي بس فيه وترجّع الباقي
const ovCat = computed(() => (props.t.k !== 'manual' && same.value.n > 1 ? state.overrides[merchantKey(props.t.m)] || '' : ''))
function onlyThis() {
  const t = props.t, cat = ovCat.value, key = merchantKey(t.m)
  setTxCat(t.id, cat)
  clearOverride(key)
  scope.value = 'one'
  showToast(`✓ العملية دي بس في ${CAT[cat].name} — والباقي رجع لبنده`, () => { setTxCat(t.id, null); setCategory(t, cat) })
}
// لو العملية دي عليها تنبيه (مكررة / أكبر من عادتك) — نعرضه هنا ونقفله من هنا
const flag = computed(() => unusual.value.find((f) => f.tx.id === props.t.id) || null)
function okFlag() { dismissFlag(flag.value.id); emit('close') }
const canDebt = computed(() => ['transfer', 'intl', 'in'].includes(props.t.k))
const hasDebt = computed(() => txHasDebt(props.t))
const isAutoLoan = computed(() => autoLentTxIds.value.has(props.t.id))
// الحوالة دي بس، ولا كل تحويلاتي للشخص ده؟
async function notLoanAsk() {
  const d = autoLent.value.find((x) => x.txs.some((t) => t.id === props.t.id))
  const v = d && d.txs.length > 1 ? await choose({ icon: '🤝', title: 'مش سلفة', text: `${fmt(props.t.a)} ${sym()} لـ ${d.name}`, options: [
    { label: 'الحوالة دي بس', value: 'one', kind: 'primary' },
    { label: `كل تحويلاتي لـ ${d.name}`, value: 'all' },
    { label: 'إلغاء', value: null },
  ] }) : 'one'
  if (v === 'one') notLoan(props.t.id)
  else if (v === 'all') ignorePerson(d.key)
}
function selfOn() { const t = props.t; setSelfTx(t, true); showToast('🔁 اتشالت من المصاريف — تحويل بين حساباتك', () => setSelfTx(t, false)) }
function selfOff() { const t = props.t; setSelfTx(t, false); showToast('✓ رجعت تتحسب', () => setSelfTx(t, true)) }
// "الرسالة دي اتقرت غلط؟": تختار الصح، يتطبّق على طول، والقراية الذكية تتعلم الشكل ده من جديد
const KINDS_FIX = [['purchase', '🛍️ شراء'], ['transfer', '↔️ تحويل لشخص'], ['in', '⬇️ فلوس داخلة'], ['salary', '💰 راتب'], ['refund', '↩️ استرداد'], ['bill', '🧾 فاتورة'], ['cash', '💵 سحب نقدي']]
async function wrong() {
  const t = props.t
  const v = await choose({ icon: '🤖', title: 'إيه الغلط؟', text: 'تصحيحك بيتطبّق على طول، والتطبيق بيتعلم شكل الرسالة دي من جديد', options: [
    { label: 'النوع غلط', value: 'kind', kind: 'primary' },
    { label: 'دي مش عملية (شيلها)', value: 'hide' },
    { label: 'إلغاء', value: null },
  ] })
  if (!v) return
  let fix
  if (v === 'hide') fix = { hide: true }
  else {
    const k = await choose({ icon: '🏷️', title: 'النوع الصح', options: [...KINDS_FIX.filter(([id]) => id !== t.k).map(([id, l]) => ({ label: l, value: id })), { label: 'إلغاء', value: null }] })
    if (!k) return
    fix = { k }
  }
  setTxFix(t.id, fix)
  reportWrong(t, fix)
  showToast('🙏 اتصلّحت — والتطبيق بيتعلم الشكل ده من جديد', () => setTxFix(t.id, null))
  if (fix.hide) emit('close')
}
function markDebt() {
  if (props.t.k === 'transfer') { markLoan(props.t.id); showToast('🤝 اتسجلت سلفة — هتلاقيها في الديون (ليّا)', () => unanswer(props.t.id)); return }
  debtFromTx(props.t); emit('close'); emit('go', 'debts')
}
// تحويل لسه مستني ردك: سلفة ولا لأ؟
const pend = computed(() => lentPending.value.find((p) => p.tx.id === props.t.id) || null)
function ansNo() {
  const p = pend.value, stopped = answerNo(p.tx)
  showToast(stopped ? '✓ مش هسألك على تحويلاتك للشخص ده تاني' : '✓ تمام، مش سلفة', () => { unanswer(p.tx.id); if (stopped) unignorePerson(p.key) })
}
async function del() { if (await ask('تمسح المصروف ده؟', { yes: 'امسح', danger: true })) { deleteManual(props.t.id); emit('close') } }
</script>

<template>
  <BottomSheet @close="emit('close')">
<template #head><div class="head">
        <span class="ic" :style="{ background: CAT[t.c].color + '1f', color: CAT[t.c].color }">{{ CAT[t.c].icon }}</span>
        <div class="mid">
          <div class="nm">{{ t.m }}</div>
          <div class="muted sm">{{ KIND[t.k] }} · {{ t.b }} · {{ fmtDate(t.d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }}</div>
        </div>
      </div></template>
      
      <div class="amt">{{ isOut ? '' : '+' }}{{ fmt2(t.a) }} <small>{{ $money.sym }}</small></div>
      <div v-if="t.cur" class="muted sm" style="text-align: center">اتدفعت {{ fmt2(t.oa) }} {{ SYM[t.cur] || t.cur }}</div>
      <div class="muted sm" v-if="same.n > 1" style="text-align: center">{{ same.n }} عملية مع نفس المكان · إجمالي {{ fmt(same.a) }} {{ $money.sym }}</div>

      <div v-if="flag" class="flag">
        <b>{{ flag.type === 'dup' ? '⚠️ ممكن تكون مكررة' : '👀 أكبر من عادتك' }}</b>
        <span class="sm">{{ flag.text }}</span>
        <div class="fact">
          <button class="ok" @click="okFlag">✓ تمام، أنا عارفها</button>
          <span v-if="flag.type === 'dup'" class="muted xs">لو اتسحبت غلط كلّم البنك</span>
        </div>
      </div>

      <div v-if="t.k === 'self'" class="selfbox"><span>🔁 تحويل بين حساباتك — مش بيتحسب مصروف ولا دخل</span><button class="link" @click="selfOff">مش بين حساباتي</button></div>
      <div v-else-if="pend" class="autoloan ask"><span>🤝 دي سلفة؟</span><span class="ab"><button :class="{ pri: pend.likely }" @click="markLoan(t.id)">أيوه</button><button @click="ansNo">لا</button></span></div>
      <button v-else-if="canDebt && !hasDebt" class="debt" @click="markDebt">{{ t.k === 'in' ? '🤝 دي سلفة اتسلفتها (ضيفها لـ عليّا)' : '🤝 دي سلفة (ضيفها لـ ليّا)' }}</button>
      <div v-else-if="isAutoLoan" class="autoloan"><span>🤝 محسوبة سلفة ليك (ليّا)</span><button @click="notLoanAsk">مش سلفة</button></div>
      <div v-else-if="hasDebt" class="muted xs" style="text-align: center; margin-top: 10px">✓ متسجلة في الديون</div>
      <button v-if="['transfer', 'in'].includes(t.k)" class="selfbtn" @click="selfOn">🔁 دي بين حساباتي (مش مصروف)</button>

      <template v-if="isOut">
        <h3>غيّر البند</h3>
        <div v-if="showScope" class="scope">
          <button :class="{ on: scope === 'one' }" @click="scope = 'one'">العملية دي بس</button>
          <button :class="{ on: scope === 'all' }" @click="scope = 'all'">{{ ['transfer', 'intl', 'in'].includes(t.k) ? 'كل تحويلاته' : 'كل عمليات المحل' }} ({{ same.n }})</button>
        </div>
        <div v-if="ovCat && !t.one" class="ovnote">
          <span>📌 كل عمليات «<bdi>{{ t.m }}</bdi>» متنقلة لـ {{ CAT[ovCat].name }}</span>
          <button class="link" @click="onlyThis">خليها العملية دي بس</button>
        </div>
        <div v-else-if="t.one" class="muted xs" style="margin-bottom: 10px">📌 العملية دي بس في {{ CAT[t.c].name }} <button class="link xs" @click="setTxCat(t.id, null)">رجّعها</button></div>
        <CatPicker :selected="t.c" :exclude="['ccpay']" @pick="pick" />
      </template>
      <div v-if="t.k === 'manual'" class="mact">
        <button class="ed" @click="emit('edit', t)">✏️ تعديل</button>
        <button class="dl" @click="del">🗑 مسح</button>
      </div>
      <button v-if="t.sh && t.k !== 'manual'" class="wrong" @click="wrong">🤖 الرسالة دي اتقرت غلط؟</button>
      <button class="close" @click="emit('close')">تمام</button>
    </BottomSheet>
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
.scope { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; background: var(--surface-2); border-radius: 12px; padding: 3px; margin-bottom: 10px }
.scope button { border: 0; background: none; font: inherit; font-size: 12.5px; padding: 8px 6px; border-radius: 10px; color: var(--ink-2); cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.scope button.on { background: var(--surface); color: var(--ink); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,.08) }
.ovnote { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; margin-bottom: 10px; padding: 9px 12px; border-radius: 12px; background: var(--accent-soft); font-size: 13px }
.wrong { display: block; margin: 14px auto 0; border: 0; background: none; color: var(--ink-3); font: inherit; font-size: 13px; cursor: pointer; text-decoration: underline; text-underline-offset: 3px }
.selfbox { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 12px; padding: 11px 12px; border-radius: 14px; background: var(--surface-2); font-size: 13.5px; text-align: center }
.selfbtn { display: block; margin: 10px auto 0; border: 0; background: none; color: var(--ink-3); font: inherit; font-size: 13px; cursor: pointer; text-decoration: underline; text-underline-offset: 3px }
.autoloan .ab { display: flex; gap: 6px }
.autoloan button.pri { background: var(--accent); color: #fff }
.autoloan button { border: 0; border-radius: 10px; padding: 7px 12px; background: var(--surface); color: var(--ink-2); font: inherit; font-size: 12.5px; cursor: pointer }
</style>
