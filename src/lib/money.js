// العملات: التطبيق بيعرف "عملة البيت" لوحده من الرسايل (اللي بتصرف بيها أكتر الفترة الأخيرة)،
// وكل عملية بتتحوّل لها بأسعار يومية (من السيرفر) أو جدول احتياطي. ينفع حد يعيش/يصرف في أكتر من بلد.

// قيمة الوحدة بالدولار (احتياطي لو مفيش نت)
export const TO_USD = {
  // الريال والدرهم والريال القطري/العماني والدينار البحريني/الأردني مربوطين بالدولار
  USD: 1, SAR: 1 / 3.75, AED: 1 / 3.6725, QAR: 1 / 3.64, OMR: 2.6008, BHD: 2.6596, JOD: 1.4104, KWD: 3.25,
  EGP: 1 / 13 / 3.75, EUR: 4.05 / 3.75, GBP: 4.8 / 3.75, TRY: 0.029, MAD: 0.1, TND: 0.32, LBP: 0.0000112, IQD: 0.00076, PKR: 0.0036, INR: 0.012,
}
export const SYM = { SAR: 'ر.س', EGP: 'ج.م', AED: 'د.إ', KWD: 'د.ك', QAR: 'ر.ق', BHD: 'د.ب', OMR: 'ر.ع', JOD: 'د.أ', USD: '$', EUR: '€', GBP: '£', TRY: '₺', MAD: 'د.م', TND: 'د.ت', IQD: 'د.ع', PKR: 'Rs', INR: '₹' }

const S = { home: 'SAR', rates: { ...TO_USD } }
export const homeCur = () => S.home
export function setMoney(home, rates) {
  if (home && TO_USD[home]) S.home = home
  if (rates) for (const [k, v] of Object.entries(rates)) if (Number(v) > 0 && TO_USD[k]) S.rates[k] = Number(v)
}

/** كلمة/رمز العملة زي ما مكتوب في الرسالة → كود ISO */
export function normCur(tok, after = '') {
  const t = String(tok || '').trim().toUpperCase().replace(/\.$/, '')
  if (/^(SAR|SR|ر\.?\s?س)$/.test(t)) return 'SAR'
  if (t === 'ريال') return /^\s*(قطري)/.test(after) ? 'QAR' : /^\s*(عماني|عُماني)/.test(after) ? 'OMR' : 'SAR'
  if (t === 'جنيه' || t === 'ج.م' || t === 'جم') return 'EGP'
  if (t === 'درهم') return /^\s*(مغربي)/.test(after) ? 'MAD' : 'AED'
  if (t === 'دينار') return /^\s*كويتي/.test(after) ? 'KWD' : /^\s*بحريني/.test(after) ? 'BHD' : /^\s*أردني|^\s*اردني/.test(after) ? 'JOD' : /^\s*تونسي/.test(after) ? 'TND' : /^\s*عراقي/.test(after) ? 'IQD' : 'KWD'
  return TO_USD[t] ? t : null
}
// العملة لازم تكون كلمة لوحدها ("رس" جوه "مارس" مش عملة)
export const CUR_RX = '((?<![A-Za-z])(?:SAR|SR|USD|EGP|EUR|AED|GBP|KWD|QAR|BHD|OMR|JOD|TRY)(?![A-Za-z])|(?<![\\u0621-\\u064A])(?:ريال|جنيه|درهم|دينار|ر\\.?\\s?س)(?![\\u0621-\\u064A]))'

/** تحويل مبلغ لعملة البيت. الجنيه قبل مارس ٢٠٢٤ كان بسعر تاني خالص */
export function toHome(v, cur, ts = 0) {
  const c = cur || S.home
  if (c === S.home) return r2(v)
  let usd = S.rates[c] ?? TO_USD[c]
  if (c === 'EGP' && ts && ts < 1709251200000) usd = TO_USD.SAR / 8.2 // قبل التعويم
  if (!usd) return r2(v)
  return r2((v * usd) / (S.rates[S.home] ?? TO_USD[S.home]))
}
const r2 = (v) => Math.round(v * 100) / 100

/**
 * عملة البيت من الرسايل: العملة اللي اتكررت أكتر في آخر ١٢٠ يوم (رسالة الراتب بتتحسب ٥ مرات)
 * messages: [{ body, date }]
 */
export function detectHome(messages, now = Date.now()) {
  const count = {}
  const rx = new RegExp(CUR_RX + '(\\s*\\S+)?', 'gi')
  for (const m of messages) {
    if (now - Number(m.date) > 120 * 864e5) continue
    const b = String(m.body || '').normalize('NFKC')
    if (!/\d/.test(b)) continue
    const w = /راتب|رواتب|salary/i.test(b) ? 5 : 1
    const seen = new Set()
    for (const x of b.matchAll(rx)) { const c = normCur(x[1], x[2] || ''); if (c && !seen.has(c)) { seen.add(c); count[c] = (count[c] || 0) + w } }
  }
  const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0]
  return best ? best[0] : null
}
