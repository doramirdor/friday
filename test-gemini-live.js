#!/usr/bin/env node

/**
 * Simple test runner for Gemini Live Service
 * This script tests the actual implementation without mocking
 * Run with: node test-gemini-live.js
 */

import { geminiLiveService } from './src/services/gemini-live.js';

// Test configuration
const TEST_TIMEOUT = 10000; // 10 seconds
const AUDIO_TEST_DURATION = 5000; // 5 seconds

// Test results tracking
let testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: []
};

// Utility functions
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '📋',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    skip: '⏭️'
  }[type] || '📋';
  
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTest(name, testFn, timeout = TEST_TIMEOUT) {
  log(`Running test: ${name}`);
  
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Test timeout after ${timeout}ms`)), timeout);
    });
    
    await Promise.race([testFn(), timeoutPromise]);
    
    log(`✅ PASSED: ${name}`, 'success');
    testResults.passed++;
    testResults.tests.push({ name, status: 'PASSED' });
  } catch (error) {
    log(`❌ FAILED: ${name} - ${error.message}`, 'error');
    testResults.failed++;
    testResults.tests.push({ name, status: 'FAILED', error: error.message });
  }
}

function skipTest(name, reason) {
  log(`⏭️ SKIPPED: ${name} - ${reason}`, 'skip');
  testResults.skipped++;
  testResults.tests.push({ name, status: 'SKIPPED', reason });
}

// Test suite
async function testServiceAvailability() {
  assert(typeof geminiLiveService === 'object', 'Service should be an object');
  assert(typeof geminiLiveService.isAvailable === 'boolean', 'isAvailable should be boolean');
  assert(typeof geminiLiveService.isStreaming === 'boolean', 'isStreaming should be boolean');
  assert(typeof geminiLiveService.startStreaming === 'function', 'startStreaming should be function');
  assert(typeof geminiLiveService.stopStreaming === 'function', 'stopStreaming should be function');
  assert(typeof geminiLiveService.onResult === 'function', 'onResult should be function');
  assert(typeof geminiLiveService.onError === 'function', 'onError should be function');
}

async function testServiceInitialization() {
  // Wait for async initialization
  await new Promise(resolve => setTimeout(resolve, 100));
  
  if (!geminiLiveService.isAvailable) {
    throw new Error('Service should be available with proper configuration');
  }
  
  assert(geminiLiveService.isStreaming === false, 'Service should not be streaming initially');
}

async function testCallbackRegistration() {
  let resultCallbackCalled = false;
  let errorCallbackCalled = false;
  
  geminiLiveService.onResult(() => {
    resultCallbackCalled = true;
  });
  
  geminiLiveService.onError(() => {
    errorCallbackCalled = true;
  });
  
  // Callbacks should be registered (we can't directly test this without triggering them)
  assert(typeof geminiLiveService.onResult === 'function', 'Result callback should be registerable');
  assert(typeof geminiLiveService.onError === 'function', 'Error callback should be registerable');
}

async function testStreamingLifecycle() {
  if (!geminiLiveService.isAvailable) {
    throw new Error('Service not available for streaming test');
  }
  
  // Test starting streaming
  await geminiLiveService.startStreaming();
  assert(geminiLiveService.isStreaming === true, 'Service should be streaming after start');
  
  // Wait a bit to ensure connection is established
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test stopping streaming
  geminiLiveService.stopStreaming();
  assert(geminiLiveService.isStreaming === false, 'Service should not be streaming after stop');
  
  // Wait for cleanup
  await new Promise(resolve => setTimeout(resolve, 500));
}

async function testStreamingWithOptions() {
  if (!geminiLiveService.isAvailable) {
    throw new Error('Service not available for options test');
  }
  
  const options = {
    sampleRateHertz: 16000,
    languageCode: 'en-US',
    enableSpeakerDiarization: true,
    maxSpeakerCount: 2
  };
  
  await geminiLiveService.startStreaming(options);
  assert(geminiLiveService.isStreaming === true, 'Service should start with custom options');
  
  geminiLiveService.stopStreaming();
  await new Promise(resolve => setTimeout(resolve, 500));
}

async function testErrorHandling() {
  if (!geminiLiveService.isAvailable) {
    throw new Error('Service not available for error handling test');
  }
  
  let errorReceived = false;
  
  geminiLiveService.onError((error) => {
    log(`Received expected error: ${error.message}`, 'info');
    errorReceived = true;
  });
  
  // Test double start (should not cause issues)
  await geminiLiveService.startStreaming();
  await geminiLiveService.startStreaming(); // Second call should be handled gracefully
  
  geminiLiveService.stopStreaming();
  await new Promise(resolve => setTimeout(resolve, 500));
}

async function testRapidStartStop() {
  if (!geminiLiveService.isAvailable) {
    throw new Error('Service not available for rapid start/stop test');
  }
  
  // Test rapid start/stop cycles
  for (let i = 0; i < 3; i++) {
    await geminiLiveService.startStreaming();
    assert(geminiLiveService.isStreaming === true, `Service should be streaming in cycle ${i + 1}`);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    geminiLiveService.stopStreaming();
    assert(geminiLiveService.isStreaming === false, `Service should not be streaming after stop in cycle ${i + 1}`);
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

async function testAudioProcessing() {
  if (!geminiLiveService.isAvailable) {
    throw new Error('Service not available for audio processing test');
  }
  
  let transcriptReceived = false;
  
  geminiLiveService.onResult((result) => {
    log(`Received transcript: "${result.transcript}" (final: ${result.isFinal})`, 'info');
    transcriptReceived = true;
  });
  
  await geminiLiveService.startStreaming();
  
  // Wait for audio processing
  log('Listening for audio... (speak into your microphone)', 'info');
  await new Promise(resolve => setTimeout(resolve, AUDIO_TEST_DURATION));
  
  geminiLiveService.stopStreaming();
  
  // Note: We don't assert transcriptReceived because it depends on actual audio input
  log(`Audio test completed. Transcript received: ${transcriptReceived}`, 'info');
}

// Main test runner
async function runAllTests() {
  log('🚀 Starting Gemini Live Service Tests', 'info');
  log('='.repeat(50), 'info');
  
  // Basic functionality tests
  await runTest('Service Availability', testServiceAvailability);
  await runTest('Service Initialization', testServiceInitialization);
  await runTest('Callback Registration', testCallbackRegistration);
  
  // Skip streaming tests if service is not available
  if (!geminiLiveService.isAvailable) {
    skipTest('Streaming Lifecycle', 'Service not available (missing API key or browser APIs)');
    skipTest('Streaming with Options', 'Service not available');
    skipTest('Error Handling', 'Service not available');
    skipTest('Rapid Start/Stop', 'Service not available');
    skipTest('Audio Processing', 'Service not available');
  } else {
    await runTest('Streaming Lifecycle', testStreamingLifecycle, 15000);
    await runTest('Streaming with Options', testStreamingWithOptions, 10000);
    await runTest('Error Handling', testErrorHandling, 10000);
    await runTest('Rapid Start/Stop', testRapidStartStop, 20000);
    
    // Audio processing test (optional - requires user interaction)
    const shouldTestAudio = process.argv.includes('--audio');
    if (shouldTestAudio) {
      await runTest('Audio Processing', testAudioProcessing, 15000);
    } else {
      skipTest('Audio Processing', 'Use --audio flag to test audio processing');
    }
  }
  
  // Print results
  log('='.repeat(50), 'info');
  log('🏁 Test Results:', 'info');
  log(`✅ Passed: ${testResults.passed}`, 'success');
  log(`❌ Failed: ${testResults.failed}`, 'error');
  log(`⏭️ Skipped: ${testResults.skipped}`, 'skip');
  log(`📊 Total: ${testResults.tests.length}`, 'info');
  
  if (testResults.failed > 0) {
    log('\n❌ Failed Tests:', 'error');
    testResults.tests
      .filter(test => test.status === 'FAILED')
      .forEach(test => log(`  - ${test.name}: ${test.error}`, 'error'));
  }
  
  if (testResults.skipped > 0) {
    log('\n⏭️ Skipped Tests:', 'skip');
    testResults.tests
      .filter(test => test.status === 'SKIPPED')
      .forEach(test => log(`  - ${test.name}: ${test.reason}`, 'skip'));
  }
  
  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`, 'error');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log(`Unhandled rejection: ${reason}`, 'error');
  process.exit(1);
});

// Run tests
runAllTests().catch((error) => {
  log(`Test runner failed: ${error.message}`, 'error');
  process.exit(1);
}); 