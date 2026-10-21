<script setup>
import { ref, onMounted } from 'vue'
import { addMessage, notificationStatus } from '../lib/smsSource.js'
import { syncSms, state } from '../lib/store.js'
import { fmtDate } from '../lib/format.js'

defineProps({ compact: Boolean })
const st = ref(null)
const paste = ref('')
const msg = ref('')
onMounted(async () => { st.value = await notificationStatus() })

async function add() {
  msg.value = ''
  try {
    const r = await addMessage(paste.value)
    await syncSms()
    msg.value = r.added ? '✓ اتضافت' : 'الرسالة دي متضافة قبل كده'
    paste.value = ''
  } catch (e) { msg.value = 'مقدرتش أضيفها: ' + (e.message || e) }
}
const steps = [
  'افتح تطبيق <b>الاختصارات (Shortcuts)</b> ← <b>الأتمتة (Automation)</b> ← <b>＋</b>',
  'اختار <b>الرسالة (Message)</b>، وفي <b>المرسِل</b> سيبه فاضي أو اختار بنوكك، وفعّل <b>تشغيل فورًا (Run Immediately)</b>',
  'دوس <b>New Blank Automation</b> ← ضيف أكشن <b>«سجّل رسالة بنك في مصاريفي»</b>',
  'في <b>نص الرسالة</b> اختار <b>Shortcut Input ← المحتوى (Content)</b>، وفي <b>الراسل</b> اختار <b>Shortcut Input ← المرسِل (Sender)</b>',
  'خلاص ✓ — أي رسالة بنك توصل هتتسجّل لوحدها وتحسب الحدود حتى والتطبيق مقفول',
]
</script>

<template>
  <section class="card ios">
    <h2>📲 ربط رسايل البنك (آيفون)</h2>
    <p class="muted sm">آبل مش بتسمح لأي تطبيق يقرا الرسايل، فبنستخدم أتمتة "الاختصارات" تبعت رسالة البنك للتطبيق أول ما توصل. بتتعمل مرة واحدة:</p>
    <div class="status" v-if="st">
      <span class="dot" :class="st.smsReceive ? 'on' : 'off'"></span>
      <template v-if="st.smsReceive">الاختصار شغال · آخر رسالة {{ fmtDate(st.lastIntent, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) }}</template>
      <template v-else>لسه مفيش رسايل وصلت من الاختصار</template>
    </div>
    <ol class="steps">
      <li v-for="(s, i) in steps" :key="i" v-html="s"></li>
    </ol>
    <details>
      <summary>أو الصق رسالة بنك بإيدك</summary>
      <textarea v-model="paste" rows="4" placeholder="انسخ رسالة البنك من تطبيق الرسايل والصقها هنا"></textarea>
      <button class="btn" :disabled="!paste.trim()" @click="add">أضف الرسالة</button>
      <p v-if="msg" class="note">{{ msg }}</p>
    </details>
    <p class="muted xs">الرسايل القديمة: لو معاك ملف رسايل (XML/JSON) من موبايل أندرويد قديم، استورده من "البيانات" تحت.</p>
  </section>
</template>

<style scoped>
.status { background: var(--surface-2); border-radius: 12px; padding: 10px 12px; margin: 10px 0; font-size: 13px }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-left: 6px; vertical-align: middle }
.dot.on { background: var(--good) } .dot.off { background: var(--bad) }
.steps { margin: 8px 0; padding-right: 20px; font-size: 13.5px; line-height: 1.8 }
.steps li { margin-bottom: 6px }
.steps :deep(b) { font-weight: 600 }
details { margin: 10px 0; font-size: 14px }
summary { cursor: pointer; color: var(--accent); font-weight: 500 }
textarea { width: 100%; margin-top: 10px; font: inherit; font-size: 14px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); resize: vertical }
.btn { display: block; width: 100%; margin-top: 8px; padding: 12px; border-radius: 14px; border: 0; background: var(--accent); color: #fff; font: inherit; font-weight: 600 }
.btn:disabled { opacity: .5 }
.note { font-size: 13px; color: var(--accent); margin: 8px 0 0 }
</style>
