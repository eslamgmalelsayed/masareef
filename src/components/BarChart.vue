<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { Chart, BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js'
import { fmt } from '../lib/format.js'
import { state } from '../lib/store.js'

Chart.register(BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend)

const props = defineProps({
  labels: Array,
  datasets: Array, // [{label, data, color | colors}]
  stacked: Boolean,
  legend: Boolean,
  height: { type: Number, default: 200 },
})
const el = ref(null)
let chart = null

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim()

function build() {
  if (chart) chart.destroy()
  const line = css('--line'), ink3 = css('--ink-3')
  Chart.defaults.font.family = '"IBM Plex Sans Arabic", system-ui, sans-serif'
  Chart.defaults.color = ink3
  chart = new Chart(el.value, {
    type: 'bar',
    data: {
      labels: [...props.labels],
      datasets: props.datasets.map((d) =>
        d.type === 'line'
          ? { type: 'line', label: d.label, data: [...d.data], borderColor: d.color, backgroundColor: d.color, borderWidth: 2, borderDash: [5, 4], pointRadius: 3, pointHoverRadius: 5, tension: 0, stack: 'line', order: -1 }
          : { label: d.label, data: [...d.data], backgroundColor: d.colors ? [...d.colors] : d.color, borderRadius: props.stacked ? 3 : 6, borderSkipped: false, maxBarThickness: 30, stack: 'bars' },
      ),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: {
        legend: { display: props.legend, position: 'bottom', rtl: true, labels: { boxWidth: 9, boxHeight: 9, padding: 10, font: { size: 11 } } },
        tooltip: {
          rtl: true,
          textDirection: 'rtl',
          mode: props.stacked ? 'index' : 'nearest',
          filter: (i) => i.parsed.y > 0,
          itemSort: (a, b) => b.parsed.y - a.parsed.y,
          callbacks: {
            label: (c) => ` ${props.datasets.length > 1 ? c.dataset.label + ': ' : ''}${fmt(c.parsed.y)} ر.س`,
            footer: (items) => { const b = items.filter((i) => i.dataset.type !== 'line'); return props.stacked && b.length > 1 ? 'الإجمالي: ' + fmt(b.reduce((s, i) => s + i.parsed.y, 0)) + ' ر.س' : '' },
          },
        },
      },
      scales: {
        x: { stacked: props.stacked, grid: { display: false }, border: { color: line }, ticks: { maxRotation: 0, autoSkipPadding: 8, font: { size: 11 } } },
        y: { stacked: props.stacked, grid: { color: line }, border: { display: false }, ticks: { font: { size: 11 }, callback: (v) => (v >= 1000 ? v / 1000 + 'k' : v) } },
      },
    },
  })
}

onMounted(build)
watch(() => state.settings.theme, () => setTimeout(build, 30))
watch(() => [props.labels, props.datasets], build, { deep: true })
const mq = window.matchMedia('(prefers-color-scheme: dark)')
mq.addEventListener('change', build)
onBeforeUnmount(() => { chart && chart.destroy(); mq.removeEventListener('change', build) })
</script>

<template>
  <div :style="{ position: 'relative', height: height + 'px' }"><canvas ref="el"></canvas></div>
</template>
