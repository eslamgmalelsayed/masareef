// حاجات مشتركة بين functions السيرفر
import { getStore } from '@netlify/blobs'
import { maskSample, shapeOf, validTemplate, linesOf, KINDS, hash } from '../../src/lib/shapes.js'

export { maskSample, shapeOf, validTemplate, linesOf, KINDS, hash }
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
