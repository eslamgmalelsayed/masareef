import { computed } from 'vue'
import { commitments, transfers, savings, saveGoal } from './insights.js'
import { totals as debtTotals } from './debts.js'
import { funds, fundsNeedNow, remit, netWorth, zakat, activeEvent, emergency } from './tools.js'
import { creditCards } from './credit.js'
import { fmt, fmtDate } from './format.js'

// كل أداة: أيقونة + اسم + سطر واحد حي من أرقامك
export const toolsList = computed(() => [
  { id: 'commit', ic: '🔁', t: 'الالتزامات الشهرية', s: `${fmt(commitments.value.next30)} في الـ ٣٠ يوم الجايين` },
  { id: 'debts', ic: '💸', t: 'الديون', s: debtTotals.value.owed || debtTotals.value.lent ? `عليّا ${fmt(debtTotals.value.owed)} · ليّا ${fmt(debtTotals.value.lent)}` : 'سجّل اللي عليك واللي ليك' },
  { id: 'savings', ic: '🎯', t: 'هدف الادخار', s: saveGoal.value ? (savings.value.onTrack ? 'ماشي صح 👌' : 'متأخر شوية') : 'حدد هدف' },
  { id: 'emergency', ic: '🛟', t: 'صندوق الطوارئ', s: emergency.value.saved ? `معاك ${fmt(emergency.value.saved)} من ${fmt(emergency.value.target)}` : `المقترح ${fmt(emergency.value.suggested)} (${emergency.value.months} شهور)` },
  { id: 'funds', ic: '🗂️', t: 'صناديق المصاريف السنوية', s: funds.value.length ? `حط ${fmt(fundsNeedNow.value)} الراتب ده` : 'الإقامة، رحلة مصر، العيد…' },
  { id: 'transfers', ic: '🌍', t: 'الحوالات', s: remit.value.target ? `${fmt(remit.value.sent)} من ${fmt(remit.value.target)} الراتب ده` : `${fmt(transfers.value.cycle)} الراتب ده` },
  { id: 'worth', ic: '💰', t: 'صافي ثروتك', s: fmt(netWorth.value.net) + ' ر.س' },
  { id: 'zakat', ic: '🕌', t: 'الزكاة', s: zakat.value.due ? 'الجاية ' + fmtDate(zakat.value.due, { day: 'numeric', month: 'short' }) : 'احسبها وفكّرني بميعادها' },
  { id: 'events', ic: '✈️', t: 'السفر والمناسبات', s: activeEvent.value ? `${activeEvent.value.name} شغال` : 'رحلة، رمضان، العيد…' },
  { id: 'credit', ic: '💳', t: 'البطاقات الائتمانية', s: creditCards.value.length ? `${creditCards.value.length} بطاقة` : 'ضيف بطاقة' },
  { id: 'sortother', ic: '🧹', t: 'رتّب المحلات', s: 'المحلات اللي التطبيق ماعرفهاش' },
  { id: 'limits', ic: '🔔', t: 'الحدود والتنبيهات', s: 'يومي · أسبوعي · شهري · بنود' },
])
