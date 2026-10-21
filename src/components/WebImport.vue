<script setup>
import { ref } from 'vue'
import { importFile } from '../lib/store.js'
import { fmtDate } from '../lib/format.js'

const props = defineProps({ compact: Boolean })
const fileEl = ref(null)
const msg = ref('')
const showSteps = ref(!props.compact)
let last = 0
try { last = Number(localStorage.getItem('lastWebImport') || 0) } catch {}
const lastImport = ref(last)

async function onFile(e) {
  const f = e.target.files[0]
  if (!f) return
  msg.value = 'بقرا الرسايل…'
  try {
    const n = await importFile(f)
    lastImport.value = Date.now()
    try { localStorage.setItem('lastWebImport', String(lastImport.value)) } catch {}
    msg.value = `✓ اتقرت ${n} عملية (المكرر بيتجاهل لوحده)`
  } catch (err) { msg.value = 'الملف ده مش مفهوم: ' + err.message }
  e.target.value = ''
}
</script>

<template>
  <section class="card wi">
    <div class="row-b">
      <h2>📥 رسايل البنك</h2>
      <button v-if="compact" class="link" @click="showSteps = !showSteps">{{ showSteps ? 'إخفاء الخطوات' : 'إزاي أجهّزها؟' }}</button>
    </div>
    <button class="big" @click="fileEl.click()">⤓ استورد رسايل البنك</button>
    <input ref="fileEl" type="file" accept=".txt,.xml,.json,text/plain" hidden @change="onFile" />
    <p v-if="msg" class="note">{{ msg }}</p>
    <p v-else-if="lastImport" class="muted xs">آخر استيراد: {{ fmtDate(lastImport, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) }}</p>

    <div v-if="showSteps" class="steps">
      <p class="muted sm">جهّز أتمتة مرة واحدة تحفظ أي رسالة بنك في ملف لوحدها — وبعدها تستورده من هنا بدوستين:</p>
      <ol>
        <li>افتح <b>الاختصارات</b> ← <b>الأتمتة</b> ← <b>＋</b> ← <b>الرسالة (Message)</b></li>
        <li>اختار بنوكك في <b>المرسِل</b> (أو سيبه فاضي)، وفعّل <b>تشغيل فورًا</b> ← <b>التالي</b> ← <b>أتمتة فارغة جديدة</b></li>
        <li>ضيف أكشن <b>نص (Text)</b> واكتب فيه 4 سطور:
          <div class="code">التاريخ الحالي <small>(Current Date ← التنسيق ISO 8601)</small><br>From: المرسِل <small>(Shortcut Input ← Sender)</small><br>المحتوى <small>(Shortcut Input ← Content)</small><br>=====</div>
        </li>
        <li>ضيف أكشن <b>إلحاق بملف نصي (Append to Text File)</b>، وخلّي المسار <b>Shortcuts/masareef.txt</b>، وفعّل <b>سطر جديد</b></li>
        <li>خلاص ✓ — لما تحب تحدّث، دوس <b>استورد رسايل البنك</b> واختار <b>iCloud Drive ← Shortcuts ← masareef.txt</b></li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.big { width: 100%; padding: 14px; border-radius: 14px; border: 0; background: var(--accent); color: #fff; font: inherit; font-weight: 600; font-size: 15px; cursor: pointer; margin-top: 4px }
.note { font-size: 13px; color: var(--accent); margin: 8px 0 0 }
.steps { margin-top: 12px }
ol { margin: 6px 0 0; padding-right: 20px; font-size: 13.5px; line-height: 1.8 }
li { margin-bottom: 6px }
b { font-weight: 600 }
.code { background: var(--surface-2); border-radius: 10px; padding: 8px 10px; margin-top: 6px; font-size: 13px; line-height: 1.7 }
.code small { color: var(--ink-3) }
</style>
