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
- Audio device management UI in settings
- Utility functions for checking and testing audio devices
- Automatic detection and use of BlackHole for system audio
- Sample audio files for testing speech-to-text functionality
- Test function for verifying speech-to-text with existing audio files
- Multi-format audio saving (WAV and MP3) using ffmpeg for format conversion
- Robust MP3 conversion with signature verification and multiple fallback methods
- Development mode fallback for audio testing features

### Changed
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

### Fixed
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