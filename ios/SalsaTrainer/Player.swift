import SwiftUI
import AVFoundation
import Combine

@MainActor final class LearningPlayer: ObservableObject {
    let player = AVPlayer()
    @Published var index = 0
    @Published var playing = false
    @Published var position: Double = 0
    @Published var duration: Double = 0
    @Published var speed: Float = 1
    @Published var crop = false
    @Published var landscape = false
    @Published var fullLoop = false
    @Published var range = LoopRange()
    @Published var error: String?
    private var token: Any?
    private var ended: NSObjectProtocol?
    private var observation: NSKeyValueObservation?
    private var seeking = false
    private var seekVersion = 0
    let figure: Figure
    let root: URL?
    init(figure: Figure, root: URL?) {
        self.figure = figure; self.root = root
        token = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.03, preferredTimescale: 600), queue: .main) { [weak self] time in
            Task { @MainActor [weak self] in self?.tick(time.seconds) }
        }
        ended = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: nil, queue: .main) { [weak self] note in
            guard let item = note.object as? AVPlayerItem else { return }
            Task { @MainActor [weak self] in
                guard let self, item === self.player.currentItem else { return }
                if let target = self.range.seekTarget(at: self.duration, ended: true) { self.seek(target, resume: true) }
                else if self.fullLoop { self.seek(0, resume: true) }
                else { self.pause() }
            }
        }
        select(0, autoplay: false)
    }
    func select(_ value: Int, autoplay: Bool = true) {
        guard figure.videos.indices.contains(value), let root else { error = "Kein Video verfügbar."; return }
        seekVersion += 1; seeking = false
        player.pause(); playing = autoplay; index = value; range = LoopRange(); position = 0; duration = 0; error = nil
        do {
            let url = try LibraryDisk.safeURL(figure.videos[value].fileName, root: root)
            guard FileManager.default.fileExists(atPath: url.path) else { throw SalsaError.message("Die lokale Videodatei fehlt.") }
            let item = AVPlayerItem(url: url)
            observation?.invalidate()
            observation = item.observe(\.status, options: [.initial, .new]) { [weak self] item, _ in
                Task { @MainActor [weak self] in
                    guard let self, item === self.player.currentItem else { return }
                    if item.status == .readyToPlay {
                        let seconds = item.duration.seconds
                        self.duration = seconds.isFinite ? seconds : 0
                        if self.playing { self.play() }
                    } else if item.status == .failed { self.error = item.error?.localizedDescription ?? "Video nicht abspielbar."; self.pause() }
                }
            }
            player.replaceCurrentItem(with: item)
            // status may already be ready before the observation's asynchronous callback runs.
        } catch { self.error = error.localizedDescription; pause() }
    }
    func play() {
        guard player.currentItem?.status == .readyToPlay else { return }
        if duration > 0, position >= duration { seek(range.b != nil ? (range.a ?? 0) : 0, resume: true); return }
        playing = true; player.playImmediately(atRate: speed); UIApplication.shared.isIdleTimerDisabled = true
    }
    func pause() { player.pause(); playing = false; UIApplication.shared.isIdleTimerDisabled = false }
    func setSpeed(_ value: Float) { speed = value; if playing { player.rate = value } }
    func seek(_ value: Double, resume: Bool? = nil) {
        let shouldResume = resume ?? playing
        seekVersion += 1
        let version = seekVersion
        seeking = true; playing = shouldResume; player.pause()
        let target = max(0, min(duration, value)); position = target
        player.seek(to: CMTime(seconds: target, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, version == self.seekVersion else { return }; self.seeking = false
                if self.playing { self.play() }
            }
        }
    }
    private func tick(_ value: Double) {
        guard value.isFinite, !seeking else { return }
        position = value
        if playing, let target = range.seekTarget(at: value) { seek(target, resume: true) }
    }
    func stop() {
        pause(); observation?.invalidate(); observation = nil
        if let token { player.removeTimeObserver(token); self.token = nil }
        if let ended { NotificationCenter.default.removeObserver(ended); self.ended = nil }
        player.replaceCurrentItem(with: nil)
    }
    deinit {
        if let token { player.removeTimeObserver(token) }
        if let ended { NotificationCenter.default.removeObserver(ended) }
        observation?.invalidate()
    }
}

final class PlayerSurface: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }
    var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
}
struct PlayerCanvas: UIViewRepresentable {
    let player: AVPlayer
    let crop: Bool
    func makeUIView(context: Context) -> PlayerSurface { let view = PlayerSurface(); view.backgroundColor = .black; return view }
    func updateUIView(_ view: PlayerSurface, context: Context) { view.playerLayer.player = player; view.playerLayer.videoGravity = crop ? .resizeAspectFill : .resizeAspect }
    static func dismantleUIView(_ view: PlayerSurface, coordinator: ()) { view.playerLayer.player = nil }
}

struct LearningScreen: View {
    @StateObject private var model: LearningPlayer
    @Environment(\.scenePhase) private var scenePhase
    let finish: () -> Void
    @State private var orientationError: String?
    init(figure: Figure, root: URL?, finish: @escaping () -> Void) {
        _model = StateObject(wrappedValue: LearningPlayer(figure: figure, root: root)); self.finish = finish
    }
    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Button { model.stop(); OrientationControl.set(false); finish() } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }.accessibilityLabel("Zurück")
                Text(model.figure.title).font(.headline).lineLimit(1); Spacer()
                Button { model.landscape.toggle(); OrientationControl.set(model.landscape) { message in model.landscape.toggle(); orientationError = message } } label: { Image(systemName: "rotate.right").frame(width: 44, height: 44) }.accessibilityLabel("Hochformat / Querformat").accessibilityIdentifier("rotateVideo")
            }
            if model.figure.videos.count > 1 {
                Picker("Video", selection: Binding(get: { model.index }, set: { model.select($0) })) {
                    ForEach(Array(model.figure.videos.enumerated()), id: \.element.id) { index, video in
                        Text(video.title.isEmpty ? "Video \(index + 1)" : video.title).tag(index)
                    }
                }.pickerStyle(.menu).accessibilityIdentifier("videoSelector")
            }
            PlayerCanvas(player: model.player, crop: model.crop).frame(maxWidth: .infinity, maxHeight: .infinity).clipped()
            if let error = model.error { Text(error).font(.caption).foregroundStyle(.red) }
            Slider(value: Binding(get: { min(model.position, max(model.duration, 0.01)) }, set: { model.seek($0) }), in: 0...max(model.duration, 0.01))
                .accessibilityLabel("Videoposition")
            HStack {
                Text(time(model.position)); Spacer(); Text(time(model.duration))
            }.font(.caption.monospacedDigit())
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 16) {
                    Button { model.seek(LoopRange.rewind(model.position)) } label: { Image(systemName: "gobackward.5") }.accessibilityLabel("5 Sekunden zurück")
                    Button { if model.playing { model.pause() } else { model.play() } } label: { Image(systemName: model.playing ? "pause.fill" : "play.fill") }.accessibilityLabel(model.playing ? "Pause" : "Abspielen")
                    Menu("\(String(format: "%g", model.speed))×") { ForEach([Float(0.25), 0.5, 0.75, 1], id: \.self) { value in Button("\(String(format: "%g", value))×") { model.setSpeed(value) } } }
                    Button(model.crop ? "Crop" : "Fit") { model.crop.toggle() }.accessibilityIdentifier("scaleVideo")
                    Button(model.fullLoop ? "Loop ✓" : "Loop") { model.fullLoop.toggle(); if model.fullLoop { model.range = LoopRange() } }
                    Button("A") { model.fullLoop = false; model.range.setA(model.position) }
                    Button("B") { model.fullLoop = false; model.range.setB(model.position) }.disabled(model.range.a == nil || model.position <= (model.range.a ?? 0) + 0.1)
                    Button("A–B löschen") { model.range = LoopRange() }.disabled(model.range.a == nil)
                }.buttonStyle(.bordered).padding(.vertical, 2)
            }
            if let a = model.range.a { Text("A \(time(a)) · B \(model.range.b.map(time) ?? "–")").font(.caption).foregroundStyle(Palette.peach) }
            if !model.figure.description.isEmpty && !model.landscape { ScrollView { Text(model.figure.description).frame(maxWidth: .infinity, alignment: .leading) }.frame(maxHeight: 90) }
        }.padding(.horizontal).background(.black).preferredColorScheme(.dark).tint(Palette.lavender)
            .onAppear { OrientationControl.set(false) }
            .onDisappear { model.stop(); OrientationControl.set(false) }
            .onChange(of: scenePhase) { _, phase in if phase != .active { model.pause() } }
            .alert("Ausrichtung", isPresented: Binding(get: { orientationError != nil }, set: { if !$0 { orientationError = nil } })) {
                Button("OK") { orientationError = nil }
            } message: { Text(orientationError ?? "") }
    }
    private func time(_ seconds: Double) -> String { let value = Int(max(0, seconds.isFinite ? seconds : 0)); return String(format: "%d:%02d", value / 60, value % 60) }
}
