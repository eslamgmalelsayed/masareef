package com.islam.masareef;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import java.util.LinkedHashMap;
import java.util.Map;

/** بيشتغل لوحده لما توصل أي رسالة — حتى لو التطبيق مقفول — علشان يحدّث مجموع البند ويبعت إشعار الحد */
public class SmsLimitReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        final PendingResult pending = goAsync();
        final Context ctx = context.getApplicationContext();
        final SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        new Thread(() -> {
            try {
                if (parts == null) return;
                // الرسالة الطويلة بتيجي على كذا جزء — نجمعهم حسب الراسل
                Map<String, StringBuilder> bodies = new LinkedHashMap<>();
                Map<String, Long> times = new LinkedHashMap<>();
                for (SmsMessage m : parts) {
                    if (m == null) continue;
                    String addr = m.getDisplayOriginatingAddress();
                    if (addr == null) continue;
                    StringBuilder sb = bodies.get(addr);
                    if (sb == null) { sb = new StringBuilder(); bodies.put(addr, sb); times.put(addr, m.getTimestampMillis()); }
                    String part = m.getDisplayMessageBody();
                    if (part != null) sb.append(part);
                }
                for (Map.Entry<String, StringBuilder> e : bodies.entrySet()) {
                    LimitStore.addPurchase(ctx, e.getKey(), e.getValue().toString(), times.get(e.getKey()));
                }
            } catch (Exception ignored) {
            } finally {
                pending.finish();
            }
        }).start();
    }
}
