import UIKit
import SwiftUI
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private let staging = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    private var loaded = false
    override func viewDidLoad() {
        super.viewDidLoad(); isModalInPresentation = true
        view.backgroundColor = UIColor(red: 23/255, green: 20/255, blue: 31/255, alpha: 1)
        guard !loaded else { return }; loaded = true
        let loading = UIHostingController(rootView: ProgressView("Videos werden vorbereitet …").preferredColorScheme(.dark))
        embed(loading)
        Task { @MainActor in
            do {
                let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
                guard !providers.isEmpty, providers.allSatisfy({ $0.hasItemConformingToTypeIdentifier(UTType.movie.identifier) }) else {
                    throw SalsaError.message("Bitte ein oder mehrere Videos teilen.")
                }
                var drafts: [VideoDraft] = []
                for provider in providers { drafts.append(try await MovieImport.stage(provider, directory: staging)) }
                let store = FigureStore()
                if let error = store.error { throw SalsaError.message(error) }
                let screen = ShareImportScreen(store: store, incoming: drafts) { [weak self] in self?.complete() }
                embed(UIHostingController(rootView: screen.preferredColorScheme(.dark).tint(Palette.lavender)))
            } catch {
                let screen = ShareFailure(message: error.localizedDescription) { [weak self] in self?.complete() }
                embed(UIHostingController(rootView: screen.preferredColorScheme(.dark)))
            }
        }
    }
    private func embed(_ controller: UIViewController) {
        for child in children { child.willMove(toParent: nil); child.view.removeFromSuperview(); child.removeFromParent() }
        addChild(controller); controller.view.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(controller.view)
        NSLayoutConstraint.activate([
            controller.view.leadingAnchor.constraint(equalTo: view.leadingAnchor), controller.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            controller.view.topAnchor.constraint(equalTo: view.topAnchor), controller.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ]); controller.didMove(toParent: self)
    }
    private func complete() {
        try? FileManager.default.removeItem(at: staging)
        extensionContext?.completeRequest(returningItems: nil)
    }
    deinit { try? FileManager.default.removeItem(at: staging) }
}

struct ShareImportScreen: View {
    @ObservedObject var store: FigureStore
    let incoming: [VideoDraft]
    let finish: () -> Void
    @State private var editor: EditRequest?
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack { Text("Zu Salsa Trainer hinzufügen").font(.title2.bold()); Spacer(); Button("Abbrechen", action: finish) }
            Text("\(incoming.count) Video(s) · Wähle eine neue oder bestehende Figur.")
            Button("Neue Figur") { editor = EditRequest(figure: nil) }.buttonStyle(.borderedProminent)
            List(store.figures.sorted { $0.title < $1.title }) { figure in
                Button { editor = EditRequest(figure: figure) } label: {
                    VStack(alignment: .leading) { Text(figure.title); Text("\(figure.videos.count) Videos").font(.caption).foregroundStyle(.secondary) }
                }
            }.scrollContentBackground(.hidden)
        }.padding().background(Palette.background)
            .fullScreenCover(item: $editor) { request in
                EditorScreen(store: store, figure: request.figure, incoming: incoming) { finish() }
            }
    }
}
struct ShareFailure: View {
    let message: String
    let finish: () -> Void
    var body: some View { VStack(spacing: 20) { Text("Import nicht möglich").font(.title2); Text(message); Button("Schließen", action: finish) }.padding() }
}
