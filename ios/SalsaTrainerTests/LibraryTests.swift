import XCTest
import AVFoundation
@testable import SalsaTrainer

final class LibraryTests: XCTestCase {
    var root: URL!
    var originals: URL!
    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        originals = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try LibraryDisk.prepare(root)
        try FileManager.default.createDirectory(at: originals, withIntermediateDirectories: true)
    }
    override func tearDownWithError() throws {
        try FileManager.default.removeItem(at: root)
        try FileManager.default.removeItem(at: originals)
    }
    func draft(_ name: String = "clip.mp4", content: String = "video") throws -> VideoDraft {
        let url = originals.appendingPathComponent(name)
        try Data(content.utf8).write(to: url)
        var draft = VideoDraft(source: url, title: name); draft.confirmed = true; return draft
    }
    func save(_ figure: Figure, _ drafts: [VideoDraft], revision: UUID? = nil) async throws {
        try await LibraryDisk.save(root: root, figure: figure, drafts: drafts, originalRevision: revision, validate: { _ in })
    }
    func testImportCopiesBytesAndPreservesOriginal() async throws {
        let input = try draft(); let figure = Figure(title: "Ocho")
        try await save(figure, [input])
        let saved = try XCTUnwrap(LibraryDisk.read(root).first)
        let source = try XCTUnwrap(input.source)
        let target = try LibraryDisk.safeURL(saved.videos[0].fileName, root: root)
        XCTAssertNotEqual(source, target)
        XCTAssertEqual(try Data(contentsOf: source), try Data(contentsOf: target))
        XCTAssertEqual(saved.title, "Ocho")
    }
    func testUnconfirmedImportIsRejected() async throws {
        var input = try draft(); input.confirmed = false
        do { try await save(Figure(title: "Ocho"), [input]); XCTFail("Must require confirmation") } catch {}
        XCTAssertEqual(try LibraryDisk.read(root), [])
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: root.path), [])
    }
    func testFailureInSecondVideoRollsBackAllImports() async throws {
        let one = try draft("one.mp4"); let two = try draft("two.mp4")
        var count = 0
        do {
            try await LibraryDisk.save(root: root, figure: Figure(title: "Ocho"), drafts: [one, two], originalRevision: nil, validate: { _ in
                count += 1; if count == 2 { throw SalsaError.message("Invalid video") }
            }); XCTFail("Must roll back")
        } catch {}
        XCTAssertTrue(try LibraryDisk.read(root).isEmpty)
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: root.path), [])
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: originals.path).count, 2)
    }
    func testRenameReorderAndRemovalCommitTogether() async throws {
        try await save(Figure(title: "Ocho"), [draft("one.mp4"), draft("two.mp4")])
        let saved = try XCTUnwrap(LibraryDisk.read(root).first)
        let first = saved.videos[0]; let second = saved.videos[1]
        var renamed = VideoDraft(existing: second); renamed.title = "Andere Perspektive"
        try await save(saved, [renamed, VideoDraft(existing: first)], revision: saved.revision)
        let reordered = try XCTUnwrap(LibraryDisk.read(root).first)
        XCTAssertEqual(reordered.videos.map(\.fileName), [second.fileName, first.fileName])
        XCTAssertEqual(reordered.videos[0].title, "Andere Perspektive")
        try await save(reordered, [VideoDraft(existing: reordered.videos[0])], revision: reordered.revision)
        XCTAssertFalse(FileManager.default.fileExists(atPath: root.appendingPathComponent(first.fileName).path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: root.appendingPathComponent(second.fileName).path))
    }
    func testStaleEditorDoesNotOverwriteOtherChanges() async throws {
        try await save(Figure(title: "Ocho"), [draft()])
        let original = try XCTUnwrap(LibraryDisk.read(root).first)
        var edited = original; edited.title = "Neuer Name"
        try await save(edited, original.videos.map { VideoDraft(existing: $0) }, revision: original.revision)
        do { try await save(original, original.videos.map { VideoDraft(existing: $0) }, revision: original.revision); XCTFail("Must detect conflict") } catch {}
        XCTAssertEqual(try LibraryDisk.read(root).first?.title, "Neuer Name")
    }
    func testMissingSourcePreservesExistingFigure() async throws {
        try await save(Figure(title: "Ocho"), [draft()])
        let original = try XCTUnwrap(LibraryDisk.read(root).first)
        var missing = VideoDraft(source: originals.appendingPathComponent("missing.mp4"), title: "Missing"); missing.confirmed = true
        do { try await save(original, original.videos.map { VideoDraft(existing: $0) } + [missing], revision: original.revision); XCTFail("Missing source") } catch {}
        XCTAssertEqual(try LibraryDisk.read(root).first, original)
    }
    func testCannotRemoveLastVideoOrUseForeignVideo() async throws {
        try await save(Figure(title: "Ocho"), [draft()])
        let original = try XCTUnwrap(LibraryDisk.read(root).first)
        do { try await save(original, [], revision: original.revision); XCTFail("Empty list") } catch {}
        let foreign = FigureVideo(fileName: "foreign.mp4", title: "Foreign")
        do { try await save(original, [VideoDraft(existing: foreign)], revision: original.revision); XCTFail("Foreign file") } catch {}
        XCTAssertEqual(try LibraryDisk.read(root).first, original)
    }
    func testDeleteRemovesAllCopiesButKeepsOriginals() async throws {
        try await save(Figure(title: "Ocho"), [draft("one.mp4"), draft("two.mp4")])
        let saved = try XCTUnwrap(LibraryDisk.read(root).first)
        try LibraryDisk.delete(saved, root: root)
        XCTAssertTrue(try LibraryDisk.read(root).isEmpty)
        for video in saved.videos { XCTAssertFalse(FileManager.default.fileExists(atPath: root.appendingPathComponent(video.fileName).path)) }
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: originals.path).count, 2)
    }
    func testPathTraversalRejected() throws {
        for name in ["", ".", "..", "../secret", "/tmp/secret", "x\\y"] { XCTAssertThrowsError(try LibraryDisk.safeURL(name, root: root)) }
    }
    func testLoopRulesAndRewindClamp() {
        var range = LoopRange(); range.setA(2); range.setB(2)
        XCTAssertNil(range.b); range.setB(5)
        XCTAssertNil(range.seekTarget(at: 4.9)); XCTAssertEqual(range.seekTarget(at: 5), 2)
        XCTAssertEqual(range.seekTarget(at: 4, ended: true), 2)
        range.setA(3); XCTAssertNil(range.b)
        XCTAssertEqual(LoopRange.rewind(2), 0); XCTAssertEqual(LoopRange.rewind(9), 4)
    }
    func testInvalidMovieIsRejectedByActualMediaValidation() async throws {
        let input = try draft()
        do { try await LibraryDisk.save(root: root, figure: Figure(title: "Ocho"), drafts: [input], originalRevision: nil); XCTFail("Invalid movie") } catch {}
        XCTAssertTrue(try LibraryDisk.read(root).isEmpty)
    }
    func makeMovie(_ name: String = "real.mov") async throws -> URL {
        let url = originals.appendingPathComponent(name)
        let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 160, AVVideoHeightKey: 120])
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB, kCVPixelBufferWidthKey as String: 160, kCVPixelBufferHeightKey as String: 120])
        writer.add(input); XCTAssertTrue(writer.startWriting()); writer.startSession(atSourceTime: .zero)
        for frame in 0..<12 {
            while !input.isReadyForMoreMediaData { try await Task.sleep(nanoseconds: 5_000_000) }
            var buffer: CVPixelBuffer?
            XCTAssertEqual(CVPixelBufferPoolCreatePixelBuffer(nil, try XCTUnwrap(adaptor.pixelBufferPool), &buffer), kCVReturnSuccess)
            let pixelBuffer = try XCTUnwrap(buffer)
            CVPixelBufferLockBaseAddress(pixelBuffer, [])
            memset(try XCTUnwrap(CVPixelBufferGetBaseAddress(pixelBuffer)), 90, CVPixelBufferGetDataSize(pixelBuffer))
            CVPixelBufferUnlockBaseAddress(pixelBuffer, [])
            XCTAssertTrue(adaptor.append(pixelBuffer, withPresentationTime: CMTime(value: Int64(frame), timescale: 12)))
        }
        input.markAsFinished(); await writer.finishWriting()
        XCTAssertEqual(writer.status, .completed)
        return url
    }
    func testRealMovieValidation() async throws {
        let url = try await makeMovie()
        var draft = VideoDraft(source: url, title: "Real"); draft.confirmed = true
        try await LibraryDisk.save(root: root, figure: Figure(title: "Real"), drafts: [draft], originalRevision: nil)
        XCTAssertEqual(try LibraryDisk.read(root).first?.videos.count, 1)
    }
    @MainActor func testPlayerSelectionResetsMarksButKeepsLearningSettings() async throws {
        let source = try await makeMovie()
        var draft = VideoDraft(source: source, title: "One"); draft.confirmed = true
        var second = VideoDraft(source: source, title: "Two"); second.confirmed = true
        try await LibraryDisk.save(root: root, figure: Figure(title: "Player"), drafts: [draft, second], originalRevision: nil)
        let figure = try XCTUnwrap(LibraryDisk.read(root).first)
        let model = LearningPlayer(figure: figure, root: root)
        defer { model.stop() }
        for _ in 0..<200 {
            if model.duration > 0 { break }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTAssertGreaterThan(model.duration, 0)
        model.setSpeed(0.5); model.crop = true; model.landscape = true; model.fullLoop = true
        model.range.setA(0.1); model.range.setB(0.5)
        model.select(1, autoplay: false)
        XCTAssertEqual(model.index, 1); XCTAssertEqual(model.position, 0)
        XCTAssertNil(model.range.a); XCTAssertNil(model.range.b)
        XCTAssertEqual(model.speed, 0.5); XCTAssertTrue(model.crop); XCTAssertTrue(model.landscape); XCTAssertTrue(model.fullLoop)
        for _ in 0..<200 {
            if model.duration > 0 { break }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        model.play(); XCTAssertTrue(model.playing)
        model.seek(0.2); model.pause()
        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertFalse(model.playing); XCTAssertEqual(model.player.rate, 0)
    }

}
