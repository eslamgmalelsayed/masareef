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
                cfg.put("cycle", String.valueOf(ts));
                // اليوم والأسبوع ملهمش علاقة بالراتب — نسيبهم زي ما هم
                JSONObject old = cfg.optJSONObject("totals"), fresh = new JSONObject();
                if (old != null) { fresh.put("__day", old.optDouble("__day", 0)); fresh.put("__week", old.optDouble("__week", 0)); }
                cfg.put("totals", fresh);
                saveConfig(ctx, cfg);
                return;
            }
            LimitEngine.Purchase p = LimitEngine.parsePurchase(body, ts);
            if (p == null) return;
            String cat = LimitEngine.categorize(p.merchant, strings(cfg.optJSONObject("overrides")), rules(cfg.optJSONArray("rules")));
            JSONObject totals = cfg.optJSONObject("totals");
            if (totals == null) totals = new JSONObject();
            totals.put(cat, totals.optDouble(cat, 0) + p.amount);
            totals.put("__total", totals.optDouble("__total", 0) + p.amount); // إجمالي المصروفات
            // اليوم والأسبوع: لو الرسالة في يوم/أسبوع جديد نبدأ من صفر
            JSONObject pk = cfg.optJSONObject("periodKeys");
            if (pk == null) pk = new JSONObject();
            String[][] per = { { "__day", dayKey(ts, false) }, { "__week", dayKey(ts, true) } };
            for (String[] x : per) {
                if (!x[1].equals(pk.optString(x[0]))) { totals.put(x[0], 0); pk.put(x[0], x[1]); }
                totals.put(x[0], totals.optDouble(x[0], 0) + p.amount);
            }
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
        List<LimitEngine.Alert> alerts = LimitEngine.evaluate(totals, doubles(cfg.optJSONObject("limits")), notified);

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
                if (limit <= 0 || pct <= 0) continue;
                double u = owed / limit * 100;
                if (u >= pct) {
                    if (done.optBoolean(card)) continue;
                    done.put(card, true);
                    String name = c.optString("name", "••" + card);
                    notify(ctx, ("cc" + card).hashCode(), "💳 " + name + " وصلت " + Math.round(u) + "٪ من الحد",
                        "المستحق " + fmt(owed) + " من " + fmt(limit) + " ر.س — المتاح " + fmt(Math.max(0, limit - owed)));
                } else done.remove(card);
            }
            prefs(ctx).edit().putString(KEY_CREDIT_NOTIFIED, done.toString()).apply();
        } catch (Exception ignored) { }
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

    public static void notify(Context ctx, int id, String title, String text) {
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
        nm.notify(id, b.build());
    }
}
