#if DEBUG
import Foundation
import AVFoundation

/// Deterministic synthetic clips only when explicitly requested by the UI test runner.
/// This code is excluded from Release builds and never touches a real library.
enum TestFixtures {
    static func seed(_ root: URL) async throws {
        try LibraryDisk.prepare(root)
        let source = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".mov")
        defer { try? FileManager.default.removeItem(at: source) }
        let writer = try AVAssetWriter(outputURL: source, fileType: .mov)
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 160, AVVideoHeightKey: 120])
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB, kCVPixelBufferWidthKey as String: 160, kCVPixelBufferHeightKey as String: 120])
        writer.add(input)
        guard writer.startWriting() else { throw SalsaError.message("Testvideo konnte nicht erzeugt werden.") }
        writer.startSession(atSourceTime: .zero)
        for frame in 0..<48 {
            while !input.isReadyForMoreMediaData { try await Task.sleep(nanoseconds: 5_000_000) }
            guard let pool = adaptor.pixelBufferPool else { throw SalsaError.message("Kein Pixelbuffer.") }
            var buffer: CVPixelBuffer?
            guard CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer) == kCVReturnSuccess, let buffer else { throw SalsaError.message("Testbuffer fehlgeschlagen.") }
            CVPixelBufferLockBaseAddress(buffer, [])
            if let address = CVPixelBufferGetBaseAddress(buffer) { memset(address, Int32(90 + frame), CVPixelBufferGetDataSize(buffer)) }
            CVPixelBufferUnlockBaseAddress(buffer, [])
            guard adaptor.append(buffer, withPresentationTime: CMTime(value: Int64(frame), timescale: 12)) else { throw SalsaError.message("Testframe fehlgeschlagen.") }
        }
        input.markAsFinished(); await writer.finishWriting()
        guard writer.status == .completed else { throw SalsaError.message("Testvideo nicht fertiggestellt.") }
        var front = VideoDraft(source: source, title: "Frente"); front.confirmed = true
        var side = VideoDraft(source: source, title: "Lado"); side.confirmed = true
        let figure = Figure(title: "Ocho", description: "Schritte in deinem Tempo.", status: .practicing, tags: ["Test"])
        try await LibraryDisk.save(root: root, figure: figure, drafts: [front, side], originalRevision: nil)
    }
}
#endif
