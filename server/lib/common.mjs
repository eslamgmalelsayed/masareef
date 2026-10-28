// حاجات مشتركة بين functions السيرفر
import { getStore } from '@netlify/blobs'
import { maskSample, shapeOf, validTemplate, linesOf, KINDS, hash, ANCHORS, applyTemplate, anchorsFound } from '../../src/lib/shapes.js'

export { maskSample, shapeOf, validTemplate, linesOf, KINDS, hash, ANCHORS, applyTemplate, anchorsFound }
export const store = () => getStore({ name: 'templates', consistency: 'strong' })

// التطبيق بيكلّمنا من جوه الموبايل (أصل مختلف) — لازم CORS. مفيش كوكيز ولا بيانات دخول
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' }
export const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS, ...extra } })
export const preflight = () => new Response(null, { status: 204, headers: CORS })

/** جسم الطلب بحدود: مفيش طلبات ضخمة */
export async function body(req, max = 4000) {
  const t = await req.text()
  if (t.length > max) throw new Error('too large')
  return JSON.parse(t)
}
export const devKey = (d) => hash('dev:' + String(d || '').slice(0, 64))
export const okId = (id) => typeof id === 'string' && /^[a-z0-9]{4,20}$/.test(id)

/** سقف يومي لنداءات Gemini على السيرفر كله (القراية الذكية + البنوك + اسأل التطبيق). false = خلص */
export async function capOk(s, kind = 'q') {
  const cap = Number(Netlify.env.get('GEMINI_DAILY_CAP')) || 500
  const day = new Date().toISOString().slice(0, 10)
  const { blobs } = await s.list({ prefix: `q/${day}/` })
  if (blobs.length >= cap) return false
  await s.set(`q/${day}/${kind}-${crypto.randomUUID()}`, '1')
  return true
}
