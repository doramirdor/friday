import Foundation
import CoreAudio
import AVFoundation

/**
 * A utility class for managing and identifying audio devices on macOS
 */
class AudioDeviceManager {
    /**
     * Lists audio input devices detected on the system
     */
    static func listAudioDevices() -> [String] {
        var deviceList = [String]()
        
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        
        var propertySize: UInt32 = 0
        var result = AudioObjectGetPropertyDataSize(
            AudioObjectID(kAudioObjectSystemObject),
            &propertyAddress,
            0,
            nil,
            &propertySize
        )
        
        guard result == noErr else {
            print("Error getting audio devices size: \(result)")
            return deviceList
        }
        
        let deviceCount = Int(propertySize) / MemoryLayout<AudioDeviceID>.size
        var deviceIDs = [AudioDeviceID](repeating: 0, count: deviceCount)
        
        result = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &propertyAddress,
            0,
            nil,
            &propertySize,
            &deviceIDs
        )
        
        guard result == noErr else {
            print("Error getting audio devices: \(result)")
            return deviceList
        }
        
        for deviceID in deviceIDs {
            var deviceNameProperty = AudioObjectPropertyAddress(
                mSelector: kAudioDevicePropertyDeviceName,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain
            )
            
            var deviceNameSize = UInt32(256)
            var deviceNameBuffer = [UInt8](repeating: 0, count: 256)
            
            result = AudioObjectGetPropertyData(
                deviceID,
                &deviceNameProperty,
                0,
                nil,
                &deviceNameSize,
                &deviceNameBuffer
            )
            
            if result == noErr {
                let deviceName = String(bytes: deviceNameBuffer.prefix(Int(deviceNameSize)), encoding: .utf8) ?? "Unknown Device"
                
                // Check if device has input capability
                var inputChannelsAddress = AudioObjectPropertyAddress(
                    mSelector: kAudioDevicePropertyStreamConfiguration,
                    mScope: kAudioDevicePropertyScopeInput,
                    mElement: kAudioObjectPropertyElementMain
                )
                
                var propsize = UInt32(MemoryLayout<AudioBufferList>.size)
                var bufferList = AudioBufferList()
                
                result = AudioObjectGetPropertyData(
                    deviceID,
                    &inputChannelsAddress,
                    0,
                    nil,
                    &propsize,
                    &bufferList
                )
                
                if result == noErr && bufferList.mNumberBuffers > 0 {
                    deviceList.append(deviceName)
                }
            }
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
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultInputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        
        var deviceID: AudioDeviceID = 0
        var propertySize = UInt32(MemoryLayout<AudioDeviceID>.size)
        
        var result = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &propertyAddress,
            0,
            nil,
            &propertySize,
            &deviceID
        )
        
        guard result == noErr else { return nil }
        
        // Get the volume
        propertyAddress.mSelector = kAudioDevicePropertyVolumeScalar
        propertyAddress.mScope = kAudioDevicePropertyScopeInput
        
        var volume: Float32 = 0.0
        propertySize = UInt32(MemoryLayout<Float32>.size)
        
        result = AudioObjectGetPropertyData(
            deviceID,
            &propertyAddress,
            0,
            nil,
            &propertySize,
            &volume
        )
        
        if result == noErr {
            return volume * 100.0
        }
        
        return nil
    }
    
    /**
     * Logs diagnostic information about audio devices
     */
    static func logAudioDiagnostics() {
        print("🎤 Audio Device Diagnostics:")
        print("-----------------------------")
        
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        
        var propertySize: UInt32 = 0
        var result = AudioObjectGetPropertyDataSize(
            AudioObjectID(kAudioObjectSystemObject),
            &propertyAddress,
            0,
            nil,
            &propertySize
        )
        
        guard result == noErr else {
            print("Error getting audio devices size: \(result)")
            return
        }
        
        let deviceCount = Int(propertySize) / MemoryLayout<AudioDeviceID>.size
        var deviceIDs = [AudioDeviceID](repeating: 0, count: deviceCount)
        
        result = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &propertyAddress,
            0,
            nil,
            &propertySize,
            &deviceIDs
        )
        
        guard result == noErr else {
            print("Error getting audio devices: \(result)")
            return
        }
        
        var inputDeviceCount = 0
        
        for deviceID in deviceIDs {
            // Get device name
            var deviceNameProperty = AudioObjectPropertyAddress(
                mSelector: kAudioDevicePropertyDeviceName,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain
            )
            
            var deviceNameSize = UInt32(256)
            var deviceNameBuffer = [UInt8](repeating: 0, count: 256)
            
            result = AudioObjectGetPropertyData(
                deviceID,
                &deviceNameProperty,
                0,
                nil,
                &deviceNameSize,
                &deviceNameBuffer
            )
            
            if result == noErr {
                let deviceName = String(bytes: deviceNameBuffer.prefix(Int(deviceNameSize)), encoding: .utf8) ?? "Unknown Device"
                
                // Check if device has input capability
                var inputChannelsAddress = AudioObjectPropertyAddress(
                    mSelector: kAudioDevicePropertyStreamConfiguration,
                    mScope: kAudioDevicePropertyScopeInput,
                    mElement: kAudioObjectPropertyElementMain
                )
                
                var propsize = UInt32(MemoryLayout<AudioBufferList>.size)
                var bufferList = AudioBufferList()
                
                result = AudioObjectGetPropertyData(
                    deviceID,
                    &inputChannelsAddress,
                    0,
                    nil,
                    &propsize,
                    &bufferList
                )
                
                if result == noErr && bufferList.mNumberBuffers > 0 {
                    inputDeviceCount += 1
                    print("Found input device: \(deviceName)")
                }
            }
        }
        
        print("Input devices detected: \(inputDeviceCount)")
        
        // Get microphone volume
        if let volume = getMicrophoneInputLevel() {
            print("Microphone input level: \(volume)%")
        } else {
            print("Could not get microphone input level")
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
    
    static func setMicrophoneInputLevel(_ volume: Float) -> Bool {
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultInputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        
        var deviceID: AudioDeviceID = 0
        var propertySize = UInt32(MemoryLayout<AudioDeviceID>.size)
        
        var result = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &propertyAddress,
            0,
            nil,
            &propertySize,
            &deviceID
        )
        
        guard result == noErr else { return false }
        
        // Set the volume
        propertyAddress.mSelector = kAudioDevicePropertyVolumeScalar
        propertyAddress.mScope = kAudioDevicePropertyScopeInput
        
        var newVolume = volume / 100.0
        propertySize = UInt32(MemoryLayout<Float32>.size)
        
        result = AudioObjectGetPropertyData(
            deviceID,
            &propertyAddress,
            0,
            nil,
            &propertySize,
            &newVolume
        )
        
        return result == noErr
    }
} 