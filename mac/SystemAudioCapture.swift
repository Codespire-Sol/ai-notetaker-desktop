//
//  SystemAudioCapture.swift
//  Codespire Notetaker — macOS system-audio capture helper
//
//  A standalone Swift command-line executable (no Xcode project; compiled
//  directly with `swiftc`, see mac/build.sh).
//
//  Usage:
//      SystemAudioCapture <output-file-path.wav>
//
//  Behaviour:
//    * Captures SYSTEM audio only (no microphone — the Electron app records the
//      mic separately) using ScreenCaptureKit (macOS 13.0+).
//    * Writes the captured audio to the given path as a WAV file via AVAudioFile.
//    * Prints "READY" to stdout once capture has actually started.
//    * Runs until it receives SIGTERM or SIGINT, then cleanly flushes + closes
//      the audio file and exits 0, so the resulting file is always playable.
//
//  Exit codes:
//      0  clean shutdown (SIGTERM / SIGINT)
//      1  bad usage (no output path)
//      2  unsupported macOS version (< 13.0)
//      3  no display available to attach the audio capture to
//      4  failed to start the capture (e.g. Screen Recording permission denied)
//      5  the capture stream stopped unexpectedly with an error
//

import Foundation
import ScreenCaptureKit
import AVFoundation
import CoreMedia

// MARK: - Small helpers

/// Write a line to stderr (fatal errors / diagnostics).
func writeError(_ message: String) {
    FileHandle.standardError.write(Data((message + "\n").utf8))
}

// MARK: - CMSampleBuffer -> AVAudioPCMBuffer

extension CMSampleBuffer {
    /// Standard ScreenCaptureKit pattern for turning an audio `CMSampleBuffer`
    /// into an `AVAudioPCMBuffer` that `AVAudioFile` can write.
    ///
    /// NOTE: the returned buffer does NOT copy the sample data, so it is only
    /// valid for the lifetime of the sample buffer — i.e. it must be consumed
    /// synchronously inside the stream-output callback.
    var asPCMBuffer: AVAudioPCMBuffer? {
        try? self.withAudioBufferList { audioBufferList, _ -> AVAudioPCMBuffer? in
            guard let absd = self.formatDescription?.audioStreamBasicDescription else { return nil }
            guard let format = AVAudioFormat(standardFormatWithSampleRate: absd.mSampleRate,
                                             channels: absd.mChannelsPerFrame) else { return nil }
            return AVAudioPCMBuffer(pcmFormat: format, bufferListNoCopy: audioBufferList.unsafePointer)
        }
    }
}

// MARK: - Recorder

@available(macOS 13.0, *)
final class SystemAudioRecorder: NSObject, SCStreamOutput, SCStreamDelegate {

    private let outputURL: URL

    /// Dedicated serial queue that ScreenCaptureKit delivers audio buffers on.
    private let sampleQueue = DispatchQueue(label: "com.codespire.notetaker.systemaudio.samples",
                                            qos: .userInitiated)

    /// Guards `audioFile` + `isFinishing` so the signal handler can never close
    /// the file while a write is in flight on the sample queue.
    private let fileLock = NSLock()

    private var stream: SCStream?
    private var audioFile: AVAudioFile?      // created lazily on the first audio buffer
    private var isFinishing = false

    init(outputURL: URL) {
        self.outputURL = outputURL
        super.init()
    }

    // MARK: Start

    func start() async throws {
        // Grab the shareable content. We do not actually want any windows or
        // screen pixels — a display is simply the anchor ScreenCaptureKit needs
        // in order to give us the system audio mix.
        let content = try await SCShareableContent.excludingDesktopWindows(false,
                                                                           onScreenWindowsOnly: false)

        guard let display = content.displays.first else {
            writeError("ERROR: no display available for capture")
            exit(3)
        }

        let filter = SCContentFilter(display: display, excludingWindows: [])

        let config = SCStreamConfiguration()

        // --- Audio (what we actually want) ---
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = true   // never record our own output
        config.sampleRate = 48_000
        config.channelCount = 2

        // --- Video (minimised: ScreenCaptureKit always runs a video pipeline,
        //     so make it as cheap as possible; we never add a video output). ---
        config.width = 2
        config.height = 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1)  // ~1 fps
        config.showsCursor = false

        let stream = SCStream(filter: filter, configuration: config, delegate: self)
        try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: sampleQueue)
        try await stream.startCapture()

        self.stream = stream

        // Tell the parent process (Electron) that audio is really flowing.
        print("READY")
        fflush(stdout)
    }

    // MARK: Stop

    /// Stop the stream, flush + close the WAV file, then exit with `code`.
    /// Safe to call from any thread; only the first call does any work.
    func stop(exitCode: Int32 = 0) {
        fileLock.lock()
        if isFinishing {
            fileLock.unlock()
            return
        }
        isFinishing = true          // blocks any further writes from the sample queue
        fileLock.unlock()

        let finish: () -> Void = { [self] in
            fileLock.lock()
            // Releasing the AVAudioFile flushes remaining data and closes the
            // file, leaving a valid, playable WAV on disk.
            audioFile = nil
            fileLock.unlock()
            exit(exitCode)
        }

        if let stream = self.stream {
            stream.stopCapture { _ in
                finish()
            }
        } else {
            finish()
        }
    }

    // MARK: SCStreamOutput

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio else { return }
        guard sampleBuffer.isValid else { return }
        guard let pcmBuffer = sampleBuffer.asPCMBuffer, pcmBuffer.frameLength > 0 else { return }

        fileLock.lock()
        defer { fileLock.unlock() }

        // We are shutting down — do not touch the file any more.
        if isFinishing { return }

        do {
            if audioFile == nil {
                // Create the file lazily so its format exactly matches the
                // format ScreenCaptureKit is actually delivering.
                audioFile = try AVAudioFile(forWriting: outputURL,
                                            settings: pcmBuffer.format.settings)
            }
            try audioFile?.write(from: pcmBuffer)
        } catch {
            writeError("ERROR: failed to write audio buffer: \(error.localizedDescription)")
        }
    }

    // MARK: SCStreamDelegate

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        fileLock.lock()
        let alreadyFinishing = isFinishing
        fileLock.unlock()

        // A stop we asked for ourselves is not an error.
        if alreadyFinishing { return }

        writeError("ERROR: capture stream stopped: \(error.localizedDescription)")
        // Still flush whatever we captured so the partial file stays playable.
        stop(exitCode: 5)
    }
}

// MARK: - Entry point

// Keep the signal sources alive for the lifetime of the process.
var retainedSignalSources: [DispatchSourceSignal] = []

// Unbuffered stdout so the parent process sees "READY" immediately.
setvbuf(stdout, nil, _IONBF, 0)

let arguments = CommandLine.arguments
guard arguments.count >= 2, !arguments[1].isEmpty else {
    writeError("Usage: SystemAudioCapture <output-file-path.wav>")
    exit(1)
}

let outputURL = URL(fileURLWithPath: arguments[1])

if #available(macOS 13.0, *) {
    let recorder = SystemAudioRecorder(outputURL: outputURL)

    // Signals: ignore the default disposition first, otherwise the C default
    // handler kills the process before our GCD source ever runs.
    signal(SIGTERM, SIG_IGN)
    signal(SIGINT, SIG_IGN)

    for sig in [SIGTERM, SIGINT] {
        let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
        source.setEventHandler {
            recorder.stop(exitCode: 0)
        }
        source.resume()
        retainedSignalSources.append(source)
    }

    // Start capture asynchronously; the process is then parked in dispatchMain().
    Task {
        do {
            try await recorder.start()
        } catch {
            writeError("ERROR: failed to start system audio capture: \(error.localizedDescription)")
            exit(4)
        }
    }
} else {
    writeError("ERROR: macOS 13.0 or later is required for system audio capture (ScreenCaptureKit).")
    exit(2)
}

// Park the main thread: services the main queue (signal sources + async Task)
// until stop() calls exit().
dispatchMain()
