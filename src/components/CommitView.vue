<script setup>
import { computed, ref } from 'vue'
import { subscriptions, activePlans, bnplPlans, commitments, hideSubscription } from '../lib/insights.js'
import { nextSalaryDate } from '../lib/store.js'
import { CAT } from '../lib/categories.js'
import { fmt, fmtDate, DAY } from '../lib/format.js'

const emit = defineEmits(['back', 'open'])
const c = computed(() => commitments.value)
const showDone = ref(false)
const donePlans = computed(() => bnplPlans.value.filter((p) => p.done).slice(0, 12))

// "بكرة" / "بعد ٥ أيام" / "١٥ نوفمبر"
function when(ts) {
  const d = Math.round((new Date(ts).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / DAY)
  if (d <= 0) return 'النهارده'
  if (d === 1) return 'بكرة'
  if (d < 8) return `بعد ${d} أيام`
  return fmtDate(ts, { day: 'numeric', month: 'short' })
}
const subName = (s) => (/سداد فاتورة/.test(s.name) ? CAT[s.c]?.name || s.name : s.name)
</script>

<template>
  <div class="view">
    <header class="hd sub">
      <button class="back" @click="emit('back')">→</button>
      <h1>الالتزامات الشهرية</h1>
      <span style="width: 38px"></span>
    </header>

    <section class="hero2">
      <div>
        <span class="lbl">عليك في الـ ٣٠ يوم الجايين</span>
        <b>{{ fmt(c.next30) }}<small> ر.س</small></b>
      </div>
      <div class="split">
        <div v-if="nextSalaryDate"><span class="lbl">محجوز من الراتب الجاي</span><b>{{ fmt(c.nextSalary) }}</b></div>
        <div><span class="lbl">ثابت كل شهر</span><b>{{ fmt(c.subsMonthly) }}</b></div>
        <div><span class="lbl">باقي أقساط</span><b>{{ fmt(c.bnplLeft) }}</b></div>
      </div>
    </section>

    <section class="card" v-if="c.upcoming.length">
      <h2>الجاي</h2>
      <div v-for="(u, i) in c.upcoming.slice(0, 8)" :key="i" class="up">
        <span class="when" :class="{ soon: u.at - Date.now() < 3 * DAY }">{{ when(u.at) }}</span>
        <span class="nm">{{ u.kind === 'sub' ? subName(u.ref) : u.name }}</span>
        <b>{{ fmt(u.a) }}</b>
      </div>
    </section>

    <section class="card">
      <div class="row-b"><h2>🔁 الاشتراكات والفواتير الثابتة</h2></div>
      <div v-if="!subscriptions.length" class="empty"><b>🔍</b>ملقتش اشتراكات ثابتة — بتظهر هنا لما نفس المبلغ يتسحب من نفس المكان كل شهر أو كل سنة</div>
      <div v-for="s in subscriptions" :key="s.key" class="item">
        <span class="ic" :style="{ background: (CAT[s.c]?.color || '#888') + '1f' }">{{ CAT[s.c]?.icon || '🔁' }}</span>
        <div class="mid">
          <div class="nm">{{ subName(s) }}</div>
          <div class="muted xs">{{ s.period.label }} · الجاي {{ when(s.next) }}</div>
          <div v-if="s.change > 0" class="chg up">⬆ زاد {{ fmt(s.change) }} ر.س عن المرة اللي فاتت</div>
          <div v-else-if="s.change < 0" class="chg down">⬇ قلّ {{ fmt(-s.change) }} ر.س</div>
        </div>
        <div class="amt"><b>{{ fmt(s.amount) }}</b><small v-if="s.period.id !== 'monthly'" class="muted">≈ {{ fmt(s.monthly) }}/شهر</small></div>
        <button class="x" title="مش اشتراك" @click="hideSubscription(s.key)">×</button>
      </div>
      <p v-if="subscriptions.length" class="muted xs foot">لو حاجة مش اشتراك اضغط × وهتختفي.</p>
    </section>

    <section class="card">
      <div class="row-b"><h2>💳 أقساط تابي وتمارا</h2></div>
      <div v-if="!activePlans.length" class="empty"><b>✅</b>مفيش أقساط عليك دلوقتي</div>
      <div v-for="p in activePlans" :key="p.id" class="item plan">
        <span class="ic prov" :class="p.prov">{{ p.prov === 'tabby' ? 'tabby' : 'tamara' }}</span>
        <div class="mid">
          <div class="nm">{{ p.store }}</div>
          <div class="dots"><i v-for="k in p.n" :key="k" :class="{ on: k <= p.paid }"></i><span class="muted xs">{{ p.paid }} من {{ p.n }}</span></div>
          <div class="muted xs">القسط الجاي {{ when(p.next) }} · {{ fmt(p.inst) }} ر.س<template v-if="p.estimated"> (تقديري)</template></div>
        </div>
        <div class="amt"><b>{{ fmt(p.remaining) }}</b><small class="muted">باقي من {{ fmt(p.total) }}</small></div>
      </div>
      <button v-if="donePlans.length" class="link xs" @click="showDone = !showDone">{{ showDone ? 'اخفي' : 'اعرض' }} الأقساط اللي خلصت ({{ donePlans.length }})</button>
      <template v-if="showDone">
        <div v-for="p in donePlans" :key="p.id" class="item done">
          <span class="ic prov" :class="p.prov">{{ p.prov === 'tabby' ? 'tabby' : 'tamara' }}</span>
          <div class="mid"><div class="nm">{{ p.store }}</div><div class="muted xs">{{ fmtDate(p.ts) }} · {{ p.n }} أقساط</div></div>
          <div class="amt"><b>{{ fmt(p.total) }}</b></div>
        </div>
      </template>
      <p class="muted xs foot">بنعرف الأقساط من رسايل تابي وتمارا، وبنعدّ اللي اتدفع من رسايل البنك.</p>
    </section>
  </div>
</template>

<style scoped>
.hero2 { background: var(--hero); color: var(--hero-ink); border-radius: 22px; padding: 18px; margin-bottom: 12px }
.hero2 .lbl { display: block; font-size: 12.5px; opacity: .8 }
.hero2 > div > b { font-size: 32px; font-weight: 700; font-variant-numeric: tabular-nums }
.hero2 small { font-size: 14px; opacity: .8; font-weight: 500 }
.split { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.18) }
.split b { font-size: 17px; font-variant-numeric: tabular-nums }
h2 { font-size: 15.5px; margin: 0 0 6px }
.up { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 14px }
.up:last-child { border-bottom: 0 }
.up .when { width: 72px; flex: none; font-size: 12.5px; color: var(--ink-3) }
.up .when.soon { color: var(--bad); font-weight: 600 }
.up .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.up b { font-variant-numeric: tabular-nums }
.item { display: flex; align-items: center; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--line) }
.item:last-of-type { border-bottom: 0 }
.item.done { opacity: .6 }
.ic { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; font-size: 18px; flex: none }
.prov { font-size: 10px; font-weight: 700; letter-spacing: -.02em }
.prov.tabby { background: #3effa0; color: #111 }
.prov.tamara { background: #f6d2b8; color: #3b2314 }
.mid { flex: 1; min-width: 0 }
.nm { font-size: 14.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; unicode-bidi: plaintext; text-align: right }
.amt { display: flex; flex-direction: column; align-items: flex-end; text-align: left }
.amt b { font-size: 16px; font-variant-numeric: tabular-nums }
.amt small { font-size: 11px }
.x { border: 0; background: none; color: var(--ink-3); font-size: 20px; padding: 0 2px; cursor: pointer }
.chg { font-size: 11.5px; margin-top: 2px }
.chg.up { color: var(--bad) } .chg.down { color: var(--good) }
.dots { display: flex; align-items: center; gap: 4px; margin: 4px 0 2px }
.dots i { width: 18px; height: 5px; border-radius: 3px; background: var(--bar-dim) }
.dots i.on { background: var(--accent) }
.dots span { margin-inline-start: 4px }
.foot { margin: 8px 0 0 }
</style>
