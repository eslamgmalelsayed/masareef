// POST /api/feedback — "بلّغ عن مشكلة" / "اقترح ميزة" من التطبيق → Netlify Forms (تتشاف من لوحة Netlify وتوصل إيميل)
import { json, preflight, body } from '../../lib/common.mjs'

const KIND = { bug: '🐞 مشكلة', idea: '💡 ميزة' }
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, n)

export default async (req, context) => {
  if (req.method === 'OPTIONS') return preflight()
  let q
  try { q = await body(req, 6000) } catch { return json({ error: 'bad request' }, 400) }
  const message = clip(q?.message, 3000)
  if (!KIND[q?.type] || message.length < 3) return json({ error: 'bad request' }, 400)
  const form = new URLSearchParams({
    'form-name': 'feedback',
    kind: KIND[q.type],
    message,
    contact: clip(q.contact, 120),
    app: clip(q.app, 40),
    device: clip(q.device, 120),
  })
  const site = context?.site?.url || new URL(req.url).origin
  const r = await fetch(new URL('/__forms.html', site), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() })
  if (!r.ok) { console.error('forms', r.status); return json({ error: 'not saved' }, 502) }
  return json({ ok: true })
}

export const config = { path: '/api/feedback', method: ['POST', 'OPTIONS'], rateLimit: { windowLimit: 5, windowSize: 60, aggregateBy: ['ip', 'domain'] } }
