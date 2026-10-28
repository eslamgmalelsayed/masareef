<script setup>
import { computed } from 'vue'
import { zakat, saveZakat, assets } from '../lib/tools.js'
import { state } from '../lib/store.js'
import { fmt, fmtDate } from '../lib/format.js'

const emit = defineEmits(['back', 'go'])
const Z = computed(() => zakat.value)
const z = computed(() => state.settings.zakat || {})
const hawlStr = computed(() => (z.value.hawl ? new Date(z.value.hawl).toISOString().slice(0, 10) : ''))
function setHawl(e) { saveZakat({ hawl: e.target.value ? +new Date(e.target.value + 'T09:00:00') : null }) }
</script>

<template>
  <div class="view">
    <header class="hd sub">
      <button class="back" @click="emit('back')">→</button>
      <h1>الزكاة</h1>
      <span style="width: 38px"></span>
    </header>

    <section class="card">
      <label class="fld">
        <span>سعر جرام الدهب عيار ٢٤ النهارده ({{ $money.sym }})</span>
        <input type="number" inputmode="decimal" :value="z.gram || ''" placeholder="من أي محل دهب أو موقع" @change="(e) => saveZakat({ gram: Number(e.target.value) || '' })" />
        <small class="muted" v-if="Z.nisab">النصاب = ٨٥ جرام = {{ fmt(Z.nisab) }} {{ $money.sym }}</small>
      </label>
      <label class="fld">
        <span>من إمتى فلوسك وصلت النصاب (بداية الحول)</span>
        <input type="date" :value="hawlStr" @change="setHawl" />
        <small class="muted">الحول سنة هجرية (٣٥٤ يوم) — هنفكّرك بميعادها كل سنة</small>
      </label>
    </section>

    <section class="card">
      <h2>الحساب</h2>
      <div class="r"><span>رصيد البنوك</span><b>{{ fmt(Z.bank) }}</b></div>
      <div class="r"><span>ممتلكات عليها زكاة <button class="link xs" @click="emit('go', 'worth')">تعديل</button></span><b>{{ fmt(Z.extra) }}</b></div>
      <label class="r chk"><span><input type="checkbox" :checked="!!z.withLent" @change="(e) => saveZakat({ withLent: e.target.checked })" /> ضيف الفلوس اللي ليك عند الناس</span><b>{{ fmt(Z.recv) }}</b></label>
      <label class="r chk"><span><input type="checkbox" :checked="!!z.minusDebt" @change="(e) => saveZakat({ minusDebt: e.target.checked })" /> اطرح الديون اللي عليك</span><b>{{ Z.debt ? '−' + fmt(Z.debt) : '0' }}</b></label>
      <div class="r tot"><span>المال اللي عليه زكاة</span><b>{{ fmt(Z.base) }}</b></div>
    </section>

    <section class="hero2" v-if="Z.nisab">
      <template v-if="Z.reached">
        <span class="lbl">الزكاة (٢٫٥٪)</span>
        <b>{{ fmt(Z.amount) }}<small> {{ $money.sym }}</small></b>
        <span class="lbl" v-if="Z.due">ميعادها {{ fmtDate(Z.due, { day: 'numeric', month: 'long', year: 'numeric' }) }}</span>
      </template>
      <template v-else>
        <span class="lbl">فلوسك لسه أقل من النصاب</span>
        <b>{{ fmt(Z.nisab - Z.base) }}<small> {{ $money.sym }} فاضل</small></b>
      </template>
    </section>
    <p v-else class="muted sm hint">اكتب سعر جرام الدهب علشان نحسب النصاب والزكاة.</p>

    <p class="muted xs note">الحساب تقريبي ومبني على أرصدتك وقت الحساب. في التفاصيل (الدهب الملبوس، الاستثمارات، الديون) راجع أهل العلم.</p>
  </div>
</template>

<style scoped>
.fld { display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; color: var(--ink-2); margin-bottom: 12px }
.fld:last-child { margin-bottom: 0 }
.fld input { font: inherit; font-size: 15px; color: var(--ink); background: var(--surface-2); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; outline: none }
h2 { font-size: 15.5px; margin: 0 0 6px }
.r { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 14px }
.r b { font-variant-numeric: tabular-nums }
.r.chk span { display: flex; align-items: center; gap: 8px }
.r.chk input { width: 18px; height: 18px; accent-color: var(--accent) }
.r.tot { border-bottom: 0; font-weight: 600 }
.hero2 { background: var(--hero); color: var(--hero-ink); border-radius: 22px; padding: 18px; margin-bottom: 12px }
.hero2 .lbl { display: block; font-size: 12.5px; opacity: .85 }
.hero2 > b { display: block; font-size: 32px; font-weight: 700; font-variant-numeric: tabular-nums }
.hero2 small { font-size: 14px; opacity: .8; font-weight: 500 }
.hint, .note { text-align: center; margin: 6px 16px 14px; line-height: 1.7 }
</style>
