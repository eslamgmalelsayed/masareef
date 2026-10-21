<script setup>
import { onMounted } from 'vue'
import { isIOS } from '../lib/smsSource.js'

defineProps({ busy: Boolean, error: String })
const emit = defineEmits(['unlock'])
onMounted(() => emit('unlock'))
</script>

<template>
  <div class="lock">
    <img src="/icon-192.png" alt="" class="logo" onerror="this.style.display='none'" />
    <h2>مصاريفي مقفول</h2>
    <p class="muted sm">{{ isIOS ? 'افتحه بـ Face ID أو رمز الموبايل' : 'افتحه بالبصمة أو الوش أو رمز الموبايل' }}</p>
    <button class="btn" :disabled="busy" @click="emit('unlock')">🔓 افتح</button>
    <p v-if="error" class="muted xs err">{{ error }}</p>
  </div>
</template>

<style scoped>
.lock { position: fixed; inset: 0; z-index: 200; background: var(--bg); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 24px; text-align: center }
.logo { width: 76px; height: 76px; border-radius: 20px; margin-bottom: 6px }
h2 { margin: 0; font-size: 20px }
.btn { margin-top: 14px; padding: 13px 34px; border-radius: 14px; border: 0; background: var(--accent); color: #fff; font: inherit; font-weight: 600; font-size: 16px; cursor: pointer }
.btn:disabled { opacity: .6 }
.err { max-width: 260px }
</style>
