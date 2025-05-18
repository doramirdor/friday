import Foundation

/**
 * A utility class for managing and identifying audio devices on macOS
 */
class AudioDeviceManager {
    /**
     * Lists audio input devices detected on the system
     */
    static func listAudioDevices() -> [String] {
        var deviceNames: [String] = []
        
        // Execute system_profiler command to get audio device information
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        task.arguments = ["system_profiler", "SPAudioDataType"]
        
        let outputPipe = Pipe()
        task.standardOutput = outputPipe
        
        do {
            try task.run()
            task.waitUntilExit()
            
            let outputData = outputPipe.fileHandleForReading.readDataToEndOfFile()
            if let output = String(data: outputData, encoding: .utf8) {
                // Split on Input Devices section
                if let inputSection = output.components(separatedBy: "Input Devices:").dropFirst().first,
                   let pureInputSection = inputSection.components(separatedBy: "Output Devices:").first {
                    
                    // Parse the devices section
                    let lines = pureInputSection.components(separatedBy: "\n")
                    for line in lines {
                        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
                        if trimmed.contains(":") && !trimmed.isEmpty {
                            deviceNames.append(trimmed)
                        }
                    }
                }
            }
        } catch {
            print("Error listing audio devices: \(error.localizedDescription)")
        }
        
        // If we couldn't get devices, add a default entry
        if deviceNames.isEmpty {
            deviceNames.append("Default system microphone")
        }
        
        return deviceNames
    }
    
    /**
     * Lists audio input devices (alias for listAudioDevices for compatibility)
     */
    static func listAudioInputDevices() -> [String] {
        return listAudioDevices()
    }
    
    /**
     * Gets the default audio input device
     */
    static func getDefaultInputDevice() -> String? {
        let devices = listAudioDevices()
        return devices.first
    }
    
    /**
     * Checks if a microphone is currently available
     */
    static func isMicrophoneAvailable() -> Bool {
        return !listAudioDevices().isEmpty
    }
    
    /**
     * Gets the current microphone input level (volume)
     * Returns a value between 0-100 or nil if not available
     */
    static func getMicrophoneInputLevel() -> Int? {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        task.arguments = ["-e", "input volume of (get volume settings)"]
        
        let outputPipe = Pipe()
        task.standardOutput = outputPipe
        
        do {
            try task.run()
            task.waitUntilExit()
            
            let outputData = outputPipe.fileHandleForReading.readDataToEndOfFile()
            if let output = String(data: outputData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
               let level = Int(output) {
                return level
            }
        } catch {
            print("Error getting microphone level: \(error.localizedDescription)")
        }
        
        return nil
    }
    
    /**
     * Logs diagnostic information about audio devices
     */
    static func logAudioDiagnostics() {
        print("🎤 Audio Device Diagnostics:")
        print("-----------------------------")
        
        // Log input devices
        let inputDevices = listAudioDevices()
        print("Input devices detected: \(inputDevices.count)")
        for (index, device) in inputDevices.enumerated() {
            print("[\(index+1)] \(device)")
        }
        
        // Log microphone volume
        if let level = getMicrophoneInputLevel() {
            print("Microphone input level: \(level)%")
            if level == 0 {
                print("⚠️ Warning: Microphone volume is set to 0%")
            }
        } else {
            print("Could not determine microphone input level")
        }
        
        print("-----------------------------")
    }
} 