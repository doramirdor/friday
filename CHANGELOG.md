# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Enhanced Google Speech-to-Text integration with configurable options
- UI for selecting Google Cloud credentials file
- Support for additional audio formats and speech recognition models
- Live feedback during transcription with improved error handling
- Native macOS system audio recording using ScreenCaptureKit
- Swift integration for capturing system audio without third-party drivers
- Permission management for screen recording (required for system audio)
- System audio recording hooks for React components
- File system storage for recorded audio files
- System audio recording support via BlackHole audio driver (fallback)
- New useSystemAudio hook for accessing system audio
- Audio device management and input selection
- Audio transcription formats (FLAC, WAV, MP3) based on device capabilities
- Built-in format conversion for optimal Google Speech-to-Text compatibility
- Multi-format audio recording with both WAV and MP3 output
- Automatic MP3 conversion of audio recordings for optimized file size
- Format detection for transcription based on file signatures
- Improved MP3 support in API key-based Google Speech transcription
- Optimized audio file format handling for more accurate transcription results
- Extension auto-correction for audio files missing proper extensions

### Changed
- Upgraded Google Cloud Speech-to-Text client library
- Improved error handling for audio recording and transcription
- Enhanced audio format detection for accurate transcription
- Prioritized MP3 recordings for better performance with Google Speech API
- Updated API key authentication flow for Google Speech services
- Modified transcription component to use saved MP3 files for optimal results
- Improved audio device handling in TranscriptDetails and useGoogleSpeech
- Better fallback mechanisms when specific audio devices aren't available
- Updated Google Speech API to use correct sample rate (48kHz)
- Enhanced audio playback with better error handling
- Expanded useGoogleSpeech hook with more configuration options
- Improved error notifications using toast messages
- Exposed application path in Electron API for accessing resources
- Enhanced path handling for test audio files in main process
- Enhanced audio file saving API to handle multiple formats simultaneously
- Improved MP3 encoding with optimized parameters and quality settings
- Better cross-environment compatibility with Electron and Vite development
- Updated test audio files with clearer speech samples
- Refactored main.js to support both service account and API key authentication methods
- Enhanced preload.js to expose new API key-based transcription functionality
- Improved file path handling for recordings without extensions

### Fixed
- Audio format detection and handling for Google Speech API
- MP3 encoding issues in audio recordings
- Transcription quality issues with different audio formats
- Automatic file extension management for recordings
- Format verification for audio files before transcription
- Sample rate mismatch in Google Speech API configuration
- Audio playback reliability issues
- Audio recording not being saved to disk
- Error handling in Google Cloud Speech API credential loading process
- Audio test button functionality with proper Electron API exposure
- Path resolution for audio test files to work in all environments
- Improved error reporting for speech-to-text test feature
- MP3 file format verification to ensure properly encoded files
- Audio testing error in development mode with mock implementation when Electron APIs unavailable
- Missing file extensions in native system audio recordings
- File extension duplication when saving recordings
- MP3 files being saved without proper file extensions
- Transcription errors due to missing file extensions
- Audio file lookup failing for files without extensions

## [0.2.1] - 2023-07-31

### Added
- Support for API key authentication for Google Cloud Speech-to-Text as an alternative to service account credentials
- Updated documentation with instructions for both authentication methods

## [0.2.0] - 2023-07-30

### Added
- Google Cloud Speech-to-Text API integration for improved transcription
- Enhanced audio processing in useGoogleSpeech hook
- Better error handling for audio transcription failures
- Documentation for setting up Google Cloud credentials

### Changed
- Upgraded useGoogleSpeech hook with continuous and batch transcription options
- Improved audio quality settings for speech recognition
- Replaced mock transcription with actual Google Cloud Speech API implementation

### Fixed
- Error handling in Electron's main process for Google Speech API calls 