// تحليل رسايل البنوك السعودية والمحافظ → عمليات مالية
// kind: purchase | transfer | intl | cash | bill | gov | fee | refund | salary | in | ignore

export const BANKS = {
  alrajhibank: 'الراجحي',
  'alrajhi': 'الراجحي',
  stcpay: 'STC Pay',
  'snb-alahli': 'الأهلي',
  'stc bank': 'STC Bank',
  stcbank: 'STC Bank',
  urpay: 'urpay',
  alinma: 'الإنماء',
  __ios__: 'رسالة بنك', // رسالة جت من اختصار آيفون من غير اسم الراسل
}

// بنوك ضفتها انت (التطبيق اقترحها لما لقى رسايل شكلها عمليات بنكية من راسل جديد)
const EXTRA = {}
export function setExtraBanks(map) { for (const k of Object.keys(EXTRA)) delete EXTRA[k]; Object.assign(EXTRA, map || {}) }
// أسماء عربي للبنوك المعروفة لما تتضاف
export const KNOWN_NAMES = { riyadbank: 'الرياض', sab: 'ساب', anb: 'العربي', bsf: 'الفرنسي', albilad: 'البلاد', bankalbilad: 'البلاد', aljazira: 'الجزيرة', bankaljazira: 'الجزيرة', saib: 'الاستثمار', d360: 'D360', barq: 'برق', 'mobily pay': 'Mobily Pay', tiqmo: 'tiqmo', 'friendi pay': 'Friendi Pay', alrajhib: 'الراجحي' }

export function bankOf(address) {
  if (!address) return null
  const k = address.trim().toLowerCase()
  return BANKS[k] || EXTRA[k] || null
}

const NUM = String.raw`([\d,]+(?:\.\d*)?)`
const RATES = { SAR: 1, SR: 1, 'ريال': 1, USD: 3.75, EUR: 4.05, AED: 1.02, GBP: 4.8 }
const egpRate = (ts) => (ts < 1709251200000 ? 1 / 8.2 : 1 / 13.0)

const SKIP = /OTP|رمز|security code|verification|كلمة مرور|password|تسجيل الدخول|logged in|الرقم السري|Declined|declined|not allowed|Insufficient|غير كاف|مرفوض|رفض|maintenance|Hello|هلا|عميلنا|Dear Customer|تفعيل|registered|blocked|Apple Pay successfully/i
const TOPUP_MERCH = /URPAY|STC ?PAY|STC BANK|stcpay|Mobily Pay|بنك اس تي سي/i

function num(s) {
  const v = parseFloat(s.replace(/,/g, '').replace(/\.$/, ''))
  return Number.isFinite(v) ? v : null
}
const r2 = (v) => Math.round(v * 100) / 100

export function amount(b, ts = 0) {
  for (const pat of [new RegExp('(?:إجمالي|اجمالي) المبلغ المستحق:\\s*' + NUM), new RegExp('\\(' + NUM + '\\s*ريال\\)')]) {
    const m = b.match(pat)
    if (m) return num(m[1])
  }
  const s = b.replace(/(رصيد|Your balance|Balance|رسوم وضريبة|رسوم|Fees|VAT|سعر الصرف)[^|\n]*/g, '')
  const CUR = '(SAR|SR|USD|EGP|EUR|AED|GBP|ريال)'
  for (const [p, order] of [[CUR + '\\s*:?\\s*' + NUM, 'cn'], [NUM + '\\s*' + CUR, 'nc']]) {
    const m = s.match(new RegExp(p))
    if (m) {
      const [c, vs] = order === 'cn' ? [m[1], m[2]] : [m[2], m[1]]
      const v = num(vs)
      if (v === null) continue
      if (c === 'EGP') return r2(v * egpRate(ts))
      return r2(v * RATES[c])
    }
  }
  for (const p of ['Amount:\\s*' + NUM, 'Transaction Amount\\s*' + NUM, 'مبلغ:?\\s*' + NUM, 'With:\\s*' + NUM, 'amount of\\s*' + NUM]) {
    const m = s.match(new RegExp(p))
    if (m) {
      const v = num(m[1])
      if (v !== null) return v
    }
  }
  return null
}

function merchant(b) {
  const pats = [/لدى:\s*([^|\n]+)/, /اسم المتجر\s*([^|\n]+)/, /لـ\s*([^|\n]+)/, /At:\s*([^|\n]+)/, /From:\s*([^|\n]+)/, /For\s+([^|\n]+)/, /من\s+([^|\n]+)/]
  for (const p of pats) {
    const m = b.match(p)
    if (m) {
      let v = m[1].trim()
      if (/^[\d/:\- ]+$/.test(v)) continue
      v = v.replace(/^\d+;/, '')
      return v.trim()
    }
  }
  return ''
}

function counterparty(b) {
  for (const p of [/(?:الى|إلى|To|Receiver name|To:)\s*:?\s*([^|\n]+)/, /لـ\s*([^|\n]+)/]) {
    const m = b.match(p)
    if (m) return m[1].replace(/^\d+;/, '').trim()
  }
  return ''
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

/** profile: { selfNames: string[], accounts: string[] } */
export function classify(addr, b, ts, profile) {
  const f = b.split('\n')[0].trim()
  const a = amount(b, ts)
  if (b.includes('debited with an amount')) return a == null ? null : ['purchase', a, 'STC Pay خصم']
  if (a == null) return null
  const names = (profile.selfNames || []).filter(Boolean).map(escapeRe)
  const SELF = names.length ? new RegExp(names.join('|'), 'i') : null
  const accs = (profile.accounts || []).filter(Boolean).map(escapeRe)
  const ACC = accs.length ? new RegExp(accs.join('|')) : null
  const FROM_ME = accs.length ? new RegExp('من:\\s*(?:' + accs.join('|') + ')') : null

  if (/استرداد|Reverse|Refund|refund|عكس عملية/.test(f)) return ['refund', a, merchant(b)]
  if (/ايداع رواتب|إيداع رواتب|راتب/.test(f)) return ['salary', a, 'راتب']
  if (/واردة|وارد|incoming|Inward|Credit|credited|Incoming/i.test(f) && !/صادرة/.test(f)) return ['in', a, counterparty(b) || '']
  if (/top ?up|topup|Adding money|إضافة الأموال|شحن/i.test(b)) return ['ignore', a, 'topup']
  if (f.startsWith('اليكترون')) return ['in', a, '']
  if (f.startsWith('بطاقة ائتمانية:تحويل')) return ['ignore', a, 'cc-transfer']
  if (/سداد البطاقة|credit card payment/i.test(b)) return ['ccpay', a, 'سداد البطاقة الائتمانية']
  if (/إيداع|ايداع/.test(f)) return ['in', a, 'إيداع']
  if (/رسوم/.test(f)) return ['fee', a, f.replace(/\s*\|.*/, '')]
  if (/ATM|صراف|سحب/.test(f)) return ['cash', a, 'سحب نقدي']
  // سداد بطاقة بنك تاني باستخدام كريدت كارد (مثلًا من الإنماء لبطاقة الراجحي)
  if (b.includes('خدمات مصرف الراجحي') && /البطاقة الائتمانية/.test(b)) return ['ccxfer', a, 'سداد بطاقة الراجحي بالكريدت']
  if (/(بطاقة ائتمانية|بطاقة فيزا):سداد/.test(f) || b.includes('خدمات مصرف الراجحي')) return ['ccpay', a, 'سداد البطاقة الائتمانية']
  if (/دولية|International/i.test(f)) {
    if (/عكسية/.test(f)) return ['refund', a, 'حوالة عكسية']
    return ['intl', a, counterparty(b)]
  }
  if (f.startsWith('تم انشاء حوالتك')) return ['ignore', a, 'dup-intl']
  if (/حوالة|transfer|Debit via wallet/i.test(f)) {
    if ((/alrajhi/i.test(addr) || addr === '__ios__') && (f === 'حوالة داخلية' || f === 'حوالة محلية')) {
      if (!FROM_ME || !FROM_ME.test(b)) return ['in', a, '']
    }
    if (f === 'Internal transfer' && /From:/.test(b)) return ['in', a, '']
    if (/^Incoming/i.test(f)) return ['in', a, '']
    const cp = counterparty(b)
    if ((SELF && SELF.test(cp)) || (/urpay/i.test(addr) && !cp)) return ['ignore', a, 'self']
    if (ACC && ACC.test(cp) && !/[A-Za-z؀-ۿ]{3}/.test(cp)) return ['ignore', a, 'self']
    return ['transfer', a, cp]
  }
  if (/مدفوعات|سداد|فاتورة|Bill|payment/i.test(f)) {
    const m = b.match(/(?:الجهة|الخدمة)[: ]\s*([^|\n]+)/)
    const name = m ? m[1].trim() : f.replace(/\s*\|.*/, '')
    if (f.includes('وزارة') || f.includes('حكومية')) return ['gov', a, name]
    return ['bill', a, name]
  }
  if (/شراء|Purchase|debited/i.test(f)) {
    const m = merchant(b)
    if (TOPUP_MERCH.test(m)) return ['ignore', a, 'topup:' + m]
    return ['purchase', a, m]
  }
  return null
}

/**
 * messages: [{address, body, date(ms)}]
 * returns transactions: {id, ts, a, k, m, b}
 */
export function parseMessages(messages, profile) {
  const out = []
  const seen = new Set()
  for (const msg of messages) {
    const bank = bankOf(msg.address)
    if (!bank) continue
    const b = String(msg.body || '').normalize('NFKC')
    const first = b.split('\n')[0]
    if (!b.includes('debited with an amount') && SKIP.test(first) && !/شراء|Purchase|حوالة|transfer/i.test(first)) continue
    if (/OTP|رمز|verification|security code|كلمة مرور|Insufficient|Declined|not allowed|مرفوض|غير كاف/i.test(b)) continue
    if (/الرقم السري|لمره واحده|لمرة واحدة|تم تغيير الحد|one time/i.test(b)) continue
    if (BNPL_RX.test(b)) continue // رسايل تابي/تمارا نفسها (مش البنك) — ليها حساب لوحدها
    const ts = Number(msg.date)
    const r = classify(msg.address, b, ts, profile)
    if (!r || r[0] === 'ignore') continue
    const key = msg.address + '|' + b
    if (seen.has(key)) continue
    seen.add(key)
    const name = (r[2] || '').replace(/\s+/g, ' ').trim()
    out.push({
      id: ts + ':' + hash(key),
      ts,
      a: r2(r[1]),
      k: r[0],
      m: (r[0] === 'gov' ? 'وزارة الداخلية – ' + name : name || '—').slice(0, 48),
      b: bank,
      ...meta(b),
    })
  }
  // الكروت الائتمانية: أي كارت اتسدد أو اتذكر إنه "ائتمانية/credit"
  const credit = new Set()
  for (const t of out) if (t.card && (t.k === 'ccpay' || t.k === 'ccxfer' || t.cr)) credit.add(t.b + t.card)
  for (const t of out) {
    if (t.card && credit.has(t.b + t.card)) t.cc = 1
    delete t.cr
  }
  out.sort((x, y) => y.ts - x.ts)
  return out
}

/** آخر ٤ أرقام من الكارت + الرصيد اللي في الرسالة (لو موجودين) */
function meta(b) {
  const o = {}
  const card =
    b.match(/(?:من )?البطاقة الائتمانية\s*[:：]\s*(\d{4})/) ||
    b.match(/بطاقة\s*(?:(?:ال)?ائتمانية|فيزا|مدى)?\s*[:：]?\s*\*{0,4}\s*(?:فيزا|مدى)?\s*\*{0,4}(\d{4})(?!\d)/) ||
    b.match(/عبر\s*[:：]?\s*(\d{4})\s*;/) ||
    b.match(/عبر\s*[:：]?\s*(?:فيزا|مدى)\s*;\s*(\d{4})/) ||
    b.match(/(?:Card|Via)\s*[:：]?\s*\*+(\d{4})/i) ||
    b.match(/(?:مدى|mada|فيزا|VISA)\s*\*\s*(\d{4})/i)
  if (card) o.card = card[1]
  if (/ائتمان|credit card/i.test(b)) o.cr = 1
  // رسوم العمليات بعملة أجنبية (الراجحي بيكتبها: رسوم وضريبة: 9.06 SAR)
  const fx = b.match(/رسوم وضريبة\s*[:：]\s*([\d,]+(?:\.\d+)?)/)
  if (fx) { const v = num(fx[1]); if (v) o.fx = v }
  // رسوم الحوالة الدولية (الرسوم:SAR 17.25 / رسوم:SR 17.25)
  if (/حوالة.*دولية|دولية/.test(b.split('\n')[0])) {
    const fee = b.match(/(?:ال)?رسوم\s*[:：]\s*(?:SAR|SR|ر\.?س)?\s*([\d,]+(?:\.\d+)?)/)
    if (fee) { const v = num(fee[1]); if (v) o.fee = v }
  }
  // رسايل سداد الكريدت: الرصيد فيها مش واضح هو للحساب ولا للكارت، فبنتجاهله
  // (سداد فاتورة بالبطاقة عادي — الرصيد فيه هو متاح البطاقة)
  const bal = /سداد/.test(b.split('\n')[0]) && !/^\s*سداد فاتورة/.test(b) ? null : b.match(/(?:رصيد|Your balance|Balance)\s*[:：]?\s*(?:SAR|SR)?\s*([\d,]+(?:\.\d+)?)\s*(?:SAR|SR)?/i)
  if (bal) { const v = num(bal[1]); if (v !== null) o.bal = v }
  return o
}

function hash(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** Parse "SMS Backup & Restore" XML text (browser DOMParser or regex fallback) */
export function messagesFromXml(text) {
  const res = []
  const re = /<sms\s([^>]*?)\/>/g
  const attr = (s, n) => {
    const m = s.match(new RegExp('\\s?' + n + '="([^"]*)"'))
    return m ? decodeEntities(m[1]) : ''
  }
  let m
  while ((m = re.exec(text))) {
    const s = ' ' + m[1]
    if (attr(s, ' type') !== '1') continue
    res.push({ address: attr(s, ' address'), body: attr(s, ' body'), date: Number(attr(s, ' date')) })
  }
  return res
}

function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (_, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()]
  })
}

/** JSON exported by "SMS Import / Export" app */
export function messagesFromJson(text) {
  const data = JSON.parse(text)
  const arr = Array.isArray(data) ? data : data.messages || []
  return arr
    .filter((x) => String(x.type ?? '1') === '1')
    .map((x) => ({ address: x.address, body: x.body, date: Number(x.date) }))
}

/**
 * يتعرّف تلقائيًا على أرقام حساباتك واسمك من رسايل البنوك:
 * - الحساب: الرقم اللي بيتكرر كتير في خانة "من:" / "إلى:" / "حساب" في رسايل نفس البنك
 * - الاسم: الاسم اللي بيظهر في التحويلات اللي بين حساباتك وبعض
 */
export function detectProfile(messages) {
  const PATS = [
    /من:\s*\*?(\d{4})(?!\d)/g, /(?:الى|إلى):\s*\*?(\d{4})(?!\d)/g, /حساب\s*:?\s*\*{0,2}(\d{4})\*/g,
    /من\s*:?\s*(\d{4})\*/g, /من(\d{4})\s*\|/g, /(?:^|\|\s*)Account(?: number)?:?\s*\*+(\d{4})/gm,
    /حساب\s+\*{1,2}(\d{4})/g, /من:\s*\w+,(\d{4})/g,
  ]
  const per = {}
  const fin = []
  for (const m of messages) {
    const bank = bankOf(m.address)
    if (!bank) continue
    const b = String(m.body || '').normalize('NFKC')
    if (/رمز|OTP|verification|security code/i.test(b)) continue
    fin.push(b)
    const p = (per[bank] ||= { n: 0, c: {} })
    p.n++
    const seen = new Set()
    for (const re of PATS) for (const x of b.matchAll(re)) seen.add(x[1])
    for (const a of seen) p.c[a] = (p.c[a] || 0) + 1
  }
  const accounts = new Set()
  for (const { n, c } of Object.values(per)) {
    const top = Object.entries(c).sort((a, b) => b[1] - a[1])
    if (!top.length) continue
    const best = top[0][1]
    for (const [a, k] of top) if (k >= 3 && k / n >= 0.03 && k >= best * 0.3) accounts.add(a)
  }
  const own = [...accounts]
  const ownOf = (d) => own.find((a) => d.length >= 3 && a.endsWith(d))
  const words = {}
  for (const b of fin) {
    if (!/حوالة|transfer|SARIE/i.test(b.split('\n')[0])) continue
    const hits = new Set([...b.matchAll(/(?<![\d.,])(\d{3,4})(?![\d.,:\/-])/g)].map((x) => ownOf(x[1])).filter(Boolean))
    if (hits.size < 2) continue // تحويل بين حسابين من حساباتك
    for (const x of b.matchAll(/(?:إلى|الى|To|From|من|لـ)\s*:?\s*(?:\d+;)?([A-Za-z؀-ۿ][A-Za-z؀-ۿ .]{2,})/g)) {
      const w = x[1].trim().split(/[\s.]+/)[0]
      if (w.length < 3 || /^(RJHI|SNB|STC|BANK|AL|حساب|بنك|مصرف|Account|ايبان|وزارة)$/i.test(w)) continue
      const k = w.toUpperCase()
      words[k] = (words[k] || 0) + 1
    }
  }
  const ranked = Object.entries(words).sort((a, b) => b[1] - a[1])
  const names = new Set()
  if (ranked.length) {
    const best = ranked[0][1]
    for (const [w, k] of ranked) if (k >= 3 && k >= best * 0.05) {
      names.add(w)
      if (w.startsWith('ا')) names.add('إ' + w.slice(1)) // ا ↔ إ في أول الاسم
      if (w.startsWith('إ')) names.add('ا' + w.slice(1))
    }
  }
  const displayName = ranked.find(([w]) => /[؀-ۿ]/.test(w))?.[0] || ''
  return { accounts: own, selfNames: [...names], displayName }
}

/**
 * ملف الاختصار على آيفون: كل رسالة = سطر التاريخ، وبعده نص الرسالة، وبعدها سطر =====
 * (لو التاريخ مش مفهوم بنستخدم ترتيب الرسالة في الملف)
 */
export function messagesFromText(text) {
  const out = []
  const blocks = String(text).replace(/\r/g, '').split(/^\s*={3,}\s*$/m)
  let i = 0
  for (const raw of blocks) {
    const lines = raw.split('\n').map((l) => l.trimEnd())
    while (lines.length && !lines[0].trim()) lines.shift()
    if (!lines.length) continue
    let date = NaN
    const first = lines[0].trim()
    const iso = Date.parse(first.replace(' ', 'T'))
    if (/\d{4}-\d{2}-\d{2}/.test(first) && Number.isFinite(iso)) { date = iso; lines.shift() }
    else if (/^\d{10,13}$/.test(first)) { date = Number(first.length === 10 ? first + '000' : first); lines.shift() }
    let address = '__ios__'
    if (lines[0] && /^(from|من|الراسل)\s*[:：]/i.test(lines[0])) address = lines.shift().split(/[:：]/).slice(1).join(':').trim() || '__ios__'
    const body = lines.join('\n').trim()
    if (!body) continue
    out.push({ address: bankOf(address) ? address : '__ios__', body, date: Number.isFinite(date) ? date : Date.now() - (blocks.length - i++) * 1000 })
  }
  return out
}

// ===== تابي وتمارا: الرسايل اللي بيبعتوها هم (مش البنك) — منها بنعرف خطة التقسيط =====
export const BNPL_SENDERS = ['tabby', 'tamara', 'tamara due']
const BNPL_RX = /purchase at .+ is confirmed\. Track your upcoming payments|Split in \d+ payment|tamara\.go\.link|tabby\.sa/i

/** خطط التقسيط: [{prov, store, total, n?, ts, due?}] */
export function parseBnplMessages(messages) {
  const out = []
  const seen = new Set()
  for (const m of messages) {
    const b = String(m.body || '').replace(/\s+/g, ' ')
    const ts = Number(m.date)
    let r = b.match(/Your SAR ([\d,.]+) purchase at (.+?) is confirmed/i)
    if (r) {
      const o = { prov: 'tabby', store: r[2].trim(), total: num(r[1]), ts }
      const k = 'T' + o.store + o.total + Math.round(ts / 864e5)
      if (!seen.has(k)) { seen.add(k); out.push(o) }
      continue
    }
    r = b.match(/Split in (\d+) payment confirmation: Store: (.+?) Order: ([\d,.]+) SAR(?: Date: (\d{1,2})\/(\d{1,2})\/(\d{4}))?/i)
    if (r) {
      const o = { prov: 'tamara', n: Number(r[1]), store: r[2].trim(), total: num(r[3]), ts }
      if (r[4]) o.due = +new Date(Number(r[6]), Number(r[5]) - 1, Number(r[4]))
      const k = 'M' + o.store + o.total + Math.round(ts / 864e5)
      if (!seen.has(k)) { seen.add(k); out.push(o) }
    }
  }
  return out.sort((a, b) => a.ts - b.ts)
}
