<script setup>
import { ref, onMounted } from 'vue'
import { state, syncSms, allTx } from './lib/store.js'
import { isNative, isIOS } from './lib/smsSource.js'
import { App as CapApp } from '@capacitor/app'
import HomeView from './components/HomeView.vue'
import AnalysisView from './components/AnalysisView.vue'
import TxView from './components/TxView.vue'
import SettingsView from './components/SettingsView.vue'
import TxSheet from './components/TxSheet.vue'
import LimitsView from './components/LimitsView.vue'
import AddExpense from './components/AddExpense.vue'
import { checkUpdate } from './lib/updater.js'
import IosSetup from './components/IosSetup.vue'
import WebImport from './components/WebImport.vue'
import BanksView from './components/BanksView.vue'
import CreditView from './components/CreditView.vue'

const tab = ref('home')
const txCat = ref('')
const txRange = ref(null)
const txBank = ref('')
const sheet = ref(null)
const adding = ref(null) // null | {} (جديد) | tx (تعديل)

const prevTab = ref('home')
const creditSel = ref('')
function go(t, cat = '', range = null, bank = '') { if (t === 'limits' || t === 'credit') prevTab.value = tab.value; if (t === 'credit') creditSel.value = cat; tab.value = t; txCat.value = cat; txRange.value = range; txBank.value = bank; window.scrollTo(0, 0) }

onMounted(() => { syncSms(); checkUpdate() })

// زرار الرجوع في أندرويد
if (isNative) {
  CapApp.addListener('backButton', () => {
    if (adding.value) adding.value = null
    else if (sheet.value) sheet.value = null
    else if (tab.value === 'limits' || tab.value === 'credit') go(prevTab.value)
    else if (tab.value !== 'home') go('home')
    else CapApp.exitApp()
  })
  // لما ترجع للتطبيق، نقرا الرسايل الجديدة
  CapApp.addListener('resume', () => syncSms())
}

const tabs = [
  { id: 'home', l: 'الرئيسية', i: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  { id: 'analysis', l: 'التحليل', i: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { id: 'banks', l: 'البنوك', i: 'M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18M12 3l9 5H3z' },
  { id: 'tx', l: 'العمليات', i: 'M4 6h16M4 12h16M4 18h10' },
  { id: 'settings', l: 'الإعدادات', i: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' },
]
</script>

<template>
  <main>
    <SettingsView v-if="tab === 'settings'" @go="go" />
    <LimitsView v-else-if="tab === 'limits'" @back="go(prevTab)" />
    <CreditView v-else-if="tab === 'credit'" :initial="creditSel" @back="go(prevTab)" @open="(t) => (sheet = t)" @go="go" />

    <div v-else-if="state.status === 'loading' && !allTx.length" class="splash">
      <div class="spinner"></div>
      <p>بقرا رسايل البنوك…</p>
    </div>

    <div v-else-if="state.status === 'denied'" class="splash">
      <div class="big-ic">✉️</div>
      <h2>محتاج إذن قراية الرسايل</h2>
      <p class="muted">التطبيق بيقرا رسايل البنوك بس علشان يحسب مصاريفك، وكل حاجة بتفضل على موبايلك.</p>
      <button class="btn" @click="syncSms">اسمح بقراية الرسايل</button>
      <p class="muted xs">لو رفضت قبل كده: الإعدادات ← التطبيقات ← مصاريفي ← الأذونات ← الرسايل</p>
    </div>

    <div v-else-if="!allTx.length && state.status !== 'loading'" class="splash">
      <div class="big-ic">📭</div>
      <h2>مفيش عمليات لسه</h2>
      <p class="muted">{{ isIOS ? 'اربط رسايل البنك بأتمتة الاختصارات — مرة واحدة بس:' : isNative ? 'ملقتش رسايل من البنوك المدعومة.' : 'ابدأ بلزق رسالة بنك أو أضف مصروف — كل حاجة بتتحفظ على موبايلك بس.' }}</p>
      <IosSetup v-if="isIOS" style="text-align: right; margin-top: 10px" />
      <template v-if="!isNative">
        <button class="btn" @click="adding = { paste: true }">📋 الصق أول رسالة بنك</button>
        <button class="btn ghost2" @click="adding = {}">✍️ أضف مصروف بإيدك</button>
        <WebImport style="text-align: right; margin-top: 16px; width: 100%" />
      </template>
      <button v-else class="btn" @click="go('settings')">روح للإعدادات</button>
    </div>

    <template v-else>
      <HomeView v-if="tab === 'home'" @open="(t) => (sheet = t)" @go="go" />
      <AnalysisView v-else-if="tab === 'analysis'" @go="go" />
      <BanksView v-else-if="tab === 'banks'" @go="go" />
      <TxView v-else-if="tab === 'tx'" :key="txCat + txBank + (txRange ? txRange.id + txRange.from : '')" :cat="txCat" :range="txRange" :bank="txBank" @open="(t) => (sheet = t)" />
    </template>
    
    <nav class="tabbar">
      <button v-for="t in tabs" :key="t.id" :class="{ on: tab === t.id || (t.id === 'settings' && tab === 'limits') || (t.id === 'banks' && tab === 'credit') }" @click="go(t.id)">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="t.i" /></svg>
        <span>{{ t.l }}</span>
      </button>
    </nav>

    <button v-if="['home', 'tx', 'analysis'].includes(tab)" class="fab" @click="adding = {}" aria-label="إضافة مصروف">＋</button>
    <TxSheet v-if="sheet" :t="allTx.find((x) => x.id === sheet.id) || sheet" @close="sheet = null" @edit="(t) => { sheet = null; adding = t }" />
    <AddExpense v-if="adding" :edit="adding.id ? adding : null" :paste="!!adding.paste" @close="adding = null" />
  </main>
</template>
