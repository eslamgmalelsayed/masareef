<script setup>
import { computed, ref } from 'vue'
import { emergency, saveEmergency, emergencyAdd } from '../lib/tools.js'
import { state } from '../lib/store.js'
import { fmt, fmtDate } from '../lib/format.js'

const emit = defineEmits(['back'])
const E = computed(() => emergency.value)
const e = computed(() => state.settings.emergency || {})
const addV = ref('')
const useV = ref('')
const useNote = ref('')
const showUse = ref(false)
function add() { const v = Number(addV.value || E.value.needNow); if (v > 0) { emergencyAdd(v); addV.value = '' } }
function use() { const v = Number(useV.value); if (v > 0) { emergencyAdd(-v, useNote.value.trim()); useV.value = ''; useNote.value = ''; showUse.value = false } }
const coversTxt = computed(() => { const c = E.value.covers; return c < 0.5 ? 'أقل من نص شهر' : c < 1.5 ? 'حوالي شهر' : `حوالي ${Math.round(c)} شهور` })
</script>

<template>
  <div class="view">
    <header class="hd sub">
      <button class="back" @click="emit('back')">→</button>
      <h1>صندوق الطوارئ</h1>
      <span style="width: 38px"></span>
    </header>

    <p class="muted sm intro">فلوس على جنب متلمسهاش غير لو حصل حاجة — شغل، علاج، عربية، سفر مفاجئ. القاعدة المعروفة: مصاريف ٣ لـ ٦ شهور.</p>

    <section class="hero2">
      <span class="lbl">معاك في الصندوق</span>
      <b>{{ fmt(E.saved) }}<small> من {{ fmt(E.target) }} {{ $money.sym }}</small></b>
      <div class="track"><i :style="{ width: E.pct * 100 + '%' }"></i></div>
      <span class="lbl">يكفيك {{ coversTxt }} من مصاريفك ({{ fmt(E.monthly) }} في الشهر)</span>
    </section>

    <section class="card">
      <h2>الهدف</h2>
      <div class="seg"><button v-for="m in [3, 6]" :key="m" :class="{ on: E.months === m }" @click="saveEmergency({ months: m, target: '' })">{{ m }} شهور</button></div>
      <label class="fld"><span>المبلغ (مقترح {{ fmt(E.suggested) }} = {{ E.months }} × متوسط مصاريفك)</span><input type="number" inputmode="numeric" :value="e.target || ''" :placeholder="fmt(E.suggested)" @change="(ev) => saveEmergency({ target: Number(ev.target.value) || '' })" /></label>
      <div class="fld"><span>عايز توصله في</span>
        <div class="seg s4"><button v-for="s in [6, 12, 18, 24]" :key="s" :class="{ on: E.speed === s && !e.perCycle }" @click="saveEmergency({ speed: s, perCycle: '' })">{{ s }} شهر</button></div>
      </div>
      <p class="muted sm" v-if="E.left">يعني تحط <b>{{ fmt(E.perCycle) }}</b> من كل راتب — وده بيتطرح لوحده من "تقدر تصرف/يوم"</p>
      <p class="good sm" v-else>✅ الصندوق مكتمل</p>
    </section>

    <section class="card">
      <div class="row-b"><h2>الراتب ده</h2><span v-if="E.needNow" class="muted sm">باقي تحط {{ fmt(E.needNow) }}</span><span v-else-if="E.left" class="good sm">✓ حطيت نصيبه</span></div>
      <div class="addrow">
        <input v-model="addV" type="number" inputmode="decimal" :placeholder="fmt(E.needNow || E.perCycle)" />
        <button @click="add">حطيت</button>
        <button class="ghost" @click="showUse = !showUse">استخدمت منه</button>
      </div>
      <div v-if="showUse" class="use">
        <input v-model="useV" type="number" inputmode="decimal" placeholder="المبلغ" />
        <input v-model="useNote" placeholder="في إيه؟ (اختياري)" />
        <button @click="use">سجّل</button>
      </div>
      <div v-if="E.history.length" class="hist">
        <div v-for="(h, i) in E.history.slice(0, 10)" :key="i" class="hrow">
          <span class="muted">{{ fmtDate(h.ts, { day: 'numeric', month: 'short', year: 'numeric' }) }}{{ h.note ? ' · ' + h.note : '' }}</span>
          <b :class="h.a < 0 ? 'bad' : 'good'" dir="ltr">{{ h.a < 0 ? '−' : '+' }}{{ fmt(Math.abs(h.a)) }}</b>
        </div>
      </div>
      <p class="muted xs foot">نصيحة: خليه في حساب لوحده بعيد عن حساب الصرف — علشان متصرفوش من غير ما تحس.</p>
    </section>
  </div>
</template>

<style scoped>
.intro { margin: 0 6px 12px; line-height: 1.7 }
.hero2 { background: linear-gradient(145deg, #1d4ed8, #1e3a8a); color: #fff; border-radius: 22px; padding: 18px; margin-bottom: 12px }
.hero2 .lbl { display: block; font-size: 12.5px; opacity: .88 }
.hero2 > b { display: block; font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums }
.hero2 small { font-size: 14px; opacity: .85; font-weight: 500 }
.track { height: 8px; background: rgba(255,255,255,.22); border-radius: 99px; overflow: hidden; margin: 10px 0 8px }
.track i { display: block; height: 100%; background: #fff; border-radius: 99px }
h2 { font-size: 15.5px; margin: 0 0 10px }
.seg { display: grid; grid-template-columns: 1fr 1fr; background: var(--surface-2); border-radius: 12px; padding: 3px }
.seg.s4 { grid-template-columns: repeat(4, 1fr) }
.seg button { border: 0; background: none; font: inherit; font-size: 13.5px; padding: 8px 4px; border-radius: 10px; color: var(--ink-2); cursor: pointer }
.seg button.on { background: var(--surface); color: var(--ink); font-weight: 600 }
.fld { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; font-size: 13px; color: var(--ink-2) }
.fld input { font: inherit; font-size: 15px; color: var(--ink); background: var(--surface-2); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; outline: none }
p.sm { margin: 12px 2px 0 }
.good { color: var(--good) } .bad { color: var(--bad) }
.addrow, .use { display: flex; gap: 6px }
.use { margin-top: 8px }
.addrow input, .use input { flex: 1; min-width: 0; font: inherit; font-size: 14px; padding: 9px 10px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); outline: none }
.addrow button, .use button { border: 0; border-radius: 12px; padding: 0 12px; background: var(--accent); color: #fff; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap }
.addrow .ghost { background: var(--surface-2); color: var(--ink-2) }
.hist { margin-top: 10px }
.hrow { display: flex; justify-content: space-between; padding: 7px 0; font-size: 13px; border-bottom: 1px solid var(--line) }
.hrow:last-child { border-bottom: 0 }
.hrow b { font-variant-numeric: tabular-nums }
.foot { margin: 10px 0 0; line-height: 1.6 }
</style>
