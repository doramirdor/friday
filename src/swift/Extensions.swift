import Foundation
import AVFoundation
import ScreenCaptureKit

// Date → filename safe string
extension Date {
    func toFileName() -> String {
        let f = DateFormatter()
        f.dateFormat = "y-MM-dd HH.mm.ss"
        return f.string(from: self)
    }
}

// CMSampleBuffer → AVAudioPCMBuffer for easy writing
extension CMSampleBuffer {
    var pcmBuffer: AVAudioPCMBuffer? {
        try? withAudioBufferList { list, _ -> AVAudioPCMBuffer? in
            guard let desc = formatDescription?.audioStreamBasicDescription else { return nil }
            guard let fmt = AVAudioFormat(standardFormatWithSampleRate: desc.mSampleRate, channels: desc.mChannelsPerFrame) else { return nil }
            return AVAudioPCMBuffer(pcmFormat: fmt, bufferListNoCopy: list.unsafePointer)
        }
    }
}
