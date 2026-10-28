// POST /api/report — القالب طلع غلط عند موبايل (البنك غيّر شكل رسايله مثلًا). موبايلين بلّغوا → يتشال ويتعلم من جديد
import { store, json, preflight, body, okId, devKey } from '../../lib/common.mjs'

const NEED = 2

export default async (req) => {
  if (req.method === 'OPTIONS') return preflight()
  let q
  try { q = await body(req, 500) } catch { return json({ error: 'bad request' }, 400) }
  if (!okId(q?.id) || !q?.device) return json({ error: 'bad request' }, 400)
  const s = store()
  const t = await s.get('t/' + q.id, { type: 'json' })
  if (!t) return json({ ok: true })
  await s.set(`r/${q.id}/${t.v || 1}/${devKey(q.device)}`, String(q.got || ''), { onlyIfNew: true })
  const { blobs } = await s.list({ prefix: `r/${q.id}/${t.v || 1}/` })
  // قالب لسه محدش أكده: بلاغ واحد كفاية. قالب في المكتبة: لازم بلاغين
  if (blobs.length >= (t.status === 'approved' ? NEED : 1)) {
    await s.setJSON('t/' + q.id, { ...t, status: 'disputed' })
    await s.delete('a/' + q.id)
  }
  return json({ ok: true })
}

export const config = { path: '/api/report', method: ['POST', 'OPTIONS'], rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] } }
