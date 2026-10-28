package com.islam.masareef;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** تخزين إعدادات الحدود + مجاميع الشهر الحالي، وإرسال الإشعارات */
public final class LimitStore {
    private LimitStore() {}

    private static final String PREFS = "masareef_limits";
    private static final String KEY_CONFIG = "config";
    private static final String KEY_NOTIFIED = "notified";
    private static final String CHANNEL = "limits";

    public static String currentMonth() {
        Calendar c = Calendar.getInstance();
        return String.format(Locale.ROOT, "%04d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1);
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static JSONObject loadConfig(Context ctx) {
        try { return new JSONObject(prefs(ctx).getString(KEY_CONFIG, "{}")); }
        catch (Exception e) { return new JSONObject(); }
    }

    public static void saveConfig(Context ctx, JSONObject cfg) {
        try { saveConfigRaw(ctx, cfg); } finally { TodayWidget.refresh(ctx); }
    }
    private static void saveConfigRaw(Context ctx, JSONObject cfg) {
        prefs(ctx).edit().putString(KEY_CONFIG, cfg.toString()).apply();
    }

    static Map<String, Double> doubles(JSONObject o) {
        Map<String, Double> m = new HashMap<>();
        if (o == null) return m;
        Iterator<String> it = o.keys();
        while (it.hasNext()) { String k = it.next(); m.put(k, o.optDouble(k, 0)); }
        return m;
    }

    static Map<String, String> strings(JSONObject o) {
        Map<String, String> m = new HashMap<>();
        if (o == null) return m;
        Iterator<String> it = o.keys();
        while (it.hasNext()) { String k = it.next(); m.put(k, o.optString(k, "")); }
        return m;
    }

    static List<String[]> rules(JSONArray a) {
        List<String[]> r = new ArrayList<>();
        if (a == null) return r;
        for (int i = 0; i < a.length(); i++) {
            JSONArray x = a.optJSONArray(i);
            if (x != null && x.length() == 2) r.add(new String[] { x.optString(0), x.optString(1) });
        }
        return r;
    }

    /** بيتنادى من الـ BroadcastReceiver لما توصل رسالة شراء جديدة */
    public static void addPurchase(Context ctx, String address, String body, long ts) {
        JSONObject cfg = loadConfig(ctx);
        applyMoney(cfg);
        JSONArray senders = cfg.optJSONArray("senders");
        if (senders == null || address == null) return;
        boolean ok = false;
        String a = address.trim().toLowerCase(Locale.ROOT);
        for (int i = 0; i < senders.length(); i++) if (a.equals(senders.optString(i))) { ok = true; break; }
        if (!ok) return;

        creditOnMessage(ctx, body, ts);
        try {
            // نزل راتب جديد؟ نبدأ دورة جديدة: المجاميع ترجع صفر والإشعارات تشتغل من الأول
            if (LimitEngine.isSalary(body)) {
                salarySummary(ctx, cfg, ts);
                cfg.put("cycle", String.valueOf(ts));
                // اليوم والأسبوع ملهمش علاقة بالراتب — نسيبهم زي ما هم
                JSONObject old = cfg.optJSONObject("totals"), fresh = new JSONObject();
                if (old != null) { fresh.put("__day", old.optDouble("__day", 0)); fresh.put("__week", old.optDouble("__week", 0)); }
                cfg.put("totals", fresh);
                saveConfig(ctx, cfg);
                return;
            }
            LimitEngine.Transfer tr = LimitEngine.parseTransfer(body, ts);
            if (tr != null) { loanAsk(ctx, cfg, tr, ts); return; }
            LimitEngine.Purchase p = LimitEngine.parsePurchase(body, ts);
            if (p == null) return;
            String cat = LimitEngine.categorize(p.merchant, strings(cfg.optJSONObject("overrides")), rules(cfg.optJSONArray("rules")));
            unusualCheck(ctx, cfg, p, cat, ts);
            JSONObject totals = cfg.optJSONObject("totals");
            if (totals == null) totals = new JSONObject();
            totals.put(cat, totals.optDouble(cat, 0) + p.amount);
            totals.put("__total", totals.optDouble("__total", 0) + p.amount); // إجمالي المصروفات
            // اليوم والأسبوع: لو الرسالة في يوم/أسبوع جديد نبدأ من صفر
            JSONObject pk = cfg.optJSONObject("periodKeys");
            if (pk == null) pk = new JSONObject();
            String[][] per = { { "__day", dayKey(ts, false) }, { "__week", dayKey(ts, true) } };
            JSONObject wk = cfg.optJSONObject("wkcats");
            if (wk == null) wk = new JSONObject();
            for (String[] x : per) {
                if (!x[1].equals(pk.optString(x[0]))) { totals.put(x[0], 0); pk.put(x[0], x[1]); if ("__week".equals(x[0])) wk = new JSONObject(); }
                totals.put(x[0], totals.optDouble(x[0], 0) + p.amount);
            }
            wk.put(cat, wk.optDouble(cat, 0) + p.amount); // بنود الأسبوع — لملخص الجمعة
            cfg.put("wkcats", wk);
            cfg.put("periodKeys", pk);
            cfg.put("totals", totals);
            saveConfig(ctx, cfg);
        } catch (Exception ignored) { return; }
        evaluateAndNotify(ctx);
    }

    /** يقارن مجاميع الشهر بالحدود ويبعت إشعار لأي بند عدّى ٨٠٪ أو ١٠٠٪ لأول مرة */
    public static void evaluateAndNotify(Context ctx) {
        JSONObject cfg = loadConfig(ctx);
        String month = cfg.optString("cycle", currentMonth()); // الدورة = من آخر راتب

        Map<String, Integer> notified = new HashMap<>();
        try {
            JSONObject n = new JSONObject(prefs(ctx).getString(KEY_NOTIFIED, "{}"));
            if (sameCycle(month, n.optString("month"))) {
                JSONObject lv = n.optJSONObject("levels");
                if (lv != null) { Iterator<String> it = lv.keys(); while (it.hasNext()) { String k = it.next(); notified.put(k, lv.optInt(k)); } }
            }
        } catch (Exception ignored) { }

        // يوم/أسبوع جديد → إشعارات الحد اليومي/الأسبوعي تشتغل من الأول
        JSONObject pk = cfg.optJSONObject("periodKeys");
        SharedPreferences sp = prefs(ctx);
        for (String per : new String[] { "__day", "__week" }) {
            String k = pk == null ? "" : pk.optString(per, "");
            if (!k.equals(sp.getString("pk" + per, ""))) { notified.remove(per); sp.edit().putString("pk" + per, k).apply(); }
        }

        // مجموعات البنود (مثلًا تسوق + ملابس): المجموع = مجموع البنود اللي جواها
        Map<String, Double> totals = new HashMap<>(doubles(cfg.optJSONObject("totals")));
        JSONObject groups = cfg.optJSONObject("groups");
        if (groups != null) {
            Iterator<String> gi = groups.keys();
            while (gi.hasNext()) {
                String g = gi.next();
                JSONArray cats = groups.optJSONArray(g);
                double sum = 0;
                if (cats != null) for (int i = 0; i < cats.length(); i++) { Double v = totals.get(cats.optString(i)); if (v != null) sum += v; }
                totals.put(g, sum);
            }
        }
        List<LimitEngine.Alert> alerts = LimitEngine.evaluate(totals, doubles(cfg.optJSONObject("limits")), notified, cfg.optDouble("warnPct", 80));

        try {
            JSONObject lv = new JSONObject();
            for (Map.Entry<String, Integer> e : notified.entrySet()) lv.put(e.getKey(), e.getValue());
            JSONObject n = new JSONObject();
            n.put("month", month);
            n.put("levels", lv);
            prefs(ctx).edit().putString(KEY_NOTIFIED, n.toString()).apply();
        } catch (Exception ignored) { }

        Map<String, String> names = strings(cfg.optJSONObject("names"));
        for (LimitEngine.Alert al : alerts) {
            String name = names.containsKey(al.cat) ? names.get(al.cat) : al.cat;
            String title, text;
            if (al.level >= 100) {
                title = "عدّيت حد " + name + " ⚠️";
                text = "صرفت " + fmt(al.spent) + " ر.س من الراتب ده، والحد " + fmt(al.limit) + " ر.س";
            } else {
                title = "قرّبت من حد " + name;
                text = "صرفت " + fmt(al.spent) + " من " + fmt(al.limit) + " ر.س (" + Math.round(al.spent / al.limit * 100) + "٪)";
            }
            if ("__total".equals(al.cat)) {
                title = al.level >= 100 ? "عدّيت حد المصروفات للراتب ده 🔴" : "صرفت " + Math.round(al.spent / al.limit * 100) + "٪ من حد المصروفات";
                text = al.level >= 100
                    ? "صرفت " + fmt(al.spent) + " ر.س والحد " + fmt(al.limit) + " ر.س — زيادة " + fmt(al.spent - al.limit)
                    : "صرفت " + fmt(al.spent) + " من " + fmt(al.limit) + " ر.س — باقي " + fmt(al.limit - al.spent);
            }
            if ("__day".equals(al.cat) || "__week".equals(al.cat)) {
                String when = "__day".equals(al.cat) ? "النهارده" : "الأسبوع ده";
                title = al.level >= 100 ? "عدّيت حد " + name + " ⚠️" : "صرفت " + Math.round(al.spent / al.limit * 100) + "٪ من حد " + name;
                text = al.level >= 100
                    ? "صرفت " + fmt(al.spent) + " ر.س " + when + " والحد " + fmt(al.limit) + " ر.س"
                    : "صرفت " + fmt(al.spent) + " من " + fmt(al.limit) + " ر.س " + when + " — باقي " + fmt(al.limit - al.spent);
            }
            notify(ctx, al.cat.hashCode(), title, text);
        }
    }

    // ===== تنبيه استخدام البطاقة الائتمانية (نسبة بتحددها لكل بطاقة) =====
    private static final String KEY_CREDIT = "credit";
    private static final String KEY_CREDIT_NOTIFIED = "credit_notified";
    private static final java.util.regex.Pattern CC_PAY = java.util.regex.Pattern.compile(
        "سداد البطاقة|credit card payment|(بطاقة ائتمانية|بطاقة فيزا)\\s*:\\s*سداد", java.util.regex.Pattern.CASE_INSENSITIVE);

    /** JS بيبعت: { "0710": {name, owed, limit, pct} } */
    public static void saveCredit(Context ctx, JSONObject credit) {
        prefs(ctx).edit().putString(KEY_CREDIT, credit.toString()).apply();
        evaluateCredit(ctx);
    }

    /** رسالة جديدة فيها رقم بطاقة ائتمانية معروفة: شراء يزوّد المستحق، وسداد ينقصه */
    static void creditOnMessage(Context ctx, String body, long ts) {
        try {
            JSONObject credit = new JSONObject(prefs(ctx).getString(KEY_CREDIT, "{}"));
            Iterator<String> it = credit.keys();
            boolean changed = false;
            while (it.hasNext()) {
                String card = it.next();
                if (card.length() < 4 || !body.contains(card)) continue;
                JSONObject c = credit.getJSONObject(card);
                if (CC_PAY.matcher(body).find()) {
                    Double a = LimitEngine.amount(body, ts);
                    if (a != null) { c.put("owed", c.optDouble("owed", 0) - a); changed = true; }
                } else {
                    LimitEngine.Purchase p = LimitEngine.parsePurchase(body, ts);
                    if (p != null) { c.put("owed", c.optDouble("owed", 0) + p.amount); changed = true; }
                }
            }
            if (changed) { prefs(ctx).edit().putString(KEY_CREDIT, credit.toString()).apply(); evaluateCredit(ctx); }
        } catch (Exception ignored) { }
    }

    /** إشعار مرة واحدة لما الاستخدام يعدّي النسبة، ويتصفّر لما ينزل تحتها (بعد السداد) */
    static void evaluateCredit(Context ctx) {
        try {
            JSONObject credit = new JSONObject(prefs(ctx).getString(KEY_CREDIT, "{}"));
            JSONObject done = new JSONObject(prefs(ctx).getString(KEY_CREDIT_NOTIFIED, "{}"));
            Iterator<String> it = credit.keys();
            while (it.hasNext()) {
                String card = it.next();
                JSONObject c = credit.getJSONObject(card);
                double limit = c.optDouble("limit", 0), owed = c.optDouble("owed", 0), pct = c.optDouble("pct", 80);
                double minAvail = c.optDouble("minAvail", 0);
                if (limit <= 0 || (pct <= 0 && minAvail <= 0)) continue;
                double u = owed / limit * 100, avail = Math.max(0, limit - owed);
                boolean byPct = pct > 0 && u >= pct, byAvail = minAvail > 0 && avail < minAvail;
                if (byPct || byAvail) {
                    if (done.optBoolean(card)) continue;
                    done.put(card, true);
                    String name = c.optString("name", "••" + card);
                    String title = byAvail && !byPct ? "💳 المتاح في " + name + " بقى " + fmt(avail) + " ر.س بس" : "💳 " + name + " وصلت " + Math.round(u) + "٪ من الحد";
                    notify(ctx, ("cc" + card).hashCode(), title,
                        "المستحق " + fmt(owed) + " من " + fmt(limit) + " ر.س — المتاح " + fmt(avail));
                } else done.remove(card);
            }
            prefs(ctx).edit().putString(KEY_CREDIT_NOTIFIED, done.toString()).apply();
        } catch (Exception ignored) { }
    }

    /** أول ما ينزل الراتب: ملخص الراتب اللي فات (قبل ما نصفّر المجاميع) */
    static void salarySummary(Context ctx, JSONObject cfg, long ts) {
        try {
            long cyc = Long.parseLong(cfg.optString("cycle", "0"));
            if (ts - cyc < 15L * 86400000L) return; // نفس الراتب نازل على دفعتين
            JSONObject t = cfg.optJSONObject("totals");
            if (t == null) return;
            double spent = t.optDouble("__total", 0);
            if (spent <= 0) return;
            JSONObject groups = cfg.optJSONObject("groups");
            String top = null; double topV = 0;
            Iterator<String> it = t.keys();
            while (it.hasNext()) {
                String k = it.next();
                if (k.startsWith("__") || (groups != null && groups.has(k))) continue;
                double v = t.optDouble(k, 0);
                if (v > topV) { topV = v; top = k; }
            }
            Map<String, String> names = strings(cfg.optJSONObject("names"));
            double limit = doubles(cfg.optJSONObject("limits")).containsKey("__total") ? doubles(cfg.optJSONObject("limits")).get("__total") : 0;
            String text = "الراتب اللي فات صرفت " + fmt(spent) + " ر.س" + (limit > 0 ? " (" + Math.round(spent / limit * 100) + "٪ من الحد)" : "");
            if (top != null) text += " · أكتر بند: " + (names.containsKey(top) ? names.get(top) : top) + " " + fmt(topV);
            notify(ctx, 7001, "💰 نزل الراتب — ملخص الراتب اللي فات", text);
        } catch (Exception ignored) { }
    }

    /** عملية مكررة (نفس المبلغ ونفس المكان في ربع ساعة) أو أكبر بكتير من عادتك مع نفس التاجر */
    static void unusualCheck(Context ctx, JSONObject cfg, LimitEngine.Purchase p, String cat, long ts) {
        try {
            String k = LimitEngine.merchantKey(p.merchant);
            if (k.isEmpty() || "bnpl".equals(cat) || k.contains("TABBY") || k.contains("TAMARA")) return;
            JSONArray recent = new JSONArray(prefs(ctx).getString("recent", "[]"));
            boolean dup = false;
            for (int i = 0; i < recent.length(); i++) {
                JSONObject r = recent.getJSONObject(i);
                if (k.equals(r.optString("k")) && Math.abs(r.optDouble("a") - p.amount) < 0.01 && Math.abs(ts - r.optLong("ts")) < 15 * 60000L && ts != r.optLong("ts")) dup = true;
            }
            JSONArray next = new JSONArray();
            for (int i = Math.max(0, recent.length() - 7); i < recent.length(); i++) next.put(recent.get(i));
            next.put(new JSONObject().put("k", k).put("a", p.amount).put("ts", ts));
            prefs(ctx).edit().putString("recent", next.toString()).apply();
            if (dup) {
                notify(ctx, ("dup" + k).hashCode(), "⚠️ عملية مكررة؟", "اتسحب " + fmt(p.amount) + " ر.س من " + p.merchant + " مرتين ورا بعض — اتأكد إنها مش مكررة");
                return;
            }
            JSONObject usual = cfg.optJSONObject("usual");
            double m = usual == null ? 0 : usual.optDouble(k, 0);
            if (m > 0 && p.amount >= 150 && p.amount >= 3 * m)
                notify(ctx, ("big" + k).hashCode(), "👀 عملية أكبر من عادتك", fmt(p.amount) + " ر.س في " + p.merchant + " — عادتك هناك حوالي " + fmt(m));
        } catch (Exception ignored) { }
    }

    // ===== "سلفة؟" بزرارين لحظة التحويل =====
    static void loanAsk(Context ctx, JSONObject cfg, LimitEngine.Transfer t, long ts) {
        int d = LimitEngine.loanDecision(t, loanRules(cfg.optJSONObject("lent")));
        if (d == 0) return;
        String key = LimitEngine.personKey(t.name);
        int nid = 8000 + (int) (Math.abs(ts / 1000) % 900);
        String title = "💸 حوّلت " + fmt(t.amount) + " ر.س لـ " + t.name;
        String text = d == 2 ? "سلّفته قبل كده — دي كمان سلفة؟" : "سلفة؟ لو أيوه هتتحسب ليك في الديون";
        notifyActions(ctx, nid, title, text,
            new String[] { "أيوه، سلفة", "لا" },
            new PendingIntent[] { LoanActionReceiver.pending(ctx, nid, true, t.amount, key, ts), LoanActionReceiver.pending(ctx, nid, false, t.amount, key, ts) });
    }

    /** عملة البيت وأسعار اليوم من JS → المبالغ في التنبيهات تبقى بنفس عملة التطبيق */
    static void applyMoney(JSONObject cfg) {
        JSONObject m = cfg.optJSONObject("money");
        if (m == null) return;
        JSONObject r = m.optJSONObject("toUsd");
        Map<String, Double> rates = r == null ? null : doubles(r);
        LimitEngine.setMoney(m.optString("home", "SAR"), rates);
    }

    static LimitEngine.LoanRules loanRules(JSONObject o) {
        if (o == null) return null;
        LimitEngine.LoanRules r = new LimitEngine.LoanRules();
        r.on = o.optBoolean("on", true);
        r.min = o.optDouble("min", 50);
        String[] names = { "ignore", "yes", "freq", "self", "acc" };
        for (String n : names) {
            JSONArray a = o.optJSONArray(n);
            if (a == null) continue;
            for (int i = 0; i < a.length(); i++) {
                String v = a.optString(i);
                if ("ignore".equals(n)) r.ignore.add(v); else if ("yes".equals(n)) r.yes.add(v); else if ("freq".equals(n)) r.freq.add(v); else if ("acc".equals(n)) r.acc.add(v); else r.self.add(v);
            }
        }
        JSONArray rec = o.optJSONArray("recur");
        if (rec != null) for (int i = 0; i < rec.length(); i++) { JSONArray x = rec.optJSONArray(i); if (x != null) r.recur.add(new Object[] { x.optString(0), x.optDouble(1) }); }
        return r;
    }

    // ===== ملخص الجمعة =====
    static String[] weeklyText(JSONObject cfg) {
        JSONObject w = cfg.optJSONObject("weekly");
        if (w != null && !w.optBoolean("on", true)) return null;
        JSONObject t = cfg.optJSONObject("totals"), pk = cfg.optJSONObject("periodKeys");
        boolean thisWeek = pk != null && dayKey(System.currentTimeMillis(), true).equals(pk.optString("__week"));
        double spent = thisWeek && t != null ? t.optDouble("__week", 0) : 0;
        if (spent <= 0) return new String[] { "📅 ملخص الأسبوع", "ما صرفتش حاجة الأسبوع ده 👏" };
        StringBuilder s = new StringBuilder("صرفت " + fmt(spent) + " ر.س الأسبوع ده");
        JSONObject wk = thisWeek ? cfg.optJSONObject("wkcats") : null;
        if (wk != null) {
            String top = null; double topV = 0;
            Iterator<String> it = wk.keys();
            while (it.hasNext()) { String k = it.next(); double v = wk.optDouble(k, 0); if (v > topV) { topV = v; top = k; } }
            Map<String, String> names = strings(cfg.optJSONObject("names"));
            if (top != null) s.append("\nأكتر بند: ").append(names.containsKey(top) ? names.get(top) : top).append(" ").append(fmt(topV));
        }
        double limit = w == null ? 0 : w.optDouble("limit", 0), avg = w == null ? 0 : w.optDouble("avg", 0);
        if (limit > 0) {
            long pct = Math.round(spent / limit * 100);
            s.append("\n").append(pct > 100 ? "عدّيت حد الأسبوع (" + pct + "٪) ⚠️" : pct >= 80 ? "قرّبت من حد الأسبوع (" + pct + "٪)" : "ماشي كويس — " + pct + "٪ من حد الأسبوع 👌");
        } else if (avg > 0) {
            long diff = Math.round((spent - avg) / avg * 100);
            s.append("\n").append(Math.abs(diff) < 8 ? "زي عادتك تقريبًا" : diff < 0 ? "أقل من عادتك بـ " + (-diff) + "٪ 👌" : "أكتر من عادتك بـ " + diff + "٪");
        }
        return new String[] { "📅 ملخص الأسبوع", s.toString() };
    }

    /** مفتاح اليوم (أو أول يوم في الأسبوع — الأحد) بنفس صيغة الـ JS: 2026-10-21 */
    static String dayKey(long ts, boolean week) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(ts);
        if (week) c.add(Calendar.DAY_OF_MONTH, -(c.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY));
        return String.format(Locale.US, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    /** الـ JS والـ Receiver ممكن يسجلوا نفس الراتب بتوقيت مختلف شوية */
    static boolean sameCycle(String a, String b) {
        try { return Math.abs(Long.parseLong(a) - Long.parseLong(b)) < 10L * 86400000L; }
        catch (Exception e) { return a.equals(b); }
    }

    private static String fmt(double v) { return String.format(Locale.US, "%,d", Math.round(v)); }

    public static void notify(Context ctx, int id, String title, String text) { notifyActions(ctx, id, title, text, null, null); }

    public static void notifyActions(Context ctx, int id, String title, String text, String[] labels, PendingIntent[] actions) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "حدود البنود", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("تنبيه لما توصل لحد الصرف في بند");
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setColor(0xFF0F766E)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pi);
        if (labels != null) for (int i = 0; i < labels.length; i++) b.addAction(0, labels[i], actions[i]);
        nm.notify(id, b.build());
    }
}
