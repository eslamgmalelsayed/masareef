<script setup>
import BottomSheet from './BottomSheet.vue'
import { sym } from '../lib/format.js'
import { ref, computed, onMounted, nextTick } from 'vue'
import { CATEGORIES, categorize } from '../lib/categories.js'
import CatPicker from './CatPicker.vue'
import { allTx } from '../lib/store.js'
import { saveManual, addWebMessage, syncSms } from '../lib/store.js'
import { isNative, isIOS, addMessage } from '../lib/smsSource.js'
import { CAT } from '../lib/categories.js'

const props = defineProps({ edit: Object, paste: Boolean })
const emit = defineEmits(['close', 'saved'])

const localIso = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16) }
const e = props.edit
const amount = ref(e ? String(e.a) : '')
const cat = ref(e ? e.cat || e.c : 'food')
const note = ref(e && e.m !== 'مصروف يدوي' ? e.m : '')
const when = ref(localIso(e ? e.ts : Date.now()))
const fromCash = ref(e ? !!e.fromCash : false)
const amtEl = ref(null)
const showCats = ref(false)
const showMore = ref(!!(e && e.fromCash))
let catTouched = !!e
// البنود اللي بتستخدمها أكتر — تظهر كاختيارات سريعة
const quick = computed(() => {
  const n = {}
  for (const t of allTx.value.slice(0, 400)) if (cats.some((c) => c.id === t.c)) n[t.c] = (n[t.c] || 0) + 1
  const top = cats.map((c) => c.id).sort((a, b) => (n[b] || 0) - (n[a] || 0)).slice(0, 5)
  return top.includes(cat.value) ? top : [cat.value, ...top.slice(0, 4)]
})
// اكتب "بنزين" أو "صيدلية" والبند يتختار لوحده (لحد ما تختار بإيدك)
function onNote() {
  if (catTouched || !note.value.trim()) return
  const c = categorize({ k: 'purchase', m: note.value, a: Number(amount.value) || 0 })
  if (c && c !== 'shop' && cats.some((x) => x.id === c)) cat.value = c
}
function pickCat(c) { cat.value = c; catTouched = true; showCats.value = false }
const whenLabel = computed(() => {
  const d = new Date(when.value), t = new Date()
  const same = d.toDateString() === t.toDateString()
  return (same ? 'النهارده' : d.toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'short', day: 'numeric', month: 'short' })) + ' · ' + d.toLocaleTimeString('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit' })
})
const dateEl = ref(null)
function openDate() { try { dateEl.value.showPicker() } catch { dateEl.value.focus() } }

// البنود اللي منطقي تضيفها بإيدك (من غير التحويلات والسحب)
const cats = CATEGORIES.filter((c) => !c.hidden && !['transfer', 'intl', 'cash', 'fee'].includes(c.id))
const valid = computed(() => Number(amount.value) > 0)

const canPaste = !isNative || isIOS
const pasteMode = ref(!!props.paste)
const pasteText = ref('')
const pasteMsg = ref('')

onMounted(() => nextTick(() => { if (!pasteMode.value) amtEl.value?.focus() }))

/** لزق رسالة بنك: بيقرا الحافظة، ولو المتصفح مسمحش بيفتح خانة تلزق فيها بإيدك */
async function pasteFromClipboard() {
  pasteMsg.value = ''
  try {
    const t = await navigator.clipboard.readText()
    if (t && t.trim()) { pasteText.value = t; return submitPaste() }
  } catch {}
  pasteMode.value = true
}
async function submitPaste() {
  const body = pasteText.value.trim()
  if (!body) return
  if (isIOS) {
    const r = await addMessage(body)
    await syncSms()
    pasteMsg.value = r.added ? '✓ اتسجّلت' : 'الرسالة دي متسجّلة قبل كده'
  } else {
    const r = addWebMessage(body)
    if (r.dup) pasteMsg.value = 'الرسالة دي متسجّلة قبل كده'
    else if (r.tx) pasteMsg.value = `✓ اتسجّلت: ${r.tx.a} ${sym()} · ${r.tx.m} · ${CAT[r.tx.c]?.name || ''}`
    else pasteMsg.value = 'اتحفظت، بس مش لاقي فيها عملية شراء أو تحويل'
  }
  pasteText.value = ''
}

function save() {
  if (!valid.value) return
  const t = saveManual({ id: e?.id, a: Number(amount.value), cat: cat.value, m: note.value, ts: new Date(when.value).getTime(), fromCash: fromCash.value })
  if (t) emit('saved', t)
  emit('close')
}
</script>

<template>
  <BottomSheet :title="e ? 'تعديل مصروف' : 'إضافة مصروف'" @close="emit('close')">

      <div v-if="canPaste && !e" class="pastebox">
        <button class="pbtn" @click="pasteFromClipboard">📋 الصق رسالة البنك</button>
        <template v-if="pasteMode">
          <textarea v-model="pasteText" rows="3" placeholder="الصق رسالة البنك هنا"></textarea>
          <button class="save" :disabled="!pasteText.trim()" @click="submitPaste">سجّل الرسالة</button>
        </template>
        <p v-if="pasteMsg" class="pmsg">{{ pasteMsg }}</p>
        <div class="or"><span>أو اكتب بإيدك</span></div>
      </div>

      <label class="amt">
        <input ref="amtEl" v-model="amount" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0" @keyup.enter="save" />
        <span>{{ $money.sym }}</span>
      </label>

      <input v-model="note" class="note" placeholder="على إيه؟ (بقالة، تاكسي، هدية…)" maxlength="40" @input="onNote" />

      <div class="chips">
        <button v-for="c in quick" :key="c" class="chip" :class="{ on: cat === c }" @click="pickCat(c)">{{ CAT[c].icon }} {{ CAT[c].name }}</button>
        <button class="chip more" :class="{ on: showCats }" @click="showCats = !showCats">{{ showCats ? 'أقل' : 'كل البنود…' }}</button>
      </div>
      <div v-if="showCats" class="allcats"><CatPicker :selected="cat" :exclude="['ccpay', 'transfer', 'intl', 'cash', 'fee']" @pick="pickCat" /></div>

      <div class="meta">
        <button class="mbtn" @click="openDate">🗓️ {{ whenLabel }}</button>
        <input ref="dateEl" v-model="when" type="datetime-local" class="hiddenDate" />
        <button class="mbtn" :class="{ on: fromCash }" @click="fromCash = !fromCash">💵 {{ fromCash ? 'من فلوس سحبتها ✓' : 'دفعته كاش من سحب؟' }}</button>
      </div>
      <p v-if="fromCash" class="muted xs hint">هيتخصم من "سحب نقدي" علشان المبلغ ميتحسبش مرتين</p>

      <button class="save" :disabled="!valid" @click="save">{{ e ? 'حفظ التعديل' : 'أضف المصروف' }}</button>
    </BottomSheet>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 60; display: flex; align-items: flex-end; animation: fade .2s }
.sheet { background: var(--bg); width: 100%; max-width: 560px; margin: 0 auto; max-height: 92vh; overflow-y: auto; border-radius: 24px 24px 0 0; padding: 10px 16px calc(20px + env(safe-area-inset-bottom)); animation: up .25s ease-out }
.grab { width: 40px; height: 4px; border-radius: 9px; background: var(--line); margin: 0 auto 10px }
.head { display: flex; align-items: center; justify-content: space-between; margin: 0 2px 4px }
.head b { font-size: 16px }
.x { width: 34px; height: 34px; border-radius: 50%; border: 0; background: var(--surface-2); color: var(--ink-2); font-size: 20px; line-height: 1; display: grid; place-items: center; cursor: pointer }
.chips { display: flex; gap: 6px; overflow-x: auto; margin: 12px -16px 0; padding: 0 16px 2px; scrollbar-width: none }
.chips::-webkit-scrollbar { display: none }
.chip { flex: none; border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 99px; padding: 8px 12px; font: inherit; font-size: 13px; white-space: nowrap; cursor: pointer }
.chip.on { border-color: var(--accent); background: var(--accent-soft); font-weight: 600 }
.chip.more { color: var(--accent) }
.allcats { margin-top: 10px; max-height: 40vh; overflow-y: auto; overscroll-behavior: contain }
.meta { display: flex; gap: 6px; margin-top: 12px }
.mbtn { flex: 1; min-width: 0; border: 1px solid var(--line); background: var(--surface); color: var(--ink-2); border-radius: 12px; padding: 10px 8px; font: inherit; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer }
.mbtn.on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); font-weight: 600 }
.hiddenDate { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none }
.hint { margin: 6px 4px 0 }
.pastebox { margin-top: 10px }
.pbtn { width: 100%; padding: 13px; border-radius: 14px; border: 1.5px dashed var(--accent); background: var(--accent-soft); color: var(--accent); font: inherit; font-weight: 600; font-size: 15px; cursor: pointer; margin-bottom: 6px }
.pastebox textarea { width: 100%; margin-top: 8px; font: inherit; font-size: 14px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--ink) }
.pmsg { font-size: 13px; color: var(--accent); margin: 8px 0 0 }
.or { display: flex; align-items: center; gap: 10px; color: var(--ink-3); font-size: 12px; margin: 14px 0 0 }
.or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--line) }
.amt { display: flex; align-items: baseline; justify-content: center; gap: 8px; margin: 6px 0 8px }
.amt input { width: 70%; font: inherit; font-size: 40px; font-weight: 700; text-align: center; border: 0; border-bottom: 2px solid var(--line); background: none; color: var(--ink); outline: none; padding: 4px 0; font-variant-numeric: tabular-nums }
.amt input:focus { border-color: var(--accent) }
.amt span { color: var(--ink-3); font-size: 16px }
.note { width: 100%; font: inherit; font-size: 15px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); outline: none; margin-top: 6px }
.note:focus { border-color: var(--accent) }
.lbl { font-size: 13px; color: var(--ink-2); margin: 14px 0 8px }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px }
.cbtn { display: flex; align-items: center; gap: 8px; padding: 9px 10px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font: inherit; font-size: 12.5px; text-align: right; cursor: pointer }
.cbtn.on { border-color: var(--accent); background: var(--accent-soft); font-weight: 600 }
.row { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 14px; font-size: 13.5px; color: var(--ink-2) }
.row input { font: inherit; font-size: 14px; padding: 8px 10px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--ink) }
.sw { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-top: 14px; font-size: 14px }
.sw b { font-weight: 500 }
.sw input { appearance: none; width: 46px; height: 28px; border-radius: 99px; background: var(--line); position: relative; flex: none; cursor: pointer; transition: .2s; margin: 0 }
.sw input::after { content: ''; position: absolute; top: 3px; right: 3px; width: 22px; height: 22px; border-radius: 50%; background: #fff; transition: .2s; box-shadow: 0 1px 3px rgba(0,0,0,.2) }
.sw input:checked { background: var(--accent) }
.sw input:checked::after { right: 21px }
.save { width: 100%; margin-top: 14px; padding: 14px; border-radius: 14px; border: 0; background: var(--accent); color: #fff; font: inherit; font-weight: 600; font-size: 15px; cursor: pointer }
.save:disabled { opacity: .45 }
@keyframes up { from { transform: translateY(40%) } }
@keyframes fade { from { opacity: 0 } }
</style>
