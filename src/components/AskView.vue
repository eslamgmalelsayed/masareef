<script setup>
// اسأل التطبيق — المحادثة بتفضل على الموبايل بس
import { ref, nextTick, onMounted } from 'vue'
import { askApp } from '../lib/ask.js'

const emit = defineEmits(['back'])
const IDEAS = ['صرفت كام على الأكل الراتب ده؟', 'إيه أكتر شهر صرفت فيه؟', 'أقدر أوفر منين؟', 'بصرف أكتر من الشهر اللي فات؟', 'إيه أكتر محل بصرف فيه؟']
const LS_KEY = 'askChat'
const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] } }
const chat = ref(load())
const q = ref('')
const busy = ref(false)
const box = ref(null)
const save = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(chat.value.slice(-30))) } catch {} }
const down = () => nextTick(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }))
onMounted(down)

async function send(text) {
  const t = String(text ?? q.value).trim()
  if (!t || busy.value) return
  q.value = ''
  chat.value.push({ me: 1, t })
  busy.value = true
  down()
  try {
    chat.value.push({ t: await askApp(t) })
  } catch (e) {
    chat.value.push({ err: 1, t: e.message === 'limit' ? 'اتعديت عدد الأسئلة النهارده — جرّب بكرة 🙏' : /fetch|network/i.test(e.message) ? 'مفيش نت — جرّب لما تتصل' : 'حصلت مشكلة، جرّب تاني' })
  } finally {
    busy.value = false
    save()
    down()
  }
}
function clear() { chat.value = []; save() }
</script>

<template>
  <div class="view ask">
    <header class="hd sub">
      <button class="back" @click="emit('back')">→</button>
      <h1>اسأل التطبيق</h1>
      <button v-if="chat.length" class="back" title="امسح المحادثة" @click="clear">🗑</button>
      <span v-else style="width: 38px"></span>
    </header>

    <p v-if="!chat.length" class="muted sm intro">اسأل عن فلوسك بكلامك العادي. الحسابات بتتعمل على موبايلك، واللي بيطلع للذكاء الاصطناعي سؤالك وأرقام مجمّعة بس — من غير عمليات ولا أسماء أشخاص.</p>
    <div v-if="!chat.length" class="ideas">
      <button v-for="i in IDEAS" :key="i" @click="send(i)">{{ i }}</button>
    </div>

    <div class="msgs">
      <div v-for="(m, i) in chat" :key="i" class="m" :class="{ me: m.me, err: m.err }">{{ m.t }}</div>
      <div v-if="busy" class="m typing"><i></i><i></i><i></i></div>
    </div>

    <form class="bar" @submit.prevent="send()">
      <input ref="box" v-model="q" maxlength="300" placeholder="اسأل… مثلًا: صرفت كام على المطاعم؟" />
      <button :disabled="!q.trim() || busy">↑</button>
    </form>
  </div>
</template>

<style scoped>
.ask { padding-bottom: calc(160px + env(safe-area-inset-bottom)) }
.intro { margin: 0 6px 12px; line-height: 1.7 }
.ideas { display: flex; flex-direction: column; gap: 8px }
.ideas button { text-align: right; border: 1px solid var(--line); background: var(--surface); border-radius: 14px; padding: 12px 14px; font: inherit; font-size: 14px; color: var(--ink); cursor: pointer }
.msgs { display: flex; flex-direction: column; gap: 10px; margin-top: 10px }
.m { max-width: 86%; padding: 11px 14px; border-radius: 18px; font-size: 14.5px; line-height: 1.75; white-space: pre-wrap; background: var(--surface); border: 1px solid var(--line); align-self: flex-end; border-bottom-left-radius: 6px; unicode-bidi: plaintext }
.m.me { align-self: flex-start; background: var(--accent); color: #fff; border: 0; border-bottom-left-radius: 18px; border-bottom-right-radius: 6px }
.m.err { color: var(--bad) }
.typing { display: flex; gap: 4px; padding: 14px }
.typing i { width: 7px; height: 7px; border-radius: 50%; background: var(--ink-3); animation: b 1s infinite }
.typing i:nth-child(2) { animation-delay: .15s } .typing i:nth-child(3) { animation-delay: .3s }
@keyframes b { 0%, 60%, 100% { opacity: .3 } 30% { opacity: 1 } }
.bar { position: fixed; left: 0; right: 0; bottom: calc(68px + env(safe-area-inset-bottom)); display: flex; gap: 8px; padding: 10px 14px; background: color-mix(in srgb, var(--bg) 92%, transparent); backdrop-filter: blur(8px); max-width: 560px; margin: 0 auto }
.bar input { flex: 1; min-width: 0; font: inherit; font-size: 15px; padding: 12px 14px; border-radius: 16px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); outline: none }
.bar input:focus { border-color: var(--accent) }
.bar button { width: 46px; border: 0; border-radius: 14px; background: var(--accent); color: #fff; font-size: 20px; font-weight: 700; cursor: pointer }
.bar button:disabled { opacity: .45 }
</style>
