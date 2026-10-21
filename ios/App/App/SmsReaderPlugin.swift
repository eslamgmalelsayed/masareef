import Foundation
import Capacitor
import UserNotifications

/// نفس واجهة SmsReaderPlugin بتاع أندرويد، علشان كود Vue يفضل واحد.
/// على آيفون الرسايل بتيجي من الاختصار (AddBankMessageIntent) بدل قراية الـ SMS.
@objc(SmsReaderPlugin)
public class SmsReaderPlugin: CAPPlugin, CAPBridgedPlugin, UNUserNotificationCenterDelegate {
    public let identifier = "SmsReaderPlugin"
    public let jsName = "SmsReader"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "addMessage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveConfig", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestNotifications", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "notificationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "testNotification", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "simulate", returnType: CAPPluginReturnPromise),
    ]

    public override func load() {
        // علشان الإشعار يظهر حتى والتطبيق مفتوح
        UNUserNotificationCenter.current().delegate = self
    }

    public func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                       withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }

    @objc func read(_ call: CAPPluginCall) {
        let msgs = MessageStore.all().map { ["address": $0.address, "body": $0.body, "date": $0.date] as [String: Any] }
        call.resolve(["messages": msgs])
    }

    /// إضافة رسالة يدويًا (لصق) — نفس اللي بيعمله الاختصار
    @objc func addMessage(_ call: CAPPluginCall) {
        let body = (call.getString("body") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if body.isEmpty { call.reject("empty"); return }
        let address = call.getString("address") ?? "__ios__"
        let now = Date()
        let added = MessageStore.add(address: address, body: body, date: now)
        if added { LimitStore.addMessage(address: address, body: body, ts: now.timeIntervalSince1970 * 1000) }
        call.resolve(["added": added])
    }

    @objc func saveConfig(_ call: CAPPluginCall) {
        var cfg: [String: Any] = [:]
        for (k, v) in call.options ?? [:] { if let key = k as? String { cfg[key] = v } }
        LimitStore.saveConfig(cfg)
        LimitStore.evaluateAndNotify()
        call.resolve()
    }

    @objc func requestNotifications(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            call.resolve(["granted": granted])
        }
    }

    @objc func notificationStatus(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { s in
            let ok = s.authorizationStatus == .authorized || s.authorizationStatus == .provisional
            let last = MessageStore.lastIntent
            call.resolve(["granted": ok, "smsReceive": last > 0, "lastIntent": last * 1000, "ios": true])
        }
    }

    @objc func testNotification(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? "إشعارات مصاريفي شغالة ✅"
        let text = call.getString("text") ?? "هيوصلك تنبيه لما توصل ٨٠٪ وعند تخطي أي حد"
        UNUserNotificationCenter.current().getNotificationSettings { s in
            guard s.authorizationStatus == .authorized || s.authorizationStatus == .provisional else {
                call.reject("notifications not allowed"); return
            }
            LimitStore.notify(id: "test-\(call.getInt("id") ?? 4242)", title: title, text: text)
            call.resolve()
        }
    }

    @objc func simulate(_ call: CAPPluginCall) {
        let body = call.getString("body") ?? ""
        guard let p = LimitEngine.parsePurchase(body, ts: Date().timeIntervalSince1970 * 1000) else { call.reject("مش رسالة شراء"); return }
        let cfg = LimitStore.loadConfig()
        let cat = LimitEngine.categorize(p.merchant, overrides: LimitStore.strings(cfg["overrides"]), rules: LimitStore.rules(cfg["rules"]))
        let names = LimitStore.strings(cfg["names"])
        let totals = LimitStore.doubles(cfg["totals"])
        let limits = LimitStore.doubles(cfg["limits"])
        var text = "\(p.merchant) · \(String(format: "%.2f", p.amount)) ر.س → \(names[cat] ?? cat)"
        if let l = limits[cat] { text += "\nالبند هيبقى \(LimitStore.fmt((totals[cat] ?? 0) + p.amount)) من \(LimitStore.fmt(l))" }
        if let l = limits["__total"] { text += "\nالإجمالي هيبقى \(LimitStore.fmt((totals["__total"] ?? 0) + p.amount)) من \(LimitStore.fmt(l))" }
        LimitStore.notify(id: "simulate", title: "🧪 تجربة: اتقرت رسالة شراء", text: text)
        call.resolve(["merchant": p.merchant, "amount": p.amount, "category": cat])
    }
}
