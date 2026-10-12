import Foundation
import UIKit
import Capacitor

@objc(FastcloudPlugin)
public class FastcloudPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FastcloudPlugin"
    public let jsName = "Fastcloud"
    public let pluginMethods: [CAPPluginMethod] = ["appIcon", "request", "session", "configure", "login", "logout", "player", "play", "enqueue", "control", "download", "downloads", "removeDownload", "playbackSettings", "pairingStart", "pairingPoll", "pairingCancel", "updatesCheck", "updatesStatus", "updatesDownload", "updatesInstall", "updatesCancel"].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    @objc func appIcon(_ call: CAPPluginCall) {
        Task { @MainActor in
            let application = UIApplication.shared
            if let id = call.getInt("id") {
                guard (1...12).contains(id), application.supportsAlternateIcons else { call.reject("Icon selection is unavailable"); return }
                let name: String? = id == 9 ? nil : String(format: "Icon%02d", id)
                do { try await application.setAlternateIconName(name) }
                catch { call.reject("Could not change the application icon", nil, error); return }
            }
            let selected = application.alternateIconName.flatMap { Int($0.replacingOccurrences(of: "Icon", with: "")) } ?? 9
            call.resolve(["selected": selected, "supported": application.supportsAlternateIcons])
        }
    }
    private var storeUpdate: [String: Any]?
    private func updateStatus() -> [String: Any] {
        let current = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.1.0"
        let latest = storeUpdate?["version"] as? String ?? current
        let a = latest.split(separator: ".").compactMap { Int($0) }, b = current.split(separator: ".").compactMap { Int($0) }
        let newer = a.count == 3 && b.count == 3 && a.lexicographicallyPrecedes(b) == false && a != b
        return ["supported": storeUpdate != nil, "currentVersion": current, "currentBuild": Int(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1") ?? 1, "phase": newer ? "available" : "idle", "received": 0, "total": 0, "compatible": true, "release": newer ? storeUpdate! as Any : NSNull()]
    }
    @objc func updatesCheck(_ call: CAPPluginCall) { task(call) {
        let response = try await MobileGateway.shared.raw("/v1/mobile/update?platform=ios")
        guard response.status == 200 else { throw MobileFailure.message("Could not check for updates; try again later") }
        let data = try response.json()
        self.storeUpdate = data["release"] as? [String: Any]
        return self.updateStatus()
    } }
    @objc func updatesStatus(_ call: CAPPluginCall) { call.resolve(updateStatus()) }
    @objc func updatesDownload(_ call: CAPPluginCall) { call.reject("iPhone updates are installed through the App Store") }
    @objc func updatesCancel(_ call: CAPPluginCall) { call.resolve() }
    @objc func updatesInstall(_ call: CAPPluginCall) { task(call) {
        guard let raw = self.storeUpdate?["storeUrl"] as? String, let url = URL(string: raw), url.scheme == "https", url.host == "apps.apple.com", url.user == nil, url.password == nil else { throw MobileFailure.message("App Store release is not available yet") }
        await MainActor.run { UIApplication.shared.open(url) }
        return ["needsPermission": false]
    } }
    @objc func pairingStart(_ call: CAPPluginCall) { task(call) { try await MobileGateway.shared.pairingStart() } }
    @objc func pairingPoll(_ call: CAPPluginCall) { task(call) { ["ready": try await MobileGateway.shared.pairingPoll()] } }
    @objc func pairingCancel(_ call: CAPPluginCall) { task(call) { await MobileGateway.shared.pairingCancel(); return nil } }
    private var loginFlow: MobileLogin?
    private func task(_ call: CAPPluginCall, _ action: @escaping () async throws -> [String: Any]?) {
        Task { do { call.resolve(try await action() ?? [:]) } catch { call.reject(error.localizedDescription) } }
    }
    @objc func configure(_ call: CAPPluginCall) { task(call) { try await MobileGateway.shared.configure(call.getString("server") ?? ""); return nil } }
    @objc func request(_ call: CAPPluginCall) { task(call) {
        let result = try await MobileGateway.shared.request(call.getString("path") ?? "", method: call.getString("method") ?? "GET", body: call.getObject("body"))
        if call.getBool("binary") == true { return ["status": result.status, "data": result.data.base64EncodedString(), "contentType": result.type] }
        return ["status": result.status, "data": try result.object()]
    } }
    @objc func session(_ call: CAPPluginCall) { task(call) { let value = try MobileKeychain.read(); return ["signedIn": value != nil, "accountId": value?["account_id"] ?? 0] } }
    @objc func login(_ call: CAPPluginCall) { task(call) { try await MainActor.run { if self.loginFlow == nil { self.loginFlow = MobileLogin() } }; try await self.loginFlow?.start(); return nil } }
    @objc func logout(_ call: CAPPluginCall) { task(call) { try? await MobileListening.shared.sync(); await MobileGateway.shared.pairingCancel(); await MainActor.run { MobilePlayback.shared.stop(); MobileKeychain.clear(); MobileLocal.clearPlayback() }; return nil } }
    @objc func player(_ call: CAPPluginCall) { task(call) { await MobilePlayback.shared.state() } }
    @objc func play(_ call: CAPPluginCall) { task(call) { guard let tracks = call.getArray("tracks") as? [[String: Any]] else { throw MobileFailure.message("Queue is empty") }; try await MobilePlayback.shared.play(tracks, at: call.getInt("index") ?? 0, recommended: call.getBool("recommended") ?? false); return nil } }
    @objc func enqueue(_ call: CAPPluginCall) { task(call) { guard let track = call.getObject("track") else { throw MobileFailure.message("Invalid track") }; try await MobilePlayback.shared.enqueue(track, next: call.getBool("next") ?? false); return nil } }
    @objc func control(_ call: CAPPluginCall) { task(call) { try await MobilePlayback.shared.control(call.getString("action") ?? "", value: call.getDouble("value") ?? 0, selected: call.getInt("index") ?? 0, target: call.getInt("target") ?? 0); return nil } }
    @objc func playbackSettings(_ call: CAPPluginCall) {
        guard let stored = try? MobileKeychain.read(), let owner = stored["account_id"] as? NSNumber, owner.int64Value == Int64(call.getDouble("accountId") ?? 0) else { call.reject("Account changed; retry the request"); return }
        MobileLocal.save(call.getObject("preferences") ?? [:], key: "playback-preferences")
        MobileLocal.mergeFeedback(call.getObject("feedback") ?? [:])
        if let history = call.getArray("history") { MobileLocal.save(history, key: "playback-history") }
        if let likes = call.getArray("likes") { MobileLocal.save(likes, key: "playback-likes") }
        call.resolve()
    }
    @objc func download(_ call: CAPPluginCall) { task(call) { guard let track = call.getObject("track") else { throw MobileFailure.message("Invalid track") }; try await MobileDownloads.shared.download(track); return nil } }
    @objc func downloads(_ call: CAPPluginCall) { task(call) { ["items": try await MainActor.run { try MobileDownloads.shared.list() }] } }
    @objc func removeDownload(_ call: CAPPluginCall) { task(call) { try await MainActor.run { try MobileDownloads.shared.remove(Int64(call.getDouble("id") ?? 0)) }; return nil } }
}

class FastcloudViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() { bridge?.registerPluginInstance(FastcloudPlugin()) }
}
