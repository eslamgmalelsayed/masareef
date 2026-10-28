// المراجع الذكي: بيقارن العمليات ببعض ويطلّع حاجات محتاجة تأكيدك (كل حاجة جوه الموبايل)
//  ١) تحويل لحد باسمه + فلوس داخلة بنفس المبلغ في بنك تاني ليك في نفس الساعة → تحويل لنفسك؟
//  ٢) استرداد بنفس مبلغ شراء قبله → الاسترداد ده يخص الشراء ده؟ (لو أيوه الشراء مبيتحسبش مصروف)
//  ٣) فلوس داخلة من حد حوّلتله قبل كده (ومقلتش سلفة) → رجّعلك سلفة؟
import { computed } from 'vue'
import { allTx, state, saveSettings, setSelfTx } from './store.js'
import { personKey } from './person.js'
import { markLoan, answerNo, unanswer as unLoan } from './debts.js'
import { merchantKey } from './categories.js'

const DAY = 864e5
const seen = () => new Set(state.settings.reviewSeen || [])
const hasName = (m) => /[A-Za-z؀-ۿ]{3}/.test(m || '')

export const findings = computed(() => {
  const S = seen()
  const yes = new Set(state.settings.lentYes || []), no = new Set(state.settings.lentDismiss || [])
  const txs = allTx.value
  const out = []
  const recent = Date.now() - 120 * DAY

  // ١) تحويل لنفسك (اللي ليه اسم — اللي من غير اسم بيتربط لوحده)
  const ins = txs.filter((t) => t.k === 'in' && t.ts > recent)
  for (const t of txs) {
    if (t.k !== 'transfer' || t.ts < recent || !hasName(t.m)) continue
    const m = ins.find((x) => x.b !== t.b && Math.abs(x.ts - t.ts) <= 3600e3 && Math.abs(x.a - t.a) <= 1)
    if (m) out.push({ id: 'self:' + t.id, type: 'self', tx: t, other: m, text: `حوّلت ${t.a} لـ ${t.m} من ${t.b}، ووصل نفس المبلغ ${m.b} في نفس الساعة` })
  }

  // ٢) استرداد ↔ شراء
  const links = state.settings.refundLinks || {}
  const linked = new Set(Object.values(links))
  const purchases = txs.filter((t) => t.k === 'purchase' && t.ts > recent - 60 * DAY && !linked.has(t.id))
  for (const r of txs) {
    if (r.k !== 'refund' || r.ts < recent || links[r.id] || r.a < 5) continue // ١ ريال = تحقق من الكارت، مش محتاج سؤال
    const mk = merchantKey(r.m)
    const cands = purchases.filter((p) => p.ts < r.ts && r.ts - p.ts < 60 * DAY && Math.abs(p.a - r.a) <= 0.01 && (!mk || mk === merchantKey(p.m) || !hasName(r.m)))
    if (cands.length) {
      const p = cands.sort((a, b) => (mk && merchantKey(b.m) === mk) - (mk && merchantKey(a.m) === mk) || b.ts - a.ts)[0]
      out.push({ id: 'refund:' + r.id, type: 'refund', tx: r, other: p, text: `استرداد ${r.a} — يخص شراء ${p.m} (${new Date(p.ts).toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'short' })})؟` })
    }
  }

  // ٣) رجّعلك سلفة؟
  const outs = txs.filter((t) => t.k === 'transfer' && !yes.has(t.id) && !no.has(t.id) && hasName(t.m))
  for (const i of txs) {
    if (i.k !== 'in' || i.ts < recent || !hasName(i.m)) continue
    const k = personKey(i.m)
    const o = outs.filter((t) => personKey(t.m) === k && t.ts < i.ts && i.ts - t.ts < 120 * DAY && t.a >= i.a * 0.5).sort((a, b) => b.ts - a.ts)[0]
    if (o) out.push({ id: 'loan:' + i.id, type: 'loan', tx: i, other: o, text: `${i.m} حوّلك ${i.a} — وانت كنت حوّلتله ${o.a} قبلها. كانت سلفة ورجّعها؟` })
  }
  return out.filter((f) => !S.has(f.id)).sort((a, b) => b.tx.ts - a.tx.ts)
})

function done(id) { state.settings.reviewSeen = [...(state.settings.reviewSeen || []), id].slice(-1000); saveSettings() }

/** ردك على ملاحظة: true = أيوه */
export function answer(f, ok) {
  if (ok) {
    if (f.type === 'self') setSelfTx(f.tx, true)
    if (f.type === 'refund') { state.settings.refundLinks = { ...(state.settings.refundLinks || {}), [f.tx.id]: f.other.id }; saveSettings() }
    if (f.type === 'loan') markLoan(f.other.id)
  } else if (f.type === 'loan') answerNo(f.other)
  done(f.id)
}
/** تراجع */
export function unanswer(f) {
  state.settings.reviewSeen = (state.settings.reviewSeen || []).filter((x) => x !== f.id)
  if (f.type === 'refund') { const m = { ...(state.settings.refundLinks || {}) }; delete m[f.tx.id]; state.settings.refundLinks = m }
  if (f.type === 'self') setSelfTx(f.tx, false)
  if (f.type === 'loan') unLoan(f.other.id)
  saveSettings()
}
