<script setup>
import { ask } from '../lib/dialog.js'
import { ref, onMounted } from 'vue'
import { state, saveSettings, syncSms, reparse, importFile, clearImported, resetOverrides, allTx, currentCycle, income, totalLimit, cycleSpent, dayLimit, weekLimit, salaryDay, nextSalaryDate } from '../lib/store.js'
import { isNative, isIOS, requestNotifications, biometricAvailable, biometricAuth } from '../lib/smsSource.js'
import { privacy, setPrivacy } from '../lib/format.js'
import { fmtDate, fmt } from '../lib/format.js'
import NotifyTest from './NotifyTest.vue'
import IosSetup from './IosSetup.vue'
import InstallHint from './InstallHint.vue'
import WebImport from './WebImport.vue'
import UpdateBanner from './UpdateBanner.vue'
import { update, checkUpdate } from '../lib/updater.js'
import { exportBackup, importBackup } from '../lib/backup.js'

const emit = defineEmits(['go'])
const msg = ref('')
const fileEl = ref(null)
const bkEl = ref(null)
// ===== القفل =====
const bio = ref({ available: false })
onMounted(async () => { bio.value = await biometricAvailable() })
const lockMsg = ref('')
async function toggleLock(e) {
  const want = e.target.checked
  e.target.checked = !!state.settings.lock
  lockMsg.value = ''
  // لازم تأكد بالبصمة قبل ما تشغّل أو تقفل القفل
  const r = await biometricAuth(want ? 'فعّل قفل مصاريفي' : 'اقفل قفل مصاريفي')
  if (!r.ok) { if (r.error && !/cancel|ألغ|إلغاء/i.test(r.error)) lockMsg.value = r.error; return }
  state.settings.lock = want
  saveSettings()
  e.target.checked = want
}
const bkMsg = ref('')
async function doExport() {
  try { await exportBackup(); bkMsg.value = isNative ? '' : 'اتحفظ الملف في التنزيلات ✅' } catch (e) { if (!/cancel/i.test(String(e))) bkMsg.value = 'معرفتش أحفظ النسخة: ' + (e.message || e) }
}
async function doImport(e) {
  const f = e.target.files[0]
  e.target.value = ''
  if (!f) return
  if (!(await ask('هترجّع إعداداتك ومصروفاتك اليدوية من الملف ده، واللي موجود دلوقتي هيتبدّل.', { yes: 'رجّعها' }))) return
  try { await importBackup(f) } catch (err) { bkMsg.value = err.message || String(err) }
}
function save() { saveSettings(); reparse() }
async function saveMoney() {
  saveSettings()
  if (state.settings.totalAlert !== false && isNative) await requestNotifications()
}
async function onFile(e) {
  const f = e.target.files[0]
  if (!f) return
  msg.value = 'بقرا الملف…'
  try { const n = await importFile(f); msg.value = `تمام — اتقرت ${n.toLocaleString('en-US')} عملية من الملف` }
  catch (err) { msg.value = 'الملف ده مش مفهوم: ' + err.message }
  e.target.value = ''
}
async function refresh() { await syncSms(); msg.value = state.status === 'ready' ? 'اتحدّث من الرسايل' : state.error }
async function clearOv() { if (await ask('كل المحلات اللي نقلتها لبنود تانية هترجع للتصنيف التلقائي.', { yes: 'رجّعها للتلقائي', danger: true })) resetOverrides() }
async function clearImp() { if (await ask('تمسح العمليات اللي اتقرت من الملفات؟ رسايل الموبايل مش هتتأثر.', { yes: 'امسح', danger: true })) clearImported() }
</script>

<template>
  <div class="view">
    <header class="hd"><h1>الإعدادات</h1></header>

    <section class="card">
      <h2>الدخل وحد المصروفات</h2>
      <label class="fld">
        <span>دخلك الشهري (ر.س)</span>
        <input type="number" inputmode="numeric" v-model.number="state.settings.income" @change="saveMoney" :placeholder="currentCycle.salary ? 'من رسالة الراتب: ' + fmt(currentCycle.salary) : 'مثلًا 10000'" />
        <small class="muted">سيبه فاضي ونحسبه من رسالة الراتب</small>
      </label>
      <label class="fld">
        <span>يوم نزول الراتب</span>
        <input type="number" inputmode="numeric" min="1" max="31" v-model.number="state.settings.salaryDay" @change="saveMoney" :placeholder="salaryDay ? 'تلقائي: يوم ' + salaryDay + ' في الشهر' : 'مثلًا 27'" />
        <small class="muted" v-if="nextSalaryDate">الراتب الجاي متوقع {{ fmtDate(nextSalaryDate, { weekday: 'long', day: 'numeric', month: 'long' }) }} (لو جه جمعة أو سبت بنقدّمه للخميس)</small>
      </label>
      <button class="navrow2" @click="emit('go', 'limits')">
        <span class="n2ic">🔔</span>
        <span class="n2mid">
          <span class="n2t">حدود الصرف</span>
          <b>يوم {{ fmt(dayLimit) }} · أسبوع {{ fmt(weekLimit) }} · راتب {{ fmt(totalLimit) }}</b>
          <small class="muted">صرفت {{ fmt(cycleSpent) }} من {{ fmt(totalLimit) }} ({{ totalLimit ? Math.round((cycleSpent / totalLimit) * 100) : 0 }}٪)</small>
        </span>
        <span class="n2go">تعديل<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6" /></svg></span>
      </button>
      <label class="sw">
        <span><b>نبّهني لما أقرّب أو أعدّي الحد</b><br /><small class="muted">إشعار عند ٨٠٪ وعند تخطي الحد</small></span>
        <input type="checkbox" :checked="state.settings.totalAlert !== false" @change="(e) => { state.settings.totalAlert = e.target.checked; saveMoney() }" />
      </label>
    </section>

    <section class="card">
      <h2>عام</h2>
      <div class="fld"><span>المظهر</span>
        <div class="seg3">
          <button v-for="o in [['light', '☀️ فاتح'], ['dark', '🌙 غامق'], ['auto', '⚙️ زي الموبايل']]" :key="o[0]" :class="{ on: (state.settings.theme || 'light') === o[0] }" @click="state.settings.theme = o[0]; save()">{{ o[1] }}</button>
        </div>
      </div>
      <label class="sw">
        <span><b>احسب التحويلات لأشخاص والحوالات الدولية</b><br /><small class="muted">لو مقفولة، الأرقام بتبقى مصاريف المعيشة بس</small></span>
        <input type="checkbox" v-model="state.settings.includeTransfers" @change="save" />
      </label>
    </section>

    <InstallHint />
    <WebImport v-if="!isNative" />
    <IosSetup v-if="isIOS" />
    <NotifyTest />

    <button class="card navrow" @click="emit('go', 'limits')">
      <span class="nic">🔔</span>
      <span class="nmid"><b>الحدود والتنبيهات</b><br /><small class="muted">{{ Object.keys(state.settings.limits || {}).length ? Object.keys(state.settings.limits).length + ' بند عليهم حد' : 'حد يومي وأسبوعي وشهري ولكل بند' }}</small></span>
      <span class="muted">←</span>
    </button>

    <section class="card">
      <h2>حساباتك واسمك</h2>
      <p class="muted sm">التطبيق بيتعرّف عليهم لوحده من رسايل البنك، علشان التحويل بين حساباتك ميتحسبش مصروف. اكتب بإيدك بس لو حاجة غلط.</p>
      <div class="det" v-if="state.detected.accounts.length">
        <span class="muted xs">اتعرف تلقائيًا ✓</span>
        <div><span class="chip" v-for="a in state.detected.accounts" :key="a">••{{ a }}</span><span class="chip" v-for="n in state.detected.selfNames" :key="n">{{ n }}</span></div>
      </div>
      <label class="fld"><span>اسمك (للترحيب)</span><input v-model="state.settings.name" @change="save" :placeholder="state.detected.displayName || 'اسمك'" /></label>
      <label class="fld"><span>اسمك في التحويلات (افصل بفاصلة)</span><input v-model="state.settings.selfNames" @change="save" :placeholder="state.detected.selfNames.length ? 'تلقائي: ' + state.detected.selfNames.join('، ') : 'مثلًا: محمد, MOHAMED'" /></label>
      <label class="fld"><span>آخر ٤ أرقام من حساباتك (افصل بفاصلة)</span><input v-model="state.settings.accounts" @change="save" inputmode="numeric" :placeholder="state.detected.accounts.length ? 'تلقائي: ' + state.detected.accounts.join('، ') : 'مثلًا: 1234, 5678'" /></label>
    </section>

    <section class="card">
      <h2>البيانات</h2>
      <p class="muted sm">
        {{ allTx.length.toLocaleString('en-US') }} عملية ·
        <template v-if="isNative">آخر تحديث من الرسايل: {{ state.lastSync ? fmtDate(state.lastSync, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—' }}</template>
        <template v-else>نسخة الويب — استورد ملف رسايل</template>
      </p>
      <button v-if="isNative" class="btn" @click="refresh">↻ {{ isIOS ? 'حدّث' : 'حدّث من رسايل الموبايل' }}</button>
      <button class="btn ghost" @click="fileEl.click()">⤒ استورد ملف رسايل (XML أو JSON)</button>
      <input ref="fileEl" type="file" accept=".xml,.json,text/xml,application/json" hidden @change="onFile" />
      <p v-if="msg" class="note">{{ msg }}</p>
      <div class="danger">
        <button class="link" @click="clearOv">رجّع التصنيفات للتلقائي</button>
        <button class="link" @click="clearImp" v-if="state.importedTx.length">امسح البيانات المستوردة</button>
      </div>
    </section>

    <section class="card">
      <h2>الخصوصية والأمان</h2>
      <label class="sw" v-if="isNative">
        <span><b>{{ isIOS ? 'اقفل التطبيق بـ Face ID' : 'اقفل التطبيق بالبصمة أو الوش' }}</b><br /><small class="muted">{{ bio.available ? 'بيطلبها لما تفتحه أو ترجعله بعد ٣٠ ثانية' : 'فعّل البصمة أو رمز قفل للموبايل الأول من إعداداته' }}</small></span>
        <input type="checkbox" :checked="!!state.settings.lock" :disabled="!bio.available" @change="toggleLock" />
      </label>
      <p v-if="lockMsg" class="note">{{ lockMsg }}</p>
      <label class="sw">
        <span><b>اخفي المبالغ</b><br /><small class="muted">الأرقام تبقى •••• — تقدر تقلبها بسرعة من زرار العين في الرئيسية</small></span>
        <input type="checkbox" :checked="privacy.on" @change="(e) => setPrivacy(e.target.checked)" />
      </label>
    </section>

    <section class="card">
      <h2>نسخة احتياطية</h2>
      <p class="muted sm">ملف فيه إعداداتك وحدودك وبطاقاتك ومصروفاتك اليدوية — ترجّعه لو غيّرت الموبايل أو مسحت التطبيق.</p>
      <div class="bk">
        <button class="btn" @click="doExport">📤 احفظ نسخة</button>
        <button class="btn ghost" @click="bkEl.click()">📥 رجّع من نسخة</button>
      </div>
      <input ref="bkEl" type="file" accept=".json,application/json" hidden @change="doImport" />
      <p v-if="bkMsg" class="note">{{ bkMsg }}</p>
    </section>

    <section class="card">
      <h2>التحديثات</h2>
      <p class="muted sm" v-if="isIOS">على آيفون التحديث بيوصلك من SideStore أو TestFlight.</p>
      <p class="muted sm" v-else-if="!isNative">نسخة الويب بتتحدّث لوحدها كل ما تفتحها وانت متصل بالنت.</p>
      <p class="muted sm" v-else-if="isNative">
        النسخة الحالية: <b>{{ update.current ? update.current.build : '…' }}</b>
        <template v-if="update.latest"> · آخر نسخة: <b>{{ update.latest.build }}</b></template>
      </p>
      <p class="muted sm" v-else>التحديثات بتشتغل على الموبايل بس</p>
      <UpdateBanner v-if="update.available" />
      <p v-else-if="update.latest && !update.checking" class="note">✓ عندك آخر نسخة</p>
      <p v-if="update.error && !update.available" class="muted xs">مقدرتش أوصل للتحديثات: {{ update.error }}</p>
      <button v-if="isNative && !isIOS" class="btn ghost" :disabled="update.checking" @click="checkUpdate">{{ update.checking ? 'بدوّر…' : '↻ تحقق من التحديثات' }}</button>
    </section>

    <p class="muted xs about">كل البيانات بتتقرا وتتحلل على موبايلك بس، ومبتتبعتش لأي سيرفر. النت بيُستخدم بس علشان يشوف لو فيه تحديث جديد.</p>
  </div>
</template>

<style scoped>
.fld { display: flex; flex-direction: column; gap: 6px; margin-top: 14px; font-size: 13.5px; color: var(--ink-2) }
.fld input { font: inherit; font-size: 15px; color: var(--ink); background: var(--surface-2); border: 1px solid transparent; border-radius: 12px; padding: 11px 14px; outline: none }
.fld input:focus { border-color: var(--accent) }
.seg3 { display: grid; grid-template-columns: repeat(3, 1fr); background: var(--surface-2); border-radius: 12px; padding: 3px }
.seg3 button { border: 0; background: none; font: inherit; font-size: 13px; padding: 9px 4px; border-radius: 10px; color: var(--ink-2); cursor: pointer }
.seg3 button.on { background: var(--surface); color: var(--ink); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,.08) }
.sw { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-top: 16px; font-size: 14px }
.sw b { font-weight: 500 }
.sw input { appearance: none; width: 46px; height: 28px; border-radius: 99px; background: var(--line); position: relative; flex: none; cursor: pointer; transition: .2s; margin: 0 }
.sw input::after { content: ''; position: absolute; top: 3px; right: 3px; width: 22px; height: 22px; border-radius: 50%; background: #fff; transition: .2s; box-shadow: 0 1px 3px rgba(0,0,0,.2) }
.sw input:checked { background: var(--accent) }
.sw input:checked::after { right: 21px }
.btn { display: block; width: 100%; margin-top: 10px; padding: 13px; border-radius: 14px; border: 0; background: var(--accent); color: #fff; font: inherit; font-weight: 600; cursor: pointer }
.btn.ghost { background: var(--surface-2); color: var(--ink) }
.note { font-size: 13px; color: var(--accent); margin: 10px 0 0 }
.danger { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 14px }
.navrow { display: flex; align-items: center; gap: 12px; width: 100%; text-align: right; font: inherit; color: inherit; cursor: pointer }
.nic { width: 40px; height: 40px; border-radius: 12px; background: var(--accent-soft); display: grid; place-items: center; font-size: 18px; flex: none }
.nmid { flex: 1; font-size: 14.5px } .nmid b { font-weight: 600 }
.det { background: var(--accent-soft); border-radius: 14px; padding: 10px 12px; margin-top: 10px }
.det .chip { display: inline-block; background: var(--surface); border-radius: 99px; padding: 3px 10px; font-size: 12.5px; margin: 6px 0 0 6px; font-variant-numeric: tabular-nums }
.about { text-align: center; margin: 18px 20px; line-height: 1.7 }
.navrow2 { width: 100%; margin-top: 12px; text-align: right; border: 1px solid var(--line); background: var(--surface); border-radius: 16px; padding: 12px; font: inherit; color: inherit; cursor: pointer; display: flex; align-items: center; gap: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.05); transition: transform .1s, background .15s }
.navrow2:active { transform: scale(.98); background: var(--surface-2) }
.n2ic { width: 40px; height: 40px; border-radius: 12px; background: var(--accent-soft); display: grid; place-items: center; font-size: 18px; flex: none }
.n2mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px }
.n2t { font-size: 13px; color: var(--ink-2) }
.navrow2 b { font-variant-numeric: tabular-nums; font-size: 13.5px }
.n2go { flex: none; display: flex; align-items: center; gap: 2px; color: var(--accent); font-size: 13px; font-weight: 600; background: var(--accent-soft); border-radius: 99px; padding: 6px 8px 6px 10px }
.bk { display: grid; grid-template-columns: 1fr 1fr; gap: 8px }
.bk .btn { margin: 0 }
</style>
