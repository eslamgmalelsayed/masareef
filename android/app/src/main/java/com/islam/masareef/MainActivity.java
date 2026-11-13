package com.islam.masareef;

import android.os.Bundle;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsAnimationCompat;
import androidx.core.view.WindowInsetsCompat;

import java.util.List;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private int lastKb = -1;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SmsReaderPlugin.class);
        super.onCreate(savedInstanceState);
        // الكيبورد: مع شاشة الحافة للحافة (Android 15) الصفحة مش بتصغر لوحدها لما الكيبورد يطلع،
        // فبنبعت ارتفاعه للصفحة (--kb) والنوافذ اللي من تحت بتطلع فوقه
        final View root = getWindow().getDecorView();
        // لما الكيبورد يطلع والشاشة مبتصغرش، مفيش "layout" جديد — فبنسمع لحركة الكيبورد نفسها
        ViewCompat.setWindowInsetsAnimationCallback(root, new WindowInsetsAnimationCompat.Callback(WindowInsetsAnimationCompat.Callback.DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
            @Override
            public WindowInsetsCompat onProgress(WindowInsetsCompat insets, List<WindowInsetsAnimationCompat> running) {
                pushKb(insets);
                return insets;
            }
            @Override
            public void onEnd(WindowInsetsAnimationCompat animation) {
                pushKb(ViewCompat.getRootWindowInsets(root));
            }
        });
        // احتياطي (أجهزة من غير أنيميشن للكيبورد)
        root.getViewTreeObserver().addOnGlobalLayoutListener(() -> pushKb(ViewCompat.getRootWindowInsets(root)));
    }

    private void pushKb(WindowInsetsCompat wi) {
        if (wi == null || getBridge() == null || getBridge().getWebView() == null) return;
        Insets ime = wi.getInsets(WindowInsetsCompat.Type.ime());
        Insets nav = wi.getInsets(WindowInsetsCompat.Type.navigationBars());
        float d = getResources().getDisplayMetrics().density;
        // لو الصفحة نفسها صغرت (الأجهزة القديمة) يبقى مش محتاجين نرفع حاجة
        View wv = getBridge().getWebView();
        int[] loc = new int[2];
        wv.getLocationOnScreen(loc);
        int screenH = getWindow().getDecorView().getHeight();
        int covered = Math.max(0, (loc[1] + wv.getHeight()) - (screenH - ime.bottom));
        int kb = ime.bottom > nav.bottom ? Math.round(covered / d) : 0;
        if (kb == lastKb) return;
        boolean opened = kb > 0 && lastKb <= 0;
        lastKb = kb;
        wv.post(() -> ((android.webkit.WebView) wv).evaluateJavascript(
            "document.documentElement.style.setProperty('--kb','" + kb + "px');"
            + "document.documentElement.classList.toggle('kb-open'," + (kb > 0) + ");"
            + "window.dispatchEvent(new Event('kb'));"
            + (opened ? "setTimeout(function(){var a=document.activeElement;if(a&&a.scrollIntoView&&!a.closest('.bar'))a.scrollIntoView({block:'center'})},120);" : ""), null));
    }
}
