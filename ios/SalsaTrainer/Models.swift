import Foundation

struct FigureVideo: Codable, Identifiable, Equatable {
    var id: UUID = UUID()
    var fileName: String
    var title: String
}

enum LearningStatus: String, Codable, CaseIterable, Identifiable {
    case new = "Neu", practicing = "Am Üben", learned = "Sitzt"
    var id: String { rawValue }
}

struct Figure: Codable, Identifiable, Equatable {
    var id: UUID = UUID()
    var title: String
    var description: String = ""
    var status: LearningStatus = .new
    var tags: [String] = []
    var videos: [FigureVideo] = []
    var createdAt: Date = Date()
    var revision: UUID = UUID()
}

struct VideoDraft: Identifiable, Equatable {
    var id: UUID = UUID()
    var title: String
    var existing: FigureVideo?
    var source: URL?
    var confirmed: Bool = false
    init(existing: FigureVideo) {
        id = existing.id; title = existing.title; self.existing = existing; confirmed = true
    }
    init(source: URL, title: String) { self.source = source; self.title = title }
}

struct LoopRange: Equatable {
    var a: Double?
    var b: Double?
    mutating func setA(_ time: Double) { a = max(0, time); b = nil }
    mutating func setB(_ time: Double) { if let a, time > a + 0.1 { b = time } }
    func seekTarget(at time: Double, ended: Bool = false) -> Double? {
        guard let a, let b else { return nil }
        return time >= b || ended ? a : nil
    }
    static func rewind(_ time: Double) -> Double { max(0, time - 5) }
}

enum SalsaError: LocalizedError {
    case message(String)
    var errorDescription: String? { switch self { case .message(let value): return value } }
}
