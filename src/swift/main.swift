import Foundation

print("DEBUG: Swift Recorder main.swift starting up")
print("DEBUG: Arguments: \(CommandLine.arguments)")

// Create an instance of RecorderCLI and run it
print("DEBUG: Creating RecorderCLI instance")
let recorder = RecorderCLI()
print("DEBUG: Executing recording process")
recorder.executeRecordingProcess()
print("DEBUG: Recording process finished") 