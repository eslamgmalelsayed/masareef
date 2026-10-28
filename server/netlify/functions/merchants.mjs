// POST /api/merchants — أسماء محلات (مش أشخاص) → اسم المحل الموحّد + البند بتاعه.
// النتيجة بتتحفظ لكل المستخدمين: نفس المحل مش بيتسأل عليه تاني. ولو مفيش بند مناسب،
// الذكاء الاصطناعي بيعمل بند جديد ويحطه في مجموعة — والبند ده بيبقى واحد عند الكل.
import { store, json, preflight, body, capOk, hash } from '../../lib/common.mjs'
import { gemini } from '../../lib/gemini.mjs'
import { CATEGORIES, GROUPS, merchantNorm } from '../../../src/lib/categories.js'

// البنود اللي ممكن محل يتحط فيها (مش التحويلات والسحب والرسوم — دي بتتحدد من نوع العملية)
const NOT_SHOP = new Set(['transfer', 'intl', 'cash', 'fee', 'ccpay', 'self', 'bnpl', 'other'])
const BASE = CATEGORIES.filter((c) => !NOT_SHOP.has(c.id))
const GIDS = GROUPS.filter((g) => !['g_people', 'g_other'].includes(g.id)).map((g) => g.id)

export default async (req) => {
  if (req.method === 'OPTIONS') return preflight()
  let q
  try { q = await body(req, 8000) } catch { return json({ error: 'bad request' }, 400) }
  const list = Array.isArray(q?.names) ? q.names : null
  if (!list || !list.length || list.length > 40) return json({ error: 'bad request' }, 400)
  const items = []
  for (const x of list) {
    const n = String(x?.n || '').trim().slice(0, 60)
    const k = merchantNorm(n)
    if (k.length < 2) continue
    items.push({ n, k, hint: typeof x?.hint === 'string' ? x.hint.slice(0, 20) : '' })
  }
  if (!items.length) return json({ m: {}, cats: {} })
  const s = store()
  const cats = (await s.get('x/cats', { type: 'json' })) || {}
  const out = {}
  const todo = []
  for (const it of items) {
    const have = await s.get('m/' + it.k, { type: 'json' })
    if (have) out[it.k] = have
    else if (!todo.some((t) => t.k === it.k)) todo.push(it)
  }
  if (todo.length) {
    if (!(await capOk(s, 'm'))) return json({ m: out, cats, partial: true }, Object.keys(out).length ? 200 : 429)
    let r
    try { r = await ask(todo, cats) } catch (e) { console.error(e); return json({ m: out, cats, partial: true }, Object.keys(out).length ? 200 : 503) }
    let newCats = false
    for (const [i, it] of todo.entries()) {
      const a = r[i]
      if (!a) continue
      let c = a.cat
      if (c === 'new' && a.newCat?.name) {
        const name = String(a.newCat.name).trim().slice(0, 24)
        const id = 'x_' + hash('cat:' + name)
        if (!cats[id]) { cats[id] = { name, icon: String(a.newCat.icon || '•').slice(0, 4), group: GIDS.includes(a.newCat.group) ? a.newCat.group : 'g_shop' }; newCats = true }
        c = id
      }
      if (!BASE.some((b) => b.id === c) && !cats[c]) c = 'shop'
      const v = { b: String(a.brand || it.n).trim().slice(0, 32) || it.n, c }
      out[it.k] = v
      await s.setJSON('m/' + it.k, v)
    }
    if (newCats) await s.setJSON('x/cats', cats)
  }
  return json({ m: out, cats })
}

async function ask(todo, cats) {
  const catList = [...BASE.map((c) => `${c.id}: ${c.name}`), ...Object.entries(cats).map(([id, c]) => `${id}: ${c.name}`)].join('\n')
  const groups = GROUPS.filter((g) => GIDS.includes(g.id)).map((g) => `${g.id}: ${g.name}`).join('\n')
  const names = todo.map((t, i) => `${i}. ${t.n}${t.hint ? `   (simple rules guessed: ${t.hint})` : ''}`).join('\n')
  const r = await gemini(`You categorize merchant names as they appear on bank card notifications (any country; often abbreviated, uppercase, with branch numbers or city names, e.g. "ALBAIK-RIYADH 023", "NAHDI 1288", "مطعم ابو عوف").
For every merchant return:
- brand: the clean, well-known name of the business, the SAME for all its branches and spellings (e.g. "ALBAIK-RIYADH 023" and "البيك" → "البيك"; "STARBUCKS 4421" → "Starbucks"). Keep the script people use for that brand. If you do not recognize it, clean the given name (drop branch numbers, city names, codes).
- cat: the id of the best category from this list:
${catList}
  "shop" is for general stores you cannot place better. Use "new" ONLY when the merchant clearly belongs to a common kind of spending that none of the categories cover (e.g. a gym, a barber, a pet shop, a car wash) — then also give newCat.
- newCat (only when cat = "new"): name = a short Arabic category name (2–3 words, general enough for other merchants of the same kind), icon = one emoji, group = the closest group id from:
${groups}
The rule-based guess in parentheses is often right for local chains but may be wrong; use your own judgment.

Merchants:
${names}

Return a JSON array with one object per merchant, in the same order.`, {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        brand: { type: 'STRING' },
        cat: { type: 'STRING' },
        newCat: { type: 'OBJECT', nullable: true, properties: { name: { type: 'STRING' }, icon: { type: 'STRING' }, group: { type: 'STRING' } } },
      },
      required: ['brand', 'cat'],
    },
  })
  return Array.isArray(r) ? r : []
}

export const config = { path: '/api/merchants', method: ['POST', 'OPTIONS'], rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] } }
