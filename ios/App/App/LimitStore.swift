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
            salarySummary(cfg, ts: ts)
            cfg["cycle"] = String(Int(ts))
            let old = doubles(cfg["totals"])  // اليوم والأسبوع ملهمش علاقة بالراتب
            cfg["totals"] = ["__day": old["__day"] ?? 0, "__week": old["__week"] ?? 0]
            saveConfig(cfg)
            return
        }
        guard let p = LimitEngine.parsePurchase(body, ts: ts) else { return }
        let cat = LimitEngine.categorize(p.merchant, overrides: strings(cfg["overrides"]), rules: rules(cfg["rules"]))
        unusualCheck(cfg, p, cat: cat, ts: ts)
        var totals = doubles(cfg["totals"])
        totals[cat, default: 0] += p.amount
        totals["__total", default: 0] += p.amount
        var pk = strings(cfg["periodKeys"])
        for (per, key) in [("__day", dayKey(ts, week: false)), ("__week", dayKey(ts, week: true))] {
            if pk[per] != key { totals[per] = 0; pk[per] = key }
            totals[per, default: 0] += p.amount
        }
        cfg["periodKeys"] = pk
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
            let minAvail = (c["minAvail"] as? NSNumber)?.doubleValue ?? 0
            if limit <= 0 || (pct <= 0 && minAvail <= 0) { continue }
            let u = owed / limit * 100, avail = max(0, limit - owed)
            let byPct = pct > 0 && u >= pct, byAvail = minAvail > 0 && avail < minAvail
            if byPct || byAvail {
                if done[card] == true { continue }
                done[card] = true
                let name = (c["name"] as? String) ?? "••\(card)"
                let title = byAvail && !byPct ? "💳 المتاح في \(name) بقى \(fmt(avail)) ر.س بس" : "💳 \(name) وصلت \(Int(u.rounded()))٪ من الحد"
                notify(id: "cc\(card)", title: title, text: "المستحق \(fmt(owed)) من \(fmt(limit)) ر.س — المتاح \(fmt(avail))")
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
        // يوم/أسبوع جديد → إشعارات الحد اليومي/الأسبوعي تشتغل من الأول
        let pk = strings(cfg["periodKeys"])
        for per in ["__day", "__week"] {
            let k = pk[per] ?? ""
            if UserDefaults.standard.string(forKey: "pk" + per) != k { notified[per] = nil; UserDefaults.standard.set(k, forKey: "pk" + per) }
        }
        // مجموعات البنود (مثلًا تسوق + ملابس): المجموع = مجموع البنود اللي جواها
        var totals = doubles(cfg["totals"])
        for (g, cats) in (cfg["groups"] as? [String: Any]) ?? [:] {
            totals[g] = ((cats as? [Any]) ?? []).reduce(0.0) { $0 + (totals[($1 as? String) ?? ""] ?? 0) }
        }
        let alerts = LimitEngine.evaluate(totals: totals, limits: doubles(cfg["limits"]), notified: &notified)
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
            } else if al.cat == "__day" || al.cat == "__week" {
                let when = al.cat == "__day" ? "النهارده" : "الأسبوع ده"
                title = al.level >= 100 ? "عدّيت حد \(name) ⚠️" : "صرفت \(pct)٪ من حد \(name)"
                text = al.level >= 100
                    ? "صرفت \(fmt(al.spent)) ر.س \(when) والحد \(fmt(al.limit)) ر.س"
                    : "صرفت \(fmt(al.spent)) من \(fmt(al.limit)) ر.س \(when) — باقي \(fmt(al.limit - al.spent))"
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

    /// أول ما ينزل الراتب: ملخص الراتب اللي فات (قبل ما نصفّر المجاميع)
    static func salarySummary(_ cfg: [String: Any], ts: Double) {
        let cyc = Double((cfg["cycle"] as? String) ?? "") ?? 0
        if ts - cyc < 15 * 86_400_000 { return }
        let t = doubles(cfg["totals"])
        let spent = t["__total"] ?? 0
        if spent <= 0 { return }
        let groups = (cfg["groups"] as? [String: Any]) ?? [:]
        let top = t.filter { !$0.key.hasPrefix("__") && groups[$0.key] == nil }.max { $0.value < $1.value }
        let names = strings(cfg["names"])
        let limit = doubles(cfg["limits"])["__total"] ?? 0
        var text = "الراتب اللي فات صرفت \(fmt(spent)) ر.س" + (limit > 0 ? " (\(Int((spent / limit * 100).rounded()))٪ من الحد)" : "")
        if let top = top { text += " · أكتر بند: \(names[top.key] ?? top.key) \(fmt(top.value))" }
        notify(id: "salary", title: "💰 نزل الراتب — ملخص الراتب اللي فات", text: text)
    }

    /// عملية مكررة (نفس المبلغ ونفس المكان في ربع ساعة) أو أكبر بكتير من عادتك مع نفس التاجر
    static func unusualCheck(_ cfg: [String: Any], _ p: LimitEngine.Purchase, cat: String, ts: Double) {
        let k = LimitEngine.merchantKey(p.merchant)
        if k.isEmpty || cat == "bnpl" || k.contains("TABBY") || k.contains("TAMARA") { return }
        var recent = (UserDefaults.standard.array(forKey: "masareef_recent") as? [[String: Any]]) ?? []
        let dup = recent.contains { ($0["k"] as? String) == k && abs((($0["a"] as? NSNumber)?.doubleValue ?? -1) - p.amount) < 0.01 && abs((($0["ts"] as? NSNumber)?.doubleValue ?? 0) - ts) < 15 * 60_000 }
        recent.append(["k": k, "a": p.amount, "ts": ts])
        UserDefaults.standard.set(Array(recent.suffix(8)), forKey: "masareef_recent")
        if dup {
            notify(id: "dup-\(k)", title: "⚠️ عملية مكررة؟", text: "اتسحب \(fmt(p.amount)) ر.س من \(p.merchant) مرتين ورا بعض — اتأكد إنها مش مكررة")
            return
        }
        let m = doubles(cfg["usual"])[k] ?? 0
        if m > 0 && p.amount >= 150 && p.amount >= 3 * m {
            notify(id: "big-\(k)", title: "👀 عملية أكبر من عادتك", text: "\(fmt(p.amount)) ر.س في \(p.merchant) — عادتك هناك حوالي \(fmt(m))")
        }
    }

    /// مفتاح اليوم (أو الأحد اللي بدأ بيه الأسبوع) بنفس صيغة الـ JS
    static func dayKey(_ ts: Double, week: Bool) -> String {
        let cal = Calendar(identifier: .gregorian)
        var d = Date(timeIntervalSince1970: ts / 1000)
        if week { d = cal.date(byAdding: .day, value: -(cal.component(.weekday, from: d) - 1), to: d) ?? d }
        let c = cal.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
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
