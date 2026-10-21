<script setup>
import { computed, ref } from 'vue'
import { allTx } from '../lib/store.js'
import { fmt, fmtDate } from '../lib/format.js'
import DateRange from './DateRange.vue'
import { creditCards, utilLevel } from '../lib/credit.js'

const emit = defineEmits(['go'])
const range = ref(null)
const R = computed(() => range.value || { from: new Date(Date.now() - 30 * 864e5), to: new Date() })

const SPEND = new Set(['purchase', 'bill', 'gov', 'fee'])
const SHORT = { 'الراجحي': 'RJ', 'الأهلي': 'SNB', 'الإنماء': 'IN', 'STC Bank': 'stc', 'STC Pay': 'stc', urpay: 'ur', 'رسالة بنك': '🏦', 'يدوي': '✍️', 'كاش': '💵' }
const LOGO = { 'الراجحي': '#0f4c81', 'الأهلي': '#0b7a4b', 'الإنماء': '#7a5c1e', 'STC Bank': '#4f008c', 'STC Pay': '#4f008c', urpay: '#0e7490', 'رسالة بنك': '#64748b', 'يدوي': '#94a3b8', 'كاش': '#ca8a04' }

const banks = computed(() => {
  const by = {}
  const inR = (t) => t.d >= R.value.from && t.d <= R.value.to
  for (const t of allTx.value) {
    if (t.k === 'cashAdj') continue
    const b = (by[t.b] ||= { name: t.b, spend: 0, credit: 0, cash: 0, out: 0, ccpay: 0, ccxfer: 0, inc: 0, n: 0, bal: null, cards: {} })
    // آخر رصيد ظهر (بغض النظر عن الفترة)
    if (t.bal != null) {
      if (t.cc && t.card) {
        const c = (b.cards[t.card] ||= { card: t.card, spent: 0, paid: 0, n: 0 })
        if (!c.avail || t.ts > c.avail.ts) c.avail = { v: t.bal, ts: t.ts }
      } else if (!b.bal || t.ts > b.bal.ts) b.bal = { v: t.bal, ts: t.ts, card: t.card }
    }
    if (!inR(t)) continue
    b.n++
    if (SPEND.has(t.k) || t.k === 'manual') {
      b.spend += t.a
      if (t.cc) b.credit += t.a
    } else if (t.k === 'cash') b.cash += t.a
    else if (t.k === 'transfer' || t.k === 'intl') b.out += t.a
    else if (t.k === 'ccpay') b.ccpay += t.a
    else if (t.k === 'ccxfer') b.ccxfer += t.a
    else if (t.k === 'in' || t.k === 'salary') b.inc += t.a
    if (t.cc && t.card) {
      const c = (b.cards[t.card] ||= { card: t.card, spent: 0, paid: 0, n: 0 })
      c.n++
      if (t.k === 'ccpay') c.paid += t.a
      else if (SPEND.has(t.k) || t.k === 'ccxfer' || t.k === 'cash') c.spent += t.a
    }
  }
  // كل بطاقة ائتمانية معروفة (من الرسايل أو ضفتها بإيدك) تظهر تحت بنكها حتى لو مفيش عمليات في الفترة
  for (const cc of creditCards.value) {
    const b = (by[cc.bank] ||= { name: cc.bank, spend: 0, credit: 0, cash: 0, out: 0, ccpay: 0, ccxfer: 0, inc: 0, n: 0, bal: null, cards: {} })
    const c = (b.cards[cc.card] ||= { card: cc.card, spent: 0, paid: 0, n: 0 })
    c.info = cc
  }
  return Object.values(by)
    .map((b) => ({ ...b, cardList: Object.values(b.cards).filter((c) => c.n || c.info || (c.avail && c.avail.ts >= +R.value.from)), total: b.spend + b.cash + b.out }))
    .filter((b) => b.n || b.bal || b.cardList.length)
    .sort((a, b) => b.total - a.total)
})
const totals = computed(() => banks.value.reduce((s, b) => ({ spend: s.spend + b.spend, credit: s.credit + b.credit, cash: s.cash + b.cash, ccpay: s.ccpay + b.ccpay }), { spend: 0, credit: 0, cash: 0, ccpay: 0 }))
</script>

<template>
  <div class="view">
    <header class="hd"><h1>البنوك</h1></header>
    <DateRange v-model="range" />

    <section class="sum">
      <div><span class="muted xs">المصروفات</span><b>{{ fmt(totals.spend) }}</b></div>
      <div><span class="muted xs">منها بالكريدت</span><b>{{ fmt(totals.credit) }}</b></div>
      <div><span class="muted xs">سحب نقدي</span><b>{{ fmt(totals.cash) }}</b></div>
      <div><span class="muted xs">سداد الكريدت</span><b>{{ fmt(totals.ccpay) }}</b></div>
    </section>

    <section v-for="b in banks" :key="b.name" class="card bank">
      <button class="bh" @click="emit('go', 'tx', '', range, b.name)">
        <span class="logo" :style="{ background: LOGO[b.name] || '#475569' }">{{ SHORT[b.name] || b.name.slice(0, 2) }}</span>
        <span class="bn">
          <b>{{ b.name }}</b>
          <small class="muted" v-if="b.bal">آخر رصيد {{ fmt(b.bal.v) }} ر.س · {{ fmtDate(b.bal.ts, { day: 'numeric', month: 'short' }) }}</small>
          <small class="muted" v-else>{{ b.n }} عملية في الفترة</small>
        </span>
        <span class="muted">←</span>
      </button>

      <div class="grid">
        <div class="cell"><span>🛒 مصروفات</span><b>{{ fmt(b.spend) }}</b><small v-if="b.credit" class="muted">منها {{ fmt(b.credit) }} كريدت</small></div>
        <div class="cell"><span>💵 سحب نقدي</span><b>{{ fmt(b.cash) }}</b></div>
        <div class="cell"><span>↗️ تحويلات صادرة</span><b>{{ fmt(b.out) }}</b></div>
        <div class="cell"><span>↙️ وارد</span><b class="good">{{ fmt(b.inc) }}</b></div>
        <div class="cell" v-if="b.ccpay"><span>💳 سداد الكريدت</span><b>{{ fmt(b.ccpay) }}</b></div>
        <div class="cell" v-if="b.ccxfer"><span>🔁 سداد بطاقة تانية بالكريدت</span><b>{{ fmt(b.ccxfer) }}</b></div>
      </div>

      <div v-for="c in b.cardList" :key="c.card" class="cc" @click="emit('go', 'credit', b.name + '|' + c.card)">
        <div class="cct"><span>💳 {{ c.info ? c.info.name : 'بطاقة ائتمانية ••' + c.card }} <span class="muted xs">تفاصيل ←</span></span><span v-if="c.avail" class="muted xs">المتاح {{ fmt(c.avail.v) }} · {{ fmtDate(c.avail.ts, { day: 'numeric', month: 'short' }) }}</span></div>
        <div v-if="c.info && c.info.outstanding != null" class="ccs">
          <div class="ccsr">
            <span>المستحق <b :class="utilLevel(c.info.util)">{{ fmt(Math.max(0, c.info.outstanding)) }}</b><small class="muted" v-if="c.info.limit"> من {{ fmt(c.info.limit) }}{{ c.info.limitIsInferred ? ' (تقديري)' : '' }}</small></span>
            <span v-if="c.info.util != null" class="muted xs">{{ Math.round(c.info.util * 100) }}%</span>
          </div>
          <div v-if="c.info.util != null" class="bar"><i :class="utilLevel(c.info.util)" :style="{ width: Math.min(100, c.info.util * 100) + '%' }"></i></div>
        </div>
        <div v-if="c.info && c.info.nextDue" class="due xs" :class="{ soon: c.info.daysToDue <= 3 }">
          🗓️ السداد {{ c.info.daysToDue === 0 ? 'النهارده' : c.info.daysToDue === 1 ? 'بكرة' : 'بعد ' + c.info.daysToDue + ' يوم' }} · {{ fmtDate(c.info.nextDue, { day: 'numeric', month: 'short' }) }}
        </div>
        <div v-else-if="c.info && c.info.limitIsInferred" class="muted xs hint">اضغط واكتب الحد ويوم السداد علشان الأرقام تبقى مظبوطة</div>
        <div class="ccr">
          <div><small class="muted">اتصرف</small><b>{{ fmt(c.spent) }}</b></div>
          <div><small class="muted">اتسدد</small><b class="good">{{ fmt(c.paid) }}</b></div>
          <div><small class="muted">الفرق</small><b :class="c.spent - c.paid > 0 ? 'bad' : 'good'">{{ fmt(c.spent - c.paid) }}</b></div>
        </div>
      </div>
    </section>
    <p v-if="!banks.length" class="muted" style="text-align: center; margin-top: 40px">مفيش عمليات في الفترة دي</p>
    <p class="muted xs note">الأرقام من رسايل البنك. "آخر رصيد" و"المتاح" بيظهروا لو البنك بيكتبهم في الرسالة.</p>
  </div>
</template>

<style scoped>
.sum { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 12px }
.sum > div { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 10px 6px; text-align: center; display: flex; flex-direction: column; gap: 2px }
.sum b { font-size: 15px; font-variant-numeric: tabular-nums }
.bank { padding: 14px }
.bh { display: flex; align-items: center; gap: 12px; width: 100%; border: 0; background: none; font: inherit; color: inherit; text-align: right; padding: 0; cursor: pointer }
.logo { width: 42px; height: 42px; border-radius: 13px; display: grid; place-items: center; color: #fff; font-weight: 700; font-size: 13px; letter-spacing: .02em; flex: none }
.bn { flex: 1; display: flex; flex-direction: column }
.bn b { font-size: 16px }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px }
.cell { background: var(--surface-2); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; font-size: 12.5px; color: var(--ink-2) }
.cell b { font-size: 17px; color: var(--ink); font-variant-numeric: tabular-nums }
.cc { cursor: pointer; margin-top: 10px; border: 1px dashed var(--line); border-radius: 12px; padding: 10px 12px }
.cct { display: flex; justify-content: space-between; gap: 8px; font-size: 13.5px; font-weight: 500; flex-wrap: wrap }
.ccr { display: grid; grid-template-columns: repeat(3, 1fr); text-align: center; margin-top: 8px }
.ccr > div { display: flex; flex-direction: column }
.ccr b { font-variant-numeric: tabular-nums }
.good { color: var(--good) } .bad { color: var(--bad) }
.ccs { margin-top: 8px }
.ccsr { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px }
.ccsr b { font-size: 16px; font-variant-numeric: tabular-nums }
.bar { height: 6px; border-radius: 4px; background: var(--bar-dim); margin-top: 6px; overflow: hidden }
.bar i { display: block; height: 100%; border-radius: 4px; background: var(--good) }
.bar i.warn, b.warn { background: #d97706 } b.warn { background: none; color: #d97706 }
.bar i.over { background: var(--bad) } b.over { color: var(--bad) } b.ok { color: var(--good) }
.due { margin-top: 8px; color: var(--ink-2) } .due.soon { color: var(--bad); font-weight: 600 }
.hint { margin-top: 6px }
.note { text-align: center; margin: 14px 20px }
</style>
