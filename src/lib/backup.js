import { state } from './store.js'
import { isNative } from './smsSource.js'

// اللي بتكتبه بإيدك بس — الرسايل نفسها بتتقري من الموبايل تاني
const KEYS = ['settings', 'overrides', 'manualTx', 'webMsgs', 'importedTx', 'importedBnpl', 'detected']

export async function exportBackup() {
  const data = { app: 'masareef', v: 1, at: Date.now() }
  for (const k of KEYS) data[k] = state[k]
  const json = JSON.stringify(data)
  const d = new Date()
  const name = `masareef-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`
  if (isNative) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const r = await Filesystem.writeFile({ path: name, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 })
    await Share.share({ title: 'نسخة احتياطية — مصاريفي', url: r.uri, dialogTitle: 'احفظ النسخة الاحتياطية' })
  } else {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }
  return name
}

/** بيرجّع كل حاجة من الملف وبيعيد فتح التطبيق */
export async function importBackup(file) {
  const o = JSON.parse(await file.text())
  if (!o || o.app !== 'masareef') throw new Error('الملف ده مش نسخة احتياطية من مصاريفي')
  for (const k of KEYS) if (o[k] !== undefined) localStorage.setItem(k, JSON.stringify(o[k]))
  location.reload()
}
