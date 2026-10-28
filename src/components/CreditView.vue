<script setup>
import BottomSheet from './BottomSheet.vue'
import { ask } from '../lib/dialog.js'
import { computed, ref, watch } from 'vue'
import { creditCards, utilLevel, saveCardSettings, addManualCard, removeCard } from '../lib/credit.js'
import { CAT, merchantKey } from '../lib/categories.js'
import { fmt, fmt2, fmtDate } from '../lib/format.js'
import BarChart from './BarChart.vue'
import TxRow from './TxRow.vue'

const props = defineProps({ initial: String })
const emit = defineEmits(['back', 'open', 'go'])
const sel = ref(props.initial || '')
const cards = computed(() => creditCards.value)
watch(cards, (c) => { if (!c.find((x) => x.key === sel.value) && c.length) sel.value = c[0].key }, { immediate: true })
const c = computed(() => cards.value.find((x) => x.key === sel.value))

const editing = ref(false)
const form = ref({})
function openEdit() {
  const x = c.value
  form.value = { name: x.name, limit: x.limitIsInferred ? '' : x.limit || '', stmtDay: x.stmtDay || '', dueDay: x.dueDay || '', alertPct: x.alertPct, minAvail: x.minAvail || '', balType: 'owed', bal: '' }
  editing.value = true
}
function saveEdit() {
  const f = form.value
  const patch = { name: f.name === `${c.value.bank} ••${c.value.card}` ? '' : f.name, limit: Number(f.limit) || '', stmtDay: Number(f.stmtDay) || '', dueDay: Number(f.dueDay) || '', alertPct: f.alertPct === 80 ? '' : f.alertPct, minAvail: Number(f.minAvail) || '' }
  if (f.bal !== '' && f.bal != null) patch.manual = { type: f.balType, v: Number(f.bal), ts: Date.now() }
  saveCardSettings(c.value.key, patch)
  editing.value = false
}

const adding = ref(false)
const nf = ref({ name: '', bank: '', card: '', limit: '', owed: '', dueDay: '' })
function addCard() {
  if (!nf.value.name && !nf.value.card) return
  sel.value = addManualCard(nf.value)
  adding.value = false
  nf.value = { name: '', bank: '', card: '', limit: '', owed: '', dueDay: '' }
}
async function delCard() { if (await ask('تشيل البطاقة دي؟', { yes: 'شيلها', danger: true })) { removeCard(c.value.key); sel.value = '' } }

const chart = computed(() => {
  if (!c.value) return null
  const cs = getComputedStyle(document.documentElement)
  return {
    labels: c.value.months.map((m) => m.label),
    datasets: [
      { label: 'اتصرف', data: c.value.months.map((m) => m.spent), color: cs.getPropertyValue('--bad').trim() },
      { label: 'اتسدد', data: c.value.months.map((m) => m.paid), color: cs.getPropertyValue('--good').trim() },
    ],
  }
})
const SPEND = new Set(['purchase', 'bill', 'gov', 'fee', 'cash', 'ccxfer'])
const top = computed(() => {
  if (!c.value) return { merchants: [], cats: [] }
  const since = c.value.cur ? c.value.cur.from : new Date(Date.now() - 30 * 864e5)
  const rows = c.value.list.filter((t) => SPEND.has(t.k) && t.d >= since)
  const m = {}, k = {}
  for (const t of rows) {
    const key = merchantKey(t.m) || t.m
    ;(m[key] ||= { n: t.m, a: 0, cat: t.c }).a += t.a
    k[t.c] = (k[t.c] || 0) + t.a
  }
  return { since, merchants: Object.values(m).sort((a, b) => b.a - a.a).slice(0, 6), cats: Object.entries(k).sort((a, b) => b[1] - a[1]).slice(0, 5) }
})
const recent = computed(() => (c.value ? c.value.list.slice(0, 8) : []))
</script>

<template>
  <div class="view">
    <header class="hd">
      <button class="back" @click="emit('back')">→</button>
      <h1>البطاقات الائتمانية</h1>
      <button class="add" @click="adding = true">＋</button>
    </header>

    <div class="pills scroll" v-if="cards.length > 1">
      <button v-for="x in cards" :key="x.key" class="pill" :class="{ on: x.key === sel }" @click="sel = x.key">💳 {{ x.name }}</button>
    </div>

    <p v-if="!cards.length" class="muted" style="text-align: center; margin-top: 40px">ملقتش بطاقات ائتمانية في الرسايل — تقدر تضيف بطاقة بإيدك من ＋</p>

    <template v-if="c">
      <!-- كارت البطاقة -->
      <section class="plastic" :class="utilLevel(c.util)">
        <div class="pt"><span>{{ c.name }}</span><span class="chip">••{{ c.card }}</span></div>
        <div class="lbl">المستحق دلوقتي</div>
        <div class="big">{{ c.outstanding == null ? '—' : fmt(Math.max(0, c.outstanding)) }}<small> {{ $money.sym }}</small></div>
        <div v-if="c.outstanding != null && c.outstanding < 0" class="xs credit">عندك رصيد دائن {{ fmt(-c.outstanding) }} {{ $money.sym }}</div>
        <template v-if="c.limit">
          <div class="track"><i :style="{ width: Math.min(100, (c.util || 0) * 100) + '%' }"></i></div>
          <div class="row"><span>{{ Math.round((c.util || 0) * 100) }}٪ من الحد</span><span>الحد {{ fmt(c.limit) }}{{ c.limitIsInferred ? ' (تقديري)' : '' }}</span></div>
        </template>
        <button v-if="!c.limit || c.limitIsInferred" class="setlim" @click="openEdit">{{ c.limit ? 'الحد ده تقديري — اكتب الحد الحقيقي' : 'اكتب الحد الائتماني للبطاقة' }} ←</button>
        <div class="row foot">
          <span v-if="c.base && c.base.src === 'manual'">✍️ رصيد كتبته {{ fmtDate(c.base.ts, { day: 'numeric', month: 'short' }) }}</span>
          <span v-else-if="c.avail">المتاح {{ fmt(c.avail.v) }} · {{ fmtDate(c.avail.ts, { day: 'numeric', month: 'short' }) }}</span>
          <span v-else>مفيش رصيد في الرسايل — اكتبه بإيدك</span>
          <button class="lnk" @click="openEdit">✏️ تعديل</button>
        </div>
      </section>

      <!-- ميعاد السداد -->
      <section class="card due" :class="{ soon: c.daysToDue != null && c.daysToDue <= 3 }">
        <template v-if="c.nextDue">
          <div class="dd"><b>{{ c.daysToDue === 0 ? 'النهارده آخر يوم للسداد!' : `السداد بعد ${c.daysToDue} يوم` }}</b><span class="muted sm">{{ fmtDate(c.nextDue, { weekday: 'long', day: 'numeric', month: 'long' }) }}</span></div>
          <div class="muted xs">🔔 هيجيلك تذكير قبلها بـ ٣ أيام وفي يومها</div>
        </template>
        <template v-else>
          <div class="dd"><b>حدد ميعاد السداد</b><span class="muted sm" v-if="c.usualPayDay">انت بتسدد عادةً يوم {{ c.usualPayDay }}</span></div>
          <button class="btn sm" @click="openEdit(); form.dueDay = c.usualPayDay || ''">حدده وفعّل التذكير</button>
        </template>
      </section>

      <!-- الكشف -->
      <section class="card" v-if="c.cur">
        <h2>الكشف</h2>
        <div class="stm">
          <div><small class="muted">من {{ fmtDate(c.cur.from, { day: 'numeric', month: 'short' }) }} لحد النهارده</small><b>{{ fmt(c.cur.spent) }}</b></div>
          <div><small class="muted">الكشف اللي فات</small><b>{{ fmt(c.prev.spent) }}</b></div>
          <div><small class="muted">اتسدد من بعده</small><b :class="c.prev.paid >= c.prev.spent ? 'good' : 'bad'">{{ fmt(c.prev.paid) }}</b></div>
        </div>
      </section>
      <button v-else class="card setstm" @click="openEdit">📄 حدد يوم الكشف علشان تشوف صرفك من آخر كشف ←</button>

      <section class="card" v-if="c.fxYear">
        <div class="row-b"><h2>🌍 رسوم العملات الأجنبية</h2><b>{{ fmt2(c.fxYear) }} {{ $money.sym }}</b></div>
        <div class="muted sm">على {{ c.fxCount }} عملية بعملة أجنبية في آخر سنة (اشتراكات ومواقع برّه)</div>
      </section>

      <section class="card" v-if="chart">
        <h2>آخر ٦ شهور</h2>
        <BarChart :labels="chart.labels" :datasets="chart.datasets" legend :height="190" />
      </section>

      <section class="card" v-if="top.merchants.length">
        <h2>أكتر حاجات على البطاقة</h2>
        <div class="muted xs" style="margin-bottom: 6px">من {{ fmtDate(top.since, { day: 'numeric', month: 'short' }) }}</div>
        <div v-for="m in top.merchants" :key="m.n" class="mrow"><span class="dot" :style="{ background: CAT[m.cat].color }"></span><span class="mn">{{ m.n }}</span><span class="ma">{{ fmt(m.a) }}</span></div>
      </section>

      <section class="card" v-if="recent.length">
        <div class="row-b"><h2>آخر العمليات</h2><button class="link" @click="emit('go', 'tx', '', null, c.bank)">الكل ←</button></div>
        <TxRow v-for="t in recent" :key="t.id" :t="t" @open="emit('open', t)" />
      </section>
    </template>

    <!-- تعديل البطاقة -->
    <BottomSheet v-if="editing" :title="'تعديل ' + c.name" @close="editing = false">
        <label class="fld"><span>اسم البطاقة</span><input v-model="form.name" /></label>
        <label class="fld"><span>الحد الائتماني (أقصى رصيد للبطاقة)</span><input v-model="form.limit" type="number" inputmode="numeric" :placeholder="c.inferred ? 'تقديري: ' + fmt(c.inferred) : 'مثلًا 30000'" /></label>
        <div class="two">
          <label class="fld"><span>يوم الكشف</span><input v-model="form.stmtDay" type="number" inputmode="numeric" min="1" max="31" placeholder="مثلًا 1" /></label>
          <label class="fld"><span>آخر يوم للسداد</span><input v-model="form.dueDay" type="number" inputmode="numeric" min="1" max="31" :placeholder="c.usualPayDay ? 'عادةً ' + c.usualPayDay : 'مثلًا 27'" /></label>
        </div>
        <div class="fld">
          <span>نبهني لما استخدام البطاقة يوصل</span>
          <div class="seg pcts"><button v-for="p in [50, 60, 70, 80, 90, 0]" :key="p" :class="{ on: form.alertPct === p }" @click="form.alertPct = p">{{ p ? p + '٪' : 'مقفول' }}</button></div>
          <small class="muted" v-if="form.alertPct && (Number(form.limit) || c.limit)">يعني لما المستحق يعدّي {{ fmt((Number(form.limit) || c.limit) * form.alertPct / 100) }} {{ $money.sym }} — حتى والتطبيق مقفول</small>
          <div class="minav"><span>أو لما المتاح يقل عن</span><input v-model="form.minAvail" type="number" inputmode="numeric" placeholder="مثلًا 2000" /><span>{{ $money.sym }}</span></div>
        </div>
        <div class="fld">
          <span>الرصيد دلوقتي (من تطبيق البنك) — اختياري</span>
          <div class="seg"><button :class="{ on: form.balType === 'owed' }" @click="form.balType = 'owed'">المستحق عليّا</button><button :class="{ on: form.balType === 'avail' }" @click="form.balType = 'avail'">المتاح</button></div>
          <input v-model="form.bal" type="number" inputmode="decimal" placeholder="اكتب الرقم زي ما هو في تطبيق البنك" />
          <small class="muted">هيتحسب من اللحظة دي، وأي شراء أو سداد بعدها بيتضاف عليه لوحده</small>
        </div>
        <button class="save" @click="saveEdit">حفظ</button>
        <button v-if="c.added" class="del" @click="delCard(); editing = false">شيل البطاقة</button>
      </BottomSheet>

    <!-- إضافة بطاقة بإيدك -->
    <BottomSheet v-if="adding" title="إضافة بطاقة ائتمانية" @close="adding = false">
        <p class="muted sm">لبطاقة البنك بتاعها مش بيبعت رسايل، أو بنك مش مدعوم.</p>
        <label class="fld"><span>اسم البطاقة</span><input v-model="nf.name" placeholder="مثلًا: فيزا الأهلي" /></label>
        <div class="two">
          <label class="fld"><span>البنك</span><input v-model="nf.bank" placeholder="الأهلي" /></label>
          <label class="fld"><span>آخر ٤ أرقام</span><input v-model="nf.card" inputmode="numeric" maxlength="4" /></label>
        </div>
        <div class="two">
          <label class="fld"><span>الحد</span><input v-model="nf.limit" type="number" inputmode="numeric" /></label>
          <label class="fld"><span>المستحق دلوقتي</span><input v-model="nf.owed" type="number" inputmode="decimal" /></label>
        </div>
        <label class="fld"><span>آخر يوم للسداد</span><input v-model="nf.dueDay" type="number" inputmode="numeric" min="1" max="31" /></label>
        <button class="save" @click="addCard">أضف البطاقة</button>
      </BottomSheet>
  </div>
</template>

<style scoped>
.hd { align-items: center }
.back, .add { width: 38px; height: 38px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font-size: 18px; cursor: pointer }
.plastic { border-radius: 22px; padding: 18px; color: #fff; background: linear-gradient(135deg, #1e293b, #0f172a); margin-bottom: 12px; position: relative; overflow: hidden }
.plastic::after { content: ''; position: absolute; width: 220px; height: 220px; border-radius: 50%; background: rgba(255,255,255,.06); top: -90px; left: -60px }
.plastic.ok { background: linear-gradient(135deg, #0f766e, #134e4a) }
.plastic.warn { background: linear-gradient(135deg, #b45309, #78350f) }
.plastic.over { background: linear-gradient(135deg, #dc2626, #7f1d1d) }
.pt { display: flex; justify-content: space-between; font-size: 14px; font-weight: 600 }
.chip { background: rgba(255,255,255,.18); border-radius: 8px; padding: 1px 8px; font-variant-numeric: tabular-nums }
.lbl { font-size: 12.5px; opacity: .8; margin-top: 14px }
.big { font-size: 36px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.2 }
.big small { font-size: 15px; opacity: .75; font-weight: 500 }
.credit { opacity: .9 }
.track { height: 8px; background: rgba(255,255,255,.2); border-radius: 99px; overflow: hidden; margin-top: 12px }
.track i { display: block; height: 100%; background: #fff; border-radius: 99px }
.row { display: flex; justify-content: space-between; gap: 8px; font-size: 12.5px; opacity: .9; margin-top: 8px; position: relative; z-index: 1 }
.foot { padding-top: 10px; margin-top: 12px; border-top: 1px solid rgba(255,255,255,.18) }
.setlim { display: block; width: 100%; margin-top: 10px; background: rgba(255,255,255,.16); border: 1px dashed rgba(255,255,255,.5); color: #fff; font: inherit; font-size: 13px; padding: 8px; border-radius: 12px; cursor: pointer; position: relative; z-index: 1 }
.lnk { background: rgba(255,255,255,.18); border: 0; color: #fff; font: inherit; font-size: 12.5px; padding: 3px 10px; border-radius: 99px; cursor: pointer }
.due .dd { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap }
.due.soon { border-color: var(--bad); background: color-mix(in srgb, var(--bad) 8%, var(--surface)) }
.due .btn { margin-top: 10px; width: 100%; padding: 11px; border-radius: 12px; border: 0; background: var(--accent); color: #fff; font: inherit; font-weight: 600 }
.setstm { width: 100%; text-align: right; font: inherit; color: var(--ink); cursor: pointer; font-size: 14px }
.stm { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 8px }
.stm > div { background: var(--surface-2); border-radius: 12px; padding: 10px 8px; display: flex; flex-direction: column; gap: 2px }
.stm b { font-size: 17px; font-variant-numeric: tabular-nums }
.good { color: var(--good) } .bad { color: var(--bad) }
.mrow { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 14px }
.mrow:last-child { border-bottom: 0 }
.dot { width: 8px; height: 8px; border-radius: 3px; flex: none }
.mn { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.ma { font-weight: 600; font-variant-numeric: tabular-nums }
.scrim { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 60; display: flex; align-items: flex-end }
.sheet { background: var(--bg); width: 100%; max-width: 560px; margin: 0 auto; max-height: 92vh; overflow-y: auto; border-radius: 24px 24px 0 0; padding: 10px 16px calc(20px + env(safe-area-inset-bottom)) }
.grab { width: 40px; height: 4px; border-radius: 9px; background: var(--line); margin: 0 auto 12px }
.fld { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; font-size: 13px; color: var(--ink-2) }
.fld input { font: inherit; font-size: 15px; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; outline: none; width: 100%; min-width: 0 }
.fld input:focus { border-color: var(--accent) }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px }
.seg { display: grid; grid-template-columns: 1fr 1fr; background: var(--surface-2); border-radius: 12px; padding: 3px }
.seg button { border: 0; background: none; font: inherit; font-size: 13px; padding: 8px; border-radius: 10px; color: var(--ink-2) }
.seg button.on { background: var(--surface); color: var(--ink); font-weight: 600 }
.save { width: 100%; margin-top: 16px; padding: 13px; border-radius: 14px; border: 0; background: var(--accent); color: #fff; font: inherit; font-weight: 600 }
.del { width: 100%; margin-top: 8px; padding: 11px; border-radius: 14px; border: 1px solid var(--line); background: none; color: var(--bad); font: inherit }
.seg.pcts { grid-template-columns: repeat(6, 1fr) }
.seg.pcts button { padding-inline: 2px; font-size: 13px; font-variant-numeric: tabular-nums }
.minav { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink-2); margin-top: 6px }
.minav input { width: 110px; flex: none; text-align: center }
</style>
