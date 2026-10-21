import Foundation
import UserNotifications

/// رسايل البنوك اللي وصلت عن طريق الاختصار (بديل صندوق الرسايل على أندرويد)
enum MessageStore {
    struct Msg: Codable { let address: String; let body: String; let date: Double }

    private static var url: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("bank-messages.json")
    }
    private static let lock = NSLock()

    static func all() -> [Msg] {
        lock.lock(); defer { lock.unlock() }
        guard let d = try? Data(contentsOf: url), let m = try? JSONDecoder().decode([Msg].self, from: d) else { return [] }
        return m
    }

    @discardableResult
    static func add(address: String, body: String, date: Date) -> Bool {
        lock.lock(); defer { lock.unlock() }
        var list = (try? JSONDecoder().decode([Msg].self, from: Data(contentsOf: url))) ?? []
        if list.contains(where: { $0.body == body && abs($0.date - date.timeIntervalSince1970 * 1000) < 120_000 }) { return false }
        list.append(Msg(address: address, body: body, date: (date.timeIntervalSince1970 * 1000).rounded()))
        if let d = try? JSONEncoder().encode(list) { try? d.write(to: url, options: .atomic) }
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "masareef_last_intent")
        return true
    }

    static var lastIntent: Double { UserDefaults.standard.double(forKey: "masareef_last_intent") }
}

/// إعدادات الحدود ومجاميع الراتب الحالي + الإشعارات (زي LimitStore.java)
enum LimitStore {
    private static let kConfig = "masareef_limits_config"
    private static let kNotified = "masareef_limits_notified"

    static func loadConfig() -> [String: Any] {
        guard let d = UserDefaults.standard.data(forKey: kConfig),
              let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { return [:] }
        return o
    }
    static func saveConfig(_ cfg: [String: Any]) {
        if let d = try? JSONSerialization.data(withJSONObject: cfg) { UserDefaults.standard.set(d, forKey: kConfig) }
    }

    static func doubles(_ o: Any?) -> [String: Double] {
        var m: [String: Double] = [:]
        for (k, v) in (o as? [String: Any]) ?? [:] { m[k] = (v as? NSNumber)?.doubleValue ?? 0 }
        return m
    }
    static func strings(_ o: Any?) -> [String: String] {
        var m: [String: String] = [:]
        for (k, v) in (o as? [String: Any]) ?? [:] { m[k] = v as? String ?? "" }
        return m
    }
    static func rules(_ o: Any?) -> [[String]] { ((o as? [Any]) ?? []).compactMap { $0 as? [String] } }

    /// بيتنادى من الاختصار لما توصل رسالة بنك
    static func addMessage(address: String, body: String, ts: Double) {
        creditOnMessage(body: body, ts: ts)
        var cfg = loadConfig()
        if LimitEngine.isSalary(body) {
            cfg["cycle"] = String(Int(ts))
            cfg["totals"] = [String: Double]()
            saveConfig(cfg)
            return
        }
        guard let p = LimitEngine.parsePurchase(body, ts: ts) else { return }
        let cat = LimitEngine.categorize(p.merchant, overrides: strings(cfg["overrides"]), rules: rules(cfg["rules"]))
        var totals = doubles(cfg["totals"])
        totals[cat, default: 0] += p.amount
        totals["__total", default: 0] += p.amount
        cfg["totals"] = totals
        saveConfig(cfg)
        evaluateAndNotify()
    }

    // ===== تنبيه استخدام البطاقة الائتمانية =====
    static let kCredit = "masareef_credit", kCreditNotified = "masareef_credit_notified"
    static let ccPay = try! NSRegularExpression(pattern: "سداد البطاقة|credit card payment|(بطاقة ائتمانية|بطاقة فيزا)\\s*:\\s*سداد", options: [.caseInsensitive])

    static func loadCredit() -> [String: [String: Any]] {
        guard let d = UserDefaults.standard.data(forKey: kCredit),
              let o = try? JSONSerialization.jsonObject(with: d) as? [String: [String: Any]] else { return [:] }
        return o
    }
    static func saveCredit(_ c: [String: Any]) {
        if let d = try? JSONSerialization.data(withJSONObject: c) { UserDefaults.standard.set(d, forKey: kCredit) }
        evaluateCredit()
    }
    static func creditOnMessage(body: String, ts: Double) {
        var credit = loadCredit(); var changed = false
        let isPay = ccPay.firstMatch(in: body, range: NSRange(body.startIndex..., in: body)) != nil
        for (card, var c) in credit where card.count >= 4 && body.contains(card) {
            let owed = (c["owed"] as? NSNumber)?.doubleValue ?? 0
            if isPay, let a = LimitEngine.amount(body, ts: ts) { c["owed"] = owed - a; changed = true }
            else if !isPay, let p = LimitEngine.parsePurchase(body, ts: ts) { c["owed"] = owed + p.amount; changed = true }
            credit[card] = c
        }
        if changed { saveCredit(credit) }
    }
    static func evaluateCredit() {
        let credit = loadCredit()
        var done = (UserDefaults.standard.dictionary(forKey: kCreditNotified) as? [String: Bool]) ?? [:]
        for (card, c) in credit {
            let limit = (c["limit"] as? NSNumber)?.doubleValue ?? 0, owed = (c["owed"] as? NSNumber)?.doubleValue ?? 0
            let pct = (c["pct"] as? NSNumber)?.doubleValue ?? 80
            if limit <= 0 || pct <= 0 { continue }
            let u = owed / limit * 100
            if u >= pct {
                if done[card] == true { continue }
                done[card] = true
                let name = (c["name"] as? String) ?? "••\(card)"
                notify(id: "cc\(card)", title: "💳 \(name) وصلت \(Int(u.rounded()))٪ من الحد",
                       text: "المستحق \(fmt(owed)) من \(fmt(limit)) ر.س — المتاح \(fmt(max(0, limit - owed)))")
            } else { done[card] = nil }
        }
        UserDefaults.standard.set(done, forKey: kCreditNotified)
    }

    static func sameCycle(_ a: String, _ b: String) -> Bool {
        if let x = Double(a), let y = Double(b) { return abs(x - y) < 10 * 86_400_000 }
        return a == b
    }

    static func evaluateAndNotify() {
        let cfg = loadConfig()
        let cycle = (cfg["cycle"] as? String) ?? ""
        var notified: [String: Int] = [:]
        if let d = UserDefaults.standard.data(forKey: kNotified),
           let n = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
           sameCycle(cycle, (n["cycle"] as? String) ?? "") {
            for (k, v) in (n["levels"] as? [String: Any]) ?? [:] { notified[k] = (v as? NSNumber)?.intValue ?? 0 }
        }
        let alerts = LimitEngine.evaluate(totals: doubles(cfg["totals"]), limits: doubles(cfg["limits"]), notified: &notified)
        if let d = try? JSONSerialization.data(withJSONObject: ["cycle": cycle, "levels": notified]) {
            UserDefaults.standard.set(d, forKey: kNotified)
        }
        let names = strings(cfg["names"])
        for al in alerts {
            let name = names[al.cat] ?? al.cat
            let pct = Int((al.spent / al.limit * 100).rounded())
            var title: String, text: String
            if al.cat == "__total" {
                title = al.level >= 100 ? "عدّيت حد المصروفات للراتب ده 🔴" : "صرفت \(pct)٪ من حد المصروفات"
                text = al.level >= 100
                    ? "صرفت \(fmt(al.spent)) ر.س والحد \(fmt(al.limit)) ر.س — زيادة \(fmt(al.spent - al.limit))"
                    : "صرفت \(fmt(al.spent)) من \(fmt(al.limit)) ر.س — باقي \(fmt(al.limit - al.spent))"
            } else if al.level >= 100 {
                title = "عدّيت حد \(name) ⚠️"
                text = "صرفت \(fmt(al.spent)) ر.س من الراتب ده، والحد \(fmt(al.limit)) ر.س"
            } else {
                title = "قرّبت من حد \(name)"
                text = "صرفت \(fmt(al.spent)) من \(fmt(al.limit)) ر.س (\(pct)٪)"
            }
            notify(id: "limit-\(al.cat)", title: title, text: text)
        }
    }

    static func fmt(_ v: Double) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "en_US")
        f.maximumFractionDigits = 0
        return f.string(from: NSNumber(value: v.rounded())) ?? String(Int(v))
    }

    static func notify(id: String, title: String, text: String) {
        let c = UNMutableNotificationContent()
        c.title = title
        c.body = text
        c.sound = .default
        let req = UNNotificationRequest(identifier: id + "-\(Int(Date().timeIntervalSince1970))", content: c, trigger: nil)
        UNUserNotificationCenter.current().add(req)
    }
}
