package com.islam.masareef;

import android.Manifest;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * يقرأ رسايل الوارد (inbox) من البنوك المحددة بس.
 * JS: SmsReader.read({ senders: ['alrajhibank', ...] }) -> { messages: [{address, body, date}] }
 */
@CapacitorPlugin(
    name = "SmsReader",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS }, alias = "sms"),
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class SmsReaderPlugin extends Plugin {

    @PluginMethod
    public void read(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            requestPermissionForAlias("sms", call, "smsPermissionCallback");
            return;
        }
        readInBackground(call);
    }

    @PermissionCallback
    private void smsPermissionCallback(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) {
            readInBackground(call);
        } else {
            call.reject("SMS permission denied");
        }
    }

    /** JS بيبعت: الحدود، أسماء البنود، القواعد، التصنيفات اليدوية، ومجاميع الشهر الحالي */
    @PluginMethod
    public void saveConfig(PluginCall call) {
        try {
            JSObject cfg = call.getData();
            LimitStore.saveConfig(getContext(), cfg);
            LimitStore.evaluateAndNotify(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("saveConfig failed: " + e.getMessage(), e);
        }
    }

    // ===== قفل التطبيق بالبصمة / الوش / رمز الموبايل =====
    private int authenticators() {
        return Build.VERSION.SDK_INT >= 30
            ? (androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK | androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL)
            : androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK;
    }

    @PluginMethod
    public void biometricAvailable(PluginCall call) {
        JSObject o = new JSObject();
        try {
            int r = androidx.biometric.BiometricManager.from(getContext()).canAuthenticate(authenticators());
            boolean ok = r == androidx.biometric.BiometricManager.BIOMETRIC_SUCCESS;
            if (!ok && Build.VERSION.SDK_INT < 30) {
                android.app.KeyguardManager km = (android.app.KeyguardManager) getContext().getSystemService(android.content.Context.KEYGUARD_SERVICE);
                ok = km != null && km.isDeviceSecure();
            }
            o.put("available", ok);
        } catch (Exception e) { o.put("available", false); }
        call.resolve(o);
    }

    @PluginMethod
    public void biometricAuth(PluginCall call) {
        final String title = call.getString("title", "افتح مصاريفي");
        getActivity().runOnUiThread(() -> {
            try {
                java.util.concurrent.Executor ex = androidx.core.content.ContextCompat.getMainExecutor(getContext());
                androidx.biometric.BiometricPrompt bp = new androidx.biometric.BiometricPrompt((androidx.fragment.app.FragmentActivity) getActivity(), ex,
                    new androidx.biometric.BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(androidx.biometric.BiometricPrompt.AuthenticationResult result) {
                            JSObject o = new JSObject(); o.put("ok", true); call.resolve(o);
                        }
                        @Override
                        public void onAuthenticationError(int code, CharSequence msg) {
                            JSObject o = new JSObject(); o.put("ok", false); o.put("code", code); o.put("error", String.valueOf(msg)); call.resolve(o);
                        }
                    });
                androidx.biometric.BiometricPrompt.PromptInfo.Builder b = new androidx.biometric.BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title)
                    .setSubtitle("بالبصمة أو الوش أو رمز الموبايل");
                if (Build.VERSION.SDK_INT >= 30) b.setAllowedAuthenticators(authenticators());
                else b.setDeviceCredentialAllowed(true);
                bp.authenticate(b.build());
            } catch (Exception e) {
                JSObject o = new JSObject(); o.put("ok", false); o.put("error", String.valueOf(e.getMessage())); call.resolve(o);
            }
        });
    }

    @PluginMethod
    public void saveCredit(PluginCall call) {
        try {
            JSObject cards = call.getObject("cards", new JSObject());
            LimitStore.saveCredit(getContext(), cards);
            call.resolve();
        } catch (Exception e) {
            call.reject("saveCredit failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject r = new JSObject(); r.put("granted", true); call.resolve(r); return;
        }
        requestPermissionForAlias("notifications", call, "notifPermissionCallback");
    }

    @PermissionCallback
    private void notifPermissionCallback(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(r);
    }

    @PluginMethod
    public void testNotification(PluginCall call) {
        String title = call.getString("title", "إشعارات مصاريفي شغالة ✅");
        String text = call.getString("text", "هيوصلك تنبيه لما توصل ٨٠٪ و ١٠٠٪ من أي حد");
        int id = call.getInt("id", 4242);
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            call.reject("notifications not allowed");
            return;
        }
        LimitStore.notify(getContext(), id, title, text);
        call.resolve();
    }

    @PluginMethod
    public void scheduleReminders(PluginCall call) {
        try {
            JSArray items = call.getArray("items");
            ReminderReceiver.schedule(getContext(), items == null ? new JSArray() : items);
            call.resolve();
        } catch (Exception e) {
            call.reject("schedule failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void notificationStatus(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED);
        r.put("smsReceive", getPermissionState("sms") == PermissionState.GRANTED);
        call.resolve(r);
    }

    /** يجرّب نفس اللي بيحصل لما توصل رسالة شراء — من غير ما يغيّر أي مجاميع */
    @PluginMethod
    public void simulate(PluginCall call) {
        String body = call.getString("body", "");
        LimitEngine.Purchase p = LimitEngine.parsePurchase(body, System.currentTimeMillis());
        if (p == null) { call.reject("مش رسالة شراء"); return; }
        org.json.JSONObject cfg = LimitStore.loadConfig(getContext());
        String cat = LimitEngine.categorize(p.merchant, LimitStore.strings(cfg.optJSONObject("overrides")), LimitStore.rules(cfg.optJSONArray("rules")));
        java.util.Map<String, String> names = LimitStore.strings(cfg.optJSONObject("names"));
        java.util.Map<String, Double> totals = LimitStore.doubles(cfg.optJSONObject("totals"));
        java.util.Map<String, Double> limits = LimitStore.doubles(cfg.optJSONObject("limits"));
        String name = names.containsKey(cat) ? names.get(cat) : cat;
        double after = (totals.containsKey(cat) ? totals.get(cat) : 0) + p.amount;
        double totalAfter = (totals.containsKey("__total") ? totals.get("__total") : 0) + p.amount;
        StringBuilder text = new StringBuilder();
        text.append(String.format(java.util.Locale.US, "%s · %.2f ر.س → %s", p.merchant, p.amount, name));
        if (limits.containsKey(cat)) text.append(String.format(java.util.Locale.US, "\nالبند هيبقى %,d من %,d", Math.round(after), Math.round(limits.get(cat))));
        if (limits.containsKey("__total")) text.append(String.format(java.util.Locale.US, "\nالإجمالي هيبقى %,d من %,d", Math.round(totalAfter), Math.round(limits.get("__total"))));
        LimitStore.notify(getContext(), 4243, "🧪 تجربة: اتقرت رسالة شراء", text.toString());
        JSObject r = new JSObject();
        r.put("merchant", p.merchant);
        r.put("amount", p.amount);
        r.put("category", cat);
        call.resolve(r);
    }

    /** يتأكد إن التطبيق مسموحله يسطّب تحديثات (مرة واحدة) */
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject r = new JSObject();
        r.put("allowed", Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(r);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 26) {
            android.content.Intent i = new android.content.Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    /** ينزّل ملف الـ APK الجديد ويفتح شاشة التسطيب */
    @PluginMethod
    public void installUpdate(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null) { call.reject("no url"); return; }
        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
            call.reject("install-permission");
            return;
        }
        new Thread(() -> {
            try {
                java.io.File dir = new java.io.File(getContext().getCacheDir(), "updates");
                if (!dir.exists()) dir.mkdirs();
                java.io.File out = new java.io.File(dir, "masareef-update.apk");
                String next = url;
                java.net.HttpURLConnection con = null;
                for (int hop = 0; hop < 6; hop++) { // GitHub بيحوّل الرابط لسيرفر تاني
                    con = (java.net.HttpURLConnection) new java.net.URL(next).openConnection();
                    con.setInstanceFollowRedirects(false);
                    con.setRequestProperty("Accept", "application/octet-stream");
                    con.setConnectTimeout(20000);
                    con.setReadTimeout(60000);
                    int code = con.getResponseCode();
                    if (code >= 300 && code < 400) { next = con.getHeaderField("Location"); con.disconnect(); continue; }
                    if (code != 200) throw new Exception("HTTP " + code);
                    break;
                }
                try (java.io.InputStream in = con.getInputStream(); java.io.FileOutputStream fo = new java.io.FileOutputStream(out)) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) > 0) fo.write(buf, 0, n);
                }
                con.disconnect();
                Uri uri = androidx.core.content.FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", out);
                android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_VIEW);
                i.setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION | android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                call.resolve();
            } catch (Exception e) {
                call.reject("download failed: " + e.getMessage(), e);
            }
        }).start();
    }

    private void readInBackground(final PluginCall call) {
        new Thread(() -> {
            try {
                call.resolve(readMessages(call));
            } catch (Exception e) {
                call.reject("Failed to read SMS: " + e.getMessage(), e);
            }
        }).start();
    }

    private JSObject readMessages(PluginCall call) throws Exception {
        Set<String> senders = new HashSet<>();
        JSArray arr = call.getArray("senders");
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                senders.add(arr.getString(i).trim().toLowerCase(Locale.ROOT));
            }
        }

        JSArray out = new JSArray();
        Cursor c = getContext().getContentResolver().query(
            Uri.parse("content://sms/inbox"),
            new String[] { "address", "body", "date" },
            null, null, "date DESC"
        );
        if (c != null) {
            try {
                int iAddr = c.getColumnIndexOrThrow("address");
                int iBody = c.getColumnIndexOrThrow("body");
                int iDate = c.getColumnIndexOrThrow("date");
                while (c.moveToNext()) {
                    String address = c.getString(iAddr);
                    if (address == null) continue;
                    if (!senders.isEmpty() && !senders.contains(address.trim().toLowerCase(Locale.ROOT))) continue;
                    JSObject m = new JSObject();
                    m.put("address", address);
                    m.put("body", c.getString(iBody));
                    m.put("date", c.getLong(iDate));
                    out.put(m);
                }
            } finally {
                c.close();
            }
        }
        JSObject ret = new JSObject();
        ret.put("messages", out);
        return ret;
    }
}
