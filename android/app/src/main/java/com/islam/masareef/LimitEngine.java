package com.islam.masareef;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * منطق خالص (من غير Android) لحدود البنود:
 * - يطلّع المبلغ واسم المحل من رسالة شراء جديدة
 * - يحدد البند بنفس قواعد التطبيق (بتتبعت من JS)
 * - يقرر إمتى نبعت إشعار (٨٠٪ و ١٠٠٪ من الحد)
 */
public final class LimitEngine {
    private LimitEngine() {}

    private static final int CI = Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE;
    private static final String NUM = "([\\d,]+(?:\\.\\d*)?)";

    private static final Pattern NOT_PURCHASE = Pattern.compile(
        "استرداد|Reverse|Refund|عكس عملية|Declined|Insufficient|not allowed|رمز|OTP|الرقم السري|لمره واحده|لمرة واحدة|verification|security code|مرفوض|غير كاف|تم تغيير الحد", CI);
    private static final Pattern PURCHASE = Pattern.compile("شراء|Purchase|debited with an amount", CI);
    private static final Pattern TOPUP = Pattern.compile("URPAY|STC ?PAY|STC BANK|stcpay|Mobily Pay|بنك اس تي سي|top ?up|إضافة الأموال", CI);

    public static final class Purchase {
        public final double amount;
        public final String merchant;
        Purchase(double amount, String merchant) { this.amount = amount; this.merchant = merchant; }
    }

    public static final class Alert {
        public final String cat;
        public final int level; // 80 | 100
        public final double spent;
        public final double limit;
        Alert(String cat, int level, double spent, double limit) { this.cat = cat; this.level = level; this.spent = spent; this.limit = limit; }
    }

    private static final Pattern SALARY = Pattern.compile("(ايداع|إيداع)\\s*(رواتب|راتب)|Salary (credit|deposit)", CI);

    /** رسالة نزول الراتب */
    public static boolean isSalary(String raw) {
        if (raw == null) return false;
        String first = Normalizer.normalize(raw, Normalizer.Form.NFKC).split("\n", 2)[0];
        return SALARY.matcher(first).find();
    }

    /** يرجّع null لو الرسالة مش عملية شراء */
    public static Purchase parsePurchase(String raw, long ts) {
        if (raw == null) return null;
        String b = Normalizer.normalize(raw, Normalizer.Form.NFKC);
        String first = b.split("\n", 2)[0].trim();
        if (NOT_PURCHASE.matcher(b).find()) return null;
        if (!PURCHASE.matcher(first).find() && !b.contains("debited with an amount")) return null;
        Double a = amount(b, ts);
        if (a == null || a <= 0) return null;
        if (b.contains("debited with an amount")) return new Purchase(a, "STC Pay خصم");
        String m = merchant(b);
        if (TOPUP.matcher(m).find()) return null;
        return new Purchase(a, m.replaceAll("\\s+", " ").trim());
    }

    private static Double num(String s) {
        try {
            String v = s.replace(",", "");
            if (v.endsWith(".")) v = v.substring(0, v.length() - 1);
            return Double.parseDouble(v);
        } catch (Exception e) { return null; }
    }

    private static double rate(String cur, long ts) {
        switch (cur) {
            case "USD": return 3.75;
            case "EUR": return 4.05;
            case "AED": return 1.02;
            case "GBP": return 4.8;
            case "EGP": return ts < 1709251200000L ? 1 / 8.2 : 1 / 13.0;
            default: return 1;
        }
    }

    public static Double amount(String b, long ts) {
        Matcher m = Pattern.compile("(?:إجمالي|اجمالي) المبلغ المستحق:\\s*" + NUM).matcher(b);
        if (m.find()) return num(m.group(1));
        m = Pattern.compile("\\(" + NUM + "\\s*ريال\\)").matcher(b);
        if (m.find()) return num(m.group(1));
        String s = b.replaceAll("(رصيد|Your balance|Balance|رسوم وضريبة|رسوم|Fees|VAT|سعر الصرف)[^|\\n]*", "");
        String cur = "(SAR|SR|USD|EGP|EUR|AED|GBP|ريال)";
        m = Pattern.compile(cur + "\\s*:?\\s*" + NUM).matcher(s);
        if (m.find()) { Double v = num(m.group(2)); if (v != null) return round2(v * rate(m.group(1), ts)); }
        m = Pattern.compile(NUM + "\\s*" + cur).matcher(s);
        if (m.find()) { Double v = num(m.group(1)); if (v != null) return round2(v * rate(m.group(2), ts)); }
        String[] pats = { "Amount:\\s*" + NUM, "Transaction Amount\\s*" + NUM, "مبلغ:?\\s*" + NUM, "amount of\\s*" + NUM };
        for (String p : pats) {
            m = Pattern.compile(p).matcher(s);
            if (m.find()) { Double v = num(m.group(1)); if (v != null) return v; }
        }
        return null;
    }

    private static double round2(double v) { return Math.round(v * 100.0) / 100.0; }

    public static String merchant(String b) {
        String[] pats = { "لدى:\\s*([^|\\n]+)", "اسم المتجر\\s*([^|\\n]+)", "لـ\\s*([^|\\n]+)", "At:\\s*([^|\\n]+)",
                          "From:\\s*([^|\\n]+)", "For\\s+([^|\\n]+)", "من\\s+([^|\\n]+)" };
        for (String p : pats) {
            Matcher m = Pattern.compile(p).matcher(b);
            if (m.find()) {
                String v = m.group(1).trim();
                if (v.matches("^[\\d/:\\- ]+$")) continue;
                return v.replaceFirst("^\\d+;", "").trim();
            }
        }
        return "";
    }

    /** لازم تطابق merchantKey في categories.js */
    public static String merchantKey(String name) {
        String s = name == null ? "" : name.toUpperCase(Locale.ROOT);
        s = s.replaceFirst("^(TAP|PAYPAL)\\s*\\*?\\s*", "");
        s = s.replaceAll("[^A-Z0-9\\u0600-\\u06FF]", "");
        return s.length() > 9 ? s.substring(0, 9) : s;
    }

    /** rules: [catId, regexSource] بنفس ترتيب categories.js */
    public static String categorize(String merchant, Map<String, String> overrides, List<String[]> rules) {
        String key = merchantKey(merchant);
        if (!key.isEmpty() && overrides != null && overrides.containsKey(key)) return overrides.get(key);
        if (rules != null) {
            for (String[] r : rules) {
                try {
                    if (Pattern.compile(r[1], CI).matcher(merchant).find()) return r[0];
                } catch (Exception ignored) { }
            }
        }
        return "shop"; // محل مش معروف → تسوق ومحلات (زي categories.js)
    }

    /**
     * notified: "cat@limit" -> آخر مستوى اتبعت له إشعار (٠/٨٠/١٠٠). بيتحدّث هنا.
     * لو الحد اتغير، المفتاح بيتغير فالإشعارات بترجع تشتغل للحد الجديد.
     */
    public static List<Alert> evaluate(Map<String, Double> totals, Map<String, Double> limits, Map<String, Integer> notified) {
        return evaluate(totals, limits, notified, 80);
    }

    /** warnPct: نسبة التنبيه الأول (٠ = بس لما تعدّي الحد) */
    public static List<Alert> evaluate(Map<String, Double> totals, Map<String, Double> limits, Map<String, Integer> notified, double warnPct) {
        List<Alert> out = new ArrayList<>();
        for (Map.Entry<String, Double> e : limits.entrySet()) {
            double limit = e.getValue() == null ? 0 : e.getValue();
            if (limit <= 0) continue;
            String cat = e.getKey();
            double spent = totals.containsKey(cat) && totals.get(cat) != null ? totals.get(cat) : 0;
            int level = spent >= limit ? 100 : warnPct > 0 && spent >= warnPct / 100.0 * limit ? 80 : 0;
            String key = cat + "@" + Math.round(limit);
            int prev = notified.containsKey(key) ? notified.get(key) : 0;
            if (level > prev) {
                out.add(new Alert(cat, level, spent, limit));
                notified.put(key, level);
            }
        }
        return out;
    }
}
