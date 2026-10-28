// القراية الذكية: كل رسالة بنك ليها "شكل" (القالب من غير الأرقام والأسماء).
// الذكاء الاصطناعي بيتعلم الشكل مرة واحدة (من مثال مخفي البيانات) ويرجّع "قالب":
// { kind, amountLine, partyLine } — والكود هنا بيطبّق القالب على كل رسالة بنفس الشكل، جوه الموبايل.
import { amount } from './parser.js'

export const KINDS = ['purchase', 'transfer', 'intl', 'in', 'salary', 'refund', 'cash', 'bill', 'fee', 'ignore']

const INVIS = /[​-‏؜‪-‮⁦-⁩]/g
/** سطور الرسالة زي ما الذكاء الاصطناعي بيشوفها (نفس الترقيم هنا وعلى السيرفر) */
export function linesOf(body) {
  return String(body || '').normalize('NFKC').replace(INVIS, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
}

const LABEL = /^([^\d:：*]{1,28})[:：]/
// كلمة عادية (بنكية عامة) بتفضل، وأي كلمة تانية (اسم، محل، حروف وهمية) = §
function skel(s) {
  let r = s.replace(/\d[\d,.]*/g, '9').replace(/[\p{L}\p{M}]+/gu, (w) => (keepWord(w) ? w : '§'))
  // اسم من كذا كلمة أو فيه حرف أول ("سامي محمد" / "ج. السيد") = § واحدة
  for (let prev = ''; prev !== r;) { prev = r; r = r.replace(/§[\s.\-'’ـ]+(?:\p{L}\.?[\s.\-'’ـ]+)?§/gu, '§') }
  return r.replace(/\s+/g, ' ').trim()
}
/**
 * الشكل: الرسالة من غير أرقام ولا أسماء. بيطلع هو هو من الرسالة الحقيقية ومن النسخة المخفية
 * (shapeOf(b) === shapeOf(maskSample(b))) — علشان السيرفر يقدر يتأكد منه من غير ما يشوف الرسالة.
 */
export function shapeOf(bank, body) {
  const parts = linesOf(body).map((l, i) => {
    const m = i > 0 && l.match(LABEL)
    return m ? skel(m[1]) + ':' : skel(l).slice(0, 60)
  })
  const key = bank + '¶' + parts.join('¶')
  return { id: hash(key), key, lines: parts.length }
}

export function hash(s) {
  let h1 = 0x811c9dc5, h2 = 0
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = (h2 * 31 + c) | 0 }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36)
}

// كلمات بنكية عامة (مش بيانات شخصية) — بتفضل علشان الموديل يفهم الرسالة. أي كلمة تانية (اسم، محل) بتتخبى
const VOCAB = new Set(`تم تمت خصم إيداع ايداع عملية العملية شراء تحويل حوالة حوالات بطاقة البطاقة حساب الحساب حسابك لحسابك مبلغ المبلغ رصيد الرصيد
ريال ر.س تقسيط التقسيط بنجاح من إلى الى لدى في عبر على عن مع قيمة بقيمة القيمة سداد فاتورة الفاتورة استرداد راتب رواتب الرواتب الشهري القسط
مدة التاجر المتجر متجر صادرة واردة وارد صادر محلية داخلية دولية فورية مقبولة انترنت إنترنت الإنترنت الالكتروني الإلكتروني الألكتروني
ائتمانية الائتمانية مدى فيزا جاري الجاري توفير سحب نقدي صراف رسوم الرسوم ضريبة وضريبة المستحق إجمالي اجمالي الأدنى الادنى تاريخ التاريخ
الاستحقاق كشف شهر نقطة نقاط مكافأة المكافأة المتبقية استبدلت طلب تمويل التمويل النوع حالة رقم الرقم المرجعي مرجعي القسيمة عميلنا العزيز
مبروك عيدية اضافة إضافة الأموال أموال محفظة المحفظة شحن لعملية بمبلغ الدولة دولة مصرف بنك البنك آيبان ايبان المعرف البديل الجهة الخدمة
مدفوعات حكومية وزارة نقاط البيع POS Purchase Amount Balance Card Account From To At Via Debit Credit Transfer transfer Local local Internal
Outward Inward outward inward Online online Payment payment Refund Reverse Salary Fee Fees VAT Date Time Ref Wallet wallet Top up top
Merchant Transaction transaction type SARIE deposit Deposit Available available credited debited
جنيه جنيهات درهم دراهم دينار ليرة المتاح متاح الحالي خصمت أضيف اضيف أودع اودع Dear Customer debited credited with an amount of SAR SR USD EUR AED GBP EGP mada VISA`.split(/\s+/))
const keepWord = (w) => VOCAB.has(w) || VOCAB.has(w.replace(/^(و|ب|ل|ال)/, '')) || w.length <= 1

/**
 * نسخة من الرسالة مفيهاش أي بيانات حقيقية: كل رقم بيتبدل برقم عشوائي بنفس الطول،
 * وكل كلمة مش بنكية عامة (اسم شخص، اسم محل) بتتبدل بحروف وهمية.
 */
export function maskSample(body, rnd = Math.random) {
  const digit = () => String(Math.floor(rnd() * 10))
  const word = (w) => (keepWord(w) ? w : /[A-Za-z]/.test(w) ? 'X'.repeat(Math.min(w.length, 6)) : 'س'.repeat(Math.min(w.length, 6)))
  return linesOf(body).map((l) => l.replace(/\d/g, digit).replace(/[\p{L}\p{M}]+/gu, word)).join('\n')
}

/** اسم المحل/الشخص من سطر: من غير اسم الخانة، ولا "لـ/إلى"، ولا رقم الحساب في الأول، ولا النجوم */
export function cleanParty(line) {
  let s = String(line || '')
  const m = s.match(LABEL)
  if (m) s = s.slice(m[0].length)
  s = s.trim().replace(/^(لـ|ل(?=\s*[*\d])|إلى|الى|لدى|To|At|From|من)\s*:?\s*/i, '')
  const acct = (s.match(/^\*?(\d{3,})/) || [])[1] || ''
  s = s.replace(/^\*?\d+[;\s]*/, '').replace(/[\s.,،:;]+$/, '').replace(/\*+$/, '').replace(/\s+/g, ' ').trim()
  return { name: s.slice(0, 48), acct }
}

/** المبلغ من السطر اللي القالب حدده: بالعملة لو موجودة، وإلا أول رقم في السطر (مش تاريخ ولا وقت) */
function amountIn(line, ts) {
  const a = amount(line, ts)
  if (a > 0) return a
  const v = String(line).replace(/^[^\d:：]{0,28}[:：]/, '').replace(/\d{1,4}[/\-]\d{1,2}[/\-]\d{1,4}|\d{1,2}:\d{2}(:\d{2})?/g, ' ').match(/(?<![\d*])\d[\d,]*(?:\.\d+)?/)
  const n = v ? parseFloat(v[0].replace(/,/g, '')) : NaN
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

/** القالب صالح شكلًا؟ (بنتأكد من اللي راجع من السيرفر قبل ما نستخدمه) */
export function validTemplate(t, nLines) {
  if (!t || !KINDS.includes(t.kind)) return false
  if (t.kind === 'ignore') return true
  const ok = (x) => x == null || (Number.isInteger(x) && x >= 0 && x < nLines)
  if (t.currency != null && !/^[A-Z]{3}$/.test(t.currency)) return false
  // الكلمات اللي بتحدد مكان القيمة جوه السطر (لو السطر فيه كذا قيمة): كلمة قصيرة من غير أرقام
  for (const k of ANCHORS) if (t[k] != null && (typeof t[k] !== 'string' || !t[k].trim() || t[k].length > 24 || /\d/.test(t[k]))) return false
  return Number.isInteger(t.amountLine) && ok(t.amountLine) && ok(t.partyLine) && ok(t.balanceLine)
}
export const ANCHORS = ['amountAfter', 'amountBefore', 'partyAfter', 'partyBefore', 'balanceAfter', 'balanceBefore']
/** جزء السطر بين كلمتين (بعد after وقبل before). لو الكلمة مش موجودة → null (القالب مش مناسب للرسالة) */
function segment(line, after, before) {
  let s = String(line || '')
  if (after) { const i = s.indexOf(after); if (i < 0) return null; s = s.slice(i + after.length) }
  if (before) { const j = s.indexOf(before); if (j >= 0) s = s.slice(0, j) }
  return s
}

/**
 * يطبّق القالب على رسالة. بيرجّع نفس شكل classify: [kind, amount, name] أو null لو فشل.
 * الحارس: المبلغ لازم يكون مكتوب فعلًا في سطر المبلغ.
 * القالب: { kind, amountLine, partyLine?, balanceLine?, currency? (ISO زي SAR/EGP/AED),
 *           amountAfter/Before?, partyAfter/Before?, balanceAfter/Before? (كلمات بتحدد مكان القيمة جوه السطر) }
 */
export function applyTemplate(t, body, ts, profile = {}) {
  const ls = linesOf(body)
  if (!validTemplate(t, ls.length)) return null
  if (t.kind === 'ignore') return ['ignore', 0, 'ai']
  const aSeg = segment(ls[t.amountLine], t.amountAfter, t.amountBefore)
  const a = aSeg == null ? null : amountIn(aSeg, ts)
  if (!(a > 0)) return null
  const pSeg = t.partyLine == null ? null : segment(ls[t.partyLine], t.partyAfter, t.partyBefore)
  const p = pSeg == null ? { name: '', acct: '' } : cleanParty(pSeg)
  if (t.kind === 'transfer') {
    const self = (profile.selfNames || []).filter(Boolean)
    if (self.some((n) => p.name.toLowerCase().includes(String(n).toLowerCase()))) return ['ignore', a, 'self']
    if (p.acct && (profile.accounts || []).some((x) => x && (String(x).endsWith(p.acct) || p.acct.endsWith(String(x))))) return ['ignore', a, 'self']
  }
  // الرصيد والعملة (لو القالب حددهم) — بيدخلوا مع العملية
  const extra = {}
  if (t.balanceLine != null) { const bs = segment(ls[t.balanceLine], t.balanceAfter, t.balanceBefore); const bal = bs == null ? null : amountIn(bs, ts); if (bal != null) extra.bal = bal }
  if (t.currency && t.currency !== 'SAR') extra.cur = t.currency
  return [t.kind, a, p.name, extra]
}

const MONEY = /(SAR|SR|ر\.?\s?س|ريال|USD|EUR|AED|EGP|KWD|QAR|BHD|OMR|JOD)\s*:?\s*[\d,]+|[\d,]+(\.\d+)?\s*(SAR|SR|ر\.?\s?س|ريال|USD|EUR|AED|EGP|KWD|QAR|BHD|OMR|JOD|جنيه|درهم|دينار)|(مبلغ|Amount|القيمة)\s*:?\s*[\d,]+/i
/** رسالة فيها فلوس؟ (لو التطبيق مافهمهاش يبقى تستاهل نسأل عليها) */
export const hasMoney = (b) => MONEY.test(String(b || '').normalize('NFKC'))
