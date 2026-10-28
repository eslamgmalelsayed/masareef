// GET /api/rates — أسعار العملات اليومية (قيمة الوحدة بالدولار). بنجيبها مرة في اليوم ونخزنها
import { store, json, preflight } from '../../lib/common.mjs'

const WANT = ['USD', 'SAR', 'AED', 'QAR', 'OMR', 'BHD', 'JOD', 'KWD', 'EGP', 'EUR', 'GBP', 'TRY', 'MAD', 'TND', 'IQD', 'PKR', 'INR', 'LBP']

export default async (req) => {
  if (req.method === 'OPTIONS') return preflight()
  const day = new Date().toISOString().slice(0, 10)
  const s = store()
  let fx = await s.get('fx/' + day, { type: 'json' })
  if (!fx) {
    try {
      const r = await fetch('https://open.er-api.com/v6/latest/USD')
      const j = await r.json()
      if (j.result !== 'success') throw new Error('fx ' + j.result)
      const toUsd = {}
      for (const c of WANT) if (j.rates?.[c] > 0) toUsd[c] = 1 / j.rates[c]
      fx = { day, toUsd }
      await s.setJSON('fx/' + day, fx)
    } catch (e) {
      console.error(e)
      return json({ error: 'rates unavailable' }, 503) // التطبيق بيكمل بالجدول الاحتياطي
    }
  }
  return json(fx, 200, { 'netlify-cdn-cache-control': 'public, s-maxage=3600' })
}

export const config = { path: '/api/rates', method: ['GET', 'OPTIONS'] }
