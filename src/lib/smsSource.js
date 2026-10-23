import { Capacitor, registerPlugin } from '@capacitor/core'

const SmsReader = registerPlugin('SmsReader')

export const isNative = Capacitor.isNativePlatform()
export const platform = Capacitor.getPlatform() // android | ios | web
export const isIOS = platform === 'ios'

/** يقرأ رسايل الوارد من البنوك المحددة فقط (الفلترة بتحصل جوه Java) */
export async function readSms(senders) {
  const res = await SmsReader.read({ senders: senders.map((s) => s.toLowerCase()) })
  return res.messages || []
}

/** يبعت إعدادات الحدود للجزء الأصلي اللي بيراقب الرسايل الجديدة ويبعت الإشعارات */
export async function saveNativeConfig(cfg) {
  if (!isNative) return
  try { await SmsReader.saveConfig(cfg) } catch (e) { console.warn('saveConfig', e) }
}

export async function requestNotifications() {
  if (!isNative) return false
  try { return (await SmsReader.requestNotifications()).granted } catch { return false }
}

export async function testNotification() {
  if (isNative) await SmsReader.testNotification()
}

export async function notify(title, text, id) {
  if (!isNative) throw new Error('web')
  await SmsReader.testNotification({ title, text, id })
}

export async function notificationStatus() {
  if (!isNative) return { granted: false, smsReceive: false, web: true }
  try { return await SmsReader.notificationStatus() } catch { return { granted: false, smsReceive: false } }
}

/** يشغّل نفس منطق الرسالة الجديدة على رسالة وهمية (مش بيغيّر المجاميع) */
export async function simulatePurchase(body) {
  return SmsReader.simulate({ body })
}

/** آيفون: إضافة رسالة بنك بالنسخ واللصق (نفس اللي بيعمله الاختصار) */
export async function addMessage(body, address = '__ios__') {
  return SmsReader.addMessage({ body, address })
}

/** تذكيرات ميعاد السداد — بتتجدول في الموبايل نفسه */
export async function scheduleReminders(items) {
  if (!isNative) return
  try { await SmsReader.scheduleReminders({ items }) } catch (e) { console.warn('reminders', e) }
}

/** حالة البطاقات الائتمانية للجزء الأصلي — علشان ينبهك لما الاستخدام يعدّي النسبة حتى والتطبيق مقفول */
export async function saveCredit(cards) {
  if (!isNative) return
  try { await SmsReader.saveCredit({ cards }) } catch (e) { console.warn('credit', e) }
}

/** قفل التطبيق: البصمة/الوش متاحين؟ */
export async function biometricAvailable() {
  if (!isNative) return { available: false }
  try { return await SmsReader.biometricAvailable() } catch { return { available: false } }
}
export async function biometricAuth(title = 'افتح مصاريفي') {
  if (!isNative) return { ok: true }
  try { return await SmsReader.biometricAuth({ title }) } catch (e) { return { ok: false, error: String(e) } }
}

/** راسلين جداد شكلهم بنوك: [{address, n, last}] */
export async function listSenders(known) {
  if (!isNative || isIOS) return []
  try { return (await SmsReader.listSenders({ known })).senders || [] } catch { return [] }
}

/** ردود "سلفة؟" اللي اتضغطت من الإشعار (وبتتمسح بعد ما نقراها) */
export async function loanAnswers() {
  if (!isNative) return []
  try { return (await SmsReader.loanAnswers()).items || [] } catch { return [] }
}
