import { reactive } from 'vue'
// رسالة صغيرة تحت الشاشة بتأكد إن الحاجة اتعملت (ومعاها تراجع لو فيه)
export const toast = reactive({ text: '', undo: null, id: 0 })
let t = null
export function showToast(text, undo = null, ms = 4000) {
  Object.assign(toast, { text, undo, id: toast.id + 1 })
  clearTimeout(t)
  t = setTimeout(() => { toast.text = ''; toast.undo = null }, ms)
}
export function hideToast() { toast.text = ''; toast.undo = null }
