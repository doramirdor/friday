# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Refactored TranscriptDetails component into a layered architecture with:
  - Main process layer: transcript-handler.js for file operations and IPC handling
  - Preload layer: transcript-bridge.js to safely expose main process functionality
  - Renderer layer: useTranscript.ts hook and TranscriptDetails component
- New useTranscript hook for managing transcript state and interactions with the main process
- Support for saving, loading, and exporting transcripts in multiple formats
- Auto-save functionality for transcripts during recording
- Software recording fallback mode that automatically activates when the Swift Recorder binary is unavailable
- Improved reliability for recording functionality across different environments
- Redesigned TranscriptDetails UI with resizable panels, tabbed interface and enhanced controls
- Added support for speaker management during recording
- Implemented audio visualization with waveform display
- Added audio controls with volume adjustment and seeking capabilities
- Implemented notes editor with text formatting capabilities
- Added action items tracking system for meeting follow-ups
- Added context management system for project files and references
- Implemented comprehensive save functionality that preserves all meeting data in the database
- Added recording source selection (system, mic, both) in the TranscriptDetails component
- Enhanced debug logging for recording processes and audio file handling

### Changed
- Renamed TranscriptDetailsRefactored to TranscriptDetails for better code organization
- Simplified TranscriptDetailsPage to use the new TranscriptDetails component
- Improved settings dialog with fixed size and scrollable content for better user experience
- Enhanced transcript editing capabilities with inline editing and speaker assignment
- Improved recording controls with better visual feedback and status indicators
- Upgraded audio player with waveform visualization and playback controls
- Replaced defaultProps with JavaScript default parameters in function components
- Enhanced save functionality to store all meeting data including details, action items, notes, context, transcript, and audio recording path
- Improved recording source selection with visual indicators for active source
- Implemented singleton pattern for database initialization to prevent duplicate setup and improve performance

### Fixed
- Fixed audio playback issues with MP3 data URLs by adding automatic conversion to WAV format for better browser compatibility
- Added native player fallback for audio playback when browser can't play certain audio formats
- Added visual indication when audio can't be played in browser with option to use native player
- Fixed audio player not showing by improving the display condition to always show player when audio is available, regardless of meeting state
- Fixed audio player not being displayed in TranscriptDetails component when audio is successfully loaded
- Fixed preload script module not found error by implementing more robust module loading with fallbacks
- Recording functionality issue where Swift Recorder binary path couldn't be found by improving path resolution in different environments (development and production)
- START_FAILED errors when attempting to use combined recording by implementing better path resolution and error handling
- Enhanced Swift Recorder binary path detection to use multiple fallbacks if the primary path isn't found
- RECORDER_NOT_FOUND errors by implementing a software-only recording mode that works without the Swift binary
- Settings dialog alignment issue where content was vertically centered instead of aligned to the top
- Incomplete scrolling in the transcription tab of the settings dialog which prevented access to bottom content
- Inconsistent tab panel rendering in settings dialog by ensuring all tabs have uniform alignment and proper spacing
- Added proper spacing and consistent bottom padding across all settings tab panels for better usability
- Fixed settings dialog tab navigation to ensure it always stays fixed at the top when scrolling through content
- Meeting page data not being properly passed to TranscriptDetails component, restoring missing title, description, tags, and live transcription settings
- Fixed UI layout issues in TranscriptDetails component with responsive design improvements
- Addressed panel collapsing behavior in the transcript view
- Fixed duplicate function declaration in TranscriptDetails component
- Resolved React warning about using defaultProps in function components by using JavaScript default parameters
- Fixed missing recording source selection (system, mic, both) in the transcript details page
- Fixed audio playback after recording stops by properly handling file paths and loading audio files
- Enhanced error handling for audio recording to provide better user feedback
- Fixed preload script module path resolution error by using absolute paths for module imports
- Fixed DatabaseService export in database.ts to use proper namespaced pattern, resolving import errors across the application
- Fixed database being initialized multiple times, causing duplicate setup and potential performance issues
- Fixed module import error by adding .js extension to @google-cloud/speech/build/protos/protos import
- Fixed CommonJS module import error by using default import for google from @google-cloud/speech/build/protos/protos.js
- Fixed "Invalid hook call" error in TranscriptDetails by correctly using the useSettings hook
- Fixed Swift Recorder issues by enabling software recording mode by default

## [0.3.1] - 2024-05-21

### Added
- Database persistence for user settings using PouchDB
- useSettings hook for managing application settings
- Automatic migration of settings from localStorage to PouchDB
- Consistent API for updating and retrieving settings
- Settings synchronization between components
- Recording source preference persistence
- Live transcription preference persistence
- Robust error handling for database operations
- Database recovery mechanism for corrupted storage
- Improved error boundaries and error reporting
- PouchDB runtime patching script to fix constructor issues in different environments
- Asynchronous database initialization system that avoids ESM/CommonJS conflicts
- Global PouchDB constructor patching that works across module systems
- Direct bundler module cache overriding for PouchDB constructor issues
- Full in-memory PouchDB fallback implementation for seamless degradation
- In-memory implementation of PouchDB find plugin interface

### Fixed
- Fixed "Class extends value [object Object] is not a constructor or null" error in PouchDB initialization with enhanced ESM module handling
- Added robust PouchDB constructor resolution for compatibility with both browser and Electron environments
- Improved automatic recovery from PouchDB initialization errors
- Implemented better error detection and storage cleanup for corrupted PouchDB data
- Enhanced global error handler to detect and recover from PouchDB failures
- Implemented dynamic imports and async database initialization to prevent module conflicts
- Added browser-side patching for PouchDB AMD/ESM module loading
- Implemented global constructor patching that completely avoids module imports
- Added direct module cache patching for webpack/vite bundlers
- Created complete in-memory PouchDB fallback that provides core functionality
- Ensured proper function of createIndex and find API methods in fallback
- Improved PouchDB type definitions for better type safety
- Enhanced database context error handling
- Implemented automatic database recovery for corrupted storage
- Made Swift code compatible with macOS (removed iOS-specific AVAudioSession code)

## [0.3.0] - 2024-11-11

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
- System audio recording support via virtual audio driver (fallback)
- New useSystemAudio hook for accessing system audio
- API for checking recording permissions status
- API for saving and editing transcriptions
- Combined recording functionality for simultaneous system audio and microphone capture
- New useCombinedRecording hook for combined audio recording
- Audio diagnostic tools for troubleshooting microphone and recording issues
- macOS-compatible AudioDeviceManager for system audio device detection
- Native player integration for audio playback when browser playback is restricted
- Enhanced AudioPlayer UI with animations, highlighting and download option
- Debug logging for audio playback and conversion issues
- Direct API fallback for Google Speech-to-Text when client library fails
- Support for transcribing long audio files by automatically splitting them into chunks
- Local database persistence using PouchDB for storing meetings, transcripts, speakers, notes, and action items
- Database service with comprehensive API for CRUD operations
- Context provider for database initialization

### Changed
- Redesigned recording interface with visual feedback indicators 
- Improved error handling and fallbacks for recording flows
- Enhanced file naming and organization for recorded audio
- Updated Electron IPC layer to support new recording modes
- Enhanced permission checks for different recording types
- Unified recording API for consistent access to different audio sources
- Improved ffmpeg implementation for audio format conversion
- Improved visibility and user experience for audio playback after recording stops
- Enhanced AudioPlayer display logic to ensure it's always visible after recording

### Fixed
- Bug in permission handling on macOS Ventura and later
- Audio playback issues with certain file formats
- System audio recording errors in specific hardware configurations
- UI state management during ongoing recordings
- Electron main process memory management during long recordings
- Microphone not being detected in combined recording mode due to iOS-specific AVAudioSession APIs
- Compiler errors related to incompatible AVAudioSession APIs on macOS
- "Mic levels" monitoring in combined recording mode
- Audio player not displaying after recording stops and file is saved
- Transcription not being displayed in the transcript area after recording completes
- Fixed combined recording not properly connecting to Google Speech API for transcription
- Security restrictions when loading local audio files in browser environment
- Added fallback to native system player when browser audio playback is restricted
- Enhanced visibility of AudioPlayer component after recording stops
- Fixed audio playback issues with data URLs and large files
- Improved error handling for data URL conversion in Electron
- Fixed Google Speech API transcription failures in testSpeechWithFile by properly passing API key parameters
- Enhanced error handling and debugging in Google Speech API integration
- Fixed compatibility issue with Google Speech API's getUniverseDomain method
- Added fallback to direct REST API call when Google Cloud Speech client fails
- Prevented error messages from being added to transcripts
- Combined recording (system audio + microphone) initialization issues
- Improved error handling when starting combined recordings
- Better user feedback when recording components fail to initialize
- Fixed status code handling between Swift recorder and Electron
- Better cleanup of temporary files when recording fails
- Fixed "Sync input too long" error when transcribing audio files longer than 1 minute
- Fixed combined recording not starting due to disabled hook implementation

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