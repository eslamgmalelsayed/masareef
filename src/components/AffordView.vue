<script setup>
import { computed, ref, onMounted } from 'vue'
import { affordCheck, affordToFund } from '../lib/extras.js'
import { showToast } from '../lib/toast.js'
import { fmt } from '../lib/format.js'

const emit = defineEmits(['back', 'go'])
const price = ref('')
const name = ref('')
const inp = ref(null)
onMounted(() => setTimeout(() => inp.value?.focus(), 250))
const r = computed(() => (Number(price.value) > 0 ? affordCheck(price.value) : null))
const ICON = { ok: '✅', tight: '⚠️', over: '🔴', none: 'ℹ️' }
const eqTxt = (d) => (d < 1 ? 'أقل من صرف يوم' : d < 1.5 ? 'صرف يوم تقريبًا' : `صرف ${Math.round(d)} أيام`)
function toFund() {
  affordToFund(name.value.trim(), r.value.price, r.value.fund.months)
  showToast(`🗂️ اتعمل صندوق — حط ${fmt(r.value.fund.per)} كل شهر`)
  emit('go', 'funds')
}
</script>

<template>
  <div class="view">
    <header class="hd sub">
      <button class="back" @click="emit('back')">→</button>
      <h1>أقدر أشتريها؟</h1>
      <span style="width: 38px"></span>
    </header>

    <section class="card ask">
      <label class="big"><input ref="inp" v-model="price" type="number" inputmode="decimal" placeholder="0" /><span>ر.س</span></label>
      <input v-model="name" class="nm" placeholder="إيه هي؟ (اختياري)" />
    </section>

    <template v-if="r">
      <section class="card res" :class="r.level">
        <b class="t">{{ ICON[r.level] }} {{ r.title }}</b>
        <template v-if="r.level !== 'none'">
          <div class="rows">
            <div><span>تقدر تصرف في اليوم دلوقتي</span><b>{{ fmt(r.perNow) }}</b></div>
            <div><span>بعد ما تشتريها</span><b :class="r.level">{{ fmt(r.perAfter) }}</b></div>
            <div><span>لحد الراتب</span><b>{{ r.days }} يوم</b></div>
          </div>
          <p v-if="r.eqDays" class="muted xs eq">💡 تمنها = {{ eqTxt(r.eqDays) }} من صرفك العادي</p>
        </template>
        <button v-else class="link" @click="emit('go', 'limits')">حدد الحد ‹</button>
      </section>

      <section v-if="r.level === 'over' || r.level === 'tight'" class="card tips">
        <h2>بدل كده</h2>
        <div v-if="r.salaryIn" class="tip"><span>📅</span><div><b>استنى الراتب الجاي</b><small class="muted">بعد {{ r.salaryIn }} يوم — وتبقى من حد الشهر الجاي</small></div></div>
        <button class="tip act" @click="toFund"><span>🗂️</span><div><b>اعملها صندوق</b><small class="muted">حط {{ fmt(r.fund.per) }} كل شهر لمدة {{ r.fund.months }} شهور وتشتريها كاش</small></div><i>‹</i></button>
      </section>
    </template>
    <p v-else class="muted sm intro">اكتب سعر الحاجة، وأقولك في ثانية لو تقدر تشتريها من غير ما تعدّي حدك — محسوبة من اللي فاضلك والأقساط والصناديق اللي جاية قبل الراتب.</p>
  </div>
</template>

<style scoped>
.intro { margin: 4px 6px; line-height: 1.7 }
.ask { padding: 18px 16px 14px }
.big { display: flex; align-items: baseline; justify-content: center; gap: 8px }
.big input { width: 70%; border: 0; background: none; font: inherit; font-size: 40px; font-weight: 700; text-align: center; color: var(--ink); outline: none; font-variant-numeric: tabular-nums }
.big input::-webkit-outer-spin-button, .big input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0 }
.big input { -moz-appearance: textfield }
.big span { color: var(--ink-3); font-size: 16px }
.nm { width: 100%; box-sizing: border-box; margin-top: 10px; font: inherit; font-size: 14.5px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); outline: none; text-align: center }
.res .t { display: block; font-size: 17px; margin-bottom: 10px }
.res.ok { border-color: color-mix(in srgb, var(--good) 45%, var(--line)); background: color-mix(in srgb, var(--good) 7%, var(--surface)) }
.res.tight { border-color: #f59e0b; background: color-mix(in srgb, #f59e0b 8%, var(--surface)) }
.res.over { border-color: var(--bad); background: color-mix(in srgb, var(--bad) 7%, var(--surface)) }
.rows > div { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 14px }
.rows > div:last-child { border-bottom: 0 }
.rows b { font-variant-numeric: tabular-nums }
.rows b.over { color: var(--bad) } .rows b.tight { color: #b45309 } .rows b.ok { color: var(--good) }
.eq { margin: 8px 0 0 }
.tips h2 { margin-bottom: 6px }
.tip { display: flex; align-items: center; gap: 12px; padding: 10px 0; width: 100%; border: 0; border-top: 1px solid var(--line); background: none; font: inherit; color: inherit; text-align: right }
.tip:first-of-type { border-top: 0 }
.tip > span { font-size: 22px }
.tip div { flex: 1; display: flex; flex-direction: column; gap: 2px }
.tip small { font-size: 12.5px }
.tip.act { cursor: pointer }
.tip i { font-style: normal; color: var(--accent); font-size: 18px }
</style>
