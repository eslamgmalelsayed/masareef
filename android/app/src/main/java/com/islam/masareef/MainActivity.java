package com.islam.masareef;

import android.os.Bundle;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

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
        root.getViewTreeObserver().addOnGlobalLayoutListener(() -> {
            WindowInsetsCompat wi = ViewCompat.getRootWindowInsets(root);
            if (wi == null || getBridge() == null || getBridge().getWebView() == null) return;
            Insets ime = wi.getInsets(WindowInsetsCompat.Type.ime());
            Insets nav = wi.getInsets(WindowInsetsCompat.Type.navigationBars());
            float d = getResources().getDisplayMetrics().density;
            int kb = Math.round(Math.max(0, ime.bottom - nav.bottom) / d);
            if (kb == lastKb) return;
            lastKb = kb;
            getBridge().getWebView().evaluateJavascript(
                "document.documentElement.style.setProperty('--kb','" + kb + "px');"
                + "document.documentElement.classList.toggle('kb-open'," + (kb > 0) + ");"
                + "if(" + (kb > 0) + "){var a=document.activeElement;if(a&&a.scrollIntoView)setTimeout(function(){a.scrollIntoView({block:'center'})},60)}", null);
        });
    }
}
