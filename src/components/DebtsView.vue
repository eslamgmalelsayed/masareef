<script setup>
import BottomSheet from './BottomSheet.vue'
import { ask, choose } from '../lib/dialog.js'
import { computed, ref } from 'vue'
import { owedOpen, lent, manualDebts, totals, simulate, saveDebt, deleteDebt, addPayment, removePayment, excludeDebt, nudgeText, autoLent, autoLentOn, setAutoLent, notLoan, ignorePerson, autoLentPay, autoLentUnpay, autoLentClose, setAutoLentRange, autoLentRange, lentPending } from '../lib/debts.js'
import LoanAsk from './LoanAsk.vue'
import { state, saveSettings } from '../lib/store.js'
import { savings } from '../lib/insights.js'
import { fmt, fmtDate, DAY } from '../lib/format.js'

const props = defineProps({ initial: String })
const emit = defineEmits(['back', 'go', 'open'])
const tab = ref(props.initial === 'lent' ? 'lent' : 'owe')
const askAll = ref(false)
const T = computed(() => totals.value)
const showDone = ref(false)
const party = ref('')

// ===== الخطة =====
const method = computed({ get: () => state.settings.debtMethod || 'snowball', set: (v) => { state.settings.debtMethod = v; saveSettings() } })
const suggestExtra = computed(() => Math.max(0, Math.floor((savings.value.avgSaved * 0.5) / 50) * 50))
const extra = computed({
  get: () => (state.settings.debtExtra === '' || state.settings.debtExtra == null ? suggestExtra.value : Number(state.settings.debtExtra)),
  set: (v) => { state.settings.debtExtra = Number(v); saveSettings() },
})
const maxExtra = computed(() => Math.max(1000, Math.ceil((savings.value.income || 5000) * 0.5 / 100) * 100))
const plan = computed(() => (owedOpen.value.length ? simulate(owedOpen.value, extra.value, method.value) : null))
const base = computed(() => (owedOpen.value.length ? simulate(owedOpen.value, 0, method.value, false) : null))
const monthName = (m) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + m); return d.toLocaleDateString('ar-EG-u-nu-latn', { month: 'long', year: 'numeric' }) }
const curve = computed(() => {
  if (!plan.value) return []
  const c = plan.value.curve, step = Math.max(1, Math.ceil(c.length / 18))
  const pts = c.filter((_, i) => i % step === 0)
  const mx = Math.max(1, ...pts)
  return pts.map((v) => (v / mx) * 100)
})
const ratioLvl = computed(() => (T.value.ratio == null ? '' : T.value.ratio < 0.33 ? 'ok' : T.value.ratio < 0.45 ? 'warn' : 'over'))
const anyEst = computed(() => owedOpen.value.some((d) => d.minEst))

// ===== إضافة / تعديل =====
const ed = ref(null)
const payV = ref('')
function openNew(type) { ed.value = { type, name: '', amount: '', monthly: '', dueDay: '', rate: '', match: '', remindDays: 30, isNew: true }; payV.value = '' }
function openEdit(d) {
  if (d.kind === 'card') return emit('go', 'credit', d.key)
  if (d.kind === 'bnpl') return emit('go', 'commit')
  const r = d.ref || d
  ed.value = { ...r, remindDays: r.remindDays ?? 30 }
  payV.value = ''
}
const cur = computed(() => (ed.value && !ed.value.isNew ? manualDebts.value.find((x) => x.id === ed.value.id) : null))
function saveEd() {
  const e = ed.value
  if (!e.name.trim() || !(Number(e.amount) > 0)) return
  const d = { type: e.type, name: e.name.trim(), amount: Number(e.amount), monthly: Number(e.monthly) || '', dueDay: Number(e.dueDay) || '', rate: Number(e.rate) || '', match: (e.match || '').trim(), remindDays: Number(e.remindDays) || 0, note: e.note || '' }
  if (!e.isNew) d.id = e.id
  saveDebt(d)
  ed.value = null
}
function pay() {
  const a = Number(payV.value)
  if (!(a > 0) || !cur.value) return
  const before = cur.value.left
  addPayment(cur.value.id, a)
  payV.value = ''
  if (a >= before - 0.5) { party.value = cur.value.name; ed.value = null; setTimeout(() => (party.value = ''), 3500) }
}
async function del() { if (await ask('تمسح الدين ده؟', { yes: 'امسح', danger: true })) { deleteDebt(ed.value.id); ed.value = null } }
function toggleClosed() { saveDebt({ id: ed.value.id, closed: !cur.value.closed }); ed.value = null }
function nudge(d) { window.open('https://wa.me/?text=' + encodeURIComponent(nudgeText(d)), '_blank') }
const ago = (ts) => {
  const d = Math.round((Date.now() - ts) / DAY)
  if (d < 1) return 'النهارده'
  if (d < 7) return d === 1 ? 'من امبارح' : d === 2 ? 'من يومين' : `من ${d} أيام`
  if (d < 45) { const w = Math.round(d / 7); return w === 1 ? 'من أسبوع' : w === 2 ? 'من أسبوعين' : `من ${w} أسابيع` }
  const m = Math.round(d / 30); return m === 1 ? 'من شهر' : m === 2 ? 'من شهرين' : `من ${m} شهور`
}
const doneOwe = computed(() => manualDebts.value.filter((d) => d.type === 'owe' && d.done))
// شيت السلفة التلقائية (تحويلات لشخص)
const au = ref(null)
const auPay = ref('')
const curAuto = computed(() => (au.value ? autoLent.value.find((d) => d.key === au.value) || null : null))
function openLent(d) { if (d.auto) { au.value = d.key; auPay.value = '' } else openEdit(d) }
function payAuto() { const v = Number(auPay.value); if (v > 0) { autoLentPay(au.value, v); auPay.value = '' } }
function closeAuto() { autoLentClose(au.value, true); au.value = null }
async function ignoreAuto() {
  const d = curAuto.value
  const v = await choose({ icon: '🤝', title: `تحويلاتك لـ ${d.name}`, text: 'هتتشال من الديون، ومش هسألك على تحويلاتك ليه تاني.', options: [
    { label: 'أيوه، كل تحويلاته', value: 'all', kind: 'primary' },
    ...(d.txs.length > 1 ? [{ label: `آخر حوالة بس (${fmt(d.txs[0].a)})`, value: 'one' }] : []),
    { label: 'إلغاء', value: null },
  ] })
  if (v === 'all') { ignorePerson(d.key); au.value = null }
  else if (v === 'one') notLoan(d.txs[0].id)
}
// "مش سلفة" على حوالة: الحوالة دي بس، ولا كل تحويلاته؟
async function notLoanAsk(t) {
  const d = curAuto.value
  const v = d && d.txs.length > 1 ? await choose({ icon: '🤝', title: 'مش سلفة', text: `${fmt(t.a)} ر.س لـ ${d.name}`, options: [
    { label: 'الحوالة دي بس', value: 'one', kind: 'primary' },
    { label: `كل تحويلاتي لـ ${d.name}`, value: 'all' },
    { label: 'إلغاء', value: null },
  ] }) : 'one'
  if (v === 'one') notLoan(t.id)
  else if (v === 'all') { ignorePerson(d.key); au.value = null }
}
const lentOpen = computed(() => lent.value.filter((d) => !d.done))
const lentDone = computed(() => lent.value.filter((d) => d.done))
</script>

<template>
  <div class="view">
    <header class="hd sub">
      <button class="back" @click="emit('back')">→</button>
      <h1>الديون</h1>
      <span style="width: 38px"></span>
    </header>

    <div class="seg top">
      <button :class="{ on: tab === 'owe' }" @click="tab = 'owe'">عليّا <b>{{ fmt(T.owed) }}</b></button>
      <button :class="{ on: tab === 'lent' }" @click="tab = 'lent'">ليّا <b>{{ fmt(T.lent) }}</b></button>
    </div>

    <div v-if="party" class="party">🎉 خلصت {{ party }}! الفلوس اللي كانت رايحة له هتروح للدين اللي بعده</div>

    <!-- ================= عليّا ================= -->
    <template v-if="tab === 'owe'">
      <section v-if="owedOpen.length" class="hero2">
        <span class="lbl">إجمالي اللي عليك</span>
        <b>{{ fmt(T.owed) }}<small> ر.س</small></b>
        <div class="split">
          <div><span class="lbl">أقساط / شهر</span><b>{{ fmt(T.min) }}</b></div>
          <div v-if="T.ratio != null"><span class="lbl">من دخلك</span><b class="ratio" :class="ratioLvl">{{ Math.round(T.ratio * 100) }}٪</b></div>
          <div v-if="plan && !plan.capped"><span class="lbl">هتخلص</span><b>{{ monthName(plan.months) }}</b></div>
        </div>
      </section>

      <section class="card">
        <div v-if="!owedOpen.length" class="empty"><b>🙌</b>مفيش ديون عليك — لو عليك قرض أو فلوس لحد ضيفها من تحت</div>
        <div v-for="d in owedOpen" :key="d.key" class="item" @click="openEdit(d)">
          <span class="ic">{{ d.kind === 'card' ? '💳' : d.kind === 'bnpl' ? '🛍️' : '💸' }}</span>
          <div class="mid">
            <div class="nm">{{ d.name.replace('💳 ', '') }}</div>
            <div class="bar" v-if="d.total > d.left"><i :style="{ width: Math.min(100, ((d.total - d.left) / d.total) * 100) + '%' }"></i></div>
            <div class="muted xs">
              <template v-if="d.min">قسط {{ fmt(d.min) }}/شهر{{ d.minEst ? ' (تقديري)' : '' }}</template>
              <template v-if="d.dueDay"> · يوم {{ d.dueDay }}</template>
              <template v-if="d.rate"> · فايدة {{ d.rate }}٪</template>
              <template v-if="d.kind !== 'manual'"> · تلقائي</template>
            </div>
          </div>
          <div class="amt"><b>{{ fmt(d.left) }}</b><small class="muted" v-if="d.total > d.left">من {{ fmt(d.total) }}</small></div>
          <button v-if="d.kind === 'card'" class="x" title="مش دين — بسددها كاملة" @click.stop="excludeDebt(d.key)">×</button>
        </div>
        <button class="addb" @click="openNew('owe')">＋ ضيف دين عليّا</button>
        <button v-if="doneOwe.length" class="link xs" @click="showDone = !showDone">🎉 ديون خلصتها ({{ doneOwe.length }})</button>
        <template v-if="showDone">
          <div v-for="d in doneOwe" :key="d.id" class="item done" @click="openEdit(d)">
            <span class="ic">✅</span><div class="mid"><div class="nm">{{ d.name }}</div></div><div class="amt"><b>{{ fmt(d.amount) }}</b></div>
          </div>
        </template>
      </section>

      <section v-if="plan" class="card">
        <h2>خطة السداد</h2>
        <div class="seg">
          <button :class="{ on: method === 'snowball' }" @click="method = 'snowball'">الأصغر الأول</button>
          <button :class="{ on: method === 'avalanche' }" @click="method = 'avalanche'">الأغلى فايدة الأول</button>
        </div>
        <p class="muted xs mhint">{{ method === 'snowball' ? 'بتقفل الديون الصغيرة بسرعة — بتحس إنك بتتقدم' : 'بتسدد اللي فايدته أعلى الأول — بتوفّر فلوس أكتر' }}</p>

        <label class="ex">
          <span>هدفع زيادة على الأقساط كل شهر</span>
          <b>{{ fmt(extra) }} ر.س</b>
        </label>
        <input class="range" type="range" min="0" :max="maxExtra" step="50" :value="extra" @input="(e) => (extra = e.target.value)" />
        <p class="muted xs" v-if="suggestExtra">المقترح {{ fmt(suggestExtra) }} = نص اللي بيفضل معاك عادةً من الراتب</p>

        <div class="res" :class="{ bad: plan.capped }">
          <template v-if="!plan.capped">
            <span>هتخلص كل ديونك في</span>
            <b>{{ monthName(plan.months) }}</b>
            <span class="muted sm">بعد {{ plan.months }} شهر<template v-if="base && base.months > plan.months"> — بدل {{ base.capped ? 'أكتر من ٣٠ سنة' : base.months + ' شهر' }} لو دفعت الأقساط بس</template></span>
            <span v-if="base && base.interest - plan.interest > 5" class="good sm">هتوفّر {{ fmt(base.interest - plan.interest) }} ر.س فوايد</span>
          </template>
          <template v-else><b>المبلغ ده مش كفاية يخلّص الديون</b><span class="muted sm">زوّد المبلغ الشهري أو راجع الأقساط</span></template>
        </div>

        <div class="curve"><i v-for="(h, i) in curve" :key="i" :style="{ height: Math.max(2, h) + '%' }"></i></div>
        <div class="clbl muted xs"><span>دلوقتي {{ fmt(T.owed) }}</span><span>{{ plan.capped ? '' : '٠ في ' + monthName(plan.months) }}</span></div>
        <div class="order">
          <div v-for="(d, i) in [...plan.debts].sort((a, b) => (a.end ?? 999) - (b.end ?? 999))" :key="d.key" class="orow">
            <span class="n">{{ i + 1 }}</span><span class="nm">{{ d.name.replace('💳 ', '') }}</span><span class="muted">{{ d.end ? monthName(d.end) : '—' }}</span>
          </div>
        </div>
        <p class="muted xs foot">
          الخطة حسابات تقريبية من أرقامك، مش نصيحة مالية.<template v-if="anyEst"> قسط الكريدت محسوب ٥٪ من المستحق.</template> أقساط تابي وتمارا ثابتة.
        </p>
      </section>
    </template>

    <!-- ================= ليّا ================= -->
    <template v-else>
      <section v-if="lentOpen.length" class="hero2 lentc">
        <span class="lbl">ليك عند الناس</span>
        <b>{{ fmt(T.lent) }}<small> ر.س</small></b>
        <span class="lbl">{{ lentOpen.length }} {{ lentOpen.length === 1 ? 'شخص' : 'أشخاص' }}</span>
      </section>
      <section class="card">
        <section v-if="lentPending.length" class="ask">
          <b class="askh">🤝 سلفة ولا لأ؟ <small class="muted">{{ lentPending.length }}</small></b>
          <small class="muted">تحويلات لأشخاص — اللي تقول عليها "أيوه" بس هي اللي تتحسب ليك</small>
          <LoanAsk v-for="p in (askAll ? lentPending : lentPending.slice(0, 5))" :key="p.tx.id" :p="p" flat @open="(t) => emit('open', t)" />
          <button v-if="lentPending.length > 5 && !askAll" class="link xs" @click="askAll = true">اعرض الكل ({{ lentPending.length }})</button>
        </section>
        <label class="autosw">
          <span><b>اسألني لما أحوّل لحد</b><br /><small class="muted">علشان تعرف مين مستلف منك — والتحويلات اللي بتتكرر كل شهر (زي الإيجار) مش هنسأل عليها</small></span>
          <input type="checkbox" :checked="autoLentOn" @change="(e) => setAutoLent(e.target.checked)" />
        </label>
        <div v-if="autoLentOn" class="range">
          <span class="muted xs">اسأل على التحويلات من</span>
          <div class="rseg"><button v-for="o in [[1, 'شهر'], [3, '٣ شهور'], [6, '٦ شهور'], [12, 'سنة'], [0, 'الكل']]" :key="o[0]" :class="{ on: autoLentRange === o[0] }" @click="setAutoLentRange(o[0])">{{ o[1] }}</button></div>
        </div>
        <div v-if="!lentOpen.length" class="empty"><b>🤝</b>محدش مستلف منك{{ autoLentOn ? ' — لما تحوّل لحد هنسألك' : '' }}</div>
        <div v-for="d in lentOpen" :key="d.id" class="item" @click="openLent(d)">
          <span class="ic av">{{ d.name.trim().charAt(0) }}</span>
          <div class="mid">
            <div class="nm">{{ d.name }}</div>
            <div class="bar" v-if="d.paid"><i :style="{ width: Math.min(100, (d.paid / d.amount) * 100) + '%' }"></i></div>
            <div class="muted xs">{{ ago(d.ts) }}<template v-if="d.auto"> · {{ d.txs.length }} {{ d.txs.length === 1 ? 'تحويل' : 'تحويلات' }}</template><template v-if="d.paid"> · رجّع {{ fmt(d.paid) }}</template></div>
          </div>
          <div class="amt"><b>{{ fmt(d.left) }}</b><small class="muted" v-if="d.paid">من {{ fmt(d.amount) }}</small></div>
          <button class="wa" title="فكّره على واتساب" @click.stop="nudge(d)">💬</button>
        </div>
        <button class="addb" @click="openNew('lent')">＋ حد مستلف مني</button>
        <button v-if="lentDone.length" class="link xs" @click="showDone = !showDone">✅ رجّعوا ({{ lentDone.length }})</button>
        <template v-if="showDone">
          <div v-for="d in lentDone" :key="d.id" class="item done" @click="openLent(d)">
            <span class="ic">✅</span><div class="mid"><div class="nm">{{ d.name }}</div></div><div class="amt"><b>{{ fmt(d.amount) }}</b></div>
          </div>
        </template>
      </section>
    </template>

    <!-- ================= شيت السلفة التلقائية ================= -->
    <BottomSheet v-if="curAuto" :title="curAuto.name" @close="au = null">
        <div class="state">
          <div><small class="muted">الباقي ليك</small><b>{{ fmt(curAuto.left) }}</b></div>
          <div><small class="muted">رجّع</small><b class="good">{{ fmt(curAuto.paid) }}</b></div>
        </div>
        <div class="payrow" v-if="!curAuto.done">
          <input v-model="auPay" type="number" inputmode="decimal" placeholder="رجّع كام؟" />
          <button @click="payAuto">سجّل</button>
          <button class="all" @click="closeAuto">رجّعهم كلهم</button>
        </div>
        <button v-else class="link" @click="autoLentClose(curAuto.key, false); au = null">افتحها تاني</button>

        <h3 class="sm">التحويلات</h3>
        <div class="pays">
          <div v-for="t in curAuto.txs" :key="t.id" class="prow">
            <span class="muted">{{ fmtDate(t.ts, { day: 'numeric', month: 'short', year: 'numeric' }) }} · {{ t.b }}</span>
            <b>{{ fmt(t.a) }}</b>
            <button class="notloan" @click="notLoanAsk(t)">مش سلفة</button>
          </div>
        </div>
        <template v-if="curAuto.pays.length">
          <h3 class="sm">رجّع</h3>
          <div class="pays">
            <div v-for="(p, i) in curAuto.pays" :key="i" class="prow">
              <span class="muted">{{ fmtDate(p.ts, { day: 'numeric', month: 'short', year: 'numeric' }) }}{{ p.auto ? ' · تحويل منه' : '' }}</span>
              <b class="good">{{ fmt(p.a) }}</b>
              <button v-if="!p.auto" class="x" @click="autoLentUnpay(curAuto.key, p.i)">×</button>
            </div>
          </div>
        </template>
        <div class="acts">
          <button class="link" @click="nudge(curAuto)">💬 فكّره على واتساب</button>
          <button class="link del" @click="ignoreAuto">تحويلاتي ليه مش سلف</button>
        </div>
      </BottomSheet>

    <!-- ================= شيت الإضافة / التعديل ================= -->
    <BottomSheet v-if="ed" :title="ed.isNew ? (ed.type === 'owe' ? 'دين عليّا' : 'حد مستلف مني') : ed.name" @close="ed = null">

        <template v-if="cur">
          <div class="state">
            <div><small class="muted">{{ ed.type === 'owe' ? 'الباقي عليك' : 'الباقي ليك' }}</small><b>{{ fmt(cur.left) }}</b></div>
            <div><small class="muted">{{ ed.type === 'owe' ? 'سددت' : 'رجّع' }}</small><b class="good">{{ fmt(cur.paid) }}</b></div>
          </div>
          <div class="payrow" v-if="!cur.done">
            <input v-model="payV" type="number" inputmode="decimal" :placeholder="ed.type === 'owe' ? 'دفعت كام؟' : 'رجّع كام؟'" />
            <button @click="pay">{{ ed.type === 'owe' ? 'سجّل دفعة' : 'سجّل' }}</button>
            <button class="all" @click="payV = Math.round(cur.left * 100) / 100; pay()">{{ ed.type === 'owe' ? 'خلّصته' : 'رجّعهم كلهم' }}</button>
          </div>
          <div v-if="cur.pays.length" class="pays">
            <div v-for="(p, i) in cur.pays.slice(0, 8)" :key="i" class="prow">
              <span class="muted">{{ fmtDate(p.ts, { day: 'numeric', month: 'short', year: 'numeric' }) }}{{ p.auto ? ' · تحويل تلقائي' : '' }}</span>
              <b>{{ fmt(p.a) }}</b>
              <button v-if="!p.auto" class="x" @click="removePayment(cur.id, p.i)">×</button>
            </div>
          </div>
          <h3 class="sm">التفاصيل</h3>
        </template>

        <label class="fld"><span>{{ ed.type === 'owe' ? 'اسم الدين' : 'اسم الشخص' }}</span><input v-model="ed.name" :placeholder="ed.type === 'owe' ? 'مثلًا قرض البنك، أحمد…' : 'مثلًا أحمد'" /></label>
        <label class="fld"><span>{{ ed.type === 'owe' ? (ed.isNew ? 'الباقي عليك دلوقتي' : 'المبلغ الأصلي') : 'المبلغ اللي سلّفته' }}</span><input v-model="ed.amount" type="number" inputmode="decimal" placeholder="0" /></label>
        <template v-if="ed.type === 'owe'">
          <div class="two">
            <label class="fld"><span>القسط الشهري</span><input v-model="ed.monthly" type="number" inputmode="decimal" placeholder="اختياري" /></label>
            <label class="fld"><span>يوم السداد</span><input v-model="ed.dueDay" type="number" inputmode="numeric" min="1" max="31" placeholder="اختياري" /></label>
          </div>
          <label class="fld"><span>الفايدة السنوية ٪ (لو فيه)</span><input v-model="ed.rate" type="number" inputmode="decimal" placeholder="مثلًا 12" /></label>
        </template>
        <template v-else>
          <div class="fld"><span>فكّرني بيه بعد</span>
            <div class="seg s4"><button v-for="o in [[14, 'أسبوعين'], [30, 'شهر'], [60, 'شهرين'], [0, 'لأ']]" :key="o[0]" :class="{ on: Number(ed.remindDays) === o[0] }" @click="ed.remindDays = o[0]">{{ o[1] }}</button></div>
          </div>
        </template>
        <label class="fld"><span>اسمه زي ما بيظهر في رسالة البنك (اختياري)</span><input v-model="ed.match" placeholder="مثلًا Ahmed" /><small class="muted xs">{{ ed.type === 'owe' ? 'أي تحويل ليه بعد كده بيتحسب دفعة لوحده' : 'أي تحويل جايلك منه بيتحسب إنه رجّع جزء' }}</small></label>

        <button class="save" @click="saveEd">حفظ</button>
        <div v-if="!ed.isNew" class="acts">
          <button class="link" @click="toggleClosed">{{ cur && cur.closed ? 'افتحه تاني' : 'اقفله (خلص)' }}</button>
          <button class="link del" @click="del">امسح</button>
        </div>
      </BottomSheet>
  </div>
</template>

<style scoped>
.seg { display: grid; grid-template-columns: 1fr 1fr; background: var(--surface-2); border-radius: 12px; padding: 3px }
.seg button { border: 0; background: none; font: inherit; font-size: 13.5px; padding: 8px; border-radius: 10px; color: var(--ink-2); cursor: pointer }
.seg button.on { background: var(--surface); color: var(--ink); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,.06) }
.seg.top { margin-bottom: 12px }
.seg.top b { font-variant-numeric: tabular-nums; margin-inline-start: 4px }
.seg.s4 { grid-template-columns: repeat(4, 1fr) }
.party { background: var(--accent-soft); color: var(--accent); border-radius: 14px; padding: 12px 14px; font-weight: 600; margin-bottom: 12px; text-align: center; animation: pop .4s }
@keyframes pop { from { transform: scale(.9); opacity: 0 } }
.hero2 { background: linear-gradient(145deg, #7c2d12, #9a3412); color: #fff; border-radius: 22px; padding: 18px; margin-bottom: 12px }
.hero2.lentc { background: var(--hero); color: var(--hero-ink) }
.hero2 .lbl { display: block; font-size: 12.5px; opacity: .85 }
.hero2 > b { display: block; font-size: 32px; font-weight: 700; font-variant-numeric: tabular-nums }
.hero2 small { font-size: 14px; opacity: .85; font-weight: 500 }
.split { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.2) }
.split b { font-size: 16px; font-variant-numeric: tabular-nums }
.ratio.ok { color: #bbf7d0 } .ratio.warn { color: #fde68a } .ratio.over { color: #fecaca }
h2 { font-size: 15.5px; margin: 0 0 10px }
.item { display: flex; align-items: center; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--line); cursor: pointer }
.item.done { opacity: .6 }
.ic { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; font-size: 18px; flex: none; background: var(--surface-2) }
.ic.av { border-radius: 50%; background: var(--accent-soft); color: var(--accent); font-weight: 700; font-size: 16px }
.mid { flex: 1; min-width: 0 }
.nm { font-size: 14.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; unicode-bidi: plaintext; text-align: right }
.bar { height: 5px; background: var(--surface-2); border-radius: 99px; overflow: hidden; margin: 5px 0 3px }
.bar i { display: block; height: 100%; background: var(--good); border-radius: 99px }
.amt { display: flex; flex-direction: column; align-items: flex-end }
.amt b { font-size: 16px; font-variant-numeric: tabular-nums }
.amt small { font-size: 11px }
.x, .wa { border: 0; background: none; color: var(--ink-3); font-size: 20px; padding: 0 2px; cursor: pointer }
.wa { font-size: 18px }
.addb { width: 100%; padding: 12px; border: 1px dashed var(--line); border-radius: 12px; background: none; color: var(--accent); font: inherit; font-weight: 500; cursor: pointer; margin: 10px 0 6px }
.mhint { margin: 6px 2px 12px }
.ex { display: flex; justify-content: space-between; align-items: baseline; font-size: 13.5px }
.ex b { font-size: 17px; font-variant-numeric: tabular-nums; color: var(--accent) }
.range { width: 100%; accent-color: var(--accent); margin: 8px 0 2px }
.res { background: var(--accent-soft); border-radius: 14px; padding: 14px; margin: 12px 0; display: flex; flex-direction: column; gap: 2px; text-align: center }
.res b { font-size: 20px; color: var(--accent) }
.res.bad { background: color-mix(in srgb, var(--bad) 10%, var(--surface)) } .res.bad b { color: var(--bad) }
.good { color: var(--good) }
.curve { display: flex; align-items: flex-end; gap: 3px; height: 60px; margin: 6px 0 10px }
.curve i { flex: 1; background: var(--accent); opacity: .7; border-radius: 3px 3px 1px 1px }
.clbl { display: flex; justify-content: space-between; margin: -4px 0 10px }
.order { display: flex; flex-direction: column }
.orow { display: flex; align-items: center; gap: 10px; padding: 7px 0; font-size: 13.5px; border-bottom: 1px solid var(--line) }
.orow:last-child { border-bottom: 0 }
.orow .n { width: 22px; height: 22px; border-radius: 50%; background: var(--surface-2); display: grid; place-items: center; font-size: 12px; flex: none }
.orow .nm { flex: 1; font-size: 13.5px }
.foot { margin: 10px 0 0; line-height: 1.6 }
.scrim { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 50; display: flex; align-items: flex-end }
.sheet { background: var(--bg); width: 100%; max-width: 560px; margin: 0 auto; max-height: 92vh; overflow-y: auto; border-radius: 24px 24px 0 0; padding: 10px 16px calc(20px + env(safe-area-inset-bottom)) }
.grab { width: 40px; height: 4px; border-radius: 9px; background: var(--line); margin: 0 auto 14px }
.fld { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; font-size: 13px; color: var(--ink-2) }
.fld input { font: inherit; font-size: 15px; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; outline: none; width: 100%; min-width: 0; box-sizing: border-box }
.fld input:focus { border-color: var(--accent) }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px }
.save { width: 100%; margin-top: 16px; padding: 13px; border-radius: 14px; border: 0; background: var(--accent); color: #fff; font: inherit; font-weight: 600; cursor: pointer }
.acts { display: flex; justify-content: space-between; margin-top: 12px }
.del { color: var(--bad) }
.state { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px }
.state > div { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px; display: flex; flex-direction: column }
.state b { font-size: 20px; font-variant-numeric: tabular-nums }
.payrow { display: flex; gap: 6px }
.payrow input { flex: 1; min-width: 0; font: inherit; font-size: 15px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); outline: none }
.payrow button { border: 0; border-radius: 12px; padding: 0 12px; background: var(--accent); color: #fff; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap }
.payrow .all { background: var(--accent-soft); color: var(--accent) }
.pays { margin-top: 8px; background: var(--surface); border-radius: 12px; padding: 2px 12px }
.prow { display: flex; align-items: center; gap: 8px; padding: 7px 0; font-size: 13px; border-bottom: 1px solid var(--line) }
.prow:last-child { border-bottom: 0 }
.prow span { flex: 1 }
.prow b { font-variant-numeric: tabular-nums }
h3.sm { margin: 16px 0 6px; font-size: 13.5px }
.ask { display: flex; flex-direction: column; gap: 2px; margin: -2px 0 12px; padding: 12px 14px 4px; border-radius: 14px; background: color-mix(in srgb, var(--accent) 6%, var(--surface)); border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--line)) }
.ask .askh { font-size: 14.5px }
.ask .la:last-of-type { border-bottom: 0 }
.ask .link { margin: 4px 0 8px; align-self: flex-start }
.autosw { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 0 10px; font-size: 13.5px }
.range { display: flex; align-items: center; gap: 8px; padding: 2px 0 10px; border-bottom: 1px solid var(--line) }
.rseg { flex: 1; display: grid; grid-template-columns: repeat(5, 1fr); background: var(--surface-2); border-radius: 10px; padding: 2px }
.rseg button { border: 0; background: none; font: inherit; font-size: 12px; padding: 6px 2px; border-radius: 8px; color: var(--ink-2); cursor: pointer; white-space: nowrap }
.rseg button.on { background: var(--surface); color: var(--ink); font-weight: 600 }
.autosw input { width: 20px; height: 20px; accent-color: var(--accent); flex: none }
.notloan { border: 1px solid var(--line); background: var(--surface-2); color: var(--ink-2); border-radius: 99px; padding: 3px 10px; font: inherit; font-size: 11.5px; cursor: pointer; white-space: nowrap }
</style>
