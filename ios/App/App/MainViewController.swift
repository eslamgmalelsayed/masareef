import UIKit
import Capacitor

/// بيسجّل الـ plugin المحلي (SmsReader) في Capacitor
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SmsReaderPlugin())
    }
}
