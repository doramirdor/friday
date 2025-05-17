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
- Robust MP3 conversion with improved error handling and file verification
- WebM/Opus to MP3 conversion pipeline for improved transcription reliability
- Added testSpeechWithFile handler to main.cjs to fix transcription with saved files
- Detailed diagnostic logging throughout the audio processing pipeline
- Debug file generation for audio format troubleshooting
- File signature detection to ensure correct audio format identification
- Directory content logging to diagnose file existence issues

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
- Simplified MP3 conversion process with enhanced reliability
- Standardized audio conversion parameters (44.1kHz, 192kbps) for better compatibility
- Enhanced useGoogleSpeech hook to use MP3 conversion for WebM/Opus audio
- Improved handling of different saveAudioFile response formats for better backward compatibility
- Synchronized main.cjs and preload.cjs with newer implementations in main.js and preload.js
- Consolidated Electron code by moving all functionality to src/electron directory
- Standardized on .js file format instead of using both .js and .cjs
- Simplified authentication to use only API key method, removing Google certification files
- Updated build configuration to use consolidated file structure
- Restructured Electron code into a layered architecture (main, preload, renderer) for better organization and separation of concerns
- Removed duplicate electron directory to reduce confusion and consolidate all Electron code
- Converted Electron code from CommonJS to ES modules to align with package.json type:module setting

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
- File lookup failing for files without extensions
- MP3 conversion failures with more robust conversion strategy
- WebM/Opus format transcription issues with Google Speech API
- No speech detected errors when using WebM/Opus audio format
- TypeScript errors in useGoogleSpeech hook
- Fixed compatibility issues with older saveAudioFile response format that didn't include files array
- Missing testSpeechWithFile handler in main.cjs preventing transcription of saved files
- Inconsistencies between preload.cjs and preload.js causing missing functionality
- Preload script module loading error by removing path module dependency
- Improved transcription reliability by only processing at the end of recording instead of per chunk
- Fixed "File not found" errors by properly handling MP3/WAV extensions in file path resolution
- Fixed "No speech detected" issues by consolidating audio chunks for better speech recognition
- Enhanced logging for audio processing to facilitate troubleshooting
- Added MIME type detection from file signatures for more reliable format identification
- Improved error detection in file handling by checking directory contents when files not found

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