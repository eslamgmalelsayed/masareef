package com.islam.masareef;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/** زرار "أيوه، سلفة" / "لا" في إشعار التحويل: بنحفظ الرد، والتطبيق يطبّقه أول ما يتفتح */
public class LoanActionReceiver extends BroadcastReceiver {
    private static final String PREFS = "masareef_loans";
    private static final String ACTION = "com.islam.masareef.LOAN";

    static PendingIntent pending(Context ctx, int nid, boolean yes, double a, String key, long ts) {
        Intent it = new Intent(ctx, LoanActionReceiver.class);
        it.setAction(ACTION);
        it.putExtra("nid", nid); it.putExtra("yes", yes); it.putExtra("a", a); it.putExtra("key", key); it.putExtra("ts", ts);
        return PendingIntent.getBroadcast(ctx, nid * 2 + (yes ? 1 : 0), it, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!ACTION.equals(intent.getAction())) return;
        try {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray arr = new JSONArray(p.getString("answers", "[]"));
            arr.put(new JSONObject()
                .put("yes", intent.getBooleanExtra("yes", false))
                .put("a", intent.getDoubleExtra("a", 0))
                .put("key", intent.getStringExtra("key"))
                .put("ts", intent.getLongExtra("ts", 0)));
            p.edit().putString("answers", arr.toString()).apply();
        } catch (Exception ignored) { }
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(intent.getIntExtra("nid", 0));
    }

    /** بيرجّع كل الردود ويمسحها */
    static JSONArray takeAll(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            JSONArray arr = new JSONArray(p.getString("answers", "[]"));
            p.edit().remove("answers").apply();
            return arr;
        } catch (Exception e) { return new JSONArray(); }
    }
}
