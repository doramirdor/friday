#!/usr/bin/swift

import Foundation

// Test duration in seconds
let TEST_DURATION: TimeInterval = 5

print("🧪 Starting combined recording test")

// Generate a unique test filename
let timestamp = Int(Date().timeIntervalSince1970)
let testFilename = "test-combined-recording-\(timestamp)"

// Build the recorder command
let recorderPath = "./Recorder"
let recordingsPath = "\(NSHomeDirectory())/Documents/Friday Recordings"
let args = [
    "--record", recordingsPath,
    "--filename", testFilename,
    "--source", "both"
]

print("📝 Test configuration:")
print("- Recording path: \(recordingsPath)")
print("- Test filename: \(testFilename)")
print("- Duration: \(TEST_DURATION) seconds")

// Create and configure the process
let process = Process()
process.executableURL = URL(fileURLWithPath: recorderPath)
process.arguments = args

// Set up pipes for output
let outputPipe = Pipe()
let errorPipe = Pipe()
process.standardOutput = outputPipe
process.standardError = errorPipe

// Start the recording
print("\n🎬 Starting recording process...")
do {
    try process.run()
    
    // Wait for the test duration
    Thread.sleep(forTimeInterval: TEST_DURATION)
    
    // Send interrupt signal to stop recording
    print("\n⏹️ Stopping recording...")
    process.interrupt()
    process.waitUntilExit()
    
    // Get the output
    let outputData = outputPipe.fileHandleForReading.readDataToEndOfFile()
    let errorData = errorPipe.fileHandleForReading.readDataToEndOfFile()
    let output = String(data: outputData, encoding: .utf8) ?? ""
    let error = String(data: errorData, encoding: .utf8) ?? ""
    
    print("\n📋 Process output:")
    print(output)
    
    if !error.isEmpty {
        print("\n⚠️ Process errors:")
        print(error)
    }
    
    // Check for the output files
    let expectedFiles = [
        "\(recordingsPath)/\(testFilename)_system.wav",
        "\(recordingsPath)/\(testFilename)_mic.wav",
        "\(recordingsPath)/\(testFilename).wav",
        "\(recordingsPath)/\(testFilename).mp3"
    ]
    
    print("\n🔍 Checking output files:")
    for filePath in expectedFiles {
        let exists = FileManager.default.fileExists(atPath: filePath)
        let size = exists ? ((try? FileManager.default.attributesOfItem(atPath: filePath)[.size] as? UInt64) ?? 0) : 0
        print("- \(filePath.split(separator: "/").last!): \(exists ? "✅ (\(size/1024) KB)" : "❌ Not found")")
    }
    
    print("\n✅ Test completed")
    print("Exit code: \(process.terminationStatus)")
    
} catch {
    print("❌ Failed to start recording process: \(error)")
    exit(1)
} 