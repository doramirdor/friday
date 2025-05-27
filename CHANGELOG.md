# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **Environment Variable Configuration**: Added dotenv support for loading API keys from `.env` files
  - Created `.env.example` template with all required environment variables
  - Configured Electron main process to load environment variables from `.env` and `.env.local` files
  - Added dotenv configuration to streaming speech handler for Google Speech API
  - Prioritized environment variables over database settings for Gemini API key
  - **Fixed renderer process access**: Exposed environment variables through electronAPI preload script
  - Added debugging logs to track API key source resolution in Gemini service
- **Toast Notification Improvements**: Enhanced toast system with better UX
  - Set default toast duration to 1 second for faster feedback
  - Positioned toasts in right bottom corner for better visibility
  - Made close button always visible for easy dismissal
  - Added `remove` function for immediate toast removal without delay
  - Added support for custom duration per toast
- Enhanced audio file handling with automatic MP3 to WAV conversion for better browser compatibility
- Improved software recording mode with better MP3 file generation
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
- Added "Send to Transcript" button to manually trigger audio transcription
- Added "Open in Native Player" button for when browser audio playback fails
- Standardized recording file location to Documents/Friday Recordings/ directory
- Standardized recording file format to MP3
- Added specialized test scripts for microphone-only recording to help diagnose issues
- Added permission request utility that opens system settings directly for microphone and screen recording
- Added recorder restart functionality to recover from stuck recording processes
- Added bulkDocs support to IPC database interface for bulk document operations
- Auto-saving functionality when leaving meeting page or closing browser
- Periodic auto-save every 30 seconds to prevent data loss
- Context content textarea for rich meeting context instead of simple name field
- Enhanced context management with content field stored in database
- Gemini AI integration for intelligent meeting analysis
- AI-powered generation of meeting titles, descriptions, notes, and tags from transcripts
- Context-aware AI analysis that considers both global and meeting-specific context
- Gemini API key configuration in settings for AI features
- Smart fallback analysis when AI service is unavailable
- **Live Streaming Transcription**: Real-time speech-to-text using Google Cloud Speech-to-Text streaming API
  - Near real-time transcription with interim and final results
  - Speaker diarization support for multi-speaker meetings
  - Live transcript display with confidence scores
  - Ability to add live transcripts directly to meeting notes
  - Automatic microphone audio capture and streaming
  - Error handling and connection management
- **Streaming Speech Service**: New service layer for managing live transcription
  - React hook (`useStreamingSpeech`) for easy integration
  - Electron main process handler for audio recording and streaming
  - IPC communication between renderer and main processes
  - Configurable streaming options (language, speaker count, etc.)
- **Delete Functionality**: Complete meeting and data deletion capabilities
  - Delete meetings from the library with confirmation dialog
  - Delete individual transcript lines with hover controls
  - Delete individual action items with remove buttons
  - Delete entire meetings from transcript details page
  - Cascading deletion of all associated data (transcript, notes, action items, context)
  - Loading states and error handling for all delete operations

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
- Changed default setting for live transcription to off
- Modified native player behavior to no longer auto-open on audio errors
- Improved recording status detection with better tracking of startup progress
- Enhanced combined recording mode with smarter status reporting for better reliability
- **Auto-Save System**: Replaced periodic auto-saving with event-based auto-saving for better performance
  - Removed automatic saving every 30 seconds
  - Added auto-save triggers for specific events:
    - Recording stopped
    - Transcript generated
    - AI analysis completed
    - Notes changed
    - Context content changed
    - Title changed
    - Description changed
    - Tags changed
    - Back to library button clicked
  - Implemented debounced auto-save (1 second delay) to prevent excessive saves
  - Maintained auto-save on page unload/visibility change for data safety

### Fixed
- **Panel Border Line**: Removed the resizable handle border line between panels that was causing UI issues
  - Eliminated conditional ResizableHandle component that created unwanted border separator
  - Simplified panel layout for cleaner appearance
  - Fixed minimize logic issues by removing conditional border rendering
- Fixed audio playback issues with MP3 data URLs by adding automatic conversion to WAV format for better browser compatibility
- Fixed "The element has no supported sources" errors by implementing more robust MP3 to WAV conversion
- Enhanced silence MP3 file generation for software recording mode with more robust file structure
- Improved browser audio error handling with automatic fallback to native player for format errors
- Fixed MediaError format errors when playing MP3 files in browser
- Fixed local AudioPlayer native player fallback during autoplay
- Enhanced error messaging for audio playback failures with clearer instructions
- Increased audio loading timeout for better reliability on slower systems
- Fixed recording files being saved with 0 bytes by adding proper silence.mp3 file
- Added comprehensive error handling to ensure recording files are created correctly
- Enhanced silence file download mechanism to prevent partial or corrupted files
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
- Fixed audio player loading loop by generating valid WAV files in software recording mode instead of empty MP3 files
- Fixed audio format errors by using pre-recorded silence MP3 file and better handling file:// URLs
- Fixed recording not starting issue by implementing better status detection and automatic recovery
- Fixed combined recording mode missing JSON status responses by implementing manual status updates
- Fixed recording process becoming stuck by adding a restart mechanism
- Fixed permission handling for both microphone and screen recording on macOS
- Fixed "ReferenceError: module is not defined in ES module scope" error in recording.js by converting CommonJS exports to ES module syntax
- Added missing getAudioDevices function in recording.js to ensure proper audio device detection
- Fixed "SyntaxError: Duplicate export of 'stopRecording'" by removing duplicate export declarations
- Fixed "speakersDb.bulkDocs is not a function" error by implementing bulkDocs method in IPC database interface
- Fixed database save operations overriding previous saves by properly handling existing documents before bulk operations
- Fixed loading existing meetings showing generic "Weekly Team Standup" data instead of saved meeting details
- Added proper data loading for existing meetings in TranscriptDetails component
- Implemented bulk save operations for transcripts and action items to prevent data conflicts
- Fixed unique meeting ID generation to prevent all new meetings from using the same ID by generating unique IDs with timestamp and random components
- Fixed database initialization issues by adding ensureDatabaseInitialized() calls to all database functions to prevent 'bulkDocs is not a function' errors
- **Panel Expansion Issue**: Fixed UI issue where collapsed panels couldn't be expanded back
  - Moved toggle buttons outside of panels so they remain visible when panels are collapsed
  - Removed `hidden` className that prevented panel expansion
  - Updated panel default sizes to respect collapsed state
  - Enhanced toggle button positioning and styling for better accessibility
- **Context Files Initialization**: Fixed new meetings starting with default context files instead of empty list
  - New meetings now start with empty context files array
  - Users can add context files as needed for each meeting

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

### Enhanced
- **Recording Interface**: Added live transcript toggle and controls to recording page
- **TranscriptDetails Component**: Integrated live streaming controls with existing recording functionality
- **Settings**: Live transcript preferences and API configuration

### Technical
- Added `node-record-lpcm16` dependency for audio recording
- Implemented streaming speech handler in Electron main process
- Added preload script methods for streaming speech IPC
- Created TypeScript interfaces for streaming speech results and options 