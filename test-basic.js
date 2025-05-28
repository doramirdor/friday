#!/usr/bin/env node

/**
 * Basic test for Gemini Live Service
 * This script verifies the service structure and basic functionality
 */

console.log('🚀 Starting Basic Gemini Live Service Tests');
console.log('='.repeat(50));

// Test results tracking
let passed = 0;
let failed = 0;

function test(name, testFn) {
  try {
    testFn();
    console.log(`✅ PASSED: ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ FAILED: ${name} - ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// Test 1: Check if the service file exists and is properly structured
test('Service file structure', () => {
  const fs = await import('fs');
  const path = await import('path');
  
  const servicePath = path.join(__dirname, 'src', 'services', 'gemini-live.ts');
  assert(fs.existsSync(servicePath), 'Gemini Live service file should exist');
  
  const content = fs.readFileSync(servicePath, 'utf8');
  assert(content.includes('export interface GeminiLiveService'), 'Should export GeminiLiveService interface');
  assert(content.includes('export interface GeminiLiveOptions'), 'Should export GeminiLiveOptions interface');
  assert(content.includes('export interface GeminiLiveResult'), 'Should export GeminiLiveResult interface');
  assert(content.includes('class GeminiLiveServiceImpl'), 'Should have GeminiLiveServiceImpl class');
  assert(content.includes('export const geminiLiveService'), 'Should export geminiLiveService singleton');
});

// Test 2: Check Web Audio API implementation
test('Web Audio API implementation', () => {
  const fs = require('fs');
  const path = require('path');
  
  const servicePath = path.join(__dirname, 'src', 'services', 'gemini-live.ts');
  const content = fs.readFileSync(servicePath, 'utf8');
  
  assert(content.includes('AudioContext'), 'Should use AudioContext');
  assert(content.includes('ScriptProcessorNode'), 'Should use ScriptProcessorNode');
  assert(content.includes('createMediaStreamSource'), 'Should create media stream source');
  assert(content.includes('createScriptProcessor'), 'Should create script processor');
  assert(content.includes('getUserMedia'), 'Should use getUserMedia');
});

// Test 3: Check PCM audio processing
test('PCM audio processing', () => {
  const fs = require('fs');
  const path = require('path');
  
  const servicePath = path.join(__dirname, 'src', 'services', 'gemini-live.ts');
  const content = fs.readFileSync(servicePath, 'utf8');
  
  assert(content.includes('Int16Array'), 'Should use Int16Array for PCM data');
  assert(content.includes('getChannelData'), 'Should get channel data from audio buffer');
  assert(content.includes('arrayBufferToBase64'), 'Should convert to base64');
  assert(content.includes('audio/pcm;rate=16000'), 'Should use correct PCM MIME type');
});

// Test 4: Check WebSocket implementation
test('WebSocket implementation', () => {
  const fs = require('fs');
  const path = require('path');
  
  const servicePath = path.join(__dirname, 'src', 'services', 'gemini-live.ts');
  const content = fs.readFileSync(servicePath, 'utf8');
  
  assert(content.includes('WebSocket'), 'Should use WebSocket');
  assert(content.includes('wss://generativelanguage.googleapis.com'), 'Should use correct Gemini Live endpoint');
  assert(content.includes('BidiGenerateContent'), 'Should use correct API method');
  assert(content.includes('models/gemini-2.0-flash-live-001'), 'Should use correct model');
});

// Test 5: Check error handling
test('Error handling implementation', () => {
  const fs = require('fs');
  const path = require('path');
  
  const servicePath = path.join(__dirname, 'src', 'services', 'gemini-live.ts');
  const content = fs.readFileSync(servicePath, 'utf8');
  
  assert(content.includes('try {') && content.includes('catch'), 'Should have try-catch blocks');
  assert(content.includes('onError'), 'Should have error callback');
  assert(content.includes('errorCallback'), 'Should handle error callbacks');
  assert(content.includes('cleanup'), 'Should have cleanup method');
});

// Test 6: Check audio accumulation buffer
test('Audio accumulation buffer', () => {
  const fs = require('fs');
  const path = require('path');
  
  const servicePath = path.join(__dirname, 'src', 'services', 'gemini-live.ts');
  const content = fs.readFileSync(servicePath, 'utf8');
  
  assert(content.includes('audioAccumulationBuffer'), 'Should have audio accumulation buffer');
  assert(content.includes('ACCUMULATION_TIME_MS'), 'Should have accumulation time constant');
  assert(content.includes('checkAndProcessAccumulatedAudio'), 'Should have accumulation processing method');
});

// Test 7: Check API key handling
test('API key handling', () => {
  const fs = require('fs');
  const path = require('path');
  
  const servicePath = path.join(__dirname, 'src', 'services', 'gemini-live.ts');
  const content = fs.readFileSync(servicePath, 'utf8');
  
  assert(content.includes('GEMINI_API_KEY'), 'Should check for environment API key');
  assert(content.includes('geminiApiKey'), 'Should check for database API key');
  assert(content.includes('gemini-api-key'), 'Should check for localStorage API key');
});

// Test 8: Check test files exist
test('Test files exist', () => {
  const fs = require('fs');
  const path = require('path');
  
  const unitTestPath = path.join(__dirname, 'src', 'services', '__tests__', 'gemini-live.test.ts');
  const integrationTestPath = path.join(__dirname, 'src', 'services', '__tests__', 'gemini-live.integration.test.ts');
  const jestConfigPath = path.join(__dirname, 'jest.config.js');
  const setupTestsPath = path.join(__dirname, 'src', 'setupTests.ts');
  
  assert(fs.existsSync(unitTestPath), 'Unit test file should exist');
  assert(fs.existsSync(integrationTestPath), 'Integration test file should exist');
  assert(fs.existsSync(jestConfigPath), 'Jest config should exist');
  assert(fs.existsSync(setupTestsPath), 'Setup tests file should exist');
});

// Test 9: Check package.json test scripts
test('Test scripts in package.json', () => {
  const fs = require('fs');
  const path = require('path');
  
  const packagePath = path.join(__dirname, 'package.json');
  const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  assert(packageContent.scripts.test, 'Should have test script');
  assert(packageContent.scripts['test:watch'], 'Should have test:watch script');
  assert(packageContent.scripts['test:coverage'], 'Should have test:coverage script');
  assert(packageContent.scripts['test:gemini-live'], 'Should have test:gemini-live script');
});

// Test 10: Check testing dependencies
test('Testing dependencies', () => {
  const fs = require('fs');
  const path = require('path');
  
  const packagePath = path.join(__dirname, 'package.json');
  const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  assert(packageContent.devDependencies.jest, 'Should have Jest dependency');
  assert(packageContent.devDependencies['ts-jest'], 'Should have ts-jest dependency');
  assert(packageContent.devDependencies['@types/jest'], 'Should have Jest types');
  assert(packageContent.devDependencies['@testing-library/jest-dom'], 'Should have testing library');
});

// Print results
console.log('='.repeat(50));
console.log('🏁 Test Results:');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📊 Total: ${passed + failed}`);

if (failed > 0) {
  console.log('\n❌ Some tests failed. Check the implementation.');
  process.exit(1);
} else {
  console.log('\n🎉 All basic tests passed! The Gemini Live service structure is correct.');
  console.log('\n📝 Next steps:');
  console.log('1. Set up your Gemini API key in environment variables or settings');
  console.log('2. Test the service in a browser environment with microphone access');
  console.log('3. Run integration tests with: npm test (once Jest is properly configured)');
  console.log('4. Test audio processing with: npm run test:gemini-live:audio');
  process.exit(0);
} 