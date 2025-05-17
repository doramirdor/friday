import AVFoundation
import ScreenCaptureKit
import Foundation

// Global signal handler
var recorderInstance: RecorderCLI?
func handleInterruptSignal(signal: Int32) {
    if signal == SIGINT {
        RecorderCLI.terminateRecording()
        recorderInstance?.convertAndFinish()
    }
}

class RecorderCLI: NSObject, SCStreamDelegate, SCStreamOutput {
    static var screenCaptureStream: SCStream?
    static var audioFileForRecording: AVAudioFile?
    var contentEligibleForSharing: SCShareableContent?
    let semaphoreRecordingStopped = DispatchSemaphore(value: 0)
    var recordingPath: String?
    var recordingFilename: String?
    var streamFunctionCalled = false
    var streamFunctionTimeout: TimeInterval = 2.0 // Increased timeout for slower systems
    var tempWavPath: String?
    var finalMp3Path: String?

    override init() {
        super.init()
        recorderInstance = self
        processCommandLineArguments()
    }

    func processCommandLineArguments() {
        let arguments = CommandLine.arguments
        guard arguments.contains("--record") else {
            if arguments.contains("--check-permissions") {
                PermissionsRequester.requestScreenCaptureAccess { granted in
                    if granted {
                        ResponseHandler.returnResponse(["code": "PERMISSION_GRANTED"])
                    } else {
                        ResponseHandler.returnResponse(["code": "PERMISSION_DENIED"])
                    }
                }
            } else {
                ResponseHandler.returnResponse(["code": "INVALID_ARGUMENTS"])
            }

            return
        }

        if let recordIndex = arguments.firstIndex(of: "--record"), recordIndex + 1 < arguments.count {
            recordingPath = arguments[recordIndex + 1]
            
            // Verify recording directory exists and is writable
            guard let path = recordingPath, FileManager.default.fileExists(atPath: path) else {
                ResponseHandler.returnResponse(["code": "INVALID_PATH", "error": "Recording directory does not exist"])
                return
            }
            
            var isDirectory: ObjCBool = false
            if !FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory) || !isDirectory.boolValue {
                ResponseHandler.returnResponse(["code": "INVALID_PATH", "error": "Recording path is not a directory"])
                return
            }
            
            // Test if we can write to the directory
            let testFile = "\(path)/test_write_permission.tmp"
            do {
                try "test".write(toFile: testFile, atomically: true, encoding: .utf8)
                try FileManager.default.removeItem(atPath: testFile)
            } catch {
                ResponseHandler.returnResponse([
                    "code": "DIRECTORY_NOT_WRITABLE", 
                    "error": "Cannot write to recording directory: \(error.localizedDescription)"
                ])
                return
            }
        } else {
            ResponseHandler.returnResponse(["code": "NO_PATH_SPECIFIED"])
        }

        if let filenameIndex = arguments.firstIndex(of: "--filename"), filenameIndex + 1 < arguments.count {
            recordingFilename = arguments[filenameIndex + 1]
            // Remove any extension from the filename if present
            if let dotIndex = recordingFilename?.lastIndex(of: ".") {
                recordingFilename = String(recordingFilename![..<dotIndex])
            }
        }
    }

    func executeRecordingProcess() {
        // First check permissions
        if !CGPreflightScreenCaptureAccess() {
            ResponseHandler.returnResponse(["code": "PERMISSION_DENIED", "error": "Screen recording permission is required"])
            return
        }
        
        self.updateAvailableContent()
        setupInterruptSignalHandler()
        setupStreamFunctionTimeout()
        semaphoreRecordingStopped.wait()
    }

    func setupInterruptSignalHandler() {
        // Use the global function as signal handler
        signal(SIGINT, handleInterruptSignal)
    }
    
    func convertAndFinish() {
        let timestamp = Date()
        let formattedTimestamp = ISO8601DateFormatter().string(from: timestamp)
        
        // Store the path for response
        let outputPath = finalMp3Path ?? tempWavPath ?? ""
        
        // If we have a WAV file, convert it to MP3
        if let wavPath = tempWavPath, FileManager.default.fileExists(atPath: wavPath) {
            let mp3Path = wavPath.replacingOccurrences(of: ".wav", with: ".mp3")
            
            // Verify the MP3 path doesn't already exist (avoid overwriting)
            if FileManager.default.fileExists(atPath: mp3Path) {
                do {
                    try FileManager.default.removeItem(atPath: mp3Path)
                    print("Removed existing MP3 file at path: \(mp3Path)")
                } catch {
                    print("Failed to remove existing MP3 file: \(error.localizedDescription)")
                }
            }
            
            // Check if ffmpeg is installed
            do {
                let whichTask = Process()
                whichTask.executableURL = URL(fileURLWithPath: "/usr/bin/which")
                whichTask.arguments = ["ffmpeg"]
                let outputPipe = Pipe()
                whichTask.standardOutput = outputPipe
                try whichTask.run()
                whichTask.waitUntilExit()
                
                if whichTask.terminationStatus != 0 {
                    print("ffmpeg not found in PATH, will try direct conversion")
                }
            } catch {
                print("Error checking for ffmpeg: \(error.localizedDescription)")
            }
            
            // Use shell for conversion with improved parameters
            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/bin/sh")
            task.arguments = [
                "-c",
                "ffmpeg -i \"\(wavPath)\" -codec:a libmp3lame -qscale:a 2 -ar 44100 \"\(mp3Path)\" -y"
            ]
            
            do {
                try task.run()
                task.waitUntilExit()
                
                // Verify the conversion succeeded
                if task.terminationStatus == 0 && FileManager.default.fileExists(atPath: mp3Path) {
                    // Get file sizes for logging
                    if let wavAttrs = try? FileManager.default.attributesOfItem(atPath: wavPath),
                       let mp3Attrs = try? FileManager.default.attributesOfItem(atPath: mp3Path),
                       let wavSize = wavAttrs[.size] as? UInt64,
                       let mp3Size = mp3Attrs[.size] as? UInt64 {
                        print("WAV: \(wavSize / 1024) KB, MP3: \(mp3Size / 1024) KB")
                    }
                    
                    // Successfully converted
                    ResponseHandler.returnResponse([
                        "code": "RECORDING_STOPPED", 
                        "timestamp": formattedTimestamp,
                        "path": mp3Path
                    ])
                    
                    // Clean up temporary WAV file
                    do {
                        try FileManager.default.removeItem(atPath: wavPath)
                        print("Removed temporary WAV file: \(wavPath)")
                    } catch {
                        print("Failed to remove temporary WAV file: \(error.localizedDescription)")
                    }
                } else {
                    // Conversion failed - try a second method with different parameters
                    let alternativeTask = Process()
                    alternativeTask.executableURL = URL(fileURLWithPath: "/bin/sh")
                    alternativeTask.arguments = [
                        "-c",
                        "ffmpeg -y -i \"\(wavPath)\" -f mp3 -b:a 192k \"\(mp3Path)\""
                    ]
                    
                    print("First conversion approach failed. Trying alternative method...")
                    
                    do {
                        try alternativeTask.run()
                        alternativeTask.waitUntilExit()
                        
                        if alternativeTask.terminationStatus == 0 && FileManager.default.fileExists(atPath: mp3Path) {
                            print("Alternative conversion successful")
                            
                            // Successfully converted with alternative method
                            ResponseHandler.returnResponse([
                                "code": "RECORDING_STOPPED", 
                                "timestamp": formattedTimestamp,
                                "path": mp3Path
                            ])
                            
                            // Clean up
                            try? FileManager.default.removeItem(atPath: wavPath)
                        } else {
                            print("Both conversion methods failed. Returning WAV file.")
                            // Both conversions failed - rename WAV to MP3 as last resort
                            do {
                                try FileManager.default.moveItem(atPath: wavPath, toPath: mp3Path)
                                print("Renamed WAV to MP3 as last resort")
                                ResponseHandler.returnResponse([
                                    "code": "RECORDING_STOPPED", 
                                    "timestamp": formattedTimestamp,
                                    "path": mp3Path,
                                    "error": "MP3 conversion failed, renamed WAV to MP3"
                                ])
                            } catch {
                                // If rename fails, just return the WAV
                                ResponseHandler.returnResponse([
                                    "code": "RECORDING_STOPPED", 
                                    "timestamp": formattedTimestamp,
                                    "path": wavPath,
                                    "error": "MP3 conversion failed with both methods"
                                ])
                            }
                        }
                    } catch {
                        print("Alternative conversion method failed: \(error.localizedDescription)")
                        // Return the WAV file if conversion consistently fails
                        ResponseHandler.returnResponse([
                            "code": "RECORDING_STOPPED", 
                            "timestamp": formattedTimestamp,
                            "path": wavPath,
                            "error": "MP3 conversion error: \(error.localizedDescription)"
                        ])
                    }
                }
            } catch {
                print("Initial conversion failed: \(error.localizedDescription)")
                // Shell execution failed
                ResponseHandler.returnResponse([
                    "code": "RECORDING_STOPPED", 
                    "timestamp": formattedTimestamp,
                    "path": wavPath,
                    "error": "MP3 conversion error: \(error.localizedDescription)"
                ])
            }
        } else {
            // No WAV file found
            ResponseHandler.returnResponse([
                "code": "RECORDING_STOPPED", 
                "timestamp": formattedTimestamp,
                "path": outputPath,
                "error": "No recording file created"
            ])
        }
    }

    func setupStreamFunctionTimeout() {
        print("Starting recording with timeout: \(streamFunctionTimeout) seconds")
        DispatchQueue.global().asyncAfter(deadline: .now() + streamFunctionTimeout) { [weak self] in
            guard let self = self else { return }
            if !self.streamFunctionCalled {
                RecorderCLI.terminateRecording()
                ResponseHandler.returnResponse([
                    "code": "STREAM_FUNCTION_NOT_CALLED",
                    "error": "The audio capture stream function was not called. Check if screen recording permission is enabled."
                ], shouldExitProcess: true)
            } else {
                let timestamp = Date()
                let formattedTimestamp = ISO8601DateFormatter().string(from: timestamp)

                // Generate unique timestamp-based filename if none provided
                let baseFilename: String
                if let providedFilename = self.recordingFilename, !providedFilename.isEmpty {
                    baseFilename = providedFilename
                } else {
                    baseFilename = timestamp.toFormattedFileName()
                }
                
                // First save as WAV (much more reliable format for capturing)
                self.tempWavPath = "\(self.recordingPath!)/\(baseFilename).wav"
                print("Saving recording to temporary WAV: \(self.tempWavPath!)")
                
                // Set the final MP3 path
                self.finalMp3Path = "\(self.recordingPath!)/\(baseFilename).mp3"
                
                // Prepare the audio file (using WAV for capture)
                self.prepareAudioFile(at: self.tempWavPath!)

                ResponseHandler.returnResponse([
                    "code": "RECORDING_STARTED", 
                    "path": self.finalMp3Path!, 
                    "timestamp": formattedTimestamp
                ], shouldExitProcess: false)
            }
        }
    }

    func updateAvailableContent() {
        print("Getting available displays for capture...")
        SCShareableContent.getExcludingDesktopWindows(true, onScreenWindowsOnly: true) { [weak self] content, error in
            guard let self = self else { return }
            
            if let error = error {
                print("Error getting sharable content: \(error.localizedDescription)")
                ResponseHandler.returnResponse([
                    "code": "CONTENT_ERROR", 
                    "error": "Could not get sharable content: \(error.localizedDescription)"
                ])
                return
            }
            
            self.contentEligibleForSharing = content
            
            if content.displays.isEmpty {
                print("No displays found for recording")
                ResponseHandler.returnResponse(["code": "NO_DISPLAY_FOUND"])
                return
            }
            
            print("Found \(content.displays.count) display(s) for recording")
            self.setupRecordingEnvironment()
        }
    }

    func setupRecordingEnvironment() {
        guard let firstDisplay = contentEligibleForSharing?.displays.first else {
            ResponseHandler.returnResponse(["code": "NO_DISPLAY_FOUND"])
            return
        }

        let screenContentFilter = SCContentFilter(display: firstDisplay, excludingApplications: [], exceptingWindows: [])
        print("Screen content filter configured")

        Task { await initiateRecording(with: screenContentFilter) }
    }

    func prepareAudioFile(at path: String) {
        do {
            // Use WAV format for capture (more reliable)
            RecorderCLI.audioFileForRecording = try AVAudioFile(
                forWriting: URL(fileURLWithPath: path),
                settings: [
                    AVSampleRateKey: 44100, // Changed to 44.1kHz for better MP3 conversion
                    AVNumberOfChannelsKey: 2,
                    AVFormatIDKey: kAudioFormatLinearPCM
                ],
                commonFormat: .pcmFormatFloat32,
                interleaved: false
            )
            print("Successfully prepared audio file at \(path)")
        } catch {
            print("Failed to create audio file: \(error.localizedDescription)")
            ResponseHandler.returnResponse(["code": "AUDIO_FILE_CREATION_FAILED", "error": error.localizedDescription])
        }
    }

    func initiateRecording(with filter: SCContentFilter) async {
        print("Initiating recording...")
        let streamConfiguration = SCStreamConfiguration()
        configureStream(streamConfiguration)

        do {
            RecorderCLI.screenCaptureStream = SCStream(filter: filter, configuration: streamConfiguration, delegate: self)

            try RecorderCLI.screenCaptureStream?.addStreamOutput(self, type: .audio, sampleHandlerQueue: .global())
            print("Added audio stream output")
            
            print("Starting capture...")
            try await RecorderCLI.screenCaptureStream?.startCapture()
            print("Capture started successfully")
        } catch {
            print("Failed to start capture: \(error.localizedDescription)")
            ResponseHandler.returnResponse(["code": "CAPTURE_FAILED", "error": error.localizedDescription])
        }
    }

    func configureStream(_ configuration: SCStreamConfiguration) {
        configuration.width = 2
        configuration.height = 2
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale.max)
        configuration.showsCursor = false
        configuration.capturesAudio = true
        configuration.sampleRate = 44100 // Changed to 44.1kHz for better compatibility
        configuration.channelCount = 2
        print("Stream configured with 44.1kHz sample rate, 2 channels")
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of outputType: SCStreamOutputType) {
        if !self.streamFunctionCalled {
            print("First audio buffer received")
            self.streamFunctionCalled = true
        }
        
        guard let audioBuffer = sampleBuffer.asPCMBuffer, sampleBuffer.isValid else { 
            return
        }

        do {
            try RecorderCLI.audioFileForRecording?.write(from: audioBuffer)
        } catch {
            print("Failed to write audio buffer: \(error.localizedDescription)")
            ResponseHandler.returnResponse(["code": "AUDIO_BUFFER_WRITE_FAILED", "error": error.localizedDescription])
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        print("Stream stopped with error: \(error.localizedDescription)")
        ResponseHandler.returnResponse(["code": "STREAM_ERROR", "error": error.localizedDescription], shouldExitProcess: false)
        RecorderCLI.terminateRecording()
        semaphoreRecordingStopped.signal()
    }

    static func terminateRecording() {
        print("Terminating recording...")
        screenCaptureStream?.stopCapture()
        screenCaptureStream = nil
        audioFileForRecording = nil
    }
}

extension Date {
    func toFormattedFileName() -> String {
        let fileNameFormatter = DateFormatter()
        fileNameFormatter.dateFormat = "y-MM-dd HH.mm.ss"
        return fileNameFormatter.string(from: self)
    }
}

class PermissionsRequester {
    static func requestScreenCaptureAccess(completion: @escaping (Bool) -> Void) {
        let hasPermission = CGPreflightScreenCaptureAccess()
        if !hasPermission {
            print("Screen capture permission not granted, requesting...")
            let result = CGRequestScreenCaptureAccess()
            print("Permission request result: \(result)")
            completion(result)
        } else {
            print("Screen capture permission already granted")
            completion(true)
        }
    }
}

class ResponseHandler {
    static func returnResponse(_ response: [String: Any], shouldExitProcess: Bool = true) {
        if let jsonData = try? JSONSerialization.data(withJSONObject: response),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            print(jsonString)
            fflush(stdout)
        } else {
            print("{\"code\": \"JSON_SERIALIZATION_FAILED\"}")
            fflush(stdout)
        }

        if shouldExitProcess {
            exit(0)
        }
    }
}

// https://developer.apple.com/documentation/screencapturekit/capturing_screen_content_in_macos
// For Sonoma updated to https://developer.apple.com/forums/thread/727709
extension CMSampleBuffer {
    var asPCMBuffer: AVAudioPCMBuffer? {
        try? self.withAudioBufferList { audioBufferList, _ -> AVAudioPCMBuffer? in
            guard let absd = self.formatDescription?.audioStreamBasicDescription else { return nil }
            guard let format = AVAudioFormat(standardFormatWithSampleRate: absd.mSampleRate, channels: absd.mChannelsPerFrame) else { return nil }
            return AVAudioPCMBuffer(pcmFormat: format, bufferListNoCopy: audioBufferList.unsafePointer)
        }
    }
}

// Based on https://gist.github.com/aibo-cora/c57d1a4125e145e586ecb61ebecff47c
extension AVAudioPCMBuffer {
    var asSampleBuffer: CMSampleBuffer? {
        let asbd = self.format.streamDescription
        var sampleBuffer: CMSampleBuffer? = nil
        var format: CMFormatDescription? = nil

        guard CMAudioFormatDescriptionCreate(
            allocator: kCFAllocatorDefault,
            asbd: asbd,
            layoutSize: 0,
            layout: nil,
            magicCookieSize: 0,
            magicCookie: nil,
            extensions: nil,
            formatDescriptionOut: &format
        ) == noErr else { return nil }

        var timing = CMSampleTimingInfo(
            duration: CMTime(value: 1, timescale: Int32(asbd.pointee.mSampleRate)),
            presentationTimeStamp: CMClockGetTime(CMClockGetHostTimeClock()),
            decodeTimeStamp: .invalid
        )

        guard CMSampleBufferCreate(
            allocator: kCFAllocatorDefault,
            dataBuffer: nil,
            dataReady: false,
            makeDataReadyCallback: nil,
            refcon: nil,
            formatDescription: format,
            sampleCount: CMItemCount(self.frameLength),
            sampleTimingEntryCount: 1,
            sampleTimingArray: &timing,
            sampleSizeEntryCount: 0,
            sampleSizeArray: nil,
            sampleBufferOut: &sampleBuffer
        ) == noErr else { return nil }

        guard CMSampleBufferSetDataBufferFromAudioBufferList(
            sampleBuffer!,
            blockBufferAllocator: kCFAllocatorDefault,
            blockBufferMemoryAllocator: kCFAllocatorDefault,
            flags: 0,
            bufferList: self.mutableAudioBufferList
        ) == noErr else { return nil }

        return sampleBuffer
    }
}

print("Recorder starting...")
let app = RecorderCLI()
app.executeRecordingProcess() 