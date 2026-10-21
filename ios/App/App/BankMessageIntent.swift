import AppIntents
import Foundation

/// أكشن في تطبيق "الاختصارات": الأتمتة بتبعتله نص رسالة البنك أول ما توصل
@available(iOS 16.0, *)
struct AddBankMessageIntent: AppIntent {
    static var title: LocalizedStringResource = "سجّل رسالة بنك في مصاريفي"
    static var description = IntentDescription("بيضيف رسالة البنك لمصاريفي، ويحسب الحدود، ويبعت إشعار لو قرّبت أو عدّيت الحد.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "نص الرسالة")
    var message: String

    @Parameter(title: "الراسل")
    var sender: String?

    func perform() async throws -> some IntentResult {
        let body = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return .result() }
        let now = Date()
        let from = (sender ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if MessageStore.add(address: from.isEmpty ? "__ios__" : from, body: body, date: now) {
            LimitStore.addMessage(address: from, body: body, ts: now.timeIntervalSince1970 * 1000)
        }
        return .result()
    }
}

@available(iOS 16.0, *)
struct MasareefShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddBankMessageIntent(),
            phrases: ["سجّل رسالة بنك في \(.applicationName)", "Add bank message to \(.applicationName)"],
            shortTitle: "سجّل رسالة بنك",
            systemImageName: "banknote"
        )
    }
}
