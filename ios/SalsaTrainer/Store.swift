import Foundation
import AVFoundation
import Combine

/// A single coordinated metadata transaction is used by both app and Share Extension.
/// Failed imports never change the library; original videos are only read.
enum LibraryDisk {
    static var group: String { Bundle.main.object(forInfoDictionaryKey: "AppGroupIdentifier") as? String ?? "group.com.rodriges17.SalsaTrainer" }
    static func defaultRoot() throws -> URL {
        guard let group = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
            throw SalsaError.message("Der gemeinsame App-Speicher ist nicht verfügbar. Bitte App-Group-Signierung prüfen.")
        }
        return group.appendingPathComponent("Library", isDirectory: true)
    }
    static func prepare(_ root: URL) throws {
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        var url = root
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try url.setResourceValues(values)
    }
    static func safeURL(_ name: String, root: URL) throws -> URL {
        guard !name.isEmpty, name == (name as NSString).lastPathComponent,
              name != ".", name != "..", !name.contains("\\") else {
            throw SalsaError.message("Ungültiger Videopfad.")
        }
        return root.appendingPathComponent(name)
    }
    static func coordinated<T>(_ root: URL, write: Bool, body: () throws -> T) throws -> T {
        let file = root.appendingPathComponent("figures.json")
        let coordinator = NSFileCoordinator(filePresenter: nil)
        var coordinationError: NSError?
        var result: Result<T, Error>?
        if write {
            coordinator.coordinate(writingItemAt: file, options: [], error: &coordinationError) { _ in
                result = Result { try body() }
            }
        } else {
            coordinator.coordinate(readingItemAt: file, options: [], error: &coordinationError) { _ in
                result = Result { try body() }
            }
        }
        if let coordinationError { throw coordinationError }
        guard let result else { throw SalsaError.message("Der lokale Speicher ist gerade nicht verfügbar.") }
        return try result.get()
    }
    static func readUncoordinated(_ root: URL) throws -> [Figure] {
        let url = root.appendingPathComponent("figures.json")
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }
        return try JSONDecoder().decode([Figure].self, from: Data(contentsOf: url))
    }
    static func read(_ root: URL) throws -> [Figure] {
        try coordinated(root, write: false) { try readUncoordinated(root) }
    }
    static func write(_ figures: [Figure], root: URL) throws {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(figures).write(to: root.appendingPathComponent("figures.json"), options: .atomic)
    }
    static func validateMovie(_ url: URL) async throws {
        let asset = AVURLAsset(url: url)
        let playable = try await asset.load(.isPlayable)
        let duration = try await asset.load(.duration)
        let tracks = try await asset.loadTracks(withMediaType: .video)
        guard playable, !tracks.isEmpty, duration.seconds.isFinite, duration.seconds > 0 else {
            throw SalsaError.message("Dieses Video ist beschädigt oder wird vom iPhone nicht unterstützt.")
        }
    }
    static func save(root: URL, figure: Figure, drafts: [VideoDraft], originalRevision: UUID?,
                     validate: @escaping (URL) async throws -> Void = validateMovie) async throws {
        guard !figure.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !drafts.isEmpty, drafts.allSatisfy({ $0.confirmed }),
              Set(drafts.map(\.id)).count == drafts.count else {
            throw SalsaError.message("Bitte Titel eintragen, mindestens ein Video hinzufügen und alle neuen Videos bestätigen.")
        }
        var imported: [URL] = []
        var videos: [FigureVideo] = []
        do {
            for draft in drafts {
                if let existing = draft.existing, draft.source == nil {
                    _ = try safeURL(existing.fileName, root: root)
                    videos.append(FigureVideo(id: draft.id, fileName: existing.fileName, title: draft.title))
                } else if let source = draft.source, draft.existing == nil {
                    let ext = source.pathExtension.lowercased()
                    let suffix = ["mov", "mp4", "m4v"].contains(ext) ? ext : "mov"
                    let target = root.appendingPathComponent(UUID().uuidString + "." + suffix)
                    imported.append(target)
                    let access = source.startAccessingSecurityScopedResource()
                    defer { if access { source.stopAccessingSecurityScopedResource() } }
                    try FileManager.default.copyItem(at: source, to: target)
                    try await validate(target)
                    videos.append(FigureVideo(id: draft.id, fileName: target.lastPathComponent, title: draft.title))
                } else { throw SalsaError.message("Ungültiger Videoentwurf.") }
            }
            try coordinated(root, write: true) {
                var current = try readUncoordinated(root)
                let previous = current.first { $0.id == figure.id }
                guard previous?.revision == originalRevision else {
                    throw SalsaError.message("Diese Figur wurde inzwischen geändert. Bitte schließen und erneut öffnen.")
                }
                let allowed = Set(previous?.videos.map(\.fileName) ?? [])
                guard drafts.compactMap(\.existing).allSatisfy({ allowed.contains($0.fileName) }) else {
                    throw SalsaError.message("Ein Video gehört nicht zu dieser Figur.")
                }
                for video in videos {
                    guard FileManager.default.fileExists(atPath: try safeURL(video.fileName, root: root).path) else {
                        throw SalsaError.message("Ein gespeichertes Video fehlt.")
                    }
                }
                var saved = figure; saved.videos = videos; saved.revision = UUID()
                current.removeAll { $0.id == saved.id }; current.append(saved)
                try write(current, root: root)
                let referenced = Set(current.flatMap { $0.videos.map(\.fileName) })
                for old in previous?.videos ?? [] where !referenced.contains(old.fileName) {
                    if let url = try? safeURL(old.fileName, root: root) { try? FileManager.default.removeItem(at: url) }
                }
            }
        } catch {
            for url in imported { try? FileManager.default.removeItem(at: url) }
            throw error
        }
    }
    static func delete(_ figure: Figure, root: URL) throws {
        try coordinated(root, write: true) {
            var current = try readUncoordinated(root)
            guard current.first(where: { $0.id == figure.id })?.revision == figure.revision else {
                throw SalsaError.message("Die Figur wurde inzwischen geändert. Bitte neu laden.")
            }
            current.removeAll { $0.id == figure.id }
            try write(current, root: root)
            let used = Set(current.flatMap { $0.videos.map(\.fileName) })
            for video in figure.videos where !used.contains(video.fileName) {
                if let url = try? safeURL(video.fileName, root: root) { try? FileManager.default.removeItem(at: url) }
            }
        }
    }
}

@MainActor final class FigureStore: ObservableObject {
    @Published var figures: [Figure] = []
    @Published var error: String?
    private(set) var root: URL?
    init(root: URL? = nil) {
        do {
            let resolved = try root ?? LibraryDisk.defaultRoot()
            try LibraryDisk.prepare(resolved); self.root = resolved
            figures = try LibraryDisk.read(resolved)
        } catch { self.error = error.localizedDescription }
    }
    func refresh() {
        guard let root else { return }
        do { figures = try LibraryDisk.read(root) } catch { self.error = error.localizedDescription }
    }
    func save(_ figure: Figure, drafts: [VideoDraft], revision: UUID?) async throws {
        guard let root else { throw SalsaError.message("Kein lokaler Speicher verfügbar.") }
        try await Task.detached(priority: .userInitiated) {
            try await LibraryDisk.save(root: root, figure: figure, drafts: drafts, originalRevision: revision)
        }.value
        refresh()
    }
    func delete(_ figure: Figure) {
        guard let root else { return }
        do { try LibraryDisk.delete(figure, root: root); refresh() } catch { self.error = error.localizedDescription }
    }
}
