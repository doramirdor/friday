import CoreGraphics
import Foundation

enum PermissionsRequester {
    static func requestScreenCaptureAccess(_ completion: @escaping (Bool) -> Void) {
        if CGPreflightScreenCaptureAccess() {
            completion(true)
            return
        }
        DispatchQueue.global().async {
            let granted = CGRequestScreenCaptureAccess()
            // Give the user a second to hit "Open System Settings" etc.
            DispatchQueue.global().asyncAfter(deadline: .now() + 5) {
                completion(granted || CGPreflightScreenCaptureAccess())
            }
        }
    }
}
