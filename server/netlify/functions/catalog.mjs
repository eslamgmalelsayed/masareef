// GET /api/catalog — المكتبة المشتركة: القوالب اللي اتأكدت عند أكتر من موبايل
import { store, json, preflight } from '../../lib/common.mjs'

export default async (req) => {
  if (req.method === 'OPTIONS') return preflight()
  const cat = await store().get('catalog', { type: 'json' })
  return json(cat || { templates: {}, at: 0 }, 200, { 'netlify-cdn-cache-control': 'public, s-maxage=600, stale-while-revalidate=3600' })
}

export const config = { path: '/api/catalog', method: ['GET', 'OPTIONS'] }
