import Foundation
import CoreAudio

/**
 * A utility class for managing and identifying audio devices on macOS
 */
class AudioDeviceManager {
    /**
     * Lists audio input devices detected on the system
     */
    static func listAudioDevices() -> [String] {
        var deviceList = [String]()
        
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/system_profiler")
        task.arguments = ["SPAudioDataType"]
        
        let outputPipe = Pipe()
        task.standardOutput = outputPipe
        
        do {
            try task.run()
            task.waitUntilExit()
            
            let outputData = outputPipe.fileHandleForReading.readDataToEndOfFile()
            if let output = String(data: outputData, encoding: .utf8) {
                // Parse the output to extract audio devices
                let lines = output.components(separatedBy: .newlines)
                var isInput = false
                
                for line in lines {
                    if line.contains("Input:") {
                        isInput = true
                    } else if line.contains("Output:") {
                        isInput = false
                    } else if isInput && line.contains(":") && !line.contains("Input:") {
                        let device = line.trimmingCharacters(in: .whitespacesAndNewlines)
                            .components(separatedBy: ":")
                            .first?
                            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                        
                        if !device.isEmpty {
                            deviceList.append(device)
                        }
                    }
                }
            }
        } catch {
            print("Error listing audio devices: \(error.localizedDescription)")
        }
        
        return deviceList
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
    static func getMicrophoneInputLevel() -> Float? {
        // Use AppleScript to get the input volume (macOS specific)
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
               let level = Float(output) {
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
    
    static func checkMicrophonePermission() -> Bool {
        // macOS doesn't have the same permission model as iOS
        // Instead, when the app tries to use the microphone, the system will prompt for permission
        return true
    }
    
    static func requestMicrophonePermission(completion: @escaping (Bool) -> Void) {
        // On macOS, we can't explicitly request permission ahead of time
        // The system will prompt when the app first tries to access the microphone
        completion(true)
    }
} 