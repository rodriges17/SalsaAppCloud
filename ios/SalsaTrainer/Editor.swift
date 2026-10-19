import SwiftUI
import AVFoundation

@MainActor final class EditorSession: ObservableObject {
    let initial: Figure?
    let initialDrafts: [VideoDraft]
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    @Published var figure: Figure
    @Published var drafts: [VideoDraft]
    @Published var busy = false
    @Published var error: String?
    init(figure: Figure?, incoming: [VideoDraft] = []) {
        initial = figure
        self.figure = figure ?? Figure(title: incoming.first?.title ?? "")
        initialDrafts = (figure?.videos ?? []).map { VideoDraft(existing: $0) }
        drafts = initialDrafts + incoming
    }
    var dirty: Bool { initial == nil ? !figure.title.isEmpty || !figure.description.isEmpty || !drafts.isEmpty || !figure.tags.isEmpty || figure.status != .new : figure != initial || drafts != initialDrafts }
    var savable: Bool { !busy && !figure.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !drafts.isEmpty && drafts.allSatisfy(\.confirmed) }
    func add(_ providers: [NSItemProvider], replacing: UUID?) async {
        guard !providers.isEmpty else { return }
        busy = true
        defer { busy = false }
        do {
            var items: [VideoDraft] = []
            for provider in providers { items.append(try await MovieImport.stage(provider, directory: directory)) }
            // A replacement stays pending until the preview is accepted.
            if let replacing, let candidate = items.first { pendingReplacement = (replacing, candidate) }
            else { drafts.append(contentsOf: items) }
        } catch { self.error = error.localizedDescription }
    }
    @Published var pendingReplacement: (UUID, VideoDraft)?
    func addFiles(_ urls: [URL], replacing: UUID?) async {
        busy = true; defer { busy = false }
        do {
            var items: [VideoDraft] = []
            for url in urls {
                let sourceURL = url; let destination = directory.appendingPathComponent(UUID().uuidString).appendingPathExtension(url.pathExtension)
                try await Task.detached {
                    try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
                    let access = sourceURL.startAccessingSecurityScopedResource()
                    defer { if access { sourceURL.stopAccessingSecurityScopedResource() } }
                    try FileManager.default.copyItem(at: sourceURL, to: destination)
                }.value
                items.append(VideoDraft(source: destination, title: url.deletingPathExtension().lastPathComponent))
            }
            if let replacing, let candidate = items.first { pendingReplacement = (replacing, candidate) }
            else { drafts.append(contentsOf: items) }
        } catch { self.error = error.localizedDescription }
    }
    deinit { try? FileManager.default.removeItem(at: directory) }
}

struct EditorScreen: View {
    @ObservedObject var store: FigureStore
    @StateObject private var session: EditorSession
    let finish: () -> Void
    @State private var tagsText: String
    @State private var photos = false
    @State private var files = false
    @State private var discard = false
    @State private var replacing: UUID?
    @State private var preview: VideoDraft?
    @State private var reviewAll = false
    init(store: FigureStore, figure: Figure?, incoming: [VideoDraft] = [], finish: @escaping () -> Void) {
        self.store = store; self.finish = finish
        _session = StateObject(wrappedValue: EditorSession(figure: figure, incoming: incoming))
        _tagsText = State(initialValue: figure?.tags.joined(separator: ", ") ?? "")
    }
    private func back() { if session.busy { return }; if session.dirty { discard = true } else { finish() } }
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button(action: back) { Image(systemName: "chevron.left").frame(width: 44, height: 44) }.accessibilityLabel("Zurück")
                Text(session.initial == nil ? "Figur hinzufügen" : "Figur bearbeiten").font(.title3.bold()); Spacer()
            }.padding(.horizontal)
            Form {
                figureSection
                videosSection
                if let error = session.error { Section { Text(error).foregroundStyle(.red) } }
            }.scrollContentBackground(.hidden)
            VStack {
                if session.busy { ProgressView("Videos werden verarbeitet …") }
                Button("Figur speichern") { save() }.buttonStyle(.borderedProminent).frame(maxWidth: .infinity)
                    .disabled(!session.savable).accessibilityIdentifier("saveFigure")
            }.padding().background(Palette.background)
        }.background(Palette.background).disabled(session.busy)
            .interactiveDismissDisabled(session.dirty || session.busy)
            .confirmationDialog("Änderungen verwerfen?", isPresented: $discard, titleVisibility: .visible) {
                Button("Änderungen verwerfen", role: .destructive, action: finish)
                Button("Weiter bearbeiten", role: .cancel) {}
            }
            .sheet(isPresented: $photos) {
                MoviePicker { providers in
                    photos = false
                    Task { await session.add(providers, replacing: replacing); showReplacement() }
                }.ignoresSafeArea()
            }
            .sheet(isPresented: $files) {
                FilesPicker { urls in
                    files = false
                    Task { await session.addFiles(urls, replacing: replacing); showReplacement() }
                }
            }
            .sheet(item: $preview, onDismiss: {
                if reviewAll, let next = session.drafts.first(where: { !$0.confirmed }) {
                    Task { @MainActor in preview = next }
                }
            }) { video in
                if let url = video.source ?? video.existing.flatMap({ existing in store.root.flatMap { try? LibraryDisk.safeURL(existing.fileName, root: $0) } }) {
                    PreviewScreen(url: url, title: video.title, accept: { confirm(video); preview = nil }, cancel: { reviewAll = false; session.pendingReplacement = nil; preview = nil })
                        .preferredColorScheme(.dark).tint(Palette.lavender)
                }
            }
    }
    private var figureSection: some View {
Section("Figur") {
                    TextField("Name der Figur", text: $session.figure.title).accessibilityIdentifier("figureTitle")
                    TextField("Beschreibung", text: $session.figure.description, axis: .vertical).lineLimit(3...10)
                    Picker("Lernstand", selection: $session.figure.status) {
                        ForEach(LearningStatus.allCases) { Text($0.rawValue).tag($0) }
                    }
                    TextField("Tags, durch Kommas getrennt", text: $tagsText)
                        .onChange(of: tagsText) { _, value in
                            session.figure.tags = Array(Set(value.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty })).sorted()
                        }
                }
    }
    private var videosSection: some View {
Section("Videos · \(session.drafts.count)") {
                    ForEach($session.drafts) { $video in
                        videoRow($video)
                    }
                    Button("Videos aus Fotos hinzufügen") { replacing = nil; photos = true }
                    Button("Videos aus Dateien hinzufügen") { replacing = nil; files = true }
                    if session.drafts.contains(where: { !$0.confirmed }) {
                        Button("Alle neuen Videos prüfen") { reviewAll = true; preview = session.drafts.first { !$0.confirmed } }
                    }
                }
    }
    private func videoRow(_ binding: Binding<VideoDraft>) -> some View {
        let video = binding.wrappedValue
        return VStack(alignment: .leading, spacing: 12) {
                            TextField("Videoname (optional)", text: binding.title)
                            Text(video.confirmed ? "Bestätigt" : "Vorschau erforderlich").font(.caption).foregroundStyle(video.confirmed ? .green : Palette.peach)
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 16) {
                                    Button("Vorschau") { reviewAll = false; preview = video }
                                    Button("Ersetzen") { replacing = video.id; photos = true }
                                    Button("Datei ersetzen") { replacing = video.id; files = true }
                                    Button { move(video.id, delta: -1) } label: { Image(systemName: "arrow.up") }.accessibilityLabel("Nach oben")
                                    Button { move(video.id, delta: 1) } label: { Image(systemName: "arrow.down") }.accessibilityLabel("Nach unten")
                                    Button("Entfernen", role: .destructive) { session.drafts.removeAll { $0.id == video.id } }.disabled(session.drafts.count <= 1)
                                }.buttonStyle(.borderless)
                            }
                        }.padding(.vertical, 6)
    }
    private func showReplacement() { if let candidate = session.pendingReplacement?.1 { reviewAll = false; preview = candidate } }
    private func confirm(_ video: VideoDraft) {
        var accepted = video; accepted.confirmed = true
        if let replacement = session.pendingReplacement, replacement.1.id == video.id,
           let index = session.drafts.firstIndex(where: { $0.id == replacement.0 }) {
            session.drafts[index] = accepted; session.pendingReplacement = nil
        } else if let index = session.drafts.firstIndex(where: { $0.id == video.id }) { session.drafts[index].confirmed = true }
    }
    private func move(_ id: UUID, delta: Int) {
        guard let index = session.drafts.firstIndex(where: { $0.id == id }), session.drafts.indices.contains(index + delta) else { return }
        session.drafts.swapAt(index, index + delta)
    }
    private func save() {
        session.busy = true; session.error = nil
        Task {
            do { try await store.save(session.figure, drafts: session.drafts, revision: session.initial?.revision); session.busy = false; finish() }
            catch { session.error = error.localizedDescription; session.busy = false }
        }
    }
}
