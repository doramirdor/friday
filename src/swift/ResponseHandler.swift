import Foundation

enum ResponseHandler {
    static func send(_ dict: [String: Any], exitProcess: Bool = true) {
        if let data = try? JSONSerialization.data(withJSONObject: dict, options: []),
           let str = String(data: data, encoding: .utf8) {
            print(str)
            fflush(stdout)
        } else {
            print("{\"code\":\"JSON_SERIALIZATION_FAILED\"}")
            fflush(stdout)
        }
        if exitProcess { Foundation.exit(0) }
    }
}