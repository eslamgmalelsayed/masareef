// POST /api/sender — راسل رسايل جديد: بنك/محفظة ولا لأ؟ النتيجة بتتحفظ لكل المستخدمين (اسم الراسل مش بيانات شخصية)
import { store, json, preflight, body, maskSample, linesOf, capOk } from '../../lib/common.mjs'
import { askSender } from '../../lib/gemini.mjs'

export default async (req) => {
  if (req.method === 'OPTIONS') return preflight()
  let q
  try { q = await body(req) } catch { return json({ error: 'bad request' }, 400) }
  const sender = String(q?.sender || '').trim()
  if (!sender || sender.length > 40 || /^\+?\d+$/.test(sender) || typeof q.sample !== 'string' || linesOf(q.sample).length > 25) return json({ error: 'bad request' }, 400)
  const id = 's/' + sender.toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '-')
  const s = store()
  const have = await s.get(id, { type: 'json' })
  if (have) return json(have)
  if (!(await capOk(s, 's'))) return json({ error: 'daily limit' }, 429)
  let r
  try { r = await askSender(sender, maskSample(q.sample)) } catch (e) { console.error(e); return json({ error: 'ai unavailable' }, 503) }
  const out = { ...r, at: Date.now() }
  await s.setJSON(id, out)
  return json(out)
}

export const config = { path: '/api/sender', method: ['POST', 'OPTIONS'], rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] } }
