import Foundation
import UIKit
import Network
import CryptoKit

@MainActor final class MobileLogin {
    private var listener: NWListener?
    private var completion: CheckedContinuation<(String, String), Error>?
    private var background: UIBackgroundTaskIdentifier = .invalid
    private var timeout: Task<Void, Never>?
    private var state = ""
    private var verifier = ""
    private var callbackPath = ""
    private func random() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw MobileFailure.message("Could not start sign-in") }
        return Data(bytes).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
    func start() async throws {
        guard completion == nil else { throw MobileFailure.message("Sign-in already open") }
        let config = try await MobileGateway.shared.raw("/v1/config").json()
        guard let redirect = config["redirect_uri"] as? String, let target = URLComponents(string: redirect), ["localhost", "127.0.0.1"].contains(target.host ?? ""), let port = target.port, let client = config["client_id"] as? String else { throw MobileFailure.message("Unsupported server sign-in callback") }
        state = try random(); verifier = try random(); callbackPath = target.path
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: UInt16(port))!)
        let listener = try NWListener(using: parameters, on: NWEndpoint.Port(rawValue: UInt16(port))!)
        self.listener = listener
        let code = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<(String, String), Error>) in
            completion = continuation
            listener.newConnectionHandler = { [weak self] connection in Task { @MainActor in self?.receive(connection) } }
            listener.stateUpdateHandler = { [weak self] status in Task { @MainActor in
                guard let self else { return }
                if case .failed = status { self.finish(.failure(MobileFailure.message("Could not listen for sign-in"))) }
                if case .ready = status {
                    var url = URLComponents(string: "https://secure.soundcloud.com/authorize")!
                    url.queryItems = [URLQueryItem(name: "client_id", value: client), URLQueryItem(name: "redirect_uri", value: redirect), URLQueryItem(name: "response_type", value: "code"), URLQueryItem(name: "code_challenge_method", value: "S256"), URLQueryItem(name: "code_challenge", value: challenge), URLQueryItem(name: "state", value: self.state)]
                    UIApplication.shared.open(url.url!)
                }
            } }
            background = UIApplication.shared.beginBackgroundTask { [weak self] in self?.finish(.failure(MobileFailure.message("Return to Veirune and try signing in again"))) }
            timeout = Task { [weak self] in try? await Task.sleep(nanoseconds: 180_000_000_000); if !Task.isCancelled { self?.finish(.failure(MobileFailure.message("Sign-in expired"))) } }
            listener.start(queue: .main)
        }
        try await MobileGateway.shared.completeLogin(code: code.0, verifier: code.1)
    }
    private func receive(_ connection: NWConnection) {
        connection.start(queue: .main)
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] data, _, _, _ in Task { @MainActor in
            guard let self, let data, let text = String(data: data, encoding: .utf8), let line = text.components(separatedBy: "\r\n").first else { connection.cancel(); return }
            let parts = line.split(separator: " ")
            guard parts.count >= 2, let url = URLComponents(string: "http://127.0.0.1" + parts[1]), url.path == self.callbackPath else { connection.cancel(); return }
            let query = Dictionary(url.queryItems?.map { ($0.name, $0.value ?? "") } ?? [], uniquingKeysWith: { first, _ in first })
            let valid = query["state"] == self.state
            let body = Data((valid ? "Sign-in complete. Return to Veirune." : "Invalid sign-in callback").utf8)
            var reply = Data("HTTP/1.1 \(valid ? "200 OK" : "400 Bad Request")\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\nContent-Length: \(body.count)\r\n\r\n".utf8)
            reply.append(body)
            connection.send(content: reply, completion: .contentProcessed { _ in connection.cancel() })
            if valid, let code = query["code"], !code.isEmpty { self.finish(.success((code, self.verifier))) }
            else if valid { self.finish(.failure(MobileFailure.message("SoundCloud sign-in was cancelled"))) }
        } }
    }
    private func finish(_ result: Result<(String, String), Error>) {
        guard let completion else { return }; self.completion = nil
        listener?.cancel(); listener = nil; timeout?.cancel(); timeout = nil
        if background != .invalid { UIApplication.shared.endBackgroundTask(background); background = .invalid }
        completion.resume(with: result)
    }
}
