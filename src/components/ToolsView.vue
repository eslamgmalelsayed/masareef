<script setup>
import { computed } from 'vue'
import { commitments, transfers, savings, saveGoal } from '../lib/insights.js'
import { totals as debtTotals } from '../lib/debts.js'
import { funds, fundsNeedNow, remit, netWorth, zakat, activeEvent } from '../lib/tools.js'
import { creditCards } from '../lib/credit.js'
import { fmt, fmtDate } from '../lib/format.js'

const emit = defineEmits(['back', 'go'])
// كل أداة: أيقونة + اسم + سطر واحد حي من أرقامك
const tools = computed(() => [
  { id: 'commit', ic: '🔁', t: 'الالتزامات الشهرية', s: `${fmt(commitments.value.next30)} في الـ ٣٠ يوم الجايين` },
  { id: 'debts', ic: '💸', t: 'الديون', s: debtTotals.value.owed || debtTotals.value.lent ? `عليّا ${fmt(debtTotals.value.owed)} · ليّا ${fmt(debtTotals.value.lent)}` : 'سجّل اللي عليك واللي ليك' },
  { id: 'savings', ic: '🎯', t: 'هدف الادخار', s: saveGoal.value ? (savings.value.onTrack ? 'ماشي صح 👌' : 'متأخر شوية') : 'حدد هدف' },
  { id: 'funds', ic: '🗂️', t: 'صناديق المصاريف السنوية', s: funds.value.length ? `حط ${fmt(fundsNeedNow.value)} الراتب ده` : 'الإقامة، رحلة مصر، العيد…' },
  { id: 'transfers', ic: '🌍', t: 'الحوالات', s: remit.value.target ? `${fmt(remit.value.sent)} من ${fmt(remit.value.target)} الراتب ده` : `${fmt(transfers.value.cycle)} الراتب ده` },
  { id: 'worth', ic: '💰', t: 'صافي ثروتك', s: fmt(netWorth.value.net) + ' ر.س' },
  { id: 'zakat', ic: '🕌', t: 'الزكاة', s: zakat.value.due ? 'الجاية ' + fmtDate(zakat.value.due, { day: 'numeric', month: 'short' }) : 'احسبها وفكّرني بميعادها' },
  { id: 'events', ic: '✈️', t: 'السفر والمناسبات', s: activeEvent.value ? `${activeEvent.value.name} شغال` : 'رحلة، رمضان، العيد…' },
  { id: 'credit', ic: '💳', t: 'البطاقات الائتمانية', s: creditCards.value.length ? `${creditCards.value.length} بطاقة` : 'ضيف بطاقة' },
  { id: 'limits', ic: '🔔', t: 'الحدود والتنبيهات', s: 'يومي · أسبوعي · شهري · بنود' },
])
</script>

<template>
  <div class="view">
    <header class="hd sub">
      <button class="back" @click="emit('back')">→</button>
      <h1>أدوات الفلوس</h1>
      <span style="width: 38px"></span>
    </header>
    <div class="grid">
      <button v-for="x in tools" :key="x.id" class="tool" @click="emit('go', x.id)">
        <span class="ic">{{ x.ic }}</span>
        <b>{{ x.t }}</b>
        <small>{{ x.s }}</small>
      </button>
    </div>
  </div>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px }
.tool { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 14px; min-height: 112px; border-radius: 18px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font: inherit; text-align: right; cursor: pointer }
.tool:active { transform: scale(.98) }
.ic { font-size: 24px; margin-bottom: 4px }
.tool b { font-size: 14.5px; line-height: 1.35 }
.tool small { font-size: 12px; color: var(--ink-3); line-height: 1.45 }
</style>
