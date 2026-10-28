<script setup>
// بلّغ عن مشكلة / اقترح ميزة — بيروح لسيرفرنا. مفيش عمليات ولا رسايل بتتبعت، بس نسخة التطبيق ونوع الموبايل
import { ref, computed, onMounted } from 'vue'
import BottomSheet from './BottomSheet.vue'
import { API } from '../lib/smart.js'
import { update } from '../lib/updater.js'
import { showToast } from '../lib/toast.js'

const props = defineProps({ type: { type: String, default: 'bug' } })
const emit = defineEmits(['close'])
const kind = ref(props.type)
const message = ref('')
const contact = ref('')
const sending = ref(false)
const err = ref('')
const box = ref(null)
onMounted(() => setTimeout(() => box.value?.focus(), 300))

const device = computed(() => {
  const ua = navigator.userAgent || ''
  return (ua.match(/Android [\d.]+(; [^;)]+)?/) || ua.match(/iPhone OS [\d_]+/) || [''])[0].slice(0, 100)
})
const app = computed(() => (update.current?.build ? 'b' + update.current.build : 'web'))
const ok = computed(() => message.value.trim().length >= 3 && !sending.value)

async function send() {
  if (!ok.value) return
  sending.value = true
  err.value = ''
  try {
    const r = await fetch(API + '/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: kind.value, message: message.value.trim(), contact: contact.value.trim(), app: app.value, device: device.value }),
    })
    if (!r.ok) throw new Error(r.status === 429 ? 'استنى دقيقة وابعت تاني' : 'ماوصلتش — جرّب تاني')
    showToast(kind.value === 'bug' ? '🙏 وصلت — هنبص عليها' : '💡 وصل اقتراحك — شكرًا!')
    emit('close')
  } catch (e) {
    err.value = e.message === 'Failed to fetch' ? 'مفيش نت — جرّب لما تتصل' : e.message
  } finally { sending.value = false }
}
</script>

<template>
  <BottomSheet :title="kind === 'bug' ? 'بلّغ عن مشكلة' : 'اقترح ميزة'" @close="emit('close')">
    <div class="seg">
      <button :class="{ on: kind === 'bug' }" @click="kind = 'bug'">🐞 مشكلة</button>
      <button :class="{ on: kind === 'idea' }" @click="kind = 'idea'">💡 ميزة</button>
    </div>
    <textarea ref="box" v-model="message" rows="5" maxlength="3000" :placeholder="kind === 'bug' ? 'إيه اللي حصل؟ وكنت في أنهي شاشة؟' : 'نفسك التطبيق يعمل إيه؟'"></textarea>
    <input v-model="contact" maxlength="120" placeholder="إيميلك أو رقمك علشان نرد عليك (اختياري)" />
    <p class="muted xs note">بيتبعت مع رسالتك: نسخة التطبيق ({{ app }}) ونوع الموبايل بس — مفيش أي عمليات أو رسايل.</p>
    <p v-if="err" class="bad sm">{{ err }}</p>
    <button class="send" :disabled="!ok" @click="send">{{ sending ? '…' : 'ابعت' }}</button>
  </BottomSheet>
</template>

<style scoped>
.seg { display: grid; grid-template-columns: 1fr 1fr; background: var(--surface-2); border-radius: 12px; padding: 3px; margin-bottom: 12px }
.seg button { border: 0; background: none; font: inherit; font-size: 14px; padding: 9px; border-radius: 10px; color: var(--ink-2); cursor: pointer }
.seg button.on { background: var(--surface); color: var(--ink); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,.08) }
textarea, input { width: 100%; box-sizing: border-box; font: inherit; font-size: 15px; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 11px 12px; outline: none; resize: vertical }
input { margin-top: 10px }
textarea:focus, input:focus { border-color: var(--accent) }
.note { margin: 10px 2px 0; line-height: 1.6 }
.bad { color: var(--bad); margin: 8px 2px 0 }
.send { width: 100%; margin-top: 14px; padding: 13px; border: 0; border-radius: 14px; background: var(--accent); color: #fff; font: inherit; font-weight: 600; cursor: pointer }
.send:disabled { opacity: .5 }
</style>
