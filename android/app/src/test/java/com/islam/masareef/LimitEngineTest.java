package com.islam.masareef;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/**
 * نفس الرسايل الوهمية اللي بيتختبر عليها الـ JS (tests/fixtures/sms.json → sms_fixtures.tsv):
 * الجزء الأصلي اللي بيبعت التنبيهات والتطبيق مقفول لازم يطلع نفس المبلغ ونفس التاجر.
 */
public class LimitEngineTest {

    private static List<String[]> rows() throws Exception {
        InputStream in = LimitEngineTest.class.getClassLoader().getResourceAsStream("sms_fixtures.tsv");
        assertNotNull("sms_fixtures.tsv مش موجود — شغّل node scripts/make-java-fixtures.mjs", in);
        List<String[]> out = new ArrayList<>();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) if (!line.isEmpty()) out.add(line.split("\t", -1));
        }
        return out;
    }

    private static String unescape(String s) {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '\\' && i + 1 < s.length()) {
                char n = s.charAt(++i);
                b.append(n == 'n' ? '\n' : n);
            } else b.append(c);
        }
        return b.toString();
    }

    @Test
    public void purchasesMatchJs() throws Exception {
        int checked = 0;
        for (String[] r : rows()) {
            String body = unescape(r[2]);
            long ts = Long.parseLong(r[1]);
            LimitEngine.Purchase p = LimitEngine.parsePurchase(body, ts);
            if ("-".equals(r[3])) {
                assertNull("مش شراء بس اتقرت كأنها شراء: " + body, p);
            } else {
                assertNotNull("شراء متقريش: " + body, p);
                assertEquals("المبلغ: " + body, Double.parseDouble(r[3]), p.amount, 0.005);
                assertEquals("التاجر: " + body, r[4], LimitEngine.merchantKey(p.merchant));
                checked++;
            }
        }
        assertTrue("مفيش عمليات شراء في الملف", checked >= 4);
    }

    @Test
    public void salaryDetected() throws Exception {
        boolean found = false;
        for (String[] r : rows()) if (unescape(r[2]).contains("رواتب")) { assertTrue(LimitEngine.isSalary(unescape(r[2]))); found = true; }
        assertTrue(found);
    }

    @Test
    public void merchantKeyMatchesJs() {
        assertEquals("ROKONRAID", LimitEngine.merchantKey("ROKON RAIDAN"));
        assertEquals("NOONCOM", LimitEngine.merchantKey("noon.com"));
        assertEquals("ANTHROPIC", LimitEngine.merchantKey("TAP * Anthropic"));
    }

    @Test
    public void weekStartsOnSunday() {
        Calendar c = Calendar.getInstance();
        c.set(2026, Calendar.OCTOBER, 21, 15, 0, 0); // أربعاء
        assertEquals("2026-10-21", LimitStore.dayKey(c.getTimeInMillis(), false));
        assertEquals("2026-10-18", LimitStore.dayKey(c.getTimeInMillis(), true));
    }
}
