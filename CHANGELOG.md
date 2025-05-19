
# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]
- Added mock transcript page at /transcript/123 with pre-recorded audio and transcript
- Improved UI design for recording status with pulsing indicator
- Enhanced visual presentation of live transcript toggle with status indicator
- Consolidated "New Meeting" button to header only
- Enhanced visual presentation of recording controls
- Switched from Toggle to Switch component for better UX
- Added gradient styling for primary action buttons
- Improved recording button UI with larger size and clearer status display
- Added default meeting recordings display in library view
- Added auto-playback of audio after stopping recording
- Moved Live Transcription setting to Meeting tab in settings
- Changed recording button to green color scheme
- Reordered settings tabs to place Context tab before Meeting tab
- Added AudioPlayer component to better handle recorded audio playback
- Added demo recording preview in Library view to showcase AudioPlayer

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
