// POST /api/confirm — موبايل جرّب القالب على رسايله وطلع صح. لما يتأكد عند موبايلين → يدخل المكتبة المشتركة
import { store, json, preflight, body, okId, devKey } from '../../lib/common.mjs'

const NEED = 2

export default async (req) => {
  if (req.method === 'OPTIONS') return preflight()
  let q
  try { q = await body(req, 500) } catch { return json({ error: 'bad request' }, 400) }
  if (!okId(q?.id) || !q?.device) return json({ error: 'bad request' }, 400)
  const s = store()
  const t = await s.get('t/' + q.id, { type: 'json' })
  if (!t) return json({ error: 'unknown' }, 404)
  await s.set(`c/${q.id}/${devKey(q.device)}`, '1', { onlyIfNew: true })
  const { blobs } = await s.list({ prefix: `c/${q.id}/` })
  if (blobs.length >= NEED && t.status === 'pending') {
    await s.setJSON('t/' + q.id, { ...t, status: 'approved', approvedAt: Date.now() })
    await s.setJSON('a/' + q.id, t.template) // المكتبة المشتركة (بتتجمع في catalog)
  }
  return json({ ok: true, confirms: blobs.length })
}

export const config = { path: '/api/confirm', method: ['POST', 'OPTIONS'], rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] } }
