// POST /api/learn — شكل رسالة جديد: لو اتعلمناه قبل كده نرجّع قالبه (كاش مشترك لكل المستخدمين)، وإلا نسأل Gemini مرة واحدة
import { store, json, preflight, body, okId, maskSample, shapeOf, validTemplate, linesOf, applyTemplate } from '../../lib/common.mjs'
import { askGemini } from '../../lib/gemini.mjs'

export default async (req) => {
  if (req.method === 'OPTIONS') return preflight()
  let q
  try { q = await body(req) } catch { return json({ error: 'bad request' }, 400) }
  const { id, bank, sample, hint } = q || {}
  if (!okId(id) || typeof bank !== 'string' || bank.length > 40 || typeof sample !== 'string' || linesOf(sample).length > 25) return json({ error: 'bad request' }, 400)
  // أمان: بنخفي تاني على السيرفر (حتى لو التطبيق اتلعب فيه، مفيش اسم ولا رقم حقيقي يوصل لـ Gemini أو يتخزن)
  const clean = maskSample(sample)
  if (shapeOf(bank, clean).id !== id) return json({ error: 'shape mismatch' }, 400)

  const s = store()
  const have = await s.get('t/' + id, { type: 'json' })
  // القالب موجود ومش متبلّغ عليه → كاش (مفيش نداء لـ Gemini)
  if (have && have.status !== 'disputed') return json({ template: have.template, status: have.status })

  // سقف يومي لنداءات Gemini على السيرفر كله (حماية من حرق الحصة). القوالب المتخزنة بتفضل شغالة عادي
  const cap = Number(Netlify.env.get('GEMINI_DAILY_CAP')) || 500
  const day = new Date().toISOString().slice(0, 10)
  const { blobs: used } = await s.list({ prefix: `q/${day}/` })
  if (used.length >= cap) return json({ error: 'daily limit', retryAfter: 'tomorrow' }, 429, { 'retry-after': '3600' })
  await s.set(`q/${day}/${crypto.randomUUID()}`, '1')

  let tpl
  try { tpl = await askGemini(bank, clean, hint && typeof hint === 'object' ? { kind: String(hint.kind || ''), amountLine: Number.isInteger(hint.amountLine) ? hint.amountLine : null } : null) }
  catch (e) { console.error(e); return json({ error: 'ai unavailable' }, 503) }
  // لازم القالب يقرا النسخة المخفية نفسها (المبلغ يطلع، والكلمات اللي بتحدد المكان موجودة فعلًا)
  if (!validTemplate(tpl, linesOf(clean).length) || (tpl.kind !== 'ignore' && !applyTemplate(tpl, clean, Date.now(), {}))) {
    console.warn('rejected template', JSON.stringify(tpl))
    return json({ template: null }, 422)
  }

  await s.setJSON('t/' + id, { template: tpl, status: 'pending', bank, sample: clean, at: Date.now(), v: (have?.v || 0) + 1 })
  return json({ template: tpl, status: 'pending' })
}

export const config = {
  path: '/api/learn',
  method: ['POST', 'OPTIONS'],
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
}
