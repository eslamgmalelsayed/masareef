<script setup>
// تقرير الشهر: صورة فيها الشهر في أرقام + سطر من الذكاء الاصطناعي — تتشارك أو تتحفظ
import { ref, watch, onMounted } from 'vue'
import { monthStats, drawReport, shareReport } from '../lib/report.js'
import { askApp } from '../lib/ask.js'
import { cycles } from '../lib/store.js'

const emit = defineEmits(['back'])
const idx = ref(cycles.value.length > 1 ? -2 : -1)
const img = ref('')
const line = ref('')
const busy = ref(false)
let cv = null
const lines = {}

async function render() {
  const s = monthStats(idx.value)
  cv = await drawReport(s, line.value)
  img.value = cv.toDataURL('image/png')
}
async function ai() {
  const k = idx.value
  if (lines[k] != null) { line.value = lines[k]; return render() }
  busy.value = true
  const s = monthStats(k)
  try {
    const a = await askApp(`اكتب جملة واحدة بس (أقل من ١٥ كلمة)، ودودة ومشجعة، تلخّص فترة راتب ${s.label}: صرفت ${Math.round(s.spent)}${s.salary ? ' من ' + Math.round(s.salary) : ''}، والتغيير عن اللي قبلها ${s.change == null ? 'مش معروف' : Math.round(s.change * 100) + '٪'}. من غير أرقام كتير ومن غير مقدمات.`)
    lines[k] = line.value = String(a || '').split('\n')[0].replace(/^["“]|["”]$/g, '').slice(0, 110)
  } catch { lines[k] = line.value = '' }
  busy.value = false
  render()
}
watch(idx, () => { line.value = ''; render().then(ai) })
onMounted(() => render().then(ai))
</script>

<template>
  <div class="view">
    <header class="hd sub">
      <button class="back" @click="emit('back')">→</button>
      <h1>تقرير الشهر</h1>
      <span style="width: 38px"></span>
    </header>
    <div v-if="cycles.length > 1" class="seg">
      <button :class="{ on: idx === -2 }" @click="idx = -2">الراتب اللي فات</button>
      <button :class="{ on: idx === -1 }" @click="idx = -1">الراتب ده (لحد النهارده)</button>
    </div>
    <div class="pv"><img v-if="img" :src="img" alt="تقرير الشهر" /><div v-if="busy" class="ai muted xs">🤖 بكتبلك سطر عن الشهر…</div></div>
    <button class="share" :disabled="!img" @click="shareReport(cv, monthStats(idx).label)">📤 شارك أو احفظ الصورة</button>
  </div>
</template>

<style scoped>
.seg { display: grid; grid-template-columns: 1fr 1fr; background: var(--surface-2); border-radius: 12px; padding: 3px; margin-bottom: 12px }
.seg button { border: 0; background: none; font: inherit; font-size: 13.5px; padding: 9px; border-radius: 10px; color: var(--ink-2); cursor: pointer }
.seg button.on { background: var(--surface); color: var(--ink); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,.08) }
.pv { position: relative; border-radius: 22px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,.15); aspect-ratio: 1080 / 1350; background: #0f766e }
.pv img { width: 100%; display: block }
.ai { position: absolute; bottom: 10px; left: 0; right: 0; text-align: center; color: #fff }
.share { width: 100%; margin-top: 14px; padding: 14px; border: 0; border-radius: 16px; background: var(--accent); color: #fff; font: inherit; font-weight: 600; font-size: 15px; cursor: pointer }
</style>
