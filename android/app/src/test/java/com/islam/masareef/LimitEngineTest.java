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
    public void warnPercentIsConfigurable() {
        java.util.Map<String, Double> totals = new java.util.HashMap<>(), limits = new java.util.HashMap<>();
        totals.put("food", 85.0); limits.put("food", 100.0);
        assertEquals(80, LimitEngine.evaluate(totals, limits, new java.util.HashMap<>(), 80).get(0).level);
        assertTrue(LimitEngine.evaluate(totals, limits, new java.util.HashMap<>(), 90).isEmpty());
        assertTrue(LimitEngine.evaluate(totals, limits, new java.util.HashMap<>(), 0).isEmpty());
        totals.put("food", 120.0);
        assertEquals(100, LimitEngine.evaluate(totals, limits, new java.util.HashMap<>(), 0).get(0).level);
    }

    @Test
    public void weekStartsOnSunday() {
        Calendar c = Calendar.getInstance();
        c.set(2026, Calendar.OCTOBER, 21, 15, 0, 0); // أربعاء
        assertEquals("2026-10-21", LimitStore.dayKey(c.getTimeInMillis(), false));
        assertEquals("2026-10-18", LimitStore.dayKey(c.getTimeInMillis(), true));
    }

    /** إشعار "سلفة؟": أي تحويل الجزء الأصلي بيلقطه لازم يكون نفس اللي الـ JS شايفه (نفس المبلغ ونفس الشخص) */
    @Test
    public void transfersMatchJs() throws Exception {
        int checked = 0;
        LimitEngine.LoanRules self = new LimitEngine.LoanRules(); // نفس selfNames بتاعة tests/fixtures/sms.json
        self.self.add("تست"); self.self.add("testuser"); self.min = 0;
        for (String a : new String[] { "1001", "2002", "3003", "4004", "5005" }) self.acc.add(a);
        for (String[] r : rows()) {
            String body = unescape(r[2]);
            LimitEngine.Transfer t = LimitEngine.parseTransfer(body, Long.parseLong(r[1]));
            if (t == null) continue;
            if ("-".equals(r[5])) { // مش تحويل لشخص في الـ JS (مثلًا تحويل لنفسك) → الإشعار مايسألش عليه
                assertEquals("هيسأل على تحويل مش لشخص: " + body, 0, LimitEngine.loanDecision(t, self));
                continue;
            }
            assertEquals("المبلغ: " + body, Double.parseDouble(r[5]), t.amount, 0.005);
            assertEquals("الشخص: " + body, r[6], LimitEngine.personKey(t.name));
            checked++;
        }
        assertTrue("مفيش تحويلات اتختبرت", checked >= 2);
    }

    @Test
    public void loanDecisionFollowsRules() throws Exception {
        LimitEngine.LoanRules lent = new LimitEngine.LoanRules();
        lent.ignore.add("landlord"); lent.yes.add("samir"); lent.freq.add("coffee"); lent.self.add("islam");
        lent.recur.add(new Object[] { "rentguy", 1500.0 });
        assertEquals(1, LimitEngine.loanDecision(new LimitEngine.Transfer(300, "FRIEND"), lent));
        assertEquals(2, LimitEngine.loanDecision(new LimitEngine.Transfer(20, "SAMIR"), lent));
        assertEquals(0, LimitEngine.loanDecision(new LimitEngine.Transfer(20, "FRIEND"), lent));
        assertEquals(0, LimitEngine.loanDecision(new LimitEngine.Transfer(900, "LANDLORD"), lent));
        assertEquals(0, LimitEngine.loanDecision(new LimitEngine.Transfer(120, "COFFEE"), lent));
        assertEquals(0, LimitEngine.loanDecision(new LimitEngine.Transfer(1500, "RENT GUY"), lent));
        assertEquals(1, LimitEngine.loanDecision(new LimitEngine.Transfer(700, "RENT GUY"), lent));
        assertEquals(0, LimitEngine.loanDecision(new LimitEngine.Transfer(500, "ISLAM GAMAL"), lent));
        LimitEngine.Transfer mine = new LimitEngine.Transfer(10776, "اسلام ج. السي"); mine.acct = "8328";
        lent.acc.add("8328");
        assertEquals(0, LimitEngine.loanDecision(mine, lent));
        lent.on = false;
        assertEquals(0, LimitEngine.loanDecision(new LimitEngine.Transfer(300, "FRIEND"), lent));
    }
}
