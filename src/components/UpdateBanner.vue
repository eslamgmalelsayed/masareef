<script setup>
import { update, installUpdate } from '../lib/updater.js'
defineProps({ compact: Boolean })
</script>

<template>
  <section v-if="update.available" class="card upd">
    <div class="top">
      <span class="ic">⬆️</span>
      <div class="mid">
        <b>في تحديث جديد</b>
        <div class="muted xs">نسخة {{ update.latest.build }} · عندك {{ update.current?.build }}</div>
      </div>
      <button class="go" :disabled="update.status === 'downloading'" @click="installUpdate">
        {{ update.status === 'downloading' ? 'بينزّل…' : 'حدّث' }}
      </button>
    </div>
    <p v-if="update.latest.notes && !compact" class="notes">{{ update.latest.notes }}</p>
    <p v-if="update.status === 'need-permission'" class="warn">اسمح لـ "مصاريفي" إنه يسطّب تطبيقات من الشاشة اللي اتفتحت، وارجع دوس حدّث تاني.</p>
    <p v-if="update.status === 'error'" class="warn">مقدرتش أنزّل التحديث: {{ update.error }}</p>
  </section>
</template>

<style scoped>
.upd { border-color: var(--accent); background: var(--accent-soft) }
.top { display: flex; align-items: center; gap: 12px }
.ic { font-size: 22px }
.mid { flex: 1 }
.go { padding: 10px 18px; border-radius: 12px; border: 0; background: var(--accent); color: #fff; font: inherit; font-weight: 600; cursor: pointer }
.go:disabled { opacity: .6 }
.notes { font-size: 13px; white-space: pre-line; margin: 10px 0 0; color: var(--ink-2); line-height: 1.6 }
.warn { font-size: 12.5px; color: #b45309; margin: 8px 0 0 }
</style>
