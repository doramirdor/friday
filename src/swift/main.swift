import Foundation

print("DEBUG: Swift recorder starting")
print("DEBUG: CLI args  →", CommandLine.arguments)

// Kick off the recorder
let recorder = RecorderCLI()
recorder.executeRecordingProcess()

// NOTE: RecorderCLI exits the process itself via ResponseHandler,
// so there’s nothing else to do here.
