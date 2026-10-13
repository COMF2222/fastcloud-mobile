import Foundation
import AVFoundation
import MediaPlayer
import UIKit

@MainActor final class MobilePlayback {
    static let shared = MobilePlayback()
    private var player = AVQueuePlayer()
    private var timer: Timer?
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?
    private var secondary: AVPlayer?
    private var fadeStart: Date?
    private var fadeDuration: Double = 0
    private var fadePosition: Double = 0
    private var handoffRunning = false
    private var wantsToPlay = false
    private var restoreStarted = false
    private var preload: Task<Void, Never>?
    private var epoch = 0
    private var ticks = 0
    private var previousPosition: Double = 0
    private var previousTime = Date()
    private var heardMs: Int64 = 0
    private var counted = false
    private var itemTracks: [AVPlayerItem: Int64] = [:]
    private var loading = false
    private var error: String?
    private var queue: [[String: Any]] = []
    private var index = 0
    private var speed: Float = 1
    private var shuffle = false
    private var repeatMode = 0
    private var stationVariation = 0
    private var extending = false
    private var preferences: [String: Any] { MobileLocal.dictionary("playback-preferences") }
    private var feedback: [String: [String: Any]] { MobileLocal.dictionary("playback-feedback") as? [String: [String: Any]] ?? [:] }
    private init() {
        player.automaticallyWaitsToMinimizeStalling = true
        do { try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: []) } catch { self.error = "Audio unavailable" }
        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 1, preferredTimescale: 1000), queue: .main) { [weak self] _ in Task { @MainActor in self?.tick() } }
        endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: nil, queue: .main) { [weak self] note in Task { @MainActor in self?.ended(note.object as? AVPlayerItem) } }
        NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in Task { @MainActor in
            guard let self, let type = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt else { return }
            if type == AVAudioSession.InterruptionType.began.rawValue { self.wantsToPlay = false; self.player.pause(); self.secondary?.pause() }
            else if let options = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt, AVAudioSession.InterruptionOptions(rawValue: options).contains(.shouldResume) { self.wantsToPlay = true; self.player.playImmediately(atRate: self.speed); if self.fadeStart != nil { self.secondary?.playImmediately(atRate: self.speed) } }
        } }
        NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in Task { @MainActor in if (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt) == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue { self?.wantsToPlay = false; self?.player.pause(); self?.secondary?.pause() } } }
        let commands = MPRemoteCommandCenter.shared()
        commands.playCommand.addTarget { [weak self] _ in Task { @MainActor in try? await self?.control("play") }; return .success }
        commands.pauseCommand.addTarget { [weak self] _ in Task { @MainActor in try? await self?.control("pause") }; return .success }
        commands.nextTrackCommand.addTarget { [weak self] _ in Task { @MainActor in try? await self?.control("next") }; return .success }
        commands.previousTrackCommand.addTarget { [weak self] _ in Task { @MainActor in try? await self?.control("previous") }; return .success }
        commands.changePlaybackPositionCommand.addTarget { [weak self] event in guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }; Task { @MainActor in try? await self?.control("seek", value: event.positionTime * 1000) }; return .success }
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in Task { @MainActor in self?.transitionTick() } }
    }
    private func id(_ track: [String: Any]) -> Int64 { (track["id"] as? NSNumber)?.int64Value ?? 0 }
    private func normalized(_ text: String) -> String { text.precomposedStringWithCompatibilityMapping.lowercased().filter { $0.isLetter || $0.isNumber } }
    private func artist(_ track: [String: Any]) -> String { let metadata = track["publisher_metadata"] as? [String: Any], user = track["user"] as? [String: Any]; return [metadata?["artist"], track["metadata_artist"], user?["username"]].compactMap { $0 as? String }.first { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty } ?? "" }
    private func blocked(_ track: [String: Any]) -> Bool { feedback.values.contains { value in
        guard value["disliked"] as? Bool == true, let other = value["track"] as? [String: Any] else { return false }
        if (other["id"] as? NSNumber)?.int64Value == id(track) { return true }
        return normalized(other["title"] as? String ?? "") == normalized(track["title"] as? String ?? "") && normalized(other["artist"] as? String ?? "") == normalized(artist(track)) && abs(((other["durationMs"] as? NSNumber)?.int64Value ?? 0) - ((track["duration"] as? NSNumber)?.int64Value ?? 0)) < 10000
    } }
    func play(_ tracks: [[String: Any]], at selected: Int, recommended: Bool? = nil, start: Bool = true) async throws {
        guard tracks.indices.contains(selected) else { throw MobileFailure.message("Queue is empty") }
        epoch += 1; let current = epoch; preload?.cancel(); cancelFade(); player.pause(); player.removeAllItems(); itemTracks.removeAll()
        queue = tracks.map { row in var value = row; if let recommended { value["_recommended"] = recommended }; return value }; index = selected; heardMs = 0; counted = false; loading = true; error = nil; wantsToPlay = start; restoreStarted = true
        do { try AVAudioSession.sharedInstance().setActive(true); try await fill(current, count: 1); guard epoch == current else { return }; if start { player.playImmediately(atRate: speed) }; loading = false; saveQueue(); updateNowPlaying(); preload = Task { try? await fill(current); await extend() } }
        catch { loading = false; self.error = "Playback temporarily unavailable"; throw error }
    }
    private func fill(_ current: Int, count: Int = 3) async throws {
        guard current == epoch, queue.indices.contains(index) else { return }
        for track in queue[index..<min(queue.count, index + count)] {
            let trackId = id(track); if itemTracks.values.contains(trackId) { continue }
            let local = try MobileDownloads.shared.local(trackId)
            let url: URL
            if let local { url = local } else { url = try await MobileGateway.shared.stream(trackId) }
            guard current == epoch, !Task.isCancelled else { return }
            let item = AVPlayerItem(url: url)
            item.preferredForwardBufferDuration = 30
            itemTracks[item] = trackId
            player.insert(item, after: nil)
        }
    }
    private func ended(_ item: AVPlayerItem?) {
        if handoffRunning { return }
        guard let item, itemTracks[item] != nil else { return }
        if fadeStart != nil { player.pause(); finishFade(); return }
        itemTracks.removeValue(forKey: item)
        if repeatMode == 1 { Task { try? await play(queue, at: index) }; return }
        index += 1; heardMs = 0; counted = false; previousPosition = 0
        if index >= queue.count {
            if repeatMode == 2 { Task { try? await play(queue, at: 0) } }
            else { Task { await extend(); if index < queue.count { try? await play(queue, at: index) } } }
            return
        }
        let current = epoch
        preload = Task { try? await fill(current); await extend() }
        saveQueue(); updateNowPlaying()
    }
    private func extend() async {
        guard !extending, queue.count - index < 5, let track = queue.last else { return }
        let station = track["_station"] as? [String: Any]
        guard station != nil || preferences["autoplay"] as? Bool != false else { return }
        extending = true
        defer { extending = false }
        let currentEpoch = epoch
        do {
            let seeds = (station?["seeds"] as? [[String: Any]] ?? [track]).filter { !blocked($0) }
            guard !seeds.isEmpty else { return }
            var pages: [[[String: Any]]] = []
            for position in 0..<min(4, seeds.count) {
                let seed = seeds[(stationVariation * 4 + position) % seeds.count]
                let result = try? await MobileGateway.shared.json("/v1/soundcloud/api/tracks/soundcloud%3Atracks%3A\(id(seed))/related?limit=50&access=playable&linked_partitioning=true")
                guard currentEpoch == epoch else { return }
                pages.append(result?["collection"] as? [[String: Any]] ?? [])
            }
            stationVariation += 1
            var candidates: [[String: Any]] = []
            for position in 0..<(pages.map(\.count).max() ?? 0) { for page in pages where page.indices.contains(position) { candidates.append(page[position]) } }
            let own = Set(seeds.map { normalized(artist($0)) })
            let artistStation = station?["kind"] as? String == "artist"
            var primary = station == nil ? [] : seeds
            if artistStation { primary += candidates.filter { own.contains(normalized(artist($0))) }; candidates.removeAll { own.contains(normalized(artist($0))) } }
            var existing = Set(queue.map(id))
            var artists: [String: Int] = [:]
            var recordings = Set(queue.map { normalized($0["title"] as? String ?? "") + ":" + normalized(artist($0)) })
            var added = 0, lastArtist = normalized(artist(track))
            while added < 24 && (!primary.isEmpty || !candidates.isEmpty) {
                let usePrimary = added % 3 == 2 && !primary.isEmpty || candidates.isEmpty
                var pool = usePrimary ? primary : candidates
                let alternative = usePrimary ? !candidates.isEmpty : !primary.isEmpty
                guard !pool.isEmpty else { break }
                var candidate = pool.removeFirst()
                if usePrimary { primary = pool } else { candidates = pool }
                if candidate["id"] == nil, let urn = candidate["urn"] as? String, let value = Int64(urn.split(separator: ":").last ?? "") { candidate["id"] = value }
                let performer = normalized(artist(candidate))
                let recording = normalized(candidate["title"] as? String ?? "") + ":" + performer
                let playable = !["SNIP", "BLOCK"].contains(candidate["policy"] as? String ?? "") && !["preview", "blocked"].contains(candidate["access"] as? String ?? "")
                let limit = artistStation && own.contains(performer) ? 8 : 2
                if id(candidate) > 0 && playable && !existing.contains(id(candidate)) && !recordings.contains(recording) && !blocked(candidate) && (artists[performer] ?? 0) < limit && (!alternative || lastArtist != performer) {
                    candidate["_recommended"] = true; candidate["_station"] = station
                    queue.append(candidate); existing.insert(id(candidate)); recordings.insert(recording); artists[performer, default: 0] += 1; lastArtist = performer; added += 1
                }
            }
            saveQueue()
            try await fill(currentEpoch)
        } catch { }
    }
    private func tick() {
        let now = Date(), position = player.currentTime().seconds, delta = now.timeIntervalSince(previousTime)
        if position.isFinite, player.rate > 0, player.timeControlStatus == .playing, delta > 0, delta <= 2, abs(position - previousPosition - delta * Double(speed)) < 2, queue.indices.contains(index) {
            let elapsed = Int64(delta * 1000); heardMs += elapsed
            let duration = player.currentItem?.duration.seconds ?? 0
            let threshold = duration.isFinite && duration > 0 ? min(30000, Int64(duration * 500)) : 30000
            let newly = !counted && heardMs >= threshold; if newly { counted = true }
            let track = queue[index]
            Task { try? await MobileListening.shared.add(track, ms: elapsed, counted: newly) }
        }
        previousTime = now; previousPosition = position.isFinite ? position : 0
        let sleep = UserDefaults.standard.double(forKey: "sleep")
        if sleep > 0 && now.timeIntervalSince1970 >= sleep { wantsToPlay = false; player.pause(); secondary?.pause(); UserDefaults.standard.removeObject(forKey: "sleep") }
        ticks += 1
        if ticks % 30 == 0 { Task {
            let owner = (try? MobileKeychain.read()?["account_id"] as? NSNumber)?.int64Value ?? 0
            try? await MobileListening.shared.sync()
            if let remote = try? await MobileGateway.shared.json("/v1/me/personal") {
                MobileLocal.mergeRemote(remote, owner: owner)
            }
        } }
        if ticks % 5 == 0, queue.indices.contains(index + 1) {
            let currentId = id(queue[index])
            let count = queue.count
            queue = queue.enumerated().filter { position, track in position <= index || track["_recommended"] as? Bool != true || !blocked(track) }.map(\.element)
            if queue.count != count, queue.indices.contains(index), id(queue[index]) == currentId { rebuildUpcoming() }
        }
        updateNowPlaying()
    }
    private func transitionTick() {
        let seconds = max(0, min(8, ((preferences["crossfade_ms"] as? NSNumber)?.doubleValue ?? 0) / 1000))
        guard !handoffRunning, seconds > 0, queue.indices.contains(index + 1), player.rate > 0, repeatMode != 1, UserDefaults.standard.double(forKey: "sleep") == 0 else { return }
        if let fadeStart, let secondary {
            let progress = max(0, min(1, (player.currentTime().seconds - fadePosition) / max(0.1, fadeDuration)))
            player.volume = Float(cos(progress * .pi / 2)); secondary.volume = Float(sin(progress * .pi / 2))
            if progress >= 1 { finishFade() }
            return
        }
        guard let current = player.currentItem else { return }
        let duration = current.duration.seconds, remaining = duration - player.currentTime().seconds
        guard duration.isFinite, remaining > 0, remaining < 30, player.items().count > 1 else { return }
        if secondary == nil {
            let next = player.items()[1]
            let item = AVPlayerItem(asset: next.asset); item.preferredForwardBufferDuration = 15
            let candidate = AVPlayer(playerItem: item); candidate.automaticallyWaitsToMinimizeStalling = true
            candidate.volume = 0; secondary = candidate
            candidate.preroll(atRate: speed) { _ in }
        }
        if let candidate = secondary, candidate.currentItem?.status == .readyToPlay, remaining <= min(seconds, duration / 2) {
            fadeDuration = remaining; fadePosition = player.currentTime().seconds; fadeStart = Date(); candidate.playImmediately(atRate: speed)
        }
    }
    private func finishFade() {
        guard let secondary, !handoffRunning else { return }
        handoffRunning = true; self.secondary = nil; fadeStart = nil
        let currentEpoch = epoch
        let position = secondary.currentTime(); let nextId = queue.indices.contains(index + 1) ? id(queue[index + 1]) : 0
        if let current = player.currentItem, itemTracks[current] != nextId { player.advanceToNextItem() }
        index = min(queue.count - 1, index + 1); heardMs = 0; counted = false
        player.seek(to: position, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] finished in Task { @MainActor in
            secondary.pause()
            guard let self, finished, currentEpoch == self.epoch else { return }; self.handoffRunning = false; self.player.volume = 1; if self.wantsToPlay { self.player.playImmediately(atRate: self.speed) }; self.previousPosition = position.seconds
            try? await self.fill(self.epoch); self.updateNowPlaying()
        } }
    }
    private func cancelFade() { secondary?.pause(); secondary = nil; fadeStart = nil; handoffRunning = false; player.volume = 1 }
    func control(_ action: String, value: Double = 0, selected: Int = 0, target: Int = 0) async throws {
        switch action {
        case "toggle": if wantsToPlay { wantsToPlay = false; player.pause(); secondary?.pause() } else { wantsToPlay = true; if player.currentItem?.status == .failed { try await play(queue, at: index) } else { player.playImmediately(atRate: speed); if fadeStart != nil { secondary?.playImmediately(atRate: speed) } } }
        case "play": wantsToPlay = true; player.playImmediately(atRate: speed); if fadeStart != nil { secondary?.playImmediately(atRate: speed) }
        case "pause": wantsToPlay = false; player.pause(); secondary?.pause()
        case "seek": cancelFade(); await player.seek(to: CMTime(seconds: max(0, value / 1000), preferredTimescale: 1000)); previousPosition = value / 1000
        case "next": cancelFade(); if queue.indices.contains(index + 1) { try await play(queue, at: index + 1) }
        case "previous": cancelFade(); if player.currentTime().seconds > 3 { await player.seek(to: .zero) } else { try await play(queue, at: max(0, index - 1)) }
        case "previous_track": cancelFade(); try await play(queue, at: max(0, index - 1))
        case "jump": try await play(queue, at: selected)
        case "shuffle": shuffle.toggle(); if queue.indices.contains(index + 1) { let suffix = queue[(index + 1)...].shuffled(); queue = Array(queue[...index]) + suffix; rebuildUpcoming() }
        case "repeat": repeatMode = (repeatMode + 1) % 3
        case "speed": speed = Float(max(0.5, min(2, value))); if player.rate > 0 { player.rate = speed }; if secondary?.rate ?? 0 > 0 { secondary?.rate = speed }
        case "volume": player.volume = Float(max(0, min(1, value)))
        case "remove": guard queue.indices.contains(selected) else { return }; if selected == index { queue.remove(at: selected); if !queue.isEmpty { try await play(queue, at: min(index, queue.count - 1)) } else { stop() } } else { queue.remove(at: selected); if selected < index { index -= 1 }; rebuildUpcoming() }
        case "move": guard queue.indices.contains(selected), queue.indices.contains(target), selected != index, target != index else { return }; let track = queue.remove(at: selected); queue.insert(track, at: target); rebuildUpcoming()
        case "sleep": UserDefaults.standard.set(value == 0 ? 0 : Date().timeIntervalSince1970 + value, forKey: "sleep")
        case "eq": throw MobileFailure.message("Equalizer is currently available on Android")
        default: throw MobileFailure.message("Unknown player action")
        }
        saveQueue(); updateNowPlaying()
    }
    func enqueue(_ track: [String: Any], next: Bool) async throws { if queue.isEmpty { try await play([track], at: 0); return }; queue.insert(track, at: next ? index + 1 : queue.count); if next { rebuildUpcoming() }; saveQueue() }
    private func rebuildUpcoming() { cancelFade(); let current = player.currentItem; for item in player.items() where item !== current { player.remove(item); itemTracks.removeValue(forKey: item) }; preload?.cancel(); let currentEpoch = epoch; preload = Task { try? await fill(currentEpoch) } }
    func stop() { epoch += 1; wantsToPlay = false; restoreStarted = false; preload?.cancel(); cancelFade(); player.pause(); player.removeAllItems(); queue = []; index = 0; itemTracks.removeAll(); MPNowPlayingInfoCenter.default().nowPlayingInfo = nil }
    func state() -> [String: Any] {
        if !restoreStarted, let owner = (try? MobileKeychain.read()?["account_id"] as? NSNumber)?.int64Value {
            restoreStarted = true
            if let saved = MobileLocal.array("queue-\(owner)") as? [[String: Any]], !saved.isEmpty {
                let selected = max(0, min(saved.count - 1, UserDefaults.standard.integer(forKey: "queue-index-\(owner)")))
                Task { try? await play(saved, at: selected, start: false) }
            }
        }
        let position = player.currentTime().seconds, duration = player.currentItem?.duration.seconds ?? 0; return ["queue": queue, "index": index, "playing": player.rate > 0 && player.timeControlStatus == .playing, "loading": loading || player.timeControlStatus == .waitingToPlayAtSpecifiedRate, "positionMs": position.isFinite ? Int64(max(0, position * 1000)) : 0, "durationMs": duration.isFinite ? Int64(max(0, duration * 1000)) : 0, "shuffle": shuffle, "repeat": repeatMode, "speed": speed, "error": error as Any? ?? NSNull()]
    }
    private func updateNowPlaying() { guard queue.indices.contains(index) else { return }; let track = queue[index], duration = player.currentItem?.duration.seconds ?? 0; MPNowPlayingInfoCenter.default().nowPlayingInfo = [MPMediaItemPropertyTitle: track["title"] ?? "Veirune", MPMediaItemPropertyArtist: artist(track), MPMediaItemPropertyPlaybackDuration: duration.isFinite ? duration : 0, MPNowPlayingInfoPropertyElapsedPlaybackTime: player.currentTime().seconds.isFinite ? player.currentTime().seconds : 0, MPNowPlayingInfoPropertyPlaybackRate: player.rate] }
    private func saveQueue() { guard let owner = (try? MobileKeychain.read()?["account_id"] as? NSNumber)?.int64Value else { return }; MobileLocal.save(queue, key: "queue-\(owner)"); UserDefaults.standard.set(index, forKey: "queue-index-\(owner)") }
}
