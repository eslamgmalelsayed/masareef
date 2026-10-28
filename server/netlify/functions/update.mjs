// GET /api/update — آخر نسخة من التطبيق (من Releases على GitHub). شغال والريبو عام أو خاص:
// لو الريبو خاص بنستخدم GITHUB_TOKEN (قراية بس) متخزن في Netlify — التطبيق نفسه مش محتاج أي مفتاح
// GET /api/apk/:id — بيحوّل التطبيق للينك تنزيل مؤقت من GitHub للـ APK
import { json, preflight } from '../../lib/common.mjs'

const REPO = 'eslamgmalelsayed/masareef'
const gh = (path, accept = 'application/vnd.github+json') => {
  const token = Netlify.env.get('GITHUB_TOKEN')
  return fetch('https://api.github.com' + path, {
    headers: { accept, 'user-agent': 'masareef-api', 'x-github-api-version': '2022-11-28', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    redirect: 'manual',
  })
}

export default async (req, context) => {
  if (req.method === 'OPTIONS') return preflight()
  const id = context.params?.id
  if (id) {
    if (!/^\d{1,15}$/.test(id)) return json({ error: 'bad id' }, 400)
    const r = await gh(`/repos/${REPO}/releases/assets/${id}`, 'application/octet-stream')
    const to = r.headers.get('location')
    if (!to) return json({ error: 'not found' }, 404)
    return new Response(null, { status: 302, headers: { location: to, 'cache-control': 'no-store' } })
  }
  const r = await gh(`/repos/${REPO}/releases/latest`)
  if (!r.ok) return json({ error: 'github ' + r.status }, 502)
  const j = await r.json()
  const apk = (j.assets || []).find((a) => a.name.endsWith('.apk'))
  return json({
    tag: j.tag_name, name: j.name || j.tag_name, notes: j.body || '', date: j.published_at,
    build: Number(String(j.tag_name).replace(/\D/g, '')) || 0,
    apk: apk ? `/api/apk/${apk.id}` : null,
  }, 200, { 'netlify-cdn-cache-control': 'public, s-maxage=300' })
}

export const config = { path: ['/api/update', '/api/apk/:id'], method: ['GET', 'OPTIONS'] }
