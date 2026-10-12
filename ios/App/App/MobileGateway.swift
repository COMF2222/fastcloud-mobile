import Foundation
import Security

enum MobileFailure: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let text) = self { return text }; return "Operation failed" }
}

enum MobileKeychain {
    static let service = "work.comf.fastcloud.mobile.session"
    private static let lock = NSRecursiveLock()
    static func read() throws -> [String: Any]? {
        lock.lock(); defer { lock.unlock() }
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service, kSecAttrAccount as String: "oauth",
            kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw MobileFailure.message("Session storage unavailable") }
        return try JSONSerialization.jsonObject(with: data) as? [String: Any]
    }
    static func save(_ value: [String: Any]) throws {
        lock.lock(); defer { lock.unlock() }
        let data = try JSONSerialization.data(withJSONObject: value)
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "oauth"]
        let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var item = query
            item[kSecValueData as String] = data
            item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw MobileFailure.message("Session storage unavailable") }
        } else if status != errSecSuccess { throw MobileFailure.message("Session storage unavailable") }
    }
    static func clear() { lock.lock(); defer { lock.unlock() }; SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "oauth"] as CFDictionary) }
    static func replace(_ value: [String: Any], expected: String) throws {
        lock.lock(); defer { lock.unlock() }
        guard let existing = try read(), existing["refresh_token"] as? String == expected else { throw MobileFailure.message("Account changed; retry the request") }
        try save(value)
    }
}

actor MobileGateway {
    static let shared = MobileGateway()
    private var refresh: Task<[String: Any], Error>?
    private var pairingTicket: String?
    private var pairingGeneration = 0
    private var pollingPair = false
    func pairingStart() async throws -> [String: Any] {
        guard try MobileKeychain.read() == nil else { throw MobileFailure.message("Already signed in") }
        pairingGeneration += 1
        let generation = pairingGeneration
        let response = try await raw("/v1/mobile/pairing/start", method: "POST", body: [:])
        guard response.status == 200 else { throw MobileFailure.message(response.status == 404 ? "Update the Veirune server to connect your phone" : "Could not create phone code") }
        let value = try response.json()
        guard generation == pairingGeneration, let ticket = value["ticket"] as? String, let code = value["code"] as? String else { throw MobileFailure.message("Phone connection cancelled") }
        pairingTicket = ticket
        return ["code": code, "expiresIn": value["expiresIn"] ?? 600]
    }
    func pairingCancel() { pairingGeneration += 1; pairingTicket = nil }
    func pairingPoll() async throws -> Bool {
        guard let ticket = pairingTicket else { return try MobileKeychain.read() != nil }
        if pollingPair { return false }
        pollingPair = true
        defer { pollingPair = false }
        let generation = pairingGeneration
        let response = try await raw("/v1/mobile/pairing/poll", method: "POST", body: ["ticket": ticket])
        guard generation == pairingGeneration else { return false }
        if response.status == 202 { return false }
        guard response.status == 200 else { throw MobileFailure.message("Phone code expired or connection failed; create a new code") }
        let value = try response.json()
        guard value["access_token"] is String, value["refresh_token"] is String, let owner = value["account_id"] as? NSNumber else { throw MobileFailure.message("Invalid phone sign-in response") }
        try save(value, owner: owner.int64Value)
        pairingTicket = nil
        return true
    }
    var server: String { UserDefaults.standard.string(forKey: "server") ?? "https://77.223.107.226" }
    struct Response { let status: Int; let data: Data; let type: String
        func object() throws -> Any { if data.isEmpty { return NSNull() }; return try JSONSerialization.jsonObject(with: data) }
        func json() throws -> [String: Any] { guard let result = try object() as? [String: Any] else { throw MobileFailure.message("Invalid server response") }; return result }
    }
    func configure(_ address: String) throws {
        guard let url = URLComponents(string: address), url.scheme == "https", url.host != nil, url.user == nil, url.password == nil, url.path.isEmpty, url.query == nil, url.fragment == nil else { throw MobileFailure.message("Use an HTTPS server address") }
        let existing = try MobileKeychain.read()
        if address != server && existing != nil { throw MobileFailure.message("Sign out before changing server") }
        UserDefaults.standard.set(address, forKey: "server")
    }
    func raw(_ path: String, method: String = "GET", body: [String: Any]? = nil, token: String? = nil) async throws -> Response {
        guard path.hasPrefix("/v1/"), !path.contains(".."), !path.contains("://"), let url = URL(string: server + path) else { throw MobileFailure.message("Invalid server path") }
        var request = URLRequest(url: url, timeoutInterval: 85)
        request.httpMethod = method
        request.setValue("2", forHTTPHeaderField: "X-Fastcloud-Preferences")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("OAuth " + token, forHTTPHeaderField: "Authorization") }
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body); request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, response.url?.host == url.host, data.count <= 10 * 1024 * 1024 else { throw MobileFailure.message("Invalid server response") }
        return Response(status: response.statusCode, data: data, type: response.mimeType ?? "application/octet-stream")
    }
    private func save(_ tokens: [String: Any], owner: Int64? = nil, expected: String? = nil) throws {
        var value = tokens
        value["expires_at"] = Date().timeIntervalSince1970 + Double(value["expires_in"] as? Int ?? 3600)
        if let owner { value["account_id"] = owner }
        if let expected { try MobileKeychain.replace(value, expected: expected) }
        else { try MobileKeychain.save(value) }
    }
    private func access(force: Bool = false) async throws -> String {
        guard let stored = try MobileKeychain.read(), let token = stored["access_token"] as? String else { throw MobileFailure.message("Sign in to Veirune") }
        if !force && (stored["expires_at"] as? Double ?? 0) > Date().timeIntervalSince1970 + 60 { return token }
        if let refresh { let value = try await refresh.value; return value["access_token"] as? String ?? "" }
        let task = Task<[String: Any], Error> {
            let response = try await self.raw("/v1/oauth/refresh", method: "POST", body: ["refresh_token": stored["refresh_token"] ?? ""])
            guard response.status == 200 else { throw MobileFailure.message("Server temporarily unavailable") }
            let value = try response.json()
            try await self.save(value, owner: (stored["account_id"] as? NSNumber)?.int64Value, expected: stored["refresh_token"] as? String ?? "")
            return value
        }
        refresh = task
        defer { refresh = nil }
        let refreshed = try await task.value
        return refreshed["access_token"] as? String ?? ""
    }
    func request(_ path: String, method: String = "GET", body: [String: Any]? = nil) async throws -> Response {
        let owner = (try MobileKeychain.read()?["account_id"] as? NSNumber)?.int64Value
        let token = try await access()
        guard owner != nil, (try MobileKeychain.read()?["account_id"] as? NSNumber)?.int64Value == owner else { throw MobileFailure.message("Account changed; retry the request") }
        let response = try await raw(path, method: method, body: body, token: token)
        if response.status != 401 { return response }
        let stored = try MobileKeychain.read()
        guard (stored?["account_id"] as? NSNumber)?.int64Value == owner else { throw MobileFailure.message("Account changed; retry the request") }
        let current = try await access(force: stored?["access_token"] as? String == token)
        guard (try MobileKeychain.read()?["account_id"] as? NSNumber)?.int64Value == owner else { throw MobileFailure.message("Account changed; retry the request") }
        return try await raw(path, method: method, body: body, token: current)
    }
    func json(_ path: String, method: String = "GET", body: [String: Any]? = nil) async throws -> [String: Any] {
        let response = try await request(path, method: method, body: body)
        guard (200..<300).contains(response.status) else { throw MobileFailure.message("HTTP \(response.status): \((try? response.json()["error"] as? String) ?? "Request failed")") }
        return try response.json()
    }
    func stream(_ id: Int64) async throws -> URL {
        let response = try await request("/v1/media/resolve", method: "POST", body: ["urn": "soundcloud:tracks:\(id)"])
        if response.status == 200, let path = try response.json()["playlist_path"] as? String, path.hasPrefix("/v1/media/") { return URL(string: server + path)! }
        guard response.status == 422 else { throw MobileFailure.message("Playback temporarily unavailable") }
        let data = try await json("/v1/soundcloud/api/tracks/soundcloud%3Atracks%3A\(id)/streams")
        guard let path = (data["hls_aac_160_url"] ?? data["hls_mp3_128_url"] ?? data["preview_mp3_128_url"]) as? String, path.hasPrefix("/v1/soundcloud/asset/"), let url = URL(string: server + path) else { throw MobileFailure.message("No playable stream") }
        return url
    }
    func completeLogin(code: String, verifier: String) async throws {
        var response = try await raw("/v1/oauth/exchange", method: "POST", body: ["code": code, "verifier": verifier])
        let ticket = try response.json()["ticket"] as? String ?? ""
        let deadline = Date().addingTimeInterval(14 * 60)
        while response.status == 202 && Date() < deadline {
            try await Task.sleep(nanoseconds: 3_000_000_000)
            response = try await raw("/v1/oauth/pending", method: "POST", body: ["ticket": ticket])
        }
        guard response.status == 200 else { throw MobileFailure.message("Sign-in did not complete") }
        let tokens = try response.json()
        guard let token = tokens["access_token"] as? String else { throw MobileFailure.message("Invalid sign-in response") }
        let profile = try await raw("/v1/session", token: token)
        guard profile.status == 200, let owner = try profile.json()["user_id"] as? NSNumber else { throw MobileFailure.message("Account validation failed") }
        try save(tokens, owner: owner.int64Value)
    }
}
