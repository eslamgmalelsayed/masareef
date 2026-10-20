import { reactive } from 'vue'
import { registerPlugin } from '@capacitor/core'
import { App } from '@capacitor/app'
import { isNative } from './smsSource.js'

const SmsReader = registerPlugin('SmsReader')
export const REPO = 'eslamgmalelsayed/masareef'

export const update = reactive({
  current: null, // { version, build }
  latest: null, // { build, name, notes, url, date }
  checking: false,
  available: false,
  status: '', // '' | downloading | need-permission | error
  error: '',
})

/** بيشوف آخر Release على GitHub ويقارنه برقم النسخة المتسطّبة */
export async function checkUpdate() {
  if (!isNative) return
  update.checking = true
  update.error = ''
  try {
    update.current = await App.getInfo()
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const j = await r.json()
    const apk = (j.assets || []).find((a) => a.name.endsWith('.apk'))
    const build = Number(String(j.tag_name).replace(/\D/g, ''))
    update.latest = { build, name: j.name || j.tag_name, notes: j.body || '', url: apk && apk.browser_download_url, date: j.published_at }
    update.available = !!(apk && build > Number(update.current.build))
  } catch (e) {
    update.error = String(e.message || e)
  } finally {
    update.checking = false
  }
}

export async function installUpdate() {
  if (!update.latest?.url) return
  update.status = 'downloading'
  try {
    const { allowed } = await SmsReader.canInstall()
    if (!allowed) {
      update.status = 'need-permission'
      await SmsReader.openInstallSettings()
      return
    }
    await SmsReader.installUpdate({ url: update.latest.url })
    update.status = ''
  } catch (e) {
    const m = String(e.message || e)
    update.status = /install-permission/.test(m) ? 'need-permission' : 'error'
    update.error = m
  }
}
