import SwiftUI
import AVFoundation

// Colors follow the original Android design supplied by the user.
enum Palette {
    static let background = Color(red: 23/255, green: 20/255, blue: 31/255)
    static let card = Color(red: 54/255, green: 51/255, blue: 61/255)
    static let lavender = Color(red: 205/255, green: 183/255, blue: 247/255)
    static let peach = Color(red: 1, green: 176/255, blue: 151/255)
    static let purple = Color(red: 80/255, green: 53/255, blue: 137/255)
}

struct EditRequest: Identifiable { let id = UUID(); var figure: Figure? }

enum FigureSort: String, CaseIterable { case newest = "Neueste", name = "Name", status = "Lernstand" }

struct OverviewScreen: View {
    @ObservedObject var store: FigureStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var query = ""
    @State private var status: LearningStatus?
    @State private var tag: String?
    @State private var sorting = FigureSort.newest
    @State private var editor: EditRequest?
    @State private var learning: Figure?
    @State private var deleting: Figure?
    var visible: [Figure] {
        store.figures.filter { figure in
            (status == nil || figure.status == status) && (tag == nil || figure.tags.contains(tag!)) &&
            (query.isEmpty || ([figure.title, figure.description] + figure.tags).joined(separator: " ").localizedCaseInsensitiveContains(query))
        }.sorted {
            switch sorting {
            case .name: return $0.title.localizedStandardCompare($1.title) == .orderedAscending
            case .status: return $0.status.rawValue == $1.status.rawValue ? $0.title < $1.title : $0.status.rawValue < $1.status.rawValue
            case .newest: return $0.createdAt > $1.createdAt
            }
        }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Text("Salsa Figuren").font(.largeTitle)
                Spacer()
                Menu("Tags") {
                    Button("Alle Tags") { tag = nil }
                    ForEach(Array(Set(store.figures.flatMap(\.tags))).sorted(), id: \.self) { value in Button(value) { tag = value } }
                }.foregroundStyle(Palette.peach)
            }
            Text("Deine Schritte. Dein Tempo.").font(.title3.bold()).foregroundStyle(Palette.lavender)
            TextField("Figur suchen", text: $query).padding().overlay(RoundedRectangle(cornerRadius: 6).stroke(.gray))
                .accessibilityIdentifier("searchFigures")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    filterButton("Alle Lernstände", selected: status == nil) { status = nil }
                    ForEach(LearningStatus.allCases) { value in filterButton(value.rawValue, selected: status == value) { status = value } }
                }
            }
            if let tag { Button("\(tag) ×") { self.tag = nil }.buttonStyle(.bordered) }
            HStack {
                Text("\(visible.count) Figuren"); Spacer()
                Menu("Sortierung: \(sorting.rawValue)") {
                    ForEach(FigureSort.allCases, id: \.self) { value in Button(value.rawValue) { sorting = value } }
                }.foregroundStyle(Palette.peach)
            }.font(.subheadline.bold())
            ScrollView {
                LazyVStack(spacing: 12) {
                    if visible.isEmpty {
                        ContentUnavailableView(query.isEmpty ? "Deine erste Figur" : "Keine Treffer", systemImage: "figure.dance", description: Text("Füge eigene Videos hinzu und übe in deinem Tempo."))
                    }
                    ForEach(visible) { figure in
                        Button { learning = figure } label: { FigureCard(figure: figure, root: store.root) }.buttonStyle(.plain).accessibilityIdentifier("figure-" + figure.title)
                            .contextMenu {
                                Button("Bearbeiten") { editor = EditRequest(figure: figure) }
                                Button("Löschen", role: .destructive) { deleting = figure }
                            }
                    }
                }
            }.scrollDismissesKeyboard(.interactively)
        }.padding(.horizontal, 16).padding(.top, 12).background(Palette.background)
            .safeAreaInset(edge: .bottom, alignment: .trailing) {
                Button { editor = EditRequest(figure: nil) } label: { Label("Figur hinzufügen", systemImage: "plus").bold().padding(14) }
                    .buttonStyle(.borderedProminent).tint(Palette.purple).padding()
                    .accessibilityIdentifier("addFigure")
            }
            .sheet(item: $editor) { request in
                EditorScreen(store: store, figure: request.figure) { editor = nil }.preferredColorScheme(.dark)
            }
            .fullScreenCover(item: $learning) { figure in
                #if !SHARE_EXTENSION
                LearningScreen(figure: figure, root: store.root) { learning = nil }
                #endif
            }
            .alert("Figur und alle zugehörigen Videokopien löschen?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) {
                Button("Löschen", role: .destructive) { if let figure = deleting { store.delete(figure) }; deleting = nil }
                Button("Abbrechen", role: .cancel) { deleting = nil }
            }
            .alert("Lokaler Speicher", isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) {
                Button("Erneut laden") { store.error = nil; store.refresh() }
                Button("Schließen", role: .cancel) { store.error = nil }
            } message: { Text(store.error ?? "") }
            .onChange(of: scenePhase) { _, phase in if phase == .active { store.refresh() } }
    }
    private func filterButton(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(title, action: action).padding(.horizontal, 12).padding(.vertical, 8)
            .background(selected ? Palette.card : .clear, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(selected ? Palette.card : .gray)).foregroundStyle(.primary)
    }
}

struct FigureCard: View {
    let figure: Figure
    let root: URL?
    @State private var thumbnail: UIImage?
    @State private var duration = ""
    var body: some View {
        HStack(spacing: 16) {
            Group {
                if let thumbnail { Image(uiImage: thumbnail).resizable().scaledToFill() }
                else { Image(systemName: "video").font(.largeTitle).frame(maxWidth: .infinity, maxHeight: .infinity).background(.black.opacity(0.2)) }
            }.frame(width: 100, height: 90).clipped().accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 7) {
                Text(figure.title).font(.title3.bold()).lineLimit(2)
                Text(figure.status.rawValue).foregroundStyle(Palette.peach)
                if !figure.tags.isEmpty { Text(figure.tags.joined(separator: " · ")).font(.caption).lineLimit(1) }
                Text([duration, "\(figure.videos.count) Video\(figure.videos.count == 1 ? "" : "s")"].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption)
            }
            Spacer(minLength: 0)
        }.padding(14).frame(maxWidth: .infinity, alignment: .leading).background(Palette.card, in: RoundedRectangle(cornerRadius: 22))
            .task(id: figure.videos.first?.fileName) {
                thumbnail = nil; duration = ""
                guard let root, let name = figure.videos.first?.fileName, let url = try? LibraryDisk.safeURL(name, root: root) else { return }
                let asset = AVURLAsset(url: url)
                let generator = AVAssetImageGenerator(asset: asset); generator.appliesPreferredTrackTransform = true
                generator.maximumSize = CGSize(width: 300, height: 300)
                if let result = try? await generator.image(at: .zero) { thumbnail = UIImage(cgImage: result.image) }
                if let time = try? await asset.load(.duration), time.seconds.isFinite {
                    let seconds = Int(time.seconds); duration = String(format: "%d:%02d", seconds / 60, seconds % 60)
                }
            }
    }
}
