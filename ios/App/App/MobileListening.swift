import Foundation

actor MobileListening {
    static let shared = MobileListening()
    private var owner: Int64 = 0
    private var device = ""
    private var rows: [String: [String: Any]] = [:]
    private var synced: [String: [String: Int64]] = [:]
    private var syncing = false
    private func load() throws {
        let account = (try MobileKeychain.read()?["account_id"] as? NSNumber)?.int64Value ?? 0
        if account == owner { return }
        owner = account
        let prefix = "listening-\(owner)"
        device = UserDefaults.standard.string(forKey: prefix + "-device") ?? UUID().uuidString.lowercased().replacingOccurrences(of: "-", with: "")
        UserDefaults.standard.set(device, forKey: prefix + "-device")
        rows = MobileLocal.dictionary(prefix + "-rows") as? [String: [String: Any]] ?? [:]
        synced = MobileLocal.dictionary(prefix + "-synced") as? [String: [String: Int64]] ?? [:]
    }
    func add(_ track: [String: Any], ms: Int64, counted: Bool) throws {
        try load(); guard owner > 0, ms > 0, ms <= 2000, let id = track["id"] as? NSNumber else { return }
        let formatter = DateFormatter(); formatter.dateFormat = "yyyy-MM-dd"; formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = TimeZone(secondsFromGMT: 0)
        let day = formatter.string(from: Date()), key = day + ":" + id.stringValue
        let metadata = track["publisher_metadata"] as? [String: Any], user = track["user"] as? [String: Any]
        var row = rows[key] ?? ["day": day, "trackId": id.int64Value, "title": String((track["title"] as? String ?? "").prefix(512)), "artist": String(([metadata?["artist"],track["metadata_artist"],user?["username"]].compactMap { $0 as? String }.first { !$0.isEmpty } ?? "").prefix(256)), "genre": String((track["genre"] as? String ?? "").prefix(128)), "ms": Int64(0), "plays": Int64(0)]
        row["ms"] = min(86_400_000, ((row["ms"] as? NSNumber)?.int64Value ?? 0) + ms)
        if counted { row["plays"] = min(2880, ((row["plays"] as? NSNumber)?.int64Value ?? 0) + 1) }
        row["lastPlayed"] = Int64(Date().timeIntervalSince1970)
        rows[key] = row
        MobileLocal.save(rows, key: "listening-\(owner)-rows")
    }
    func sync() async throws {
        try load(); guard owner > 0, !syncing else { return }; syncing = true; defer { syncing = false }
        let account = owner, id = device
        let batch = rows.filter { key, row in
            let acknowledged = synced[key] ?? [:]
            return ((row["ms"] as? NSNumber)?.int64Value ?? 0) > (acknowledged["ms"] ?? 0) || ((row["plays"] as? NSNumber)?.int64Value ?? 0) > (acknowledged["plays"] ?? 0)
        }.map(\.value)
        for start in stride(from: 0, to: batch.count, by: 100) {
            guard (try MobileKeychain.read()?["account_id"] as? NSNumber)?.int64Value == account else { return }
            let chunk = Array(batch[start..<min(start + 100, batch.count)])
            _ = try await MobileGateway.shared.json("/v1/me/personal", method: "POST", body: ["device": id, "stats": chunk])
            guard owner == account else { return }
            for row in chunk {
                guard let day = row["day"] as? String, let trackId = row["trackId"] as? NSNumber else { continue }
                synced[day + ":" + trackId.stringValue] = ["ms": (row["ms"] as? NSNumber)?.int64Value ?? 0, "plays": (row["plays"] as? NSNumber)?.int64Value ?? 0]
            }
            MobileLocal.save(synced, key: "listening-\(account)-synced")
        }
    }
}
