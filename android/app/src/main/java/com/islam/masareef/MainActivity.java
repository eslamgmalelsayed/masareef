package com.islam.masareef;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup.MarginLayoutParams;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SmsReaderPlugin.class);
        super.onCreate(savedInstanceState);
        // الكيبورد: مع شاشة الحافة للحافة (Android 15) الصفحة مبتصغرش لوحدها لما الكيبورد يطلع،
        // فبنحسب الهوامش بنفسنا: شريط الحالة والتنقل (زي Capacitor) + الكيبورد لو ظاهر.
        // كده الصفحة نفسها بتصغر فوق الكيبورد، وكل حاجة (خانة الكتابة، النوافذ) بتفضل باينة.
        // (قبل Android 15 الشاشة مش حافة للحافة والكيبورد بيصغّر الصفحة لوحده)
        if (Build.VERSION.SDK_INT < 35 || getBridge() == null || getBridge().getWebView() == null) return;
        View wv = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(wv, (v, wi) -> {
            Insets bars = wi.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = wi.getInsets(WindowInsetsCompat.Type.ime());
            MarginLayoutParams mlp = (MarginLayoutParams) v.getLayoutParams();
            mlp.leftMargin = bars.left;
            mlp.rightMargin = bars.right;
            mlp.topMargin = bars.top;
            mlp.bottomMargin = Math.max(bars.bottom, ime.bottom);
            v.setLayoutParams(mlp);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(wv);
    }
}
