<script setup>
import { ref, onMounted } from 'vue'
import { sym } from '../lib/format.js'
import { isNative, notificationStatus, requestNotifications, notify, simulatePurchase } from '../lib/smsSource.js'
import { totalLimit, cycleSpent, warnPct } from '../lib/store.js'
import { CAT } from '../lib/categories.js'
// الإشعار بيطلع برّه التطبيق — الأرقام فيه عادية حتى لو المبالغ مخفية جوه
const fmt = (n) => Math.round(n || 0).toLocaleString('en-US')

const st = ref(null)
const msg = ref('')
const ok = ref(true)

async function refresh() { st.value = await notificationStatus() }
onMounted(refresh)

async function allow() {
  await requestNotifications()
  await refresh()
}

async function run(fn, done) {
  msg.value = ''
  try {
    if (!st.value?.granted) await allow()
    if (!st.value?.granted) throw new Error('denied')
    const r = await fn()
    ok.value = true
    msg.value = done(r) + ' — بص على شريط الإشعارات فوق 👆'
  } catch (e) {
    ok.value = false
    const m = String(e?.message || e)
    msg.value = /web/.test(m) ? 'الإشعارات بتشتغل على الموبايل بس' : /denied|allowed/.test(m) ? 'الإشعارات مقفولة — افتحها من الإعدادات ← التطبيقات ← مصاريفي ← الإشعارات' : 'حصلت مشكلة: ' + m
  }
}

const lim = () => totalLimit.value || 10000
const tests = [
  { icon: '🔔', t: 'إشعار عادي', fn: () => notify('إشعارات مصاريفي شغالة ✅', `هيوصلك تنبيه لما توصل ${warnPct.value || 100}٪ وعند تخطي أي حد`, 4242), done: () => 'اتبعت إشعار' },
  { icon: '🟠', t: 'قرّبت من الحد', fn: () => { const r = (warnPct.value || 80) / 100; return notify(`صرفت ${Math.round(r * 100)}٪ من حد المصروفات`, `صرفت ${fmt(lim() * r)} من ${fmt(lim())} ${sym()} — باقي ${fmt(lim() * (1 - r))} (تجربة)`, 4244) }, done: () => 'اتبعت تنبيه القرب من الحد' },
  { icon: '🔴', t: 'عدّيت الحد', fn: () => notify('عدّيت حد المصروفات للراتب ده 🔴', `صرفت ${fmt(lim() * 1.05)} ${sym()} والحد ${fmt(lim())} ${sym()} — زيادة ${fmt(lim() * 0.05)} (تجربة)`, 4245), done: () => 'اتبعت تنبيه تخطي الحد' },
  {
    icon: '🧪', t: 'رسالة شراء وهمية',
    fn: () => simulatePurchase('شراء عبر نقاط البيع\nبطاقة:0000;مدى\nلدى:HUNGERSTATION\nمبلغ:45 SAR'),
    done: (r) => `اتقرت: ${r.merchant} · ${r.amount} ${sym()} → ${CAT[r.category]?.name || r.category}`,
  },
]
</script>

<template>
  <section class="card">
    <h2>🔔 تجربة الإشعارات</h2>
    <div class="status" v-if="st">
      <template v-if="st.web"><span class="dot off"></span> نسخة الويب — جرّب من الموبايل</template>
      <template v-else>
        <div><span class="dot" :class="st.granted ? 'on' : 'off'"></span> الإشعارات: <b>{{ st.granted ? 'مسموحة' : 'مقفولة' }}</b>
          <button v-if="!st.granted" class="link" @click="allow">اسمح</button></div>
        <div><span class="dot" :class="st.smsReceive ? 'on' : 'off'"></span> {{ st.ios ? 'اختصار رسايل البنك' : 'استقبال الرسايل والتطبيق مقفول' }}: <b>{{ st.smsReceive ? 'شغال' : (st.ios ? 'لسه مفيش رسايل' : 'مقفول') }}</b></div>
      </template>
    </div>
    <div class="tests">
      <button v-for="x in tests" :key="x.t" class="tb" @click="run(x.fn, x.done)">
        <span class="ti">{{ x.icon }}</span>
        <span class="tm">{{ x.t }}</span>
      </button>
    </div>
    <p v-if="msg" class="res" :class="{ bad: !ok }">{{ msg }}</p>
    <p class="muted xs" style="margin: 8px 0 0">التجارب مش بتغيّر أرقامك.</p>
  </section>
</template>

<style scoped>
.status { background: var(--surface-2); border-radius: 12px; padding: 8px 12px; margin: 8px 0; font-size: 12.5px; display: flex; flex-direction: column; gap: 4px }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-left: 6px; vertical-align: middle }
.dot.on { background: var(--good) } .dot.off { background: var(--bad) }
.status .link { margin-right: 8px }
.tests { display: grid; grid-template-columns: 1fr 1fr; gap: 6px }
.tb { display: flex; gap: 6px; align-items: center; text-align: right; padding: 9px 10px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font: inherit; cursor: pointer }
.tb:active { background: var(--accent-soft) }
.ti { font-size: 15px }
.tm { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.tm b { font-weight: 600 }
.tm small { font-size: 11.5px; line-height: 1.4 }
.res { font-size: 13px; color: var(--accent); margin: 10px 0 0; line-height: 1.6 }
.res.bad { color: var(--bad) }
</style>
