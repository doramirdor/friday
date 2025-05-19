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

class RecorderCLI: NSObject, SCStreamDelegate, SCStreamOutput, AVAudioRecorderDelegate, AVAudioPlayerDelegate {
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
    var audioSource: String = "system" // Default to system audio
    var microphoneRecorder: AVAudioRecorder?
    
    // We'll stop using AVAudioSession on macOS altogether
    #if os(iOS)
    var audioSession: AVAudioSession?
    #endif
    
    // For combined recording
    var audioEngine: AVAudioEngine?
    var systemAudioFormat: AVAudioFormat?
    var micRecordingActive = false
    var systemRecordingActive = false
    
    // Temporary files for combined recording
    var systemTempWavPath: String?
    var micTempWavPath: String?
    var combinedTempWavPath: String?

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
        
        // Check if audio source is specified
        if let sourceIndex = arguments.firstIndex(of: "--source"), sourceIndex + 1 < arguments.count {
            let source = arguments[sourceIndex + 1].lowercased()
            if source == "mic" || source == "system" || source == "both" {
                audioSource = source
                print("Using audio source: \(audioSource)")
            } else {
                print("Invalid audio source: \(source). Using default: system")
            }
        }
    }

    func executeRecordingProcess() {
        if audioSource == "system" || audioSource == "both" {
            // First check permissions for system audio
            if !CGPreflightScreenCaptureAccess() {
                ResponseHandler.returnResponse(["code": "PERMISSION_DENIED", "error": "Screen recording permission is required for system audio"])
                return
            }
        }
        
        // Create timestamp and filename
        let timestamp = Date()
        let formattedTimestamp = ISO8601DateFormatter().string(from: timestamp)
        
        // Generate unique timestamp-based filename if none provided
        let baseFilename: String
        if let providedFilename = self.recordingFilename, !providedFilename.isEmpty {
            baseFilename = providedFilename
        } else {
            baseFilename = timestamp.toFormattedFileName()
        }
        
        // Set up paths for different recording types
        self.tempWavPath = "\(self.recordingPath!)/\(baseFilename).wav"
        self.finalMp3Path = "\(self.recordingPath!)/\(baseFilename).mp3"
        
        if audioSource == "both" {
            // For combined recording, set up additional temp paths
            self.systemTempWavPath = "\(self.recordingPath!)/\(baseFilename)_system.wav"
            self.micTempWavPath = "\(self.recordingPath!)/\(baseFilename)_mic.wav"
            self.combinedTempWavPath = self.tempWavPath
            
            // Start combined recording
            setupCombinedRecording(formattedTimestamp: formattedTimestamp)
        } else if audioSource == "system" {
            // Start system audio recording
        self.updateAvailableContent()
        } else {
            // Microphone recording
            setupMicrophoneRecording()
        }
        
        setupInterruptSignalHandler()
        
        if audioSource == "system" {
        setupStreamFunctionTimeout()
        }
        
        semaphoreRecordingStopped.wait()
    }
    
    func setupCombinedRecording(formattedTimestamp: String) {
        print("Setting up combined recording (system audio + microphone)...")
        
        // Track initialization status
        var micSetupSuccess = false
        var systemSetupSuccess = false
        var micError: Error? = nil
        var systemError: Error? = nil
        
        // Step 1: Setup microphone component
        print("Starting microphone component of combined recording...")
        do {
            try setupMicrophoneForCombinedRecording()
            micSetupSuccess = true
            print("✅ Microphone recording initialized successfully")
        } catch {
            micError = error
            print("❌ Failed to setup microphone recording: \(error.localizedDescription)")
        }
        
        // Step 2: Setup system audio component
        print("Starting system audio component of combined recording...")
        do {
            // Check screen recording permission first
            if !CGPreflightScreenCaptureAccess() {
                systemError = NSError(domain: "RecorderCLI", code: 201, 
                    userInfo: [NSLocalizedDescriptionKey: "Screen recording permission is required for system audio"])
                throw systemError!
            }
            
            // Initialize system audio recording
            self.updateAvailableContent()
            systemSetupSuccess = true
            print("✅ System audio recording initialized successfully")
        } catch {
            systemError = error
            print("❌ Failed to setup system audio recording: \(error.localizedDescription)")
            
            // Clean up microphone recording if system audio fails
            if micSetupSuccess {
                print("Stopping microphone recording since system audio failed")
                microphoneRecorder?.stop()
                micRecordingActive = false
            }
        }
        
        // Step 3: Report results based on initialization success
        if micSetupSuccess && systemSetupSuccess {
            print("✅ Combined recording initialized successfully")
            // Send success response
            ResponseHandler.returnResponse([
                "code": "RECORDING_STARTED", 
                "path": self.finalMp3Path!, 
                "timestamp": formattedTimestamp,
                "combined": true
            ], shouldExitProcess: false)
        } 
        else if !micSetupSuccess && !systemSetupSuccess {
            // Both components failed
            print("❌ Both recording components failed to initialize")
            ResponseHandler.returnResponse([
                "code": "CAPTURE_FAILED",
                "error": "Failed to initialize both recording components: Mic: \(micError?.localizedDescription ?? "Unknown error"), System: \(systemError?.localizedDescription ?? "Unknown error")"
            ])
        }
        else if !micSetupSuccess {
            // Only microphone failed
            print("❌ Microphone component failed to initialize")
            ResponseHandler.returnResponse([
                "code": "CAPTURE_FAILED",
                "error": "Failed to initialize microphone component: \(micError?.localizedDescription ?? "Unknown error")"
            ])
        }
        else {
            // Only system audio failed
            print("❌ System audio component failed to initialize")
            ResponseHandler.returnResponse([
                "code": "CAPTURE_FAILED",
                "error": "Failed to initialize system audio component: \(systemError?.localizedDescription ?? "Unknown error")"
            ])
        }
    }
    
    func setupMicrophoneForCombinedRecording() {
        print("Setting up microphone for combined recording...")
        
        if microphoneRecorder != nil {
            return  // Already set up
        }
        
        // Log audio device info
        print("Checking audio input devices on macOS:")
        AudioDeviceManager.logAudioDiagnostics()
        
        // Check microphone volume
        if let micVolume = AudioDeviceManager.getMicrophoneInputLevel() {
            print("Microphone input volume: \(micVolume)%")
            if micVolume == 0 {
                print("⚠️ Warning: Microphone is muted (volume is 0%)")
                print("Please increase microphone volume in System Settings > Sound > Input")
            }
        }
        
        // Configure recording settings
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatLinearPCM),
            AVSampleRateKey: 44100.0,
            AVNumberOfChannelsKey: 2,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]
        
        do {
            guard let micPath = micTempWavPath else {
                print("Mic temp path not set")
                throw NSError(domain: "RecorderCLI", code: 101, userInfo: [NSLocalizedDescriptionKey: "Mic temp path not set"])
            }
            
            // First check if the file already exists and remove it if it does
            if FileManager.default.fileExists(atPath: micPath) {
                try FileManager.default.removeItem(atPath: micPath)
                print("Removed existing microphone recording file at \(micPath)")
            }
            
            // Create recorder
            microphoneRecorder = try AVAudioRecorder(url: URL(fileURLWithPath: micPath), settings: settings)
            guard let micRecorder = microphoneRecorder else {
                throw NSError(domain: "RecorderCLI", code: 102, userInfo: [NSLocalizedDescriptionKey: "Could not initialize microphone recorder"])
            }
            
            micRecorder.delegate = self
            
            // Add meter monitoring for audio levels
            micRecorder.isMeteringEnabled = true
            
            if micRecorder.prepareToRecord() {
                // Start recording
                let success = micRecorder.record()
                
                if success {
                    print("Microphone component started successfully")
                    micRecordingActive = true
                    
                    // Start a timer to monitor microphone audio levels
                    DispatchQueue.global(qos: .background).async { [weak self] in
                        guard let self = self else { return }
                        
                        while self.micRecordingActive && self.microphoneRecorder?.isRecording == true {
                            self.microphoneRecorder?.updateMeters()
                            let avgPower = self.microphoneRecorder?.averagePower(forChannel: 0) ?? -160.0
                            let peakPower = self.microphoneRecorder?.peakPower(forChannel: 0) ?? -160.0
                            print("Mic levels - Avg: \(avgPower) dB, Peak: \(peakPower) dB")
                            
                            // Check if mic is picking up sound (above -50dB)
                            if avgPower > -50.0 {
                                print("✅ Microphone is detecting sound")
                            } else {
                                print("⚠️ Microphone level is low")
                            }
                            
                            Thread.sleep(forTimeInterval: 1.0) // Check once per second
                        }
                    }
                } else {
                    print("Failed to start microphone component")
                    throw NSError(domain: "RecorderCLI", code: 103, userInfo: [NSLocalizedDescriptionKey: "Failed to start microphone recording"])
                }
            } else {
                print("Failed to prepare microphone component")
                throw NSError(domain: "RecorderCLI", code: 104, userInfo: [NSLocalizedDescriptionKey: "Failed to prepare microphone recording"])
            }
        } catch {
            print("Microphone setup error: \(error.localizedDescription)")
            throw error
        }
    }
    
    func setupMicrophoneRecording() {
        print("Setting up microphone recording...")
        
        // Create timestamp and filename
        let timestamp = Date()
        let formattedTimestamp = ISO8601DateFormatter().string(from: timestamp)
        
        // Generate unique timestamp-based filename if none provided
        let baseFilename: String
        if let providedFilename = self.recordingFilename, !providedFilename.isEmpty {
            baseFilename = providedFilename
        } else {
            baseFilename = timestamp.toFormattedFileName()
        }
        
        // Set up temporary WAV path and final MP3 path
        self.tempWavPath = "\(self.recordingPath!)/\(baseFilename).wav"
        self.finalMp3Path = "\(self.recordingPath!)/\(baseFilename).mp3"
        
        print("Will save recording to: \(tempWavPath!)")
        
        // Log audio device info
        print("Checking audio input devices on macOS:")
        AudioDeviceManager.logAudioDiagnostics()
            
        // Configure recording settings
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatLinearPCM),
            AVSampleRateKey: 44100.0,
            AVNumberOfChannelsKey: 2,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]
        
        do {
            // Create recorder
            microphoneRecorder = try AVAudioRecorder(url: URL(fileURLWithPath: tempWavPath!), settings: settings)
            microphoneRecorder?.delegate = self
            microphoneRecorder?.isMeteringEnabled = true
            
            if microphoneRecorder?.prepareToRecord() == true {
                // Start recording
                let success = microphoneRecorder?.record() ?? false
                
                if success {
                    print("Microphone recording started successfully")
                    
                    // Start a timer to monitor microphone audio levels
                    DispatchQueue.global(qos: .background).async { [weak self] in
                        guard let self = self else { return }
                        
                        while self.microphoneRecorder?.isRecording == true {
                            self.microphoneRecorder?.updateMeters()
                            let avgPower = self.microphoneRecorder?.averagePower(forChannel: 0) ?? -160.0
                            let peakPower = self.microphoneRecorder?.peakPower(forChannel: 0) ?? -160.0
                            print("Mic levels - Avg: \(avgPower) dB, Peak: \(peakPower) dB")
                            
                            // Check if mic is picking up sound
                            if avgPower > -50.0 {
                                print("✅ Microphone is detecting sound")
                            } else {
                                print("⚠️ Microphone level is low")
                            }
                            
                            Thread.sleep(forTimeInterval: 1.0)
                        }
                    }
                    
                    // Notify recording started
                    ResponseHandler.returnResponse([
                        "code": "RECORDING_STARTED", 
                        "path": self.finalMp3Path!, 
                        "timestamp": formattedTimestamp
                    ], shouldExitProcess: false)
                } else {
                    print("Failed to start microphone recording")
                    ResponseHandler.returnResponse([
                        "code": "CAPTURE_FAILED", 
                        "error": "Failed to start microphone recording"
                    ])
                }
            } else {
                print("Failed to prepare microphone recording")
                ResponseHandler.returnResponse([
                    "code": "CAPTURE_FAILED", 
                    "error": "Failed to prepare microphone recording"
                ])
            }
        } catch {
            print("Microphone recording setup error: \(error.localizedDescription)")
            ResponseHandler.returnResponse([
                "code": "CAPTURE_FAILED", 
                "error": "Microphone setup error: \(error.localizedDescription)"
            ])
        }
    }
    
    // AVAudioRecorderDelegate methods
    func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        print("Microphone recording finished, success: \(flag)")
        
        if audioSource == "both" {
            micRecordingActive = false
            
            // For combined recording, we need both recordings to finish
            if !systemRecordingActive {
                // Both recordings are done, combine them
                combineAndConvertRecordings()
            }
        } else if flag {
            // Standard mic-only recording
            convertAndFinish()
        } else {
            ResponseHandler.returnResponse([
                "code": "RECORDING_STOPPED", 
                "error": "Recording failed to complete properly"
            ])
        }
    }
    
    func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        print("Microphone recording encode error: \(error?.localizedDescription ?? "unknown")")
        ResponseHandler.returnResponse([
            "code": "RECORDING_ERROR", 
            "error": "Encoding error: \(error?.localizedDescription ?? "unknown")"
        ])
    }

    func setupInterruptSignalHandler() {
        // Use the global function as signal handler
        signal(SIGINT, handleInterruptSignal)
    }
    
    func combineAndConvertRecordings() {
        // Combine system audio and microphone recordings
        print("Combining system audio and microphone recordings...")
        
        guard let systemPath = systemTempWavPath,
              let micPath = micTempWavPath,
              let combinedPath = combinedTempWavPath else {
            print("Error: Missing file paths for combined recording")
            ResponseHandler.returnResponse([
                "code": "RECORDING_ERROR",
                "error": "Missing file paths for combined recording"
            ])
            return
        }
        
        // Check if both files exist
        let fileManager = FileManager.default
        guard fileManager.fileExists(atPath: systemPath) else {
            print("System audio file doesn't exist: \(systemPath)")
            // If no system audio, just use mic recording
            try? fileManager.copyItem(atPath: micPath, toPath: combinedPath)
            print("Using microphone recording only (system audio file missing)")
            convertAndFinish()
            return
        }
        
        guard fileManager.fileExists(atPath: micPath) else {
            print("Microphone file doesn't exist: \(micPath)")
            // If no mic recording, just use system audio
            try? fileManager.copyItem(atPath: systemPath, toPath: combinedPath)
            print("Using system audio recording only (microphone file missing)")
            convertAndFinish()
            return
        }
        
        // Get file sizes for diagnosis
        do {
            let systemAttrs = try fileManager.attributesOfItem(atPath: systemPath)
            let micAttrs = try fileManager.attributesOfItem(atPath: micPath)
            if let systemSize = systemAttrs[.size] as? UInt64,
               let micSize = micAttrs[.size] as? UInt64 {
                print("System audio file size: \(systemSize / 1024) KB")
                print("Microphone file size: \(micSize / 1024) KB")
                
                // Check for suspiciously small files that might indicate no recording occurred
                if systemSize < 1024 {  // Less than 1KB
                    print("⚠️ Warning: System audio file is suspiciously small: \(systemSize) bytes")
                }
                
                if micSize < 1024 {  // Less than 1KB
                    print("⚠️ Warning: Microphone audio file is suspiciously small: \(micSize) bytes")
                }
            }
        } catch {
            print("Error getting file sizes: \(error.localizedDescription)")
        }
        
        // Create a debug/test file with a simple ffmpeg command to validate merging functionality
        print("Creating test file to validate ffmpeg functionality...")
        let testPath = "\(self.recordingPath!)/ffmpeg_test_output.wav"
        
        do {
            let testTask = Process()
            testTask.executableURL = URL(fileURLWithPath: "/bin/sh")
            testTask.arguments = [
                "-c",
                "ffmpeg -version && ffmpeg -f lavfi -i sine=frequency=440:duration=1 \"\(testPath)\" -y"
            ]
            
            let outputPipe = Pipe()
            let errorPipe = Pipe()
            testTask.standardOutput = outputPipe
            testTask.standardError = errorPipe
            
            try testTask.run()
            testTask.waitUntilExit()
            
            let outputData = outputPipe.fileHandleForReading.readDataToEndOfFile()
            let errorData = errorPipe.fileHandleForReading.readDataToEndOfFile()
            let output = String(data: outputData, encoding: .utf8) ?? ""
            let error = String(data: errorData, encoding: .utf8) ?? ""
            
            print("ffmpeg test output: \(output)")
            if !error.isEmpty {
                print("ffmpeg test error: \(error)")
            }
            
            print("ffmpeg test exit status: \(testTask.terminationStatus)")
        } catch {
            print("Error running ffmpeg test: \(error.localizedDescription)")
        }
        
        // Mix the two audio files using ffmpeg
        do {
            // Run ffmpeg to mix the files with detailed output
            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/bin/sh")
            
            // Construct a command that keeps both audio streams at their original volume
            // and ensures both are audible in the output
            let ffmpegCommand = "ffmpeg -y -i \"\(systemPath)\" -i \"\(micPath)\" -filter_complex \"[0:a]volume=1.0[a];[1:a]volume=1.0[b];[a][b]amix=inputs=2:duration=longest\" \"\(combinedPath)\" -v verbose"
            print("Running ffmpeg command: \(ffmpegCommand)")
            
            task.arguments = ["-c", ffmpegCommand]
            
            let outputPipe = Pipe()
            let errorPipe = Pipe()
            task.standardOutput = outputPipe
            task.standardError = errorPipe
            
            try task.run()
            task.waitUntilExit()
            
            // Capture and log the command output
            let outputData = outputPipe.fileHandleForReading.readDataToEndOfFile()
            let errorData = errorPipe.fileHandleForReading.readDataToEndOfFile()
            let output = String(data: outputData, encoding: .utf8) ?? ""
            let error = String(data: errorData, encoding: .utf8) ?? ""
            
            if !output.isEmpty {
                print("ffmpeg output: \(output)")
            }
            
            if !error.isEmpty {
                print("ffmpeg error output: \(error)")
            }
            
            if task.terminationStatus == 0 {
                print("Successfully combined audio recordings")
                
                // Verify the combined file exists and has reasonable size
                if fileManager.fileExists(atPath: combinedPath) {
                    do {
                        let attrs = try fileManager.attributesOfItem(atPath: combinedPath)
                        if let size = attrs[.size] as? UInt64 {
                            print("Combined file size: \(size / 1024) KB")
                            
                            // Warn if file size is unexpectedly small
                            if size < 1024 * 10 { // Less than 10KB
                                print("⚠️ Warning: Combined file is suspiciously small: \(size) bytes")
                            }
                        }
                    } catch {
                        print("Error getting combined file size: \(error)")
                    }
                } else {
                    print("⚠️ Warning: Combined file was not created at \(combinedPath)")
                }
                
                // Clean up individual recordings
                try? fileManager.removeItem(atPath: systemPath)
                try? fileManager.removeItem(atPath: micPath)
                
                // Convert final WAV to MP3
                convertAndFinish()
            } else {
                print("Failed to combine audio recordings, exit code: \(task.terminationStatus)")
                print("Using simple file concatenation as fallback")
                
                // Try alternative approach - concatenating files instead of mixing
                let alternativeTask = Process()
                alternativeTask.executableURL = URL(fileURLWithPath: "/bin/sh")
                alternativeTask.arguments = [
                    "-c",
                    "ffmpeg -y -i \"\(systemPath)\" -i \"\(micPath)\" -filter_complex \"[0:a][1:a]concat=n=2:v=0:a=1\" \"\(combinedPath)\" -v verbose"
                ]
                
                try alternativeTask.run()
                alternativeTask.waitUntilExit()
                
                if alternativeTask.terminationStatus == 0 {
                    print("Alternative combination method successful")
                    convertAndFinish()
                } else {
                    // If alternative fails, just use system audio
                    print("Both combination methods failed, using system audio only")
                    try? fileManager.copyItem(atPath: systemPath, toPath: combinedPath)
                    convertAndFinish()
                }
            }
        } catch {
            print("Error combining audio recordings: \(error.localizedDescription)")
            // Fallback to system audio
            print("Using system audio only due to error")
            try? fileManager.copyItem(atPath: systemPath, toPath: combinedPath)
            convertAndFinish()
        }
    }
    
    func convertAndFinish() {
        let timestamp = Date()
        let formattedTimestamp = ISO8601DateFormatter().string(from: timestamp)
        
        // Stop all recordings first
        if audioSource == "both" {
            // Stop the microphone component if it's still recording
            if microphoneRecorder?.isRecording == true {
                microphoneRecorder?.stop()
                micRecordingActive = false
            }
            
            // Stop the system audio component if it's still active
            if RecorderCLI.screenCaptureStream != nil {
                RecorderCLI.terminateRecording()
                systemRecordingActive = false
            }
        } else if audioSource == "mic" && microphoneRecorder?.isRecording == true {
            microphoneRecorder?.stop()
        }
        
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
                        "path": mp3Path,
                        "combined": audioSource == "both"
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
                                "path": mp3Path,
                                "combined": audioSource == "both"
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
                                    "error": "MP3 conversion failed, renamed WAV to MP3",
                                    "combined": audioSource == "both"
                                ])
                            } catch {
                                // If rename fails, just return the WAV
                                ResponseHandler.returnResponse([
                                    "code": "RECORDING_STOPPED", 
                                    "timestamp": formattedTimestamp,
                                    "path": wavPath,
                                    "error": "MP3 conversion failed with both methods",
                                    "combined": audioSource == "both"
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
                            "error": "MP3 conversion error: \(error.localizedDescription)",
                            "combined": audioSource == "both"
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
                    "error": "MP3 conversion error: \(error.localizedDescription)",
                    "combined": audioSource == "both"
                ])
            }
        } else {
            // No WAV file found
            ResponseHandler.returnResponse([
                "code": "RECORDING_STOPPED", 
                "timestamp": formattedTimestamp,
                "path": outputPath,
                "error": "No recording file created",
                "combined": audioSource == "both"
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
                
                // For combined recording, use a different path
                if self.audioSource == "both" {
                    if self.systemTempWavPath == nil {
                        self.systemTempWavPath = "\(self.recordingPath!)/\(baseFilename)_system.wav" 
                    }
                    
                    // Prepare the audio file for system audio
                    self.prepareAudioFile(at: self.systemTempWavPath!)
                    self.systemRecordingActive = true
                } else {
                    // First save as WAV (much more reliable format for capturing)
                    self.tempWavPath = "\(self.recordingPath!)/\(baseFilename).wav"
                    print("Saving recording to temporary WAV: \(self.tempWavPath!)")
                    
                    // Set the final MP3 path
                    self.finalMp3Path = "\(self.recordingPath!)/\(baseFilename).mp3"
                    
                    // Prepare the audio file (using WAV for capture)
                    self.prepareAudioFile(at: self.tempWavPath!)
                }

                // Only send RECORDING_STARTED for system-only recording
                // For combined recording, we've already sent this
                if self.audioSource != "both" {
                    ResponseHandler.returnResponse([
                        "code": "RECORDING_STARTED", 
                        "path": self.finalMp3Path!, 
                        "timestamp": formattedTimestamp
                    ], shouldExitProcess: false)
                }
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
            
            if content?.displays.isEmpty ?? true {
                print("No displays found for recording")
                ResponseHandler.returnResponse(["code": "NO_DISPLAY_FOUND"])
                return
            }
            
            print("Found \(content?.displays.count ?? 0) display(s) for recording")
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
            
            if audioSource == "both" {
                systemRecordingActive = true
            }
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
        
        if audioSource == "both" {
            systemRecordingActive = false
            
            // If microphone is also done, finalize the recording
            if !micRecordingActive {
                combineAndConvertRecordings()
            }
        } else {
        RecorderCLI.terminateRecording()
        semaphoreRecordingStopped.signal()
        }
    }

    static func terminateRecording() {
        print("Terminating recording...")
        
        // Stop screen capture stream if active
        screenCaptureStream?.stopCapture()
        screenCaptureStream = nil
        audioFileForRecording = nil
        
        // Stop microphone recording if active
        if let recorder = recorderInstance?.microphoneRecorder, recorder.isRecording {
            recorder.stop()
        }
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

// Main execution function
@main
struct RecorderApp {
    static func main() {
        print("Recorder starting...")
let app = RecorderCLI()
app.executeRecordingProcess() 
    }
} 