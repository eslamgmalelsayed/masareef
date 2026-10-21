package com.islam.masareef;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.Locale;

/** ويدجت الشاشة الرئيسية: صرفت كام النهارده وفاضل كام من الحد اليومي */
public class TodayWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        render(ctx, mgr, ids);
    }

    /** بيتنادى بعد أي تحديث للأرقام (رسالة جديدة أو فتح التطبيق) */
    public static void refresh(Context ctx) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, TodayWidget.class));
            if (ids != null && ids.length > 0) render(ctx, mgr, ids);
        } catch (Exception ignored) { }
    }

    private static boolean HIDE = false;
    private static String fmt(double v) { return HIDE ? "••••" : String.format(Locale.US, "%,d", Math.round(v)); }

    static void render(Context ctx, AppWidgetManager mgr, int[] ids) {
        try {
            JSONObject cfg = LimitStore.loadConfig(ctx);
            JSONObject t = cfg.optJSONObject("totals");
            JSONObject pk = cfg.optJSONObject("periodKeys");
            JSONObject w = cfg.optJSONObject("widget");
            String today = LimitStore.dayKey(System.currentTimeMillis(), false);
            double day = (t != null && pk != null && today.equals(pk.optString("__day"))) ? t.optDouble("__day", 0) : 0;
            double cycle = t == null ? 0 : t.optDouble("__total", 0);
            double dl = w == null ? 0 : w.optDouble("day", 0);
            double cl = w == null ? 0 : w.optDouble("cycle", 0);

            HIDE = w != null && w.optBoolean("hide", false);
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_today);
            v.setTextViewText(R.id.w_amount, fmt(day) + " ر.س");
            int bg = R.drawable.widget_bg;
            if (dl > 0) {
                v.setViewVisibility(R.id.w_bar, View.VISIBLE);
                v.setProgressBar(R.id.w_bar, 100, (int) Math.min(100, Math.round(day / dl * 100)), false);
                v.setTextViewText(R.id.w_left, day <= dl ? "باقي " + fmt(dl - day) + " من " + fmt(dl) : "عدّيت حد اليوم بـ " + fmt(day - dl));
                if (day > dl) bg = R.drawable.widget_bg_over;
                else if (day >= 0.8 * dl) bg = R.drawable.widget_bg_warn;
            } else {
                v.setViewVisibility(R.id.w_bar, View.GONE);
                v.setTextViewText(R.id.w_left, "");
            }
            v.setTextViewText(R.id.w_cycle, cl > 0 ? "الراتب ده: " + fmt(cycle) + " من " + fmt(cl) : "الراتب ده: " + fmt(cycle));
            v.setInt(R.id.w_root, "setBackgroundResource", bg);

            Intent open = new Intent(ctx, MainActivity.class);
            open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            v.setOnClickPendingIntent(R.id.w_root, pi);
            mgr.updateAppWidget(ids, v);
        } catch (Exception ignored) { }
    }
}
