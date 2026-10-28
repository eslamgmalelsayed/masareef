// بنسأل Gemini عن قالب شكل رسالة — النص اللي بيوصله مخفي البيانات بالكامل (أرقام عشوائية وأسماء وهمية)
import { KINDS, linesOf, ANCHORS } from './common.mjs'

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    kind: { type: 'STRING', enum: KINDS },
    amountLine: { type: 'INTEGER', nullable: true },
    partyLine: { type: 'INTEGER', nullable: true },
    balanceLine: { type: 'INTEGER', nullable: true },
    currency: { type: 'STRING', nullable: true },
    amountAfter: { type: 'STRING', nullable: true },
    amountBefore: { type: 'STRING', nullable: true },
    partyAfter: { type: 'STRING', nullable: true },
    partyBefore: { type: 'STRING', nullable: true },
    balanceAfter: { type: 'STRING', nullable: true },
    balanceBefore: { type: 'STRING', nullable: true },
  },
  required: ['kind', 'amountLine', 'partyLine', 'balanceLine', 'currency'],
}

function prompt(bank, sample, hint) {
  const lines = linesOf(sample).map((l, i) => `${i}: ${l}`).join('\n')
  return `You read bank / e-wallet SMS notifications (any country, any language — mostly Arabic and English) for a personal expense tracker.
The message below is a TEMPLATE: every digit was replaced by a random digit and every personal name / merchant name by placeholder letters (XXXX or سسسس). Only the structure and the banking words are real.

Sender: ${bank}
Lines (index: text):
${lines}

Return JSON describing how to read ANY message with this exact structure:
- kind: one of
  purchase = card/online/POS purchase or payment to a merchant (money out)
  transfer = outgoing transfer to another person or account (money out)
  intl = outgoing international remittance (money out)
  in = incoming transfer or deposit (money in, not salary)
  salary = salary / payroll deposit
  refund = refund / reversal of a previous purchase (money back)
  cash = ATM / cash withdrawal
  bill = bill payment (utilities, SADAD, telecom bill, government service)
  fee = a bank fee or charge
  ignore = not a real money movement for this user: OTP/codes, promotions, offers, rewards/points, loan applications, card statements, balance-only alerts, declined/failed operations, wallet top-ups moved from the user's own bank account
- amountLine: index of the line holding the transaction amount (not the balance, not a fee). null only when kind = ignore.
- partyLine: index of the line holding the merchant / person / payer name, or null if the message has none.
- balanceLine: index of the line holding the remaining balance, or null.
- currency: ISO 4217 code of the amount as written (SAR, EGP, AED, USD …; "جنيه" = EGP, "درهم" = AED, "ريال" = SAR in Saudi banks), or null if not written.
- When a line holds MORE than one value (e.g. the whole message is one sentence with the amount, the merchant and the balance), also give anchors so each value can be cut out of its line:
  amountAfter / amountBefore, partyAfter / partyBefore, balanceAfter / balanceBefore = a short word or phrase copied EXACTLY from the sample that comes right before / right after that value.
  Anchors must be real banking words from the sample (never digits, never the XXXX / سسسس placeholders). Use null when the value has its own line.
${hint ? `\nA previous reading of this structure was WRONG. The correct reading has kind="${hint.kind}"${hint.amountLine != null ? ` and the amount is on line ${hint.amountLine}` : ''}.` : ''}
Answer with the JSON only.`
}

export async function askGemini(bank, sample, hint) {
  const key = Netlify.env.get('GEMINI_API_KEY')
  if (!key) throw new Error('GEMINI_API_KEY missing')
  const model = Netlify.env.get('GEMINI_MODEL') || 'gemini-3.5-flash-lite'
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt(bank, sample, hint) }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
    }),
  })
  if (!r.ok) throw new Error('gemini ' + r.status + ' ' + (await r.text()).slice(0, 200))
  const j = await r.json()
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
  const o = JSON.parse(text)
  // نرجّع القالب نضيف بالمفاتيح اللي نعرفها بس
  const t = { kind: o.kind }
  if (o.kind !== 'ignore') {
    t.amountLine = o.amountLine
    t.partyLine = o.partyLine ?? null
    t.balanceLine = o.balanceLine ?? null
    t.currency = o.currency ? String(o.currency).toUpperCase() : null
    for (const k of ANCHORS) { const v = cleanAnchor(k, o[k]); if (v) t[k] = v }
  }
  return t
}

/**
 * الموديل ساعات بيحط أرقام أو نجوم جوه الكلمة اللي بتحدد المكان ("حسابك رقم ****0011 لدى ").
 * الأرقام بتتغير من رسالة للتانية، فبناخد الكلام بس: آخر الكلام لـ After، وأوله لـ Before.
 */
export function cleanAnchor(k, v) {
  if (v == null) return null
  let s = String(v)
  if (/After$/.test(k)) s = s.replace(/^[\s\S]*[\d*]/, '')
  else s = s.replace(/[\d*][\s\S]*$/, '')
  return s.trim() ? s : null
}
