package com.islam.masareef;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/** تذكيرات ميعاد سداد الكريدت: بتتجدول بـ AlarmManager وبتتعاد بعد ريستارت الموبايل */
public class ReminderReceiver extends BroadcastReceiver {
    private static final String PREFS = "masareef_reminders";
    private static final String ACTION = "com.islam.masareef.REMINDER";
    private static final String WEEKLY = "com.islam.masareef.WEEKLY";

    /** ملخص الجمعة: كل جمعة ٨ بالليل (بيجدول نفسه تاني بعد ما يشتغل) */
    public static void scheduleWeekly(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent it = new Intent(ctx, ReminderReceiver.class);
        it.setAction(WEEKLY);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 6999, it, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        org.json.JSONObject w = LimitStore.loadConfig(ctx).optJSONObject("weekly");
        if (w != null && !w.optBoolean("on", true)) { am.cancel(pi); return; }
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextFriday(System.currentTimeMillis()), pi);
    }
    static long nextFriday(long now) {
        java.util.Calendar c = java.util.Calendar.getInstance();
        c.setTimeInMillis(now);
        c.set(java.util.Calendar.HOUR_OF_DAY, 20); c.set(java.util.Calendar.MINUTE, 0); c.set(java.util.Calendar.SECOND, 0); c.set(java.util.Calendar.MILLISECOND, 0);
        int add = (java.util.Calendar.FRIDAY - c.get(java.util.Calendar.DAY_OF_WEEK) + 7) % 7;
        c.add(java.util.Calendar.DAY_OF_MONTH, add);
        if (c.getTimeInMillis() <= now + 60000L) c.add(java.util.Calendar.DAY_OF_MONTH, 7);
        return c.getTimeInMillis();
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) { reschedule(ctx); scheduleWeekly(ctx); return; }
        if (WEEKLY.equals(intent.getAction())) {
            String[] w = LimitStore.weeklyText(LimitStore.loadConfig(ctx));
            if (w != null) LimitStore.notify(ctx, 7200, w[0], w[1]);
            scheduleWeekly(ctx);
            return;
        }
        String title = intent.getStringExtra("title");
        String text = intent.getStringExtra("text");
        int id = intent.getIntExtra("nid", 5000);
        if (title != null) LimitStore.notify(ctx, id, title, text == null ? "" : text);
    }

    /** items: [{id, at, title, text}] — بيلغي القديم ويجدول الجديد */
    public static void schedule(Context ctx, JSONArray items) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        cancelAll(ctx, p);
        p.edit().putString("items", items.toString()).apply();
        reschedule(ctx);
    }

    static void reschedule(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        try {
            JSONArray items = new JSONArray(p.getString("items", "[]"));
            long now = System.currentTimeMillis();
            for (int i = 0; i < items.length(); i++) {
                JSONObject o = items.getJSONObject(i);
                long at = o.optLong("at");
                if (at <= now) continue;
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(ctx, i, o));
            }
        } catch (Exception ignored) { }
    }

    private static void cancelAll(Context ctx, SharedPreferences p) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        try {
            JSONArray items = new JSONArray(p.getString("items", "[]"));
            for (int i = 0; i < items.length(); i++) am.cancel(pending(ctx, i, items.getJSONObject(i)));
        } catch (Exception ignored) { }
    }

    private static PendingIntent pending(Context ctx, int i, JSONObject o) {
        Intent it = new Intent(ctx, ReminderReceiver.class);
        it.setAction(ACTION);
        it.putExtra("title", o.optString("title"));
        it.putExtra("text", o.optString("text"));
        it.putExtra("nid", 5000 + i);
        return PendingIntent.getBroadcast(ctx, 7000 + i, it, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
