<script setup>
import BottomSheet from './BottomSheet.vue'
import { ask } from '../lib/dialog.js'
import { computed, ref } from 'vue'
import { funds, fundsNeedNow, saveFund, fundAdd, fundRenew, deleteFund } from '../lib/tools.js'
import { fmt, fmtDate } from '../lib/format.js'

const emit = defineEmits(['back'])
const ICONS = ['✈️', '🛂', '🎉', '🐑', '🏫', '🛡️', '🚗', '🎁', '🏠', '💍']
const IDEAS = [['🛂', 'تجديد الإقامة'], ['✈️', 'رحلة مصر'], ['🎉', 'العيد'], ['🛡️', 'التأمين']]
const ed = ref(null)
const addV = ref({})
const toMonth = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function openNew(idea) {
  const d = new Date(); d.setMonth(d.getMonth() + 6)
  ed.value = { icon: idea ? idea[0] : '✈️', name: idea ? idea[1] : '', target: '', due: toMonth(d), saved: '' }
}
function openEdit(f) { ed.value = { id: f.id, icon: f.icon, name: f.name, target: f.target, due: toMonth(f.due) } }
function save() {
  const e = ed.value
  if (!e.name.trim() || !(Number(e.target) > 0) || !e.due) return
  const [y, m] = e.due.split('-').map(Number)
  const f = { icon: e.icon, name: e.name.trim(), target: Number(e.target), due: +new Date(y, m - 1, 15) }
  if (e.id) f.id = e.id
  else if (Number(e.saved) > 0) f.initial = Number(e.saved)
  saveFund(f)
  ed.value = null
}
function add(f) { const v = Number(addV.value[f.id] || f.needNow.toFixed(0)); if (v > 0) { fundAdd(f.id, v); addV.value[f.id] = '' } }
async function del() { if (await ask('تمسح الصندوق ده؟', { yes: 'امسح', danger: true })) { deleteFund(ed.value.id); ed.value = null } }
const active = computed(() => funds.value.filter((f) => !f.due_passed))
const passed = computed(() => funds.value.filter((f) => f.due_passed))
</script>

<template>
  <div class="view">
    <header class="hd sub">
      <button class="back" @click="emit('back')">→</button>
      <h1>صناديق المصاريف السنوية</h1>
      <span style="width: 38px"></span>
    </header>

    <section v-if="active.length" class="hero2">
      <span class="lbl">حط على جنب من الراتب ده</span>
      <b>{{ fmt(fundsNeedNow) }}<small> {{ $money.sym }}</small></b>
      <span class="lbl">علشان المصاريف الكبيرة متفاجئكش — وبيتطرح من "تقدر تصرف/يوم"</span>
    </section>
    <p v-else class="muted sm intro">للمصاريف اللي مش كل شهر بس معروفة: بتحدد المبلغ والميعاد، والتطبيق يقولك تحط كام من كل راتب.</p>

    <section v-for="f in active" :key="f.id" class="card fund">
      <div class="top" @click="openEdit(f)">
        <span class="ic">{{ f.icon }}</span>
        <div class="mid">
          <b>{{ f.name }}</b>
          <small class="muted">{{ fmtDate(f.due, { month: 'long', year: 'numeric' }) }} · باقي {{ f.months }} {{ f.months === 1 ? 'شهر' : 'شهور' }}</small>
        </div>
        <div class="amt"><b>{{ fmt(f.saved) }}</b><small class="muted">من {{ fmt(f.target) }}</small></div>
      </div>
      <div class="bar"><i :style="{ width: f.pct * 100 + '%' }"></i></div>
      <div class="need">
        <span v-if="f.left <= 0" class="good">✅ اكتمل</span>
        <span v-else-if="f.needNow > 0">حط <b>{{ fmt(f.needNow) }}</b> الراتب ده</span>
        <span v-else class="good">✓ حطيت نصيب الراتب ده</span>
        <span class="addrow" v-if="f.left > 0">
          <input v-model="addV[f.id]" type="number" inputmode="decimal" :placeholder="fmt(f.needNow || f.perCycle)" />
          <button @click="add(f)">حطيت</button>
        </span>
      </div>
    </section>

    <section v-for="f in passed" :key="f.id" class="card fund past">
      <div class="top"><span class="ic">{{ f.icon }}</span><div class="mid"><b>{{ f.name }}</b><small class="muted">الميعاد جه · اتجمع {{ fmt(f.saved) }} من {{ fmt(f.target) }}</small></div></div>
      <div class="acts"><button class="link" @click="fundRenew(f.id)">جدّده للسنة الجاية</button><button class="link del" @click="deleteFund(f.id)">امسح</button></div>
    </section>

    <button class="addb" @click="openNew()">＋ صندوق جديد</button>
    <div v-if="!funds.length" class="ideas">
      <button v-for="i in IDEAS" :key="i[1]" @click="openNew(i)">{{ i[0] }} {{ i[1] }}</button>
    </div>

    <BottomSheet v-if="ed" :title="ed.id ? 'تعديل الصندوق' : 'صندوق جديد'" @close="ed = null">
        <div class="icons"><button v-for="i in ICONS" :key="i" :class="{ on: ed.icon === i }" @click="ed.icon = i">{{ i }}</button></div>
        <label class="fld"><span>اسمه</span><input v-model="ed.name" placeholder="مثلًا تجديد الإقامة" /></label>
        <div class="two">
          <label class="fld"><span>المبلغ المطلوب</span><input v-model="ed.target" type="number" inputmode="numeric" placeholder="0" /></label>
          <label class="fld"><span>محتاجه إمتى</span><input v-model="ed.due" type="month" /></label>
        </div>
        <label v-if="!ed.id" class="fld"><span>معاك منه كام دلوقتي (اختياري)</span><input v-model="ed.saved" type="number" inputmode="numeric" placeholder="0" /></label>
        <button class="save" @click="save">حفظ</button>
        <button v-if="ed.id" class="link del" style="margin-top: 12px" @click="del">امسح الصندوق</button>
      </BottomSheet>
  </div>
</template>

<style scoped>
.intro { margin: 0 6px 14px; line-height: 1.7 }
.hero2 { background: var(--hero); color: var(--hero-ink); border-radius: 22px; padding: 18px; margin-bottom: 12px }
.hero2 .lbl { display: block; font-size: 12.5px; opacity: .82 }
.hero2 > b { display: block; font-size: 32px; font-weight: 700; font-variant-numeric: tabular-nums }
.hero2 small { font-size: 14px; opacity: .8; font-weight: 500 }
.fund .top { display: flex; align-items: center; gap: 12px; cursor: pointer }
.ic { width: 42px; height: 42px; border-radius: 13px; background: var(--surface-2); display: grid; place-items: center; font-size: 20px; flex: none }
.mid { flex: 1; min-width: 0; display: flex; flex-direction: column }
.mid b { font-size: 15px }
.amt { display: flex; flex-direction: column; align-items: flex-end }
.amt b { font-size: 16px; font-variant-numeric: tabular-nums }
.amt small { font-size: 11px }
.bar { height: 6px; background: var(--surface-2); border-radius: 99px; overflow: hidden; margin: 12px 0 10px }
.bar i { display: block; height: 100%; background: var(--accent); border-radius: 99px }
.need { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13.5px; flex-wrap: wrap }
.need b { font-variant-numeric: tabular-nums }
.good { color: var(--good) }
.addrow { display: flex; gap: 6px }
.addrow input { width: 84px; font: inherit; font-size: 14px; padding: 7px 8px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); text-align: center; outline: none }
.addrow button { border: 0; border-radius: 10px; padding: 0 12px; background: var(--accent); color: #fff; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer }
.past { opacity: .75 }
.acts { display: flex; justify-content: space-between; margin-top: 10px }
.del { color: var(--bad) }
.addb { width: 100%; padding: 13px; border: 1px dashed var(--line); border-radius: 14px; background: none; color: var(--accent); font: inherit; font-weight: 500; cursor: pointer }
.ideas { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; justify-content: center }
.ideas button { border: 1px solid var(--line); background: var(--surface); color: var(--ink-2); border-radius: 99px; padding: 7px 12px; font: inherit; font-size: 13px; cursor: pointer }
.scrim { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 50; display: flex; align-items: flex-end }
.sheet { background: var(--bg); width: 100%; max-width: 560px; margin: 0 auto; max-height: 92vh; overflow-y: auto; border-radius: 24px 24px 0 0; padding: 10px 16px calc(20px + env(safe-area-inset-bottom)) }
.grab { width: 40px; height: 4px; border-radius: 9px; background: var(--line); margin: 0 auto 14px }
h2 { font-size: 16px; margin: 0 0 8px }
.icons { display: flex; flex-wrap: wrap; gap: 6px }
.icons button { width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); font-size: 19px; cursor: pointer }
.icons button.on { border-color: var(--accent); background: var(--accent-soft) }
.fld { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; font-size: 13px; color: var(--ink-2) }
.fld input { font: inherit; font-size: 15px; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; outline: none; width: 100%; min-width: 0; box-sizing: border-box }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px }
.save { width: 100%; margin-top: 16px; padding: 13px; border-radius: 14px; border: 0; background: var(--accent); color: #fff; font: inherit; font-weight: 600; cursor: pointer }
</style>
