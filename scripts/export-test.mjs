import fs from 'node:fs'
import { parseMessages, messagesFromXml, bankOf, detectProfile } from '../src/lib/parser.js'
import { categorize, RULES } from '../src/lib/categories.js'
const out = process.argv[3]
const msgs = messagesFromXml(fs.readFileSync(process.argv[2], 'utf8')).filter(m => bankOf(m.address))
const profile = detectProfile(msgs)
const esc = s => String(s).replace(/\\/g, '\\\\').replace(/\t/g, ' ').replace(/\r?\n|\r/g, '\\n')
const lines = []
for (const m of msgs) {
  const tx = parseMessages([m], profile)[0]
  const isP = tx && tx.k === 'purchase'
  lines.push([m.date, esc(m.body), isP ? tx.a : '', isP ? esc(tx.m) : '', isP ? categorize(tx) : ''].join('\t'))
}
fs.writeFileSync(out + '/msgs.tsv', lines.join('\n'))
fs.writeFileSync(out + '/rules.tsv', RULES.map(([c, r]) => c + '\t' + r.source).join('\n'))
