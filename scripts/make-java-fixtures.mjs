// بيحوّل tests/fixtures/sms.json لملف TSV بسيط يقراه اختبار الـ Java (من غير مكتبات)
import fs from 'node:fs'
import { parseMessages, bankOf } from '../src/lib/parser.js'
import { merchantKey } from '../src/lib/categories.js'
import { personKey } from '../src/lib/person.js'
const F = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/sms.json', import.meta.url), 'utf8'))
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\t/g, ' ').replace(/\r?\n/g, '\\n')
const all = parseMessages(F.messages, F.profile)
// الجزء الأصلي بيتأكد من الراسل قبل ما يقرا، فرسايل غير البنوك مش بتوصل للـ parser أصلًا
const rows = F.messages.filter((m) => bankOf(m.address)).map((m) => {
  const t = all.find((x) => x.ts === m.date)
  const isP = t && t.k === 'purchase'
  const isT = t && t.k === 'transfer'
  return [m.address, m.date, esc(m.body), isP ? t.a : '-', isP ? merchantKey(t.m) : '-', isT ? t.a : '-', isT ? personKey(t.m) : '-'].join('\t')
})
const out = new URL('../android/app/src/test/resources/sms_fixtures.tsv', import.meta.url)
fs.mkdirSync(new URL('.', out), { recursive: true })
fs.writeFileSync(out, rows.join('\n') + '\n')
console.log('wrote', rows.length, 'rows')
