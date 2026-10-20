<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { CATEGORIES } from '../lib/categories.js'
import { saveManual } from '../lib/store.js'

const props = defineProps({ edit: Object })
const emit = defineEmits(['close', 'saved'])

const localIso = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16) }
const e = props.edit
const amount = ref(e ? String(e.a) : '')
const cat = ref(e ? e.cat || e.c : 'food')
const note = ref(e && e.m !== 'مصروف يدوي' ? e.m : '')
const when = ref(localIso(e ? e.ts : Date.now()))
const fromCash = ref(e ? !!e.fromCash : false)
const amtEl = ref(null)

// البنود اللي منطقي تضيفها بإيدك (من غير التحويلات والسحب)
const cats = CATEGORIES.filter((c) => !['transfer', 'intl', 'cash', 'fee'].includes(c.id))
const valid = computed(() => Number(amount.value) > 0)

onMounted(() => nextTick(() => amtEl.value?.focus()))

function save() {
  if (!valid.value) return
  const t = saveManual({ id: e?.id, a: Number(amount.value), cat: cat.value, m: note.value, ts: new Date(when.value).getTime(), fromCash: fromCash.value })
  if (t) emit('saved', t)
  emit('close')
}
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <div class="sheet">
      <div class="grab"></div>
      <h2>{{ e ? 'تعديل مصروف' : 'إضافة مصروف' }}</h2>

      <label class="amt">
        <input ref="amtEl" v-model="amount" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0" @keyup.enter="save" />
        <span>ر.س</span>
      </label>

      <input v-model="note" class="note" placeholder="على إيه؟ (مثلًا: بقالة، تاكسي، هدية…)" maxlength="40" />

      <div class="lbl">البند</div>
      <div class="grid">
        <button v-for="c in cats" :key="c.id" class="cbtn" :class="{ on: cat === c.id }" @click="cat = c.id">
          <span :style="{ color: c.color }">{{ c.icon }}</span><span>{{ c.name }}</span>
        </button>
      </div>

      <label class="row"><span>التاريخ والوقت</span><input v-model="when" type="datetime-local" /></label>

      <label class="sw">
        <span><b>دفعته كاش من فلوس سحبتها</b><br /><small class="muted">علشان السحب من الصراف ميتحسبش مرتين — هيتخصم من بند "سحب نقدي"</small></span>
        <input v-model="fromCash" type="checkbox" />
      </label>

      <button class="save" :disabled="!valid" @click="save">{{ e ? 'حفظ التعديل' : 'أضف المصروف' }}</button>
    </div>
  </div>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 60; display: flex; align-items: flex-end; animation: fade .2s }
.sheet { background: var(--bg); width: 100%; max-width: 560px; margin: 0 auto; max-height: 92vh; overflow-y: auto; border-radius: 24px 24px 0 0; padding: 10px 16px calc(20px + env(safe-area-inset-bottom)); animation: up .25s ease-out }
.grab { width: 40px; height: 4px; border-radius: 9px; background: var(--line); margin: 0 auto 12px }
h2 { text-align: center; font-size: 16px }
.amt { display: flex; align-items: baseline; justify-content: center; gap: 8px; margin: 14px 0 8px }
.amt input { width: 70%; font: inherit; font-size: 44px; font-weight: 700; text-align: center; border: 0; border-bottom: 2px solid var(--line); background: none; color: var(--ink); outline: none; padding: 4px 0; font-variant-numeric: tabular-nums }
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
.save { width: 100%; margin-top: 18px; padding: 14px; border-radius: 14px; border: 0; background: var(--accent); color: #fff; font: inherit; font-weight: 600; font-size: 15px; cursor: pointer }
.save:disabled { opacity: .45 }
@keyframes up { from { transform: translateY(40%) } }
@keyframes fade { from { opacity: 0 } }
</style>
