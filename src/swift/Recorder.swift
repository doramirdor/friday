
import Foundation
import AVFoundation
import ScreenCaptureKit
import CoreAudio

@available(macOS 13.0, *)
final class RecorderCLI: NSObject, SCStreamDelegate, SCStreamOutput, AVAudioRecorderDelegate {
    // PUBLIC CONFIG -----------------
    var audioSource: String = "system" // mic | system | both

    // PRIVATE STATE -----------------
    private var recordingDir: String = FileManager.default.currentDirectoryPath
    private var baseFilename: String = Date().toFileName()
    private var screenStream: SCStream?
    private var systemAudioFile: AVAudioFile?
    private var micRecorder: AVAudioRecorder?
    private var systemRecordingActive = false
    private var micRecordingActive = false

    // MARK: – CLI entry
    override init() {
        super.init()
        parseCLI()
    }

    func executeRecordingProcess() {
        // Any Bluetooth present? just print a warning (no abort!)
        if AudioDeviceManager.isCurrentOutputDeviceBluetooth() {
            print("⚠️  Output device is Bluetooth – continuing, quality may be narrow‑band.")
        }

        if audioSource == "mic" {
            startMicOnly()
            return
        }

        // Request screen‑capture permission first for system or both.
        PermissionsRequester.requestScreenCaptureAccess { granted in
            guard granted else {
                ResponseHandler.send(["code": "PERMISSION_DENIED"]) ; return
            }
            if self.audioSource == "both" { self.startMicOnly() } // mic part first
            self.startSystemAudio()
        }
    }

    // MARK: – System audio via ScreenCaptureKit
    private func startSystemAudio() {
        print("Initialising ScreenCaptureKit …")
        SCShareableContent.getExcludingDesktopWindows(true, onScreenWindowsOnly: true) { content, err in
            guard let display = content?.displays.first else {
                ResponseHandler.send(["code": "NO_DISPLAY_FOUND"]) ; return
            }
            let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
            Task { try await self.beginCapture(filter: filter) }
        }
    }

    private func beginCapture(filter: SCContentFilter) async throws {
        let cfg = SCStreamConfiguration()
        cfg.width = 2 ; cfg.height = 2 ; cfg.capturesAudio = true ; cfg.sampleRate = 44100 ; cfg.channelCount = 2
        screenStream = SCStream(filter: filter, configuration: cfg, delegate: self)
        try screenStream?.addStreamOutput(self, type: .audio, sampleHandlerQueue: .global())
        let systemPath = urlInDir("_system.wav")
        systemAudioFile = try AVAudioFile(forWriting: systemPath, settings: [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 44100, AVNumberOfChannelsKey: 2])
        try await screenStream?.startCapture()
        systemRecordingActive = true
        print("✅ System audio recording started")
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of outputType: SCStreamOutputType) {
        guard let buf = sb.pcmBuffer else { return }
        try? systemAudioFile?.write(from: buf)
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        print("System stream stopped: \(error.localizedDescription)")
        systemRecordingActive = false
        finishIfPossible()
    }

    // MARK: – Microphone only path
    private func startMicOnly() {
        AudioDeviceManager.logAudioDiagnostics()
        let micPath = urlInDir("_mic.wav")
        let settings: [String: Any] = [ AVFormatIDKey: kAudioFormatLinearPCM,
                                        AVSampleRateKey: 44100,
                                        AVNumberOfChannelsKey: 2 ]
        do {
            micRecorder = try AVAudioRecorder(url: micPath, settings: settings)
            micRecorder?.delegate = self
            guard micRecorder?.record() == true else { throw NSError(domain: "rec", code: -1) }
            micRecordingActive = true
            print("✅ Microphone recording started")
        } catch {
            ResponseHandler.send(["code": "MIC_ERROR", "error": error.localizedDescription])
        }
    }

    func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        micRecordingActive = false
        finishIfPossible()
    }

    // MARK: – Combine & finish
    private func finishIfPossible() {
        guard (audioSource == "mic" && !micRecordingActive) ||
              (audioSource == "system" && !systemRecordingActive) ||
              (audioSource == "both" && !micRecordingActive && !systemRecordingActive) else { return }

        if audioSource == "both" {
            combineSystemAndMic()
        } else if audioSource == "system" {
            convertWavToMp3(wav: urlInDir("_system.wav"))
        } else {
            convertWavToMp3(wav: urlInDir("_mic.wav"))
        }
    }

    private func combineSystemAndMic() {
        let sys = urlInDir("_system.wav")
        let mic = urlInDir("_mic.wav")
        let combined = urlInDir(".wav")
        let ffmpeg = "/opt/homebrew/bin/ffmpeg"
        guard FileManager.default.fileExists(atPath: ffmpeg) else {
            ResponseHandler.send(["code": "NO_FFMPEG"]) ; return
        }
        let task = Process()
        task.executableURL = URL(fileURLWithPath: ffmpeg)
        task.arguments = ["-y", "-i", sys.path, "-i", mic.path, "-filter_complex", "amix=inputs=2:duration=longest:normalize=1", combined.path]
        try? task.run(); task.waitUntilExit()
        convertWavToMp3(wav: combined)
    }

    private func convertWavToMp3(wav: URL) {
        let mp3 = wav.deletingPathExtension().appendingPathExtension("mp3")
        let ffmpeg = "/opt/homebrew/bin/ffmpeg"
        let task = Process()
        task.executableURL = URL(fileURLWithPath: ffmpeg)
        task.arguments = ["-y", "-i", wav.path, "-codec:a", "libmp3lame", "-qscale:a", "2", mp3.path]
        try? task.run(); task.waitUntilExit()
        ResponseHandler.send(["code": "RECORDING_STOPPED", "path": mp3.path])
    }

    // MARK: – CLI parsing helpers
    private func parseCLI() {
        let args = CommandLine.arguments
        if let idx = args.firstIndex(of: "--record"), idx + 1 < args.count {
            recordingDir = (args[idx + 1] as NSString).expandingTildeInPath
        }
        if let idx = args.firstIndex(of: "--filename"), idx + 1 < args.count {
            baseFilename = args[idx + 1]
        }
        if let idx = args.firstIndex(of: "--source"), idx + 1 < args.count {
            let src = args[idx + 1].lowercased(); if ["mic","system","both"].contains(src) { audioSource = src }
        }
    }

    private func urlInDir(_ suffix: String) -> URL {
        URL(fileURLWithPath: recordingDir).appendingPathComponent(baseFilename + suffix)
    }
}
