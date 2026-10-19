import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import AVKit

/// Provider URLs expire when the completion handler returns. Only temporary staging
/// is copied here; permanent library files are committed after explicit confirmation.
enum MovieImport {
    static func stage(_ provider: NSItemProvider, directory: URL) async throws -> VideoDraft {
        guard provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier) else {
            throw SalsaError.message("Bitte ausschließlich Videos auswählen.")
        }
        let suggestedName = provider.suggestedName
        return try await withCheckedThrowingContinuation { continuation in
            provider.loadFileRepresentation(forTypeIdentifier: UTType.movie.identifier) { url, error in
                do {
                    if let error { throw error }
                    guard let url else { throw SalsaError.message("Das Video konnte nicht gelesen werden.") }
                    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                    let target = directory.appendingPathComponent(UUID().uuidString).appendingPathExtension(url.pathExtension)
                    try FileManager.default.copyItem(at: url, to: target)
                    let name = suggestedName ?? url.deletingPathExtension().lastPathComponent
                    continuation.resume(returning: VideoDraft(source: target, title: (name as NSString).deletingPathExtension))
                } catch { continuation.resume(throwing: error) }
            }
        }
    }
}

struct MoviePicker: UIViewControllerRepresentable {
    let completion: ([NSItemProvider]) -> Void
    func makeUIViewController(context: Context) -> PHPickerViewController {
        var config = PHPickerConfiguration(); config.filter = .videos; config.selectionLimit = 0
        config.preferredAssetRepresentationMode = .current
        let picker = PHPickerViewController(configuration: config); picker.delegate = context.coordinator
        return picker
    }
    func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(completion) }
    class Coordinator: NSObject, PHPickerViewControllerDelegate {
        let completion: ([NSItemProvider]) -> Void
        init(_ completion: @escaping ([NSItemProvider]) -> Void) { self.completion = completion }
        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            completion(results.map(\.itemProvider))
        }
    }
}

struct FilesPicker: UIViewControllerRepresentable {
    let completion: ([URL]) -> Void
    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.movie], asCopy: true)
        picker.allowsMultipleSelection = true; picker.delegate = context.coordinator; return picker
    }
    func updateUIViewController(_ controller: UIDocumentPickerViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(completion) }
    class Coordinator: NSObject, UIDocumentPickerDelegate {
        let completion: ([URL]) -> Void
        init(_ completion: @escaping ([URL]) -> Void) { self.completion = completion }
        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { completion(urls) }
        func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { completion([]) }
    }
}

@MainActor final class PreviewModel: ObservableObject {
    let player: AVPlayer
    @Published var ready = false
    @Published var error: String?
    private var observation: NSKeyValueObservation?
    init(url: URL) {
        let item = AVPlayerItem(url: url); player = AVPlayer(playerItem: item)
        observation = item.observe(\.status, options: [.initial, .new]) { [weak self] item, _ in
            Task { @MainActor [weak self] in
                self?.ready = item.status == .readyToPlay
                if item.status == .failed { self?.error = item.error?.localizedDescription ?? "Video nicht abspielbar." }
            }
        }
    }
    deinit { observation?.invalidate(); player.pause() }
}

struct PreviewScreen: View {
    @StateObject private var model: PreviewModel
    @Environment(\.scenePhase) private var scenePhase
    let title: String
    let accept: () -> Void
    let cancel: () -> Void
    init(url: URL, title: String, accept: @escaping () -> Void, cancel: @escaping () -> Void) {
        _model = StateObject(wrappedValue: PreviewModel(url: url)); self.title = title
        self.accept = accept; self.cancel = cancel
    }
    var body: some View {
        VStack(spacing: 20) {
            HStack { Button(action: cancel) { Label("Zurück", systemImage: "chevron.left") }; Spacer(); Text("Video prüfen").bold() }
            Text(title).font(.title2)
            VideoPlayer(player: model.player).frame(maxHeight: .infinity)
            Text("Spiele das Video zur Kontrolle ab. Erst nach deiner Bestätigung und dem Speichern wird es übernommen.")
                .font(.callout).foregroundStyle(.secondary)
            if let error = model.error { Text(error).foregroundStyle(.red) }
            Button("Video übernehmen") { model.player.pause(); accept() }
                .buttonStyle(.borderedProminent).disabled(!model.ready)
        }.padding().background(Palette.background).onDisappear { model.player.pause() }
            .onChange(of: scenePhase) { _, phase in if phase != .active { model.player.pause() } }
            .interactiveDismissDisabled()
    }
}
