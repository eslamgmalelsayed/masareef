import Foundation

/// نفس منطق LimitEngine.java بالظبط — لازم الاتنين يفضلوا متطابقين
enum LimitEngine {
    struct Purchase { let amount: Double; let merchant: String }
    struct Alert { let cat: String; let level: Int; let spent: Double; let limit: Double }

    private static let NUM = "([\\d,]+(?:\\.\\d*)?)"

    private static func re(_ p: String, ci: Bool = false) -> NSRegularExpression? {
        try? NSRegularExpression(pattern: p, options: ci ? [.caseInsensitive] : [])
    }
    private static func test(_ p: String, _ s: String, ci: Bool = false) -> Bool {
        guard let r = re(p, ci: ci) else { return false }
        return r.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil
    }
    private static func groups(_ p: String, _ s: String, ci: Bool = false) -> [String]? {
        guard let r = re(p, ci: ci), let m = r.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) else { return nil }
        return (0..<m.numberOfRanges).map { i in
            guard let rg = Range(m.range(at: i), in: s) else { return "" }
            return String(s[rg])
        }
    }
    private static func replace(_ p: String, _ s: String, with t: String = "") -> String {
        guard let r = re(p) else { return s }
        return r.stringByReplacingMatches(in: s, range: NSRange(s.startIndex..., in: s), withTemplate: t)
    }

    static let notPurchase = "استرداد|Reverse|Refund|عكس عملية|Declined|Insufficient|not allowed|رمز|OTP|الرقم السري|لمره واحده|لمرة واحدة|verification|security code|مرفوض|غير كاف|تم تغيير الحد"
    static let purchase = "شراء|Purchase|debited with an amount"
    static let topup = "URPAY|STC ?PAY|STC BANK|stcpay|Mobily Pay|بنك اس تي سي|top ?up|إضافة الأموال"
    static let salary = "(ايداع|إيداع)\\s*(رواتب|راتب)|Salary (credit|deposit)"

    static func normalize(_ s: String) -> String { s.precomposedStringWithCompatibilityMapping }
    static func firstLine(_ s: String) -> String {
        String(s.split(separator: "\n", maxSplits: 1, omittingEmptySubsequences: false).first ?? "").trimmingCharacters(in: .whitespaces)
    }

    static func isSalary(_ raw: String) -> Bool { test(salary, firstLine(normalize(raw)), ci: true) }

    static func parsePurchase(_ raw: String, ts: Double) -> Purchase? {
        let b = normalize(raw)
        let first = firstLine(b)
        if test(notPurchase, b, ci: true) { return nil }
        let debited = b.contains("debited with an amount")
        if !test(purchase, first, ci: true) && !debited { return nil }
        guard let a = amount(b, ts: ts), a > 0 else { return nil }
        if debited { return Purchase(amount: a, merchant: "STC Pay خصم") }
        let m = merchant(b)
        if test(topup, m, ci: true) { return nil }
        return Purchase(amount: a, merchant: replace("\\s+", m, with: " ").trimmingCharacters(in: .whitespaces))
    }

    private static func num(_ s: String) -> Double? {
        var v = s.replacingOccurrences(of: ",", with: "")
        if v.hasSuffix(".") { v.removeLast() }
        return Double(v)
    }
    private static func rate(_ cur: String, _ ts: Double) -> Double {
        switch cur {
        case "USD": return 3.75
        case "EUR": return 4.05
        case "AED": return 1.02
        case "GBP": return 4.8
        case "EGP": return ts < 1709251200000 ? 1 / 8.2 : 1 / 13.0
        default: return 1
        }
    }
    private static func r2(_ v: Double) -> Double { (v * 100).rounded() / 100 }

    static func amount(_ b: String, ts: Double) -> Double? {
        if let g = groups("(?:إجمالي|اجمالي) المبلغ المستحق:\\s*" + NUM, b) { return num(g[1]) }
        if let g = groups("\\(" + NUM + "\\s*ريال\\)", b) { return num(g[1]) }
        let s = replace("(رصيد|Your balance|Balance|رسوم وضريبة|رسوم|Fees|VAT|سعر الصرف)[^|\\n]*", b)
        let cur = "(SAR|SR|USD|EGP|EUR|AED|GBP|ريال)"
        if let g = groups(cur + "\\s*:?\\s*" + NUM, s), let v = num(g[2]) { return r2(v * rate(g[1], ts)) }
        if let g = groups(NUM + "\\s*" + cur, s), let v = num(g[1]) { return r2(v * rate(g[2], ts)) }
        for p in ["Amount:\\s*" + NUM, "Transaction Amount\\s*" + NUM, "مبلغ:?\\s*" + NUM, "amount of\\s*" + NUM] {
            if let g = groups(p, s), let v = num(g[1]) { return v }
        }
        return nil
    }

    static func merchant(_ b: String) -> String {
        let pats = ["لدى:\\s*([^|\\n]+)", "اسم المتجر\\s*([^|\\n]+)", "لـ\\s*([^|\\n]+)", "At:\\s*([^|\\n]+)",
                    "From:\\s*([^|\\n]+)", "For\\s+([^|\\n]+)", "من\\s+([^|\\n]+)"]
        for p in pats {
            if let g = groups(p, b) {
                let v = g[1].trimmingCharacters(in: .whitespaces)
                if test("^[\\d/:\\- ]+$", v) { continue }
                return replace("^\\d+;", v).trimmingCharacters(in: .whitespaces)
            }
        }
        return ""
    }

    /// لازم تطابق merchantKey في categories.js
    static func merchantKey(_ name: String) -> String {
        var s = name.uppercased()
        s = replace("^(TAP|PAYPAL)\\s*\\*?\\s*", s)
        s = replace("[^A-Z0-9\\u0600-\\u06FF]", s)
        return String(s.prefix(9))
    }

    static func categorize(_ merchant: String, overrides: [String: String], rules: [[String]]) -> String {
        let key = merchantKey(merchant)
        if !key.isEmpty, let c = overrides[key] { return c }
        for r in rules where r.count == 2 {
            if test(r[1], merchant, ci: true) { return r[0] }
        }
        return "shop"
    }

    /// notified: "cat@limit" → آخر مستوى اتبعت له إشعار
    static func evaluate(totals: [String: Double], limits: [String: Double], notified: inout [String: Int]) -> [Alert] {
        var out: [Alert] = []
        for (cat, limit) in limits where limit > 0 {
            let spent = totals[cat] ?? 0
            let level = spent >= limit ? 100 : spent >= 0.8 * limit ? 80 : 0
            let key = "\(cat)@\(Int(limit.rounded()))"
            if level > (notified[key] ?? 0) {
                out.append(Alert(cat: cat, level: level, spent: spent, limit: limit))
                notified[key] = level
            }
        }
        return out
    }
}
