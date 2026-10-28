// POST /api/limit-groups — بنود ومصروفها (أرقام مجمّعة بس) → اقتراح بنود تتدمج تحت حد واحد
import { store, json, preflight, body, capOk } from '../../lib/common.mjs'
import { gemini } from '../../lib/gemini.mjs'

export default async (req) => {
  if (req.method === 'OPTIONS') return preflight()
  let q
  try { q = await body(req, 6000) } catch { return json({ error: 'bad request' }, 400) }
  const cats = Array.isArray(q?.cats) ? q.cats.slice(0, 40).map((c) => ({ id: String(c?.id || '').slice(0, 20), name: String(c?.name || '').slice(0, 30), spent: Math.round(Number(c?.spent) || 0), limit: Math.round(Number(c?.limit) || 0) })).filter((c) => c.id && c.name) : null
  if (!cats || cats.length < 2) return json({ error: 'bad request' }, 400)
  const s = store()
  if (!(await capOk(s, 'g'))) return json({ error: 'daily limit' }, 429)
  let r
  try {
    r = await gemini(`A personal expense app lets the user put several spending categories under ONE shared monthly limit (one alert for their total).
Here are the user's categories with their average monthly spending and the limit they set (0 = no limit), in ${String(q.currency || '').slice(0, 5) || 'local currency'}:
${cats.map((c) => `${c.id}: ${c.name} — spends ${c.spent}, limit ${c.limit}`).join('\n')}

Suggest at most 3 merges that make budgeting simpler: categories that are really the same kind of spending, where a single limit makes more sense than separate ones (e.g. restaurants + food delivery, online shopping + clothes).
Only merge categories the user actually spends on. Never merge transfers to people, rent, or bank fees with anything. Each category in at most one merge. Skip it if nothing is a clear win.
For each merge: name = a short Arabic name for the merged limit, cats = the category ids, why = one short Arabic sentence (Egyptian dialect) explaining the benefit.`, {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, cats: { type: 'ARRAY', items: { type: 'STRING' } }, why: { type: 'STRING' } }, required: ['name', 'cats', 'why'] },
    })
  } catch (e) { console.error(e); return json({ error: 'ai unavailable' }, 503) }
  const ids = new Set(cats.map((c) => c.id))
  const used = new Set()
  const out = []
  for (const g of Array.isArray(r) ? r : []) {
    const cs = [...new Set((g.cats || []).filter((c) => ids.has(c) && !used.has(c)))]
    if (cs.length < 2) continue
    cs.forEach((c) => used.add(c))
    out.push({ name: String(g.name || '').slice(0, 30), cats: cs, why: String(g.why || '').slice(0, 140) })
    if (out.length >= 3) break
  }
  return json({ groups: out })
}

export const config = { path: '/api/limit-groups', method: ['POST', 'OPTIONS'], rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] } }
