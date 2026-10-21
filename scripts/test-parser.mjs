import fs from 'node:fs'
import { parseMessages, messagesFromXml, detectProfile } from '../src/lib/parser.js'
import { categorize, CAT } from '../src/lib/categories.js'
const xml = fs.readFileSync(process.argv[2], 'utf8')
const msgs = messagesFromXml(xml)
const profile = detectProfile(msgs)
console.time('parse')
const tx = parseMessages(msgs, profile)
console.timeEnd('parse')
const k = {}, c = {}
for (const t of tx) {
  k[t.k] = (k[t.k] || 0) + 1
  if (!['refund', 'salary', 'in', 'ccpay', 'ccxfer'].includes(t.k)) { const cc = categorize(t); c[cc] = (c[cc] || 0) + t.a }
}
console.log(msgs.length, tx.length, k)
for (const [id, v] of Object.entries(c).sort((a, b) => b[1] - a[1])) console.log(Math.round(v), CAT[id].name)
