// كل ساعة: بنجمع القوالب المؤكدة في ملف واحد (catalog) — كاتب واحد بس، فمفيش تضارب
import { store } from '../../lib/common.mjs'

export default async () => {
  const s = store()
  const templates = {}
  for await (const page of s.list({ prefix: 'a/', paginate: true })) {
    for (const b of page.blobs) {
      const t = await s.get(b.key, { type: 'json' })
      if (t) templates[b.key.slice(2)] = t
    }
  }
  await s.setJSON('catalog', { templates, at: Date.now() })
  // عدّاد السقف اليومي: نمسح الأيام اللي فاتت
  const today = new Date().toISOString().slice(0, 10)
  for await (const page of s.list({ prefix: 'q/', paginate: true })) for (const b of page.blobs) if (!b.key.startsWith(`q/${today}/`)) await s.delete(b.key)
  console.log('catalog', Object.keys(templates).length)
}

export const config = { schedule: '7 * * * *' } // كل ساعة (الدقيقة ٧ UTC)
