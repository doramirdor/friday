import Foundation
import CoreAudio
import AVFoundation

/// Utility class for managing and identifying audio devices on macOS.
final class AudioDeviceManager {
    // MARK: – Device enumeration
    static func listAudioInputDevices() -> [String] {
        var deviceNames: [String] = []

        var addr = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)

        var dataSize: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &dataSize) == noErr else { return [] }

        let deviceCount = Int(dataSize) / MemoryLayout<AudioDeviceID>.size
        var deviceIDs = [AudioDeviceID](repeating: 0, count: deviceCount)
        guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &dataSize, &deviceIDs) == noErr else { return [] }

        for id in deviceIDs {
            if hasInput(id) {
                deviceNames.append(name(of: id))
            }
        }
        return deviceNames
    }

    static func getDefaultInputDeviceName() -> String? { listAudioInputDevices().first }
    static func isMicrophoneAvailable() -> Bool { !listAudioInputDevices().isEmpty }

    // MARK: – Bluetooth detection
    /// Returns true if the current **output** device transport is Bluetooth.
    static func isCurrentOutputDeviceBluetooth() -> Bool {
        var addr = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)
        var devID: AudioDeviceID = 0
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &devID) == noErr else { return false }

        addr.mSelector = kAudioDevicePropertyTransportType
        var transport: UInt32 = 0
        size = UInt32(MemoryLayout<UInt32>.size)
        guard AudioObjectGetPropertyData(devID, &addr, 0, nil, &size, &transport) == noErr else { return false }
        return transport == kAudioDeviceTransportTypeBluetooth
    }

    // MARK: – Volume helpers
    /// Returns input volume (0‑100) of default input device, or nil.
    static func getMicrophoneInputLevel() -> Float? {
        guard let devID = defaultInputID() else { return nil }
        var addr = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyVolumeScalar,
            mScope: kAudioDevicePropertyScopeInput,
            mElement: kAudioObjectPropertyElementMain)
        var vol: Float32 = 0
        var size = UInt32(MemoryLayout<Float32>.size)
        guard AudioObjectGetPropertyData(devID, &addr, 0, nil, &size, &vol) == noErr else { return nil }
        return vol * 100
    }

    static func setMicrophoneInputLevel(_ level0to100: Float) -> Bool {
        guard let devID = defaultInputID() else { return false }
        var value = Float32(max(0, min(level0to100, 100)) / 100)
        var addr = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyVolumeScalar,
            mScope: kAudioDevicePropertyScopeInput,
            mElement: kAudioObjectPropertyElementMain)
        var size = UInt32(MemoryLayout<Float32>.size)
        return AudioObjectSetPropertyData(devID, &addr, 0, nil, size, &value) == noErr
    }

    // MARK: – Diagnostics
    static func logAudioDiagnostics() {
        print("🎤 Audio diagnostics:")
        for name in listAudioInputDevices() { print("  • \(name)") }
        if let vol = getMicrophoneInputLevel() { print("  Mic level: \(String(format: "%.0f", vol))%") }
        print("  Output over Bluetooth: \(isCurrentOutputDeviceBluetooth())")
    }

    // MARK: – Private helpers
    private static func defaultInputID() -> AudioDeviceID? {
        var addr = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultInputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)
        var devID: AudioDeviceID = 0
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        return AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &devID) == noErr ? devID : nil
    }

    private static func name(of id: AudioDeviceID) -> String {
        var addr = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyDeviceNameCFString,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)
        var cfName: CFString = "" as CFString
        var size = UInt32(MemoryLayout<CFString>.size)
        return AudioObjectGetPropertyData(id, &addr, 0, nil, &size, &cfName) == noErr ? (cfName as String) : "Unknown"
    }

    private static func hasInput(_ id: AudioDeviceID) -> Bool {
        var addr = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyStreamConfiguration,
            mScope: kAudioDevicePropertyScopeInput,
            mElement: kAudioObjectPropertyElementMain)
        var size: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(id, &addr, 0, nil, &size) == noErr else { return false }
        let bufferList = UnsafeMutablePointer<AudioBufferList>.allocate(capacity: 1)
        defer { bufferList.deallocate() }
        return AudioObjectGetPropertyData(id, &addr, 0, nil, &size, bufferList) == noErr && bufferList.pointee.mNumberBuffers > 0
    }
}

