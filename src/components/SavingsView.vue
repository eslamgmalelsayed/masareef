<script setup>
import { computed } from 'vue'
import { savings } from '../lib/insights.js'
import { safeToSpend } from '../lib/tools.js'
import { state, saveSettings, saveCandidates, toggleSaveAcct } from '../lib/store.js'
import { ref } from 'vue'
import { fmt } from '../lib/format.js'

const emit = defineEmits(['back', 'go'])
const S = computed(() => savings.value)
const maxH = computed(() => Math.max(1, ...S.value.history.map((h) => Math.abs(h.saved)), S.value.goal))
const pct = computed(() => (S.value.goal ? Math.max(0, Math.min(100, (S.value.projected / S.value.goal) * 100)) : 0))
const suggest = computed(() => Math.max(0, Math.floor((S.value.avgSaved * 0.9) / 100) * 100))

const accts = computed(() => new Set(state.settings.saveAccts || []))
const picking = ref(false)
const maxPut = computed(() => Math.max(1, ...S.value.history.map((h) => Math.abs(h.put)), S.value.goal || 0))
function setGoal(e) {
  const v = Math.max(0, Math.round(Number(e.target.value) || 0))
  state.settings.saveGoal = v || ''
  saveSettings()
}
</script>

<template>
  <div class="view">
    <header class="hd sub">
      <button class="back" @click="emit('back')">→</button>
      <h1>هدف الادخار</h1>
      <span style="width: 38px"></span>
    </header>

    <section class="card acc">
      <div class="row-b"><h2>🐷 حساب الادخار</h2><button v-if="S.hasAcct && !picking" class="link" @click="picking = true">تعديل</button></div>
      <template v-if="S.hasAcct && !picking">
        <div class="put"><span class="muted sm">حوّشت الراتب ده</span><b>{{ fmt(Math.max(0, S.put)) }} <small>{{ $money.sym }}</small></b>
          <small v-if="S.goal" class="muted">من هدف {{ fmt(S.goal) }} · {{ Math.round((Math.max(0, S.put) / S.goal) * 100) }}٪</small></div>
        <div v-if="S.goal" class="track2"><i :style="{ width: Math.min(100, (Math.max(0, S.put) / S.goal) * 100) + '%' }"></i></div>
        <p class="muted xs">أي تحويل للحساب {{ [...accts].map((a) => '••' + a).join(' / ') }} بيتحسب ادخار، وأي فلوس ترجع منه بتتخصم.</p>
      </template>
      <template v-else>
        <p class="muted sm">اختار الحساب اللي بتحوّش فيه — التحويلات ليه هتتحسب ادخار مش صرف.</p>
        <label v-for="c in saveCandidates" :key="c.acct" class="cand">
          <input type="checkbox" :checked="accts.has(c.acct)" @change="(e) => toggleSaveAcct(c.acct, e.target.checked)" />
          <span><b>••{{ c.acct }}</b> {{ c.name }}<br /><small class="muted">{{ c.mine ? 'حسابك · ' : '' }}حوّلت له {{ c.n }} مرة · {{ fmt(c.a) }} {{ $money.sym }} في السنة</small></span>
        </label>
        <p v-if="!saveCandidates.length" class="muted xs">لسه مفيش تحويلات لحسابات تانية.</p>
        <button v-if="S.hasAcct" class="link" @click="picking = false">تمام</button>
      </template>
    </section>

    <section class="card goal">
      <label>
        <span>عايز تحوّش كام من كل راتب؟</span>
        <input type="number" inputmode="numeric" min="0" step="100" :value="S.goal || ''" :placeholder="suggest ? 'مثلًا ' + fmt(suggest) : 'مثلًا 2000'" @change="setGoal" />
      </label>
      <small class="muted" v-if="S.avgSaved > 0">متوسط اللي بيفضل معاك من الراتب: {{ fmt(S.avgSaved) }} {{ $money.sym }}</small>
    </section>

    <section v-if="S.goal" class="hero2" :class="S.onTrack ? 'ok' : 'bad'">
      <span class="lbl">{{ S.onTrack ? 'ماشي صح 👌' : 'بالمعدل ده مش هتوصل للهدف' }}</span>
      <b>{{ fmt(Math.max(0, S.projected)) }}<small> من {{ fmt(S.goal) }} {{ $money.sym }}</small></b>
      <span class="lbl">ده اللي متوقع يفضل معاك آخر الراتب</span>
      <div class="track"><i :style="{ width: pct + '%' }"></i></div>
      <div class="split">
        <div><span class="lbl">تقدر تصرف/يوم</span><b>{{ fmt(safeToSpend.perDay) }}</b></div>
        <div><span class="lbl">فاضل للراتب</span><b>{{ S.daysLeft }} يوم</b></div>
        <div><span class="lbl">معاك دلوقتي</span><b>{{ fmt(Math.max(0, S.soFar)) }}</b></div>
      </div>
    </section>
    <p v-else class="muted sm hint">اكتب هدفك، والتطبيق هيقولك ماشي صح ولا لأ، وهيطرحه من "تقدر تصرف/يوم" في الرئيسية.</p>

    <button class="card linkcard" @click="emit('go', 'emergency')">🛟 <span><b>صندوق الطوارئ</b><br /><small class="muted">أول حاجة تحوّشها قبل أي هدف تاني — مصاريف ٣ لـ ٦ شهور</small></span><span class="muted">←</span></button>

    <section class="card" v-if="S.history.length">
      <h2>فضل معاك كام من كل راتب</h2>
      <div v-for="h in S.history" :key="h.id" class="hrow">
        <span class="m">{{ h.label }}</span>
        <span class="bar"><i :class="h.saved >= 0 ? (S.goal && h.saved >= S.goal ? 'hit' : 'pos') : 'neg'" :style="{ width: Math.min(100, (Math.abs(h.saved) / maxH) * 100) + '%' }"></i></span>
        <b dir="ltr" :class="{ neg: h.saved < 0 }">{{ h.saved < 0 ? '−' : '' }}{{ fmt(Math.abs(h.saved)) }}</b>
      </div>
      <p class="muted xs foot">الراتب ناقص كل المصروفات في نفس الفترة. لو بالسالب يبقى صرفت أكتر من الراتب.</p>
    </section>
    <section class="card" v-if="S.hasAcct && S.history.length">
      <h2>حوّلت كام للادخار من كل راتب</h2>
      <div v-for="h in S.history" :key="h.id" class="hrow">
        <span class="m">{{ h.label }}</span>
        <span class="bar"><i :class="h.put >= 0 ? (S.goal && h.put >= S.goal ? 'hit' : 'pos') : 'neg'" :style="{ width: Math.min(100, (Math.abs(h.put) / maxPut) * 100) + '%' }"></i></span>
        <b dir="ltr" :class="{ neg: h.put < 0 }">{{ h.put < 0 ? '−' : '' }}{{ fmt(Math.abs(h.put)) }}</b>
      </div>
    </section>
  </div>
</template>

<style scoped>
.acc .put { display: flex; flex-direction: column; gap: 2px; margin: 4px 0 8px }
.acc .put b { font-size: 26px; font-variant-numeric: tabular-nums }
.acc .put b small { font-size: 14px; font-weight: 500; opacity: .7 }
.track2 { height: 8px; background: var(--surface-2); border-radius: 99px; overflow: hidden; margin-bottom: 8px }
.track2 i { display: block; height: 100%; background: var(--accent); border-radius: 99px }
.cand { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 14px; cursor: pointer }
.cand:last-of-type { border-bottom: 0 }
.cand input { width: 20px; height: 20px; accent-color: var(--accent); flex: none; margin-top: 2px }
.goal label { display: flex; flex-direction: column; gap: 8px; font-weight: 500 }
.goal input { font: inherit; font-size: 22px; font-weight: 700; text-align: center; padding: 12px; border-radius: 14px; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); outline: none; font-variant-numeric: tabular-nums }
.goal input:focus { border-color: var(--accent) }
.goal input::placeholder { font-size: 15px; font-weight: 400 }
.goal small { display: block; margin-top: 8px; text-align: center }
.hint { text-align: center; margin: 4px 16px 14px; line-height: 1.7 }
.hero2 { color: #fff; border-radius: 22px; padding: 18px; margin-bottom: 12px }
.hero2.ok { background: linear-gradient(145deg, #0f766e, #115e59) }
.hero2.bad { background: linear-gradient(145deg, #b45309, #92400e) }
.hero2 .lbl { display: block; font-size: 12.5px; opacity: .85 }
.hero2 > b { display: block; font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 2px 0 }
.hero2 small { font-size: 14px; opacity: .85; font-weight: 500 }
.track { height: 8px; background: rgba(255,255,255,.22); border-radius: 99px; overflow: hidden; margin-top: 10px }
.track i { display: block; height: 100%; background: #fff; border-radius: 99px }
.split { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.2) }
.split b { font-size: 17px; font-variant-numeric: tabular-nums }
h2 { font-size: 15.5px; margin: 0 0 10px }
.hrow { display: flex; align-items: center; gap: 10px; padding: 7px 0; font-size: 13.5px }
.hrow .m { width: 58px; flex: none; color: var(--ink-2) }
.bar { flex: 1; height: 10px; background: var(--surface-2); border-radius: 99px; overflow: hidden }
.bar i { display: block; height: 100%; border-radius: 99px }
.bar i.pos { background: var(--accent) } .bar i.hit { background: var(--good) } .bar i.neg { background: var(--bad) }
.hrow b { width: 64px; text-align: left; font-variant-numeric: tabular-nums }
.hrow b.neg { color: var(--bad) }
.foot { margin: 8px 0 0 }
.linkcard { display: flex; align-items: center; gap: 12px; width: 100%; text-align: right; font: inherit; color: inherit; cursor: pointer; font-size: 20px }
.linkcard span:nth-child(1) { flex: 1; font-size: 14px }
</style>
