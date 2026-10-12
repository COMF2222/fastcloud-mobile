import Foundation
import AVFoundation

@MainActor final class MobileDownloads: NSObject, AVAssetDownloadDelegate {
    static let shared = MobileDownloads()
    private lazy var session: AVAssetDownloadURLSession = {
        let config = URLSessionConfiguration.background(withIdentifier: "work.comf.fastcloud.mobile.downloads")
        return AVAssetDownloadURLSession(configuration: config, assetDownloadDelegate: self, delegateQueue: OperationQueue.main)
    }()
    private var pending: [Int: CheckedContinuation<Void, Error>] = [:]
    private var records: [String: [String: Any]] {
        get { MobileLocal.dictionary("downloads") as? [String: [String: Any]] ?? [:] }
        set { MobileLocal.save(newValue, key: "downloads") }
    }
    private func owner() throws -> Int64 { guard let id = (try MobileKeychain.read()?["account_id"] as? NSNumber)?.int64Value else { throw MobileFailure.message("Sign in first") }; return id }
    func local(_ id: Int64) throws -> URL? {
        let key = "\(try owner()):\(id)"
        guard let raw = records[key]?["url"] as? String, let url = URL(string: raw), FileManager.default.fileExists(atPath: url.path) else { return nil }
        return url
    }
    func download(_ track: [String: Any]) async throws {
        guard let id = track["id"] as? NSNumber else { throw MobileFailure.message("Invalid track ID") }
        if try local(id.int64Value) != nil { return }
        let owner = try owner(), url = try await MobileGateway.shared.stream(id.int64Value)
        guard let task = session.makeAssetDownloadTask(asset: AVURLAsset(url: url), assetTitle: track["title"] as? String ?? "Veirune", assetArtworkData: nil, options: nil) else { throw MobileFailure.message("Could not save this track") }
        task.taskDescription = "\(owner):\(id.int64Value)"
        var record = records; record[task.taskDescription!] = ["track": track, "owner": owner, "ready": false]; records = record
        try await withCheckedThrowingContinuation { continuation in pending[task.taskIdentifier] = continuation; task.resume() }
    }
    func list() throws -> [[String: Any]] {
        let account = try owner()
        return records.values.filter { ($0["owner"] as? NSNumber)?.int64Value == account && $0["ready"] as? Bool == true }.map { ["track": $0["track"] ?? [:], "ready": true, "bytes": $0["bytes"] ?? 0] }
    }
    func remove(_ id: Int64) throws {
        let key = "\(try owner()):\(id)"
        if let raw = records[key]?["url"] as? String, let url = URL(string: raw), FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
        var value = records; value.removeValue(forKey: key); records = value
    }
    func urlSession(_ session: URLSession, assetDownloadTask: AVAssetDownloadTask, didFinishDownloadingTo location: URL) {
        guard let key = assetDownloadTask.taskDescription else { return }
        var all = records, value = all[key] ?? [:]; value["url"] = location.absoluteString; value["ready"] = true
        var bytes: Int64 = 0
        if let files = FileManager.default.enumerator(at: location, includingPropertiesForKeys: [.fileSizeKey]) { for case let file as URL in files { bytes += Int64((try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) } }
        value["bytes"] = bytes; all[key] = value; records = all
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let continuation = pending.removeValue(forKey: task.taskIdentifier) else { return }
        if let error { continuation.resume(throwing: error) } else { continuation.resume() }
    }
}
