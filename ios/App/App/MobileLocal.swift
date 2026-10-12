import Foundation

enum MobileLocal {
    private static let lock = NSRecursiveLock()
    static func array(_ key: String) -> [Any] { object(key) as? [Any] ?? [] }
    static func object(_ key: String) -> Any? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONSerialization.jsonObject(with: data)
    }
    static func dictionary(_ key: String) -> [String: Any] { object(key) as? [String: Any] ?? [:] }
    static func save(_ value: Any, key: String) {
        lock.lock(); defer { lock.unlock() }
        guard let data = try? JSONSerialization.data(withJSONObject: value) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
    static func mergeFeedback(_ incoming: [String: Any]) {
        lock.lock(); defer { lock.unlock() }
        var result = incoming
        for (key, raw) in dictionary("playback-feedback") {
            guard let left = raw as? [String: Any] else { continue }
            let right = result[key] as? [String: Any]
            let a = (left["updatedAt"] as? NSNumber)?.int64Value ?? 0, b = (right?["updatedAt"] as? NSNumber)?.int64Value ?? 0
            if right == nil || a > b || a == b && (left["device"] as? String ?? "") > (right?["device"] as? String ?? "") { result[key] = left }
        }
        save(result, key: "playback-feedback")
    }
    static func clearPlayback() {
        lock.lock(); defer { lock.unlock() }
        for key in ["playback-preferences", "playback-feedback", "playback-history", "playback-likes", "sleep"] { UserDefaults.standard.removeObject(forKey: key) }
    }
    static func mergeRemote(_ value: [String: Any], owner: Int64) {
        lock.lock(); defer { lock.unlock() }
        guard let stored = try? MobileKeychain.read(), (stored["account_id"] as? NSNumber)?.int64Value == owner else { return }
        mergeFeedback(value["trackFeedback"] as? [String: Any] ?? [:])
        save(value["tracks"] ?? [], key: "playback-history")
    }
}
