<script setup>
import { ref } from 'vue'
import { isNative } from '../lib/smsSource.js'

defineProps({ dismissible: Boolean })
const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
let hidden = false
try { hidden = localStorage.getItem('installHintHidden') === '1' } catch {}
const show = ref(!isNative && !standalone && !hidden)
function hide() { show.value = false; try { localStorage.setItem('installHintHidden', '1') } catch {} }
</script>

<template>
  <section v-if="show" class="card hint">
    <div class="row-b">
      <h2>📲 ثبّته على الشاشة الرئيسية</h2>
      <button v-if="dismissible" class="link" @click="hide">إخفاء</button>
    </div>
    <ol v-if="ios">
      <li>دوس زرار <b>المشاركة</b> <span class="ic">⬆︎</span> تحت في سفاري</li>
      <li>اختار <b>إضافة إلى الشاشة الرئيسية</b></li>
      <li>دوس <b>إضافة</b> — هيظهر "مصاريفي" بأيقونته ويفتح زي أي تطبيق</li>
    </ol>
    <ol v-else>
      <li>من قائمة المتصفح <b>⋮</b> اختار <b>تثبيت التطبيق</b> أو <b>إضافة إلى الشاشة الرئيسية</b></li>
    </ol>
    <p class="muted xs">رسايلك وبياناتك بتفضل على موبايلك بس.</p>
  </section>
</template>

<style scoped>
.hint { border-color: var(--accent); background: var(--accent-soft) }
ol { margin: 6px 0; padding-right: 20px; font-size: 14px; line-height: 1.9 }
b { font-weight: 600 }
.ic { display: inline-block; padding: 0 6px; border-radius: 6px; background: var(--surface) }
</style>
