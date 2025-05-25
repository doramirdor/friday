import Foundation

struct SpeechRecognitionWord {
    let word: String
    let startTime: TimeInterval
    let endTime: TimeInterval
    let speakerTag: Int
    
    init(from json: [String: Any]) {
        self.word = json["word"] as? String ?? ""
        
        // Parse time strings like "1.100s" to TimeInterval
        let startTimeStr = json["startTime"] as? String ?? "0s"
        let endTimeStr = json["endTime"] as? String ?? "0s"
        self.startTime = TimeInterval(startTimeStr.replacingOccurrences(of: "s", with: "")) ?? 0
        self.endTime = TimeInterval(endTimeStr.replacingOccurrences(of: "s", with: "")) ?? 0
        
        self.speakerTag = json["speakerTag"] as? Int ?? 0
    }
}

struct SpeechRecognitionResult {
    let transcript: String
    let confidence: Double
    let words: [SpeechRecognitionWord]
    
    init(from json: [String: Any]) {
        let alternatives = json["alternatives"] as? [[String: Any]] ?? []
        let firstAlternative = alternatives.first ?? [:]
        
        self.transcript = firstAlternative["transcript"] as? String ?? ""
        self.confidence = firstAlternative["confidence"] as? Double ?? 0.0
        
        let wordsJson = firstAlternative["words"] as? [[String: Any]] ?? []
        self.words = wordsJson.map { SpeechRecognitionWord(from: $0) }
    }
}

class TranscriptConverter {
    static func convertToSRT(words: [SpeechRecognitionWord], outputPath: String) -> Bool {
        var srtContent = ""
        var currentSegment = 1
        var currentSpeaker = 0
        var segmentWords: [SpeechRecognitionWord] = []
        
        // Group words by speaker segments
        for word in words {
            if word.speakerTag != currentSpeaker && !segmentWords.isEmpty {
                // Write current segment
                srtContent += writeSRTSegment(
                    number: currentSegment,
                    startTime: segmentWords.first?.startTime ?? 0,
                    endTime: segmentWords.last?.endTime ?? 0,
                    speaker: currentSpeaker,
                    text: segmentWords.map { $0.word }.joined(separator: " ")
                )
                currentSegment += 1
                segmentWords = []
            }
            
            segmentWords.append(word)
            currentSpeaker = word.speakerTag
        }
        
        // Write final segment
        if !segmentWords.isEmpty {
            srtContent += writeSRTSegment(
                number: currentSegment,
                startTime: segmentWords.first?.startTime ?? 0,
                endTime: segmentWords.last?.endTime ?? 0,
                speaker: currentSpeaker,
                text: segmentWords.map { $0.word }.joined(separator: " ")
            )
        }
        
        // Write to file
        do {
            try srtContent.write(toFile: outputPath, atomically: true, encoding: .utf8)
            return true
        } catch {
            print("Error writing SRT file: \(error.localizedDescription)")
            return false
        }
    }
    
    static func convertToMarkdown(words: [SpeechRecognitionWord], outputPath: String) -> Bool {
        var mdContent = "# Transcript with Speaker Diarization\n\n"
        var currentSpeaker = 0
        var currentSegment: [String] = []
        var speakerChanges = 0
        var speakerStats: [Int: Int] = [:] // Track word count per speaker
        
        // Group words by speaker
        for word in words {
            if word.speakerTag != currentSpeaker {
                if !currentSegment.isEmpty {
                    // Write current segment
                    mdContent += formatMarkdownSegment(speaker: currentSpeaker, text: currentSegment.joined(separator: " "))
                    speakerChanges += 1
                }
                currentSegment = []
                currentSpeaker = word.speakerTag
            }
            
            currentSegment.append(word.word)
            speakerStats[word.speakerTag, default: 0] += 1
        }
        
        // Write final segment
        if !currentSegment.isEmpty {
            mdContent += formatMarkdownSegment(speaker: currentSpeaker, text: currentSegment.joined(separator: " "))
        }
        
        // Add statistics
        mdContent += "\n## Statistics\n\n"
        mdContent += "- Recording duration: \(String(format: "%.2f", words.last?.endTime ?? 0)) seconds\n"
        mdContent += "- Number of speaker changes: \(speakerChanges)\n"
        mdContent += "- Number of unique speakers: \(speakerStats.count)\n\n"
        
        mdContent += "### Speaker Word Counts\n\n"
        for (speaker, wordCount) in speakerStats.sorted(by: { $0.key < $1.key }) {
            let percentage = Double(wordCount) / Double(words.count) * 100
            mdContent += "- Speaker \(speaker): \(wordCount) words (\(String(format: "%.1f", percentage))%)\n"
        }
        
        // Write to file
        do {
            try mdContent.write(toFile: outputPath, atomically: true, encoding: .utf8)
            return true
        } catch {
            print("Error writing Markdown file: \(error.localizedDescription)")
            return false
        }
    }
    
    private static func formatMarkdownSegment(speaker: Int, text: String) -> String {
        let timestamp = Date().formatted(date: .omitted, time: .standard)
        return """
        ### Speaker \(speaker)
        
        \(text)
        
        """
    }
    
    private static func writeSRTSegment(number: Int, startTime: TimeInterval, endTime: TimeInterval, speaker: Int, text: String) -> String {
        let formattedStart = formatSRTTime(startTime)
        let formattedEnd = formatSRTTime(endTime)
        return """
        \(number)
        \(formattedStart) --> \(formattedEnd)
        [Speaker \(speaker)] \(text)
        
        """
    }
    
    private static func formatSRTTime(_ seconds: TimeInterval) -> String {
        let hours = Int(seconds) / 3600
        let minutes = Int(seconds) / 60 % 60
        let secs = Int(seconds) % 60
        let milliseconds = Int((seconds - TimeInterval(Int(seconds))) * 1000)
        return String(format: "%02d:%02d:%02d,%03d", hours, minutes, secs, milliseconds)
    }
    
    static func processGoogleSpeechResponse(jsonPath: String, outputBasePath: String) -> Bool {
        do {
            // Read and parse JSON file
            let jsonData = try Data(contentsOf: URL(fileURLWithPath: jsonPath))
            guard let json = try JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
                  let results = json["results"] as? [[String: Any]] else {
                print("Error: Invalid JSON format")
                return false
            }
            
            // Collect all words with speaker tags from all results
            var allWords: [SpeechRecognitionWord] = []
            var fullTranscript = ""
            
            for result in results {
                if let alternatives = result["alternatives"] as? [[String: Any]],
                   let firstAlt = alternatives.first {
                    
                    // Add to full transcript
                    if let transcript = firstAlt["transcript"] as? String {
                        if !fullTranscript.isEmpty {
                            fullTranscript += "\n"
                        }
                        fullTranscript += transcript
                    }
                    
                    // Add words with speaker tags
                    if let words = firstAlt["words"] as? [[String: Any]] {
                        allWords.append(contentsOf: words.map { SpeechRecognitionWord(from: $0) })
                    }
                }
            }
            
            // Save the full transcript
            let txtPath = outputBasePath + ".txt"
            try fullTranscript.write(toFile: txtPath, atomically: true, encoding: .utf8)
            print("✅ Saved plain transcript to: \(txtPath)")
            
            if allWords.isEmpty {
                print("⚠️ No speaker-tagged words found in the response")
                return false
            }
            
            // Generate output paths
            let srtPath = outputBasePath + ".srt"
            let mdPath = outputBasePath + ".md"
            
            // Convert to different formats
            let srtSuccess = convertToSRT(words: allWords, outputPath: srtPath)
            let mdSuccess = convertToMarkdown(words: allWords, outputPath: mdPath)
            
            if srtSuccess && mdSuccess {
                print("✅ Successfully generated transcripts:")
                print("- Plain text: \(txtPath)")
                print("- SRT: \(srtPath)")
                print("- Markdown: \(mdPath)")
                return true
            } else {
                print("❌ Failed to generate one or more transcript formats")
                return false
            }
        } catch {
            print("Error processing speech recognition response: \(error.localizedDescription)")
            return false
        }
    }
} 