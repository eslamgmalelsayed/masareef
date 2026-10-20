import { Capacitor, registerPlugin } from '@capacitor/core'

const SmsReader = registerPlugin('SmsReader')

export const isNative = Capacitor.isNativePlatform()

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
