<script setup>
import { computed, ref } from 'vue'
import { allTx, state, saveSettings, setCategory, clearOverride } from '../lib/store.js'
import { CATEGORIES, CAT, merchantKey } from '../lib/categories.js'
import CatPicker from './CatPicker.vue'
import { fmt, fmtDate } from '../lib/format.js'

const emit = defineEmits(['back', 'open'])
const CATS = CATEGORIES.filter((c) => !c.hidden && c.id !== 'other' && c.id !== 'transfer' && c.id !== 'intl')
// كلمات بسيطة بتلمّح للبند (المحلات اللي القواعد مالقتهاش)
const HINTS = [
  ['grocery', /بقالة|تموينات|ماركت|سوبر|خضار|فواكه|لحوم|ملحمة|مياه|STORE|SHOP ?MART|GROCER|BAKALA|BAQ/i],
  ['food', /مطعم|كافيه|كافي|قهوة|كوفي|مخبز|حلويات|شاورما|مشويات|فول|بوفية|CAFE|COFFEE|KAFE|REST|BURGER|PIZZA|SHAWARMA|GRILL|BAKERY|KITCHEN|TEA|JUICE|DONUT|BROAST|BUFFET/i],
  ['health', /صيدلية|مستشفى|عيادة|طبي|PHARM|CLINIC|HOSPITAL|MEDICAL|DENT|OPTIC/i],
  ['transport', /محطة|وقود|بنزين|تشحيم|غسيل|PETROL|STATION|FUEL|GAS|CAR ?WASH|PARKING|UBER|CAREEM|BOLT|JEENY/i],
  ['clothes', /ملابس|أزياء|احذية|FASHION|CLOTH|SHOES|WEAR|BOUTIQUE/i],
  ['telecom', /موبايل|جوال|اتصالات|MOBILE|TELECOM/i],
]
const hintOf = (name) => (HINTS.find(([, rx]) => rx.test(name)) || [])[0] || ''

const recent = ref(true) // آخر ٦ شهور الأول — الأهم
const keep = computed(() => new Set(state.settings.otherKeep || []))
const rows = computed(() => {
  const by = {}
  for (const t of allTx.value) {
    if (!['purchase', 'bill'].includes(t.k)) continue
    const k0 = merchantKey(t.m)
    // المحلات اللي التطبيق حطها في "تسوق ومحلات" لوحده (لسه محدش راجعها) + اللي في أخرى
    if (!((t.c === 'shop' && !state.overrides[k0]) || t.c === 'other')) continue
    if (recent.value && Date.now() - t.ts > 183 * 864e5) continue
    const k = merchantKey(t.m)
    if (!k) continue
    const o = (by[k] ||= { k, name: t.m, n: 0, a: 0, last: 0, tx: t, c: t.c })
    o.n++; o.a += t.a
    if (t.ts > o.last) { o.last = t.ts; o.tx = t }
  }
  return Object.values(by).map((o) => ({ ...o, hint: hintOf(o.name) })).sort((a, b) => b.a - a.a)
})
const total = computed(() => rows.value.reduce((x, r) => x + r.a, 0))
// البنود اللي بتستخدمها أكتر تظهر الأول
const top = computed(() => {
  const n = {}
  for (const t of allTx.value) if (t.c !== 'other' && CAT[t.c] && !CAT[t.c].hidden) n[t.c] = (n[t.c] || 0) + 1
  return [...CATS].sort((a, b) => (n[b.id] || 0) - (n[a.id] || 0))
})
const open = ref('')
const undo = ref(null)
let timer = null
function move(r, cat) {
  setCategory(r.tx, cat)
  open.value = ''
  undo.value = { k: r.k, name: r.name, cat }
  clearTimeout(timer); timer = setTimeout(() => (undo.value = null), 5000)
}
// "مكانه صح": بنثبّته في البند ده (فيختفي من القايمة)
function keepHere(r) { move(r, r.c) }
function doUndo() { clearOverride(undo.value.k); undo.value = null }
</script>

<template>
  <div class="view">
    <header class="hd sub">
      <button class="back" @click="emit('back')">→</button>
      <h1>رتّب المحلات</h1>
      <span style="width: 38px"></span>
    </header>

    <div class="seg"><button :class="{ on: recent }" @click="recent = true">آخر ٦ شهور</button><button :class="{ on: !recent }" @click="recent = false">الكل</button></div>
    <p class="muted sm intro" v-if="rows.length">
      {{ rows.length }} محل التطبيق ماعرفهمش ({{ fmt(total) }} {{ $money.sym }}) — اتحطوا في "تسوق ومحلات". لو محل مكانه غلط اضغط عليه وانقله؛ النقل بيتطبّق على كل عملياته ومش بيتلغي مع التحديثات.
    </p>
    <div v-else class="card empty"><b>✨</b>كل المحلات اتراجعت</div>

    <section class="card list" v-if="rows.length">
      <div v-for="r in rows" :key="r.k" class="row" :class="{ open: open === r.k }">
        <button class="head" @click="open = open === r.k ? '' : r.k">
          <span class="mid"><b>{{ r.name }}</b><small class="muted">{{ CAT[r.c].icon }} {{ r.n }} {{ r.n === 1 ? 'عملية' : 'عمليات' }} · آخرها {{ fmtDate(r.last, { day: 'numeric', month: 'short' }) }}</small></span>
          <span v-if="r.hint && open !== r.k" class="hint">{{ CAT[r.hint].icon }}؟</span>
          <b class="amt">{{ fmt(r.a) }}</b>
        </button>
        <div v-if="open === r.k" class="pick">
          <CatPicker :selected="r.c" :suggest="r.hint" :exclude="['ccpay', 'transfer', 'intl']" @pick="(c) => move(r, c)" />
          <div class="pact">
            <button class="link xs" @click="emit('open', r.tx)">شوف آخر عملية</button>
            <button class="link xs" @click="keepHere(r)">✓ مكانه صح ({{ CAT[r.c].name }})</button>
          </div>
        </div>
      </div>
    </section>

    <div v-if="undo" class="toast">اتنقل "{{ undo.name }}" لـ {{ CAT[undo.cat].name }} <button @click="doUndo">تراجع</button></div>
  </div>
</template>

<style scoped>
.intro { margin: 0 6px 12px; line-height: 1.7 }
.seg { display: grid; grid-template-columns: 1fr 1fr; background: var(--surface-2); border-radius: 12px; padding: 3px; margin-bottom: 10px }
.seg button { border: 0; background: none; font: inherit; font-size: 13.5px; padding: 8px; border-radius: 10px; color: var(--ink-2); cursor: pointer }
.seg button.on { background: var(--surface); color: var(--ink); font-weight: 600 }
.list { padding: 4px 14px }
.row { border-bottom: 1px solid var(--line) }
.row:last-child { border-bottom: 0 }
.head { display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px 0; border: 0; background: none; font: inherit; color: inherit; text-align: right; cursor: pointer }
.mid { flex: 1; min-width: 0; display: flex; flex-direction: column }
.mid b { font-size: 14.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; unicode-bidi: plaintext; text-align: right }
.amt { font-variant-numeric: tabular-nums }
.hint { font-size: 13px; opacity: .8 }
.pick { padding: 0 0 12px }
.chip { border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 99px; padding: 7px 11px; font: inherit; font-size: 13px; cursor: pointer }
.chip.sug { background: var(--accent); border-color: var(--accent); color: #fff }
.chip.sug small { opacity: .8; font-size: 10.5px }
.chip.more { color: var(--accent); background: none }
.pact { width: 100%; display: flex; justify-content: space-between; margin-top: 10px }
.toast { position: fixed; bottom: calc(84px + env(safe-area-inset-bottom)); left: 16px; right: 16px; background: var(--ink); color: var(--bg); border-radius: 14px; padding: 12px 14px; font-size: 13.5px; display: flex; justify-content: space-between; align-items: center; gap: 10px; z-index: 40 }
.toast button { border: 0; background: none; color: #5eead4; font: inherit; font-weight: 600; cursor: pointer }
</style>
