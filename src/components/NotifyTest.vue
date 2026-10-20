<script setup>
import { ref, onMounted } from 'vue'
import { isNative, notificationStatus, requestNotifications, notify, simulatePurchase } from '../lib/smsSource.js'
import { totalLimit, cycleSpent } from '../lib/store.js'
import { CAT } from '../lib/categories.js'
import { fmt } from '../lib/format.js'

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
  { icon: '🔔', t: 'إشعار عادي', d: 'يتأكد إن الإشعارات بتوصل', fn: () => notify('إشعارات مصاريفي شغالة ✅', 'هيوصلك تنبيه لما توصل ٨٠٪ وعند تخطي أي حد', 4242), done: () => 'اتبعت إشعار' },
  { icon: '🟠', t: 'قرّبت من الحد (٨٠٪)', d: 'شكل التنبيه لما تقرّب', fn: () => notify('صرفت ٨٠٪ من حد المصروفات', `صرفت ${fmt(lim() * 0.8)} من ${fmt(lim())} ر.س — باقي ${fmt(lim() * 0.2)} (تجربة)`, 4244), done: () => 'اتبعت تنبيه ٨٠٪' },
  { icon: '🔴', t: 'عدّيت الحد', d: 'شكل التنبيه لما تعدّي', fn: () => notify('عدّيت حد المصروفات للراتب ده 🔴', `صرفت ${fmt(lim() * 1.05)} ر.س والحد ${fmt(lim())} ر.س — زيادة ${fmt(lim() * 0.05)} (تجربة)`, 4245), done: () => 'اتبعت تنبيه تخطي الحد' },
  {
    icon: '🧪', t: 'رسالة شراء وهمية', d: 'يجرّب قراية رسالة بنك وتصنيفها وحساب الحد — من غير ما يغيّر أرقامك',
    fn: () => simulatePurchase('شراء عبر نقاط البيع\nبطاقة:0000;مدى\nلدى:HUNGERSTATION\nمبلغ:45 SAR'),
    done: (r) => `اتقرت: ${r.merchant} · ${r.amount} ر.س → ${CAT[r.category]?.name || r.category}`,
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
        <div><span class="dot" :class="st.smsReceive ? 'on' : 'off'"></span> استقبال الرسايل والتطبيق مقفول: <b>{{ st.smsReceive ? 'شغال' : 'مقفول' }}</b></div>
      </template>
    </div>
    <div class="tests">
      <button v-for="x in tests" :key="x.t" class="tb" @click="run(x.fn, x.done)">
        <span class="ti">{{ x.icon }}</span>
        <span class="tm"><b>{{ x.t }}</b><small class="muted">{{ x.d }}</small></span>
      </button>
    </div>
    <p v-if="msg" class="res" :class="{ bad: !ok }">{{ msg }}</p>
    <p class="muted xs" style="margin: 10px 0 0">الصرف الحالي للراتب ده {{ fmt(cycleSpent) }} من {{ fmt(totalLimit) }} — التجارب مش بتغيّر الأرقام دي.</p>
  </section>
</template>

<style scoped>
.status { background: var(--surface-2); border-radius: 12px; padding: 10px 12px; margin: 10px 0; font-size: 13px; display: flex; flex-direction: column; gap: 6px }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-left: 6px; vertical-align: middle }
.dot.on { background: var(--good) } .dot.off { background: var(--bad) }
.status .link { margin-right: 8px }
.tests { display: grid; grid-template-columns: 1fr 1fr; gap: 8px }
.tb { display: flex; gap: 8px; align-items: flex-start; text-align: right; padding: 12px; border-radius: 14px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font: inherit; cursor: pointer }
.tb:active { background: var(--accent-soft) }
.ti { font-size: 18px }
.tm { display: flex; flex-direction: column; gap: 2px; font-size: 13.5px }
.tm b { font-weight: 600 }
.tm small { font-size: 11.5px; line-height: 1.4 }
.res { font-size: 13px; color: var(--accent); margin: 10px 0 0; line-height: 1.6 }
.res.bad { color: var(--bad) }
</style>
