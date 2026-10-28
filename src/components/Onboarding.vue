<script setup>
// أول تشغيل: الصلاحيات بس. كل حاجة تانية (الراتب، الحدود، البنوك) التطبيق بيعرفها لوحده أو اختيارية بعدين
import { ref } from 'vue'
import { requestNotifications } from '../lib/smsSource.js'

const emit = defineEmits(['done', 'sms'])
const step = ref(0)
const busy = ref(false)
function sms() { emit('sms'); step.value = 1 }
async function notif() {
  busy.value = true
  try { await requestNotifications() } catch {}
  busy.value = false
  emit('done')
}
</script>

<template>
  <div class="ob">
    <div class="dots"><i :class="{ on: step === 0 }"></i><i :class="{ on: step === 1 }"></i></div>
    <template v-if="step === 0">
      <div class="ic">✉️</div>
      <h1>مصاريفي بيقرا رسايل البنك</h1>
      <p>علشان يعرف صرفت كام وفين — من غير ما تكتب حاجة. بيقرا رسايل البنوك والمحافظ بس، والقراية بتحصل على موبايلك.</p>
      <ul>
        <li>🏦 بيعرف بنوكك ومحافظك لوحده</li>
        <li>💱 وعملتك، حتى لو بتصرف في أكتر من بلد</li>
        <li>🔒 رسايلك عمرها ما بتطلع من موبايلك</li>
      </ul>
      <button class="go" @click="sms">اسمح بقراية الرسايل</button>
    </template>
    <template v-else>
      <div class="ic">🔔</div>
      <h1>تنبيهات (اختياري)</h1>
      <p>علشان يقولك لو قرّبت من حدك، أو حوّلت لحد ("سلفة؟")، أو اشتراك زاد سعره — والتطبيق مقفول.</p>
      <button class="go" :disabled="busy" @click="notif">اسمح بالتنبيهات</button>
      <button class="skip" @click="emit('done')">بعدين</button>
    </template>
  </div>
</template>

<style scoped>
.ob { position: fixed; inset: 0; z-index: 200; overflow-y: auto; min-height: 100vh; box-sizing: border-box; padding: calc(40px + env(safe-area-inset-top)) 24px calc(32px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; align-items: center; text-align: center; gap: 14px; background: var(--bg) }
.dots { display: flex; gap: 6px; margin-bottom: 18px }
.dots i { width: 8px; height: 8px; border-radius: 99px; background: var(--line); transition: width .2s }
.dots i.on { width: 22px; background: var(--accent) }
.ic { width: 84px; height: 84px; border-radius: 26px; background: var(--accent-soft); display: grid; place-items: center; font-size: 40px; margin-top: 8vh }
h1 { font-size: 22px; margin: 8px 0 0 }
p { color: var(--ink-2); line-height: 1.8; margin: 0; font-size: 15px; max-width: 360px }
ul { list-style: none; padding: 0; margin: 6px 0 0; display: flex; flex-direction: column; gap: 10px; text-align: right; width: 100%; max-width: 340px }
li { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; font-size: 14.5px }
.go { margin-top: auto; width: 100%; max-width: 360px; padding: 15px; border: 0; border-radius: 16px; background: var(--accent); color: #fff; font: inherit; font-size: 16px; font-weight: 600; cursor: pointer }
.go:disabled { opacity: .6 }
.skip { border: 0; background: none; color: var(--ink-3); font: inherit; font-size: 14.5px; padding: 8px; cursor: pointer }
</style>
