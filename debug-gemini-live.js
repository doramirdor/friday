#!/usr/bin/env node

/**
 * Debug script for Gemini Live crashes
 * Run this in the browser console to test Gemini Live step by step
 */

console.log('🔍 Gemini Live Debug Script');
console.log('='.repeat(50));

// Test 1: Check browser APIs
console.log('1. Checking browser APIs...');
const hasWebSocket = typeof WebSocket !== 'undefined';
const hasAudioContext = typeof AudioContext !== 'undefined';
const hasGetUserMedia = !!(navigator.mediaDevices?.getUserMedia);
const hasLocalStorage = typeof localStorage !== 'undefined';

console.log('✅ WebSocket:', hasWebSocket);
console.log('✅ AudioContext:', hasAudioContext);
console.log('✅ getUserMedia:', hasGetUserMedia);
console.log('✅ localStorage:', hasLocalStorage);

if (!hasWebSocket || !hasAudioContext || !hasGetUserMedia) {
  console.error('❌ Missing required browser APIs');
  console.log('This browser does not support all required APIs for Gemini Live');
}

// Test 2: Check API key
console.log('\n2. Checking API key...');
const apiKey = localStorage.getItem('gemini-api-key');
console.log('✅ API key present:', !!apiKey);
if (!apiKey) {
  console.warn('⚠️ No API key found in localStorage');
}

// Test 3: Test microphone permission
console.log('\n3. Testing microphone permission...');
async function testMicrophone() {
  try {
    console.log('🎤 Requesting microphone access...');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log('✅ Microphone access granted');
    
    // Stop the stream immediately
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch (error) {
    console.error('❌ Microphone access failed:', error.name, error.message);
    return false;
  }
}

// Test 4: Test AudioContext creation
console.log('\n4. Testing AudioContext creation...');
async function testAudioContext() {
  try {
    console.log('🎵 Creating AudioContext...');
    const audioContext = new AudioContext();
    console.log('✅ AudioContext created successfully');
    console.log('   Sample rate:', audioContext.sampleRate);
    console.log('   State:', audioContext.state);
    
    // Close the context
    await audioContext.close();
    console.log('✅ AudioContext closed successfully');
    return true;
  } catch (error) {
    console.error('❌ AudioContext creation failed:', error);
    return false;
  }
}

// Test 5: Test WebSocket connection (if API key is available)
console.log('\n5. Testing WebSocket connection...');
async function testWebSocket() {
  if (!apiKey) {
    console.warn('⚠️ Skipping WebSocket test - no API key');
    return false;
  }
  
  try {
    console.log('🔗 Creating WebSocket connection...');
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    const ws = new WebSocket(wsUrl);
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.error('❌ WebSocket connection timeout');
        ws.close();
        resolve(false);
      }, 5000);
      
      ws.onopen = () => {
        console.log('✅ WebSocket connected successfully');
        clearTimeout(timeout);
        ws.close();
        resolve(true);
      };
      
      ws.onerror = (error) => {
        console.error('❌ WebSocket connection failed:', error);
        clearTimeout(timeout);
        resolve(false);
      };
      
      ws.onclose = (event) => {
        console.log('🔌 WebSocket closed:', event.code, event.reason);
        if (event.code === 4001) {
          console.error('❌ Invalid API key');
        }
      };
    });
  } catch (error) {
    console.error('❌ WebSocket creation failed:', error);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log('\n🚀 Running all tests...');
  
  const micTest = await testMicrophone();
  const audioContextTest = await testAudioContext();
  const webSocketTest = await testWebSocket();
  
  console.log('\n📊 Test Results:');
  console.log('='.repeat(30));
  console.log('Browser APIs:', hasWebSocket && hasAudioContext && hasGetUserMedia ? '✅' : '❌');
  console.log('API Key:', !!apiKey ? '✅' : '❌');
  console.log('Microphone:', micTest ? '✅' : '❌');
  console.log('AudioContext:', audioContextTest ? '✅' : '❌');
  console.log('WebSocket:', webSocketTest ? '✅' : '❌');
  
  const allPassed = hasWebSocket && hasAudioContext && hasGetUserMedia && !!apiKey && micTest && audioContextTest && webSocketTest;
  
  if (allPassed) {
    console.log('\n🎉 All tests passed! Gemini Live should work.');
  } else {
    console.log('\n❌ Some tests failed. Check the issues above.');
    
    // Provide specific guidance
    if (!hasWebSocket || !hasAudioContext || !hasGetUserMedia) {
      console.log('💡 Try using a modern browser like Chrome, Firefox, or Safari.');
    }
    if (!apiKey) {
      console.log('💡 Add your Gemini API key in the settings.');
    }
    if (!micTest) {
      console.log('💡 Allow microphone access when prompted.');
    }
    if (!audioContextTest) {
      console.log('💡 Try refreshing the page or restarting the browser.');
    }
    if (!webSocketTest) {
      console.log('💡 Check your internet connection and API key validity.');
    }
  }
}

// Auto-run tests
runAllTests().catch(error => {
  console.error('❌ Test runner failed:', error);
});

// Export for manual testing
window.debugGeminiLive = {
  testMicrophone,
  testAudioContext,
  testWebSocket,
  runAllTests
}; 