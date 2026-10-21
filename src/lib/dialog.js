import { reactive } from 'vue'

// سؤال جوه التطبيق بدل confirm() بتاع النظام (اللي زراره بالإنجليزي)
export const dialog = reactive({ open: false, icon: '', title: '', text: '', options: [], input: null, resolve: null })

/** options: [{ label, value, kind: 'primary' | 'danger' | '' }] → بيرجّع value اللي اخترته أو null */
export function choose({ icon = '', title = '', text = '', options }) {
  return new Promise((resolve) => Object.assign(dialog, { open: true, icon, title, text, options, input: null, resolve }))
}
/** نعم/لأ */
export async function ask(text, { yes = 'تمام', danger = false, title = '', icon = danger ? '🗑️' : '' } = {}) {
  return (await choose({ icon, title, text, options: [{ label: yes, value: true, kind: danger ? 'danger' : 'primary' }, { label: 'إلغاء', value: null }] })) === true
}
/** سؤال بخانة كتابة */
export function promptText(title, value = '') {
  return new Promise((resolve) => Object.assign(dialog, { open: true, icon: '✏️', title, text: '', options: [{ label: 'حفظ', value: '__input', kind: 'primary' }, { label: 'إلغاء', value: null }], input: value, resolve }))
}
export function answer(v) {
  const r = dialog.resolve
  const out = v === '__input' ? dialog.input : v
  Object.assign(dialog, { open: false, resolve: null })
  r && r(out)
}
