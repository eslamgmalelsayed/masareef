// POST /api/ask — "اسأل التطبيق": سؤال + أرقام مجمّعة من الموبايل → إجابة قصيرة بالمصري. مفيش حاجة بتتخزن
import { store, json, preflight, body, capOk } from '../../lib/common.mjs'
import { geminiText } from '../../lib/gemini.mjs'

export default async (req) => {
  if (req.method === 'OPTIONS') return preflight()
  let q
  try { q = await body(req, 16000) } catch { return json({ error: 'bad request' }, 400) }
  const question = String(q?.q || '').trim().slice(0, 300)
  if (question.length < 2 || typeof q.ctx !== 'object') return json({ error: 'bad request' }, 400)
  if (!(await capOk(store(), 'a'))) return json({ error: 'daily limit' }, 429)
  const prompt = `انت مساعد مالي جوه تطبيق مصاريف اسمه "مصاريفي". رد باللهجة المصرية، قصير وواضح (٢–٥ سطور)، ودود ومن غير مقدمات.
استخدم الأرقام اللي في البيانات تحت بس — متألفش أي رقم. لو المعلومة مش موجودة في البيانات قول كده بصراحة واقترح إزاي يعرفها من التطبيق.
اكتب المبالغ بأرقام إنجليزي (1,250) وبعدها رمز العملة "${q.ctx.currency_symbol || q.ctx.currency || ''}" بالظبط (مش الكود). لو فيه نصيحة، خليها عملية ومحددة بالأرقام.
"cycle" = الفترة من راتب للراتب اللي بعده.

البيانات (JSON):
${JSON.stringify(q.ctx).slice(0, 14000)}

السؤال: ${question}`
  try {
    const answer = await geminiText(prompt)
    return json({ answer: answer.trim().slice(0, 1500) })
  } catch (e) { console.error(e); return json({ error: 'ai unavailable' }, 503) }
}

export const config = { path: '/api/ask', method: ['POST', 'OPTIONS'], rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] } }
