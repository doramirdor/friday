# Testing Guide for Gemini Live Service

This document describes the testing setup and procedures for the Gemini Live service implementation.

## Overview

The Gemini Live service has comprehensive test coverage including:
- **Unit Tests**: Mock-based tests for individual components
- **Integration Tests**: Real API tests with actual Gemini Live service
- **Performance Tests**: Memory usage and rapid start/stop cycles
- **Manual Tests**: Interactive audio processing tests

## Test Structure

```
src/services/__tests__/
├── gemini-live.test.ts          # Unit tests with mocks
└── gemini-live.integration.test.ts  # Integration tests with real API

test-gemini-live.js              # Standalone test runner
jest.config.js                   # Jest configuration
src/setupTests.ts               # Test environment setup
```

## Prerequisites

### 1. Install Dependencies

```bash
npm install
```

### 2. API Key Configuration

Set up your Gemini API key using one of these methods:

**Environment Variable (Recommended):**
```bash
export GEMINI_API_KEY="your-api-key-here"
```

**Database Settings:**
- Add API key through the application settings UI

**Local Storage:**
- Set `gemini-api-key` in browser localStorage

### 3. Browser Requirements

For integration tests, ensure your browser supports:
- WebSocket API
- Web Audio API (AudioContext, ScriptProcessorNode)
- MediaDevices API (getUserMedia)

## Running Tests

### Unit Tests (Jest)

Run all unit tests with mocked dependencies:

```bash
npm test
```

Watch mode for development:
```bash
npm run test:watch
```

Generate coverage report:
```bash
npm run test:coverage
```

### Integration Tests

Run integration tests with real Gemini Live API:

```bash
npm test -- --testNamePattern="Integration"
```

### Standalone Test Runner

Run comprehensive tests without Jest:

```bash
npm run test:gemini-live
```

Include audio processing tests (requires microphone):
```bash
npm run test:gemini-live:audio
```

## Test Categories

### 1. Unit Tests (`gemini-live.test.ts`)

**Initialization Tests:**
- Service availability checking
- API key priority resolution
- Browser API compatibility

**Audio Capture Tests:**
- Microphone access with correct constraints
- AudioContext creation with 16kHz sample rate
- Audio processing chain setup
- Error handling for permission denial

**WebSocket Connection Tests:**
- Correct endpoint URL construction
- Setup message format validation
- Connection failure handling
- Close event error code mapping

**Audio Processing Tests:**
- PCM audio chunk processing
- Audio accumulation buffer behavior
- Float32 to 16-bit PCM conversion
- Base64 encoding for API transmission

**Message Handling Tests:**
- Setup complete message processing
- Input transcription parsing
- Model response handling
- Error message processing
- Binary data handling

**Streaming Control Tests:**
- Start/stop lifecycle management
- Duplicate start prevention
- Resource cleanup verification
- Error state handling

### 2. Integration Tests (`gemini-live.integration.test.ts`)

**Real API Connection:**
- Actual WebSocket connection to Gemini Live
- Authentication with real API key
- Connection establishment verification

**Audio Processing:**
- Real microphone capture
- Actual audio streaming to API
- Error handling with live service

**Performance Tests:**
- Rapid start/stop cycles
- Memory usage monitoring
- Resource leak detection

**Error Recovery:**
- Network interruption handling
- Service restart capability
- Graceful degradation

### 3. Manual Tests (`test-gemini-live.js`)

**Service Availability:**
- API interface validation
- Configuration checking
- Browser compatibility

**Streaming Lifecycle:**
- Complete start/stop cycle
- Connection establishment
- Resource cleanup

**Audio Processing:**
- Real-time microphone capture
- Live transcription testing
- User interaction validation

**Error Scenarios:**
- Double start handling
- Rapid cycling stress test
- Permission denial simulation

## Test Configuration

### Jest Configuration (`jest.config.js`)

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  testTimeout: 30000, // 30 seconds for integration tests
  // ... additional configuration
};
```

### Test Environment Setup (`src/setupTests.ts`)

Provides mocks for:
- WebSocket API
- Web Audio API (AudioContext, ScriptProcessorNode)
- MediaDevices API (getUserMedia)
- Browser storage APIs
- Performance monitoring

## Running Specific Test Suites

### Audio Architecture Tests
```bash
npm test -- --testNamePattern="Audio"
```

### WebSocket Tests
```bash
npm test -- --testNamePattern="WebSocket"
```

### Error Handling Tests
```bash
npm test -- --testNamePattern="Error"
```

### Performance Tests
```bash
npm test -- --testNamePattern="Performance"
```

## Debugging Tests

### Enable Verbose Logging
```bash
npm test -- --verbose
```

### Run Single Test File
```bash
npm test src/services/__tests__/gemini-live.test.ts
```

### Debug Integration Tests
```bash
npm test -- --testNamePattern="Integration" --verbose
```

## Test Data and Mocking

### Mock Data
- Simulated audio chunks with realistic sizes
- Sample WebSocket messages matching API format
- Error scenarios with appropriate codes

### Real Data (Integration Tests)
- Actual microphone input
- Live API responses
- Real network conditions

## Continuous Integration

### GitHub Actions Example
```yaml
name: Test Gemini Live Service
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

## Troubleshooting

### Common Issues

**Tests fail with "Service not available":**
- Check API key configuration
- Verify browser API support
- Ensure network connectivity

**Audio tests timeout:**
- Check microphone permissions
- Verify audio device availability
- Increase test timeout values

**WebSocket connection fails:**
- Validate API key format
- Check network firewall settings
- Verify Gemini Live API status

**Memory leak warnings:**
- Ensure proper cleanup in afterEach
- Check for unclosed resources
- Monitor test isolation

### Debug Commands

```bash
# Run with debug output
DEBUG=* npm test

# Test specific functionality
npm run test:gemini-live

# Test with audio (requires user interaction)
npm run test:gemini-live:audio

# Generate detailed coverage
npm run test:coverage -- --verbose
```

## Contributing

When adding new tests:

1. **Unit Tests**: Mock all external dependencies
2. **Integration Tests**: Use real APIs with proper cleanup
3. **Documentation**: Update this guide with new test categories
4. **Error Handling**: Test both success and failure scenarios
5. **Performance**: Consider memory usage and timing

### Test Naming Convention

```typescript
describe('GeminiLive [Category]', () => {
  test('should [expected behavior] when [condition]', async () => {
    // Test implementation
  });
});
```

## Performance Benchmarks

Expected performance characteristics:
- **Connection Time**: < 2 seconds
- **Audio Processing Latency**: < 100ms
- **Memory Usage**: < 50MB sustained
- **Start/Stop Cycle**: < 1 second

Monitor these metrics during testing to ensure performance regression detection. 