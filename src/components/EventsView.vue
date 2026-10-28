<script setup>
import BottomSheet from './BottomSheet.vue'
import { promptText } from '../lib/dialog.js'
import { ref } from 'vue'
import { events, activeEvent, startEvent, stopEvent, deleteEvent, saveEvent } from '../lib/tools.js'
import { CAT } from '../lib/categories.js'
import { fmt, fmtDate } from '../lib/format.js'

const emit = defineEmits(['back', 'open'])
const ICONS = [['✈️', 'سفر'], ['🇪🇬', 'إجازة مصر'], ['🌙', 'رمضان'], ['🎉', 'العيد'], ['💍', 'فرح'], ['🏠', 'نقل بيت']]
const ed = ref(null)
const open = ref('')
const day = (ts) => new Date(ts).toISOString().slice(0, 10)
function openNew(i) { ed.value = { icon: i ? i[0] : '✈️', name: i ? i[1] : '', when: 'now', from: day(Date.now()), to: '' } }
function save() {
  const e = ed.value
  if (!e.name.trim()) return
  if (e.when === 'now') startEvent({ icon: e.icon, name: e.name.trim() })
  else {
    const from = +new Date(e.from + 'T00:00:00')
    const to = e.to ? +new Date(e.to + 'T23:59:59') : null
    if (to) startEvent({ icon: e.icon, name: e.name.trim(), from, to })
    else startEvent({ icon: e.icon, name: e.name.trim(), from })
  }
  ed.value = null
}
async function rename(e) { const n = await promptText('غيّر الاسم', e.name); if (n && n.trim()) saveEvent({ id: e.id, name: n.trim() }) }
</script>

<template>
  <div class="view">
    <header class="hd sub">
      <button class="back" @click="emit('back')">→</button>
      <h1>السفر والمناسبات</h1>
      <span style="width: 38px"></span>
    </header>

    <section v-if="activeEvent" class="hero2">
      <span class="lbl">{{ activeEvent.icon }} {{ activeEvent.name }} شغال من {{ activeEvent.days }} {{ activeEvent.days === 1 ? 'يوم' : 'أيام' }}</span>
      <b>{{ fmt(activeEvent.total) }}<small> {{ $money.sym }}</small></b>
      <span class="lbl">{{ fmt(activeEvent.perDay) }} في اليوم · كل اللي بتصرفه بيتجمع هنا لوحده</span>
      <button class="stop" @click="stopEvent(activeEvent.id)">⏹ خلّصت</button>
    </section>
    <template v-else>
      <p class="muted sm intro">مسافر أو داخل على مناسبة؟ شغّل الوضع وكل اللي بتصرفه في الفترة دي يتجمع لوحده — وتعرف الرحلة كلفتك كام بالظبط.</p>
      <div class="ideas"><button v-for="i in ICONS" :key="i[1]" @click="openNew(i)">{{ i[0] }} {{ i[1] }}</button></div>
      <button class="addb" @click="openNew()">＋ ابدأ</button>
    </template>

    <section v-for="e in events.filter((x) => !x.active)" :key="e.id" class="card ev">
      <button class="top" @click="open = open === e.id ? '' : e.id">
        <span class="ic">{{ e.icon }}</span>
        <span class="mid"><b>{{ e.name }}</b><small class="muted">{{ fmtDate(e.from, { day: 'numeric', month: 'short' }) }} — {{ fmtDate(e.to, { day: 'numeric', month: 'short', year: 'numeric' }) }} · {{ e.days }} يوم</small></span>
        <span class="amt"><b>{{ fmt(e.total) }}</b><small class="muted">{{ fmt(e.perDay) }}/يوم</small></span>
      </button>
      <div v-if="open === e.id" class="det">
        <div v-for="[c, v] in e.byCat.slice(0, 6)" :key="c" class="crow"><span>{{ CAT[c]?.icon }} {{ CAT[c]?.name }}</span><b>{{ fmt(v) }}</b></div>
        <div class="acts"><button class="link" @click="rename(e)">غيّر الاسم</button><button class="link del" @click="deleteEvent(e.id)">امسح</button></div>
      </div>
    </section>

    <BottomSheet v-if="ed" title="مناسبة جديدة" @close="ed = null">
        <div class="icons"><button v-for="i in ICONS" :key="i[0]" :class="{ on: ed.icon === i[0] }" @click="ed.icon = i[0]">{{ i[0] }}</button></div>
        <label class="fld"><span>الاسم</span><input v-model="ed.name" placeholder="مثلًا إجازة مصر" /></label>
        <div class="seg"><button :class="{ on: ed.when === 'now' }" @click="ed.when = 'now'">ابدأ من دلوقتي</button><button :class="{ on: ed.when === 'range' }" @click="ed.when = 'range'">فترة فاتت</button></div>
        <div v-if="ed.when === 'range'" class="two">
          <label class="fld"><span>من</span><input v-model="ed.from" type="date" /></label>
          <label class="fld"><span>لحد</span><input v-model="ed.to" type="date" /></label>
        </div>
        <button class="save" @click="save">{{ ed.when === 'now' ? 'ابدأ' : 'احفظ' }}</button>
      </BottomSheet>
  </div>
</template>

<style scoped>
.intro { margin: 0 6px 12px; line-height: 1.7 }
.hero2 { background: linear-gradient(145deg, #0369a1, #075985); color: #fff; border-radius: 22px; padding: 18px; margin-bottom: 12px }
.hero2 .lbl { display: block; font-size: 12.5px; opacity: .88 }
.hero2 > b { display: block; font-size: 32px; font-weight: 700; font-variant-numeric: tabular-nums }
.hero2 small { font-size: 14px; opacity: .8; font-weight: 500 }
.stop { margin-top: 12px; border: 0; border-radius: 12px; padding: 9px 16px; background: rgba(255,255,255,.18); color: #fff; font: inherit; font-weight: 600; cursor: pointer }
.ideas { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px }
.ideas button { border: 1px solid var(--line); background: var(--surface); color: var(--ink-2); border-radius: 99px; padding: 8px 13px; font: inherit; font-size: 13.5px; cursor: pointer }
.addb { width: 100%; padding: 13px; border: 1px dashed var(--line); border-radius: 14px; background: none; color: var(--accent); font: inherit; font-weight: 500; cursor: pointer; margin-bottom: 14px }
.ev .top { display: flex; align-items: center; gap: 12px; width: 100%; border: 0; background: none; font: inherit; color: inherit; text-align: right; padding: 0; cursor: pointer }
.ic { width: 42px; height: 42px; border-radius: 13px; background: var(--surface-2); display: grid; place-items: center; font-size: 20px; flex: none }
.mid { flex: 1; min-width: 0; display: flex; flex-direction: column }
.amt { display: flex; flex-direction: column; align-items: flex-end }
.amt b { font-size: 16px; font-variant-numeric: tabular-nums }
.amt small { font-size: 11px }
.det { margin-top: 10px; background: var(--surface-2); border-radius: 12px; padding: 4px 12px }
.crow { display: flex; justify-content: space-between; padding: 7px 0; font-size: 13.5px; border-bottom: 1px solid var(--line) }
.acts { display: flex; justify-content: space-between; padding: 8px 0 4px }
.del { color: var(--bad) }
.scrim { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 50; display: flex; align-items: flex-end }
.sheet { background: var(--bg); width: 100%; max-width: 560px; margin: 0 auto; max-height: 92vh; overflow-y: auto; border-radius: 24px 24px 0 0; padding: 10px 16px calc(20px + env(safe-area-inset-bottom)) }
.grab { width: 40px; height: 4px; border-radius: 9px; background: var(--line); margin: 0 auto 14px }
h2 { font-size: 16px; margin: 0 0 8px }
.icons { display: flex; flex-wrap: wrap; gap: 6px }
.icons button { width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); font-size: 19px; cursor: pointer }
.icons button.on { border-color: var(--accent); background: var(--accent-soft) }
.fld { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; font-size: 13px; color: var(--ink-2) }
.fld input { font: inherit; font-size: 15px; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; outline: none; width: 100%; min-width: 0; box-sizing: border-box }
.seg { display: grid; grid-template-columns: 1fr 1fr; background: var(--surface-2); border-radius: 12px; padding: 3px; margin-top: 12px }
.seg button { border: 0; background: none; font: inherit; font-size: 13.5px; padding: 8px; border-radius: 10px; color: var(--ink-2); cursor: pointer }
.seg button.on { background: var(--surface); color: var(--ink); font-weight: 600 }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px }
.save { width: 100%; margin-top: 16px; padding: 13px; border-radius: 14px; border: 0; background: var(--accent); color: #fff; font: inherit; font-weight: 600; cursor: pointer }
</style>
