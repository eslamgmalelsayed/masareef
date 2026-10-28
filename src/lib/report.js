// تقرير الشهر (فترة راتب): أرقام + صورة تتشارك
import { spendTx, cycles, currentCycle } from './store.js'
import { CAT } from './categories.js'
import { money, fmt } from './format.js'
import { isNative } from './smsSource.js'

const DAY = 864e5

/** أرقام فترة راتب. idx من آخر الفترات (-1 = الحالية، -2 = اللي قبلها) */
export function monthStats(idx = -2) {
  const cs = cycles.value.length ? cycles.value : [currentCycle.value]
  const c = cs[cs.length + idx] || cs[cs.length - 1]
  const prev = cs[cs.indexOf(c) - 1]
  const rows = spendTx.value.filter((t) => t.d >= c.from && t.d <= c.to)
  const spent = rows.reduce((x, t) => x + t.a, 0)
  const by = {}
  for (const t of rows) by[t.c] = (by[t.c] || 0) + t.a
  const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c2, v]) => ({ name: CAT[c2]?.name || c2, icon: CAT[c2]?.icon || '•', v, pct: spent ? v / spent : 0 }))
  const days = {}
  for (const t of rows) { const k = new Date(t.ts).toDateString(); days[k] = (days[k] || 0) + t.a }
  const nDays = Math.max(1, Math.round((Math.min(+c.to, Date.now()) - +c.from) / DAY))
  const zero = nDays - Object.keys(days).length
  const shops = {}
  for (const t of rows) if (t.k === 'purchase') shops[t.m] = (shops[t.m] || 0) + 1
  const fav = Object.entries(shops).sort((a, b) => b[1] - a[1])[0]
  const prevSpent = prev ? spendTx.value.filter((t) => t.d >= prev.from && t.d <= prev.to).reduce((x, t) => x + t.a, 0) : 0
  return {
    label: c.label ? `${c.label} ${c.year}` : 'الشهر ده', current: !!c.current, salary: c.salary || 0, spent,
    saved: c.salary ? c.salary - spent : null, perDay: spent / nDays, top, zeroDays: Math.max(0, zero),
    fav: fav ? { name: fav[0], n: fav[1] } : null, change: prevSpent ? (spent - prevSpent) / prevSpent : null, n: rows.length,
  }
}

/** بيرسم التقرير صورة (1080×1350) — line = سطر الذكاء الاصطناعي (اختياري) */
export async function drawReport(s, line = '') {
  try { await document.fonts?.load('700 40px "IBM Plex Sans Arabic"') } catch {}
  const W = 1080, H = 1350, cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const g = cv.getContext('2d')
  const F = (w, px) => `${w} ${px}px "IBM Plex Sans Arabic", system-ui, sans-serif`
  const bg = g.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#0f766e'); bg.addColorStop(1, '#134e4a')
  g.fillStyle = bg; g.fillRect(0, 0, W, H)
  g.direction = 'rtl'; g.textAlign = 'right'; g.fillStyle = '#fff'
  const R = W - 80, sym = money.sym
  g.globalAlpha = 0.75; g.font = F(500, 38); g.fillText('مصاريفي · تقرير ' + s.label, R, 120)
  g.globalAlpha = 1; g.font = F(500, 40); g.fillText('صرفت', R, 230)
  g.font = F(700, 132); g.fillText(fmt(s.spent), R, 370)
  g.font = F(500, 44); g.globalAlpha = 0.8; g.fillText(s.salary ? `${sym} من راتب ${fmt(s.salary)}` : sym, R, 440); g.globalAlpha = 1
  // كروت صغيرة
  const box = (x, y, w, h, t1, t2) => {
    g.fillStyle = 'rgba(255,255,255,.12)'; roundRect(g, x, y, w, h, 28); g.fill()
    g.fillStyle = '#fff'; g.font = F(500, 32); g.globalAlpha = 0.75; g.fillText(t1, x + w - 32, y + 58); g.globalAlpha = 1
    g.font = F(700, 52); g.fillText(t2, x + w - 32, y + 130)
  }
  const bw = (W - 160 - 24) / 2
  box(80 + bw + 24, 500, bw, 170, s.saved != null ? (s.saved >= 0 ? 'فضل معاك' : 'زيادة عن الراتب') : 'في اليوم', s.saved != null ? fmt(Math.abs(s.saved)) : fmt(s.perDay))
  box(80, 500, bw, 170, 'مقارنة باللي قبله', s.change == null ? '—' : (s.change > 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(s.change * 100)) + '٪')
  // أكبر البنود
  g.font = F(600, 40); g.fillText('أكبر البنود', R, 760)
  s.top.forEach((t, i) => {
    const y = 830 + i * 92
    g.fillStyle = 'rgba(255,255,255,.12)'; roundRect(g, 80, y - 50, W - 160, 72, 20); g.fill()
    g.fillStyle = 'rgba(255,255,255,.35)'; roundRect(g, W - 80 - (W - 160) * t.pct, y - 50, (W - 160) * t.pct, 72, 20); g.fill()
    g.fillStyle = '#fff'; g.font = F(500, 36); g.fillText(`${t.icon} ${t.name}`, R - 24, y)
    g.textAlign = 'left'; g.direction = 'ltr'; g.font = F(700, 36); g.fillText(fmt(t.v), 104, y); g.textAlign = 'right'; g.direction = 'rtl'
  })
  let y = 830 + s.top.length * 92 + 40
  g.font = F(500, 34); g.globalAlpha = 0.85
  if (s.zeroDays) { g.fillText(`🔥 ${s.zeroDays === 1 ? 'يوم' : s.zeroDays === 2 ? 'يومين' : s.zeroDays + (s.zeroDays <= 10 ? ' أيام' : ' يوم')} ما صرفتش فيهم حاجة`, R, y); y += 58 }
  if (s.fav) { g.fillText(`🛍️ أكتر مكان: ${s.fav.name.slice(0, 22)} (${s.fav.n} مرة)`, R, y); y += 58 }
  g.globalAlpha = 1
  if (line) { g.font = F(600, 38); wrap(g, '💬 ' + line, R, Math.max(y + 20, 1180), W - 160, 54, 2) }
  g.font = F(500, 28); g.globalAlpha = 0.6; g.fillText('مصاريفي — بيقرا رسايل البنك ويحسبلك لوحده', R, H - 50)
  return cv
}

function roundRect(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h) }
function wrap(g, text, x, y, max, lh, lines) {
  const words = text.split(' '); let line = '', n = 0
  for (const w of words) {
    const t = line ? line + ' ' + w : w
    if (g.measureText(t).width > max && line) { g.fillText(line, x, y); y += lh; line = w; if (++n >= lines - 1) break } else line = t
  }
  if (line) g.fillText(line, x, y)
}

/** مشاركة الصورة (الموبايل) أو تنزيلها (الويب) */
export async function shareReport(cv, label) {
  const name = `masareef-${label.replace(/\s+/g, '-')}.png`
  if (isNative) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const data = cv.toDataURL('image/png').split(',')[1]
    const r = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache })
    await Share.share({ title: 'تقرير ' + label, url: r.uri, dialogTitle: 'شارك التقرير' })
  } else {
    const a = document.createElement('a')
    a.href = cv.toDataURL('image/png'); a.download = name; a.click()
  }
}
