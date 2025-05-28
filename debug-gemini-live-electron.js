/**
 * Electron-specific Gemini Live Debug Script
 * Run this in the browser console (DevTools) to test Gemini Live step by step
 * This will help identify where the crash occurs
 */

console.log('🔍 Electron Gemini Live Debug Script');
console.log('='.repeat(50));

// Global debug state
window.geminiDebugState = {
  step: 0,
  errors: [],
  results: {},
  audioStream: null,
  audioContext: null,
  websocket: null
};

// Helper function to log and store results
function debugLog(step, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = { step, message, data, timestamp };
  
  console.log(`[${timestamp}] Step ${step}: ${message}`, data || '');
  
  if (!window.geminiDebugState.results[step]) {
    window.geminiDebugState.results[step] = [];
  }
  window.geminiDebugState.results[step].push(logEntry);
  
  return logEntry;
}

// Helper function to log errors
function debugError(step, error) {
  const timestamp = new Date().toISOString();
  const errorEntry = { step, error: error.message, stack: error.stack, timestamp };
  
  console.error(`[${timestamp}] Step ${step} ERROR:`, error);
  window.geminiDebugState.errors.push(errorEntry);
  
  return errorEntry;
}

// Step 1: Check basic browser APIs
async function step1_checkBrowserAPIs() {
  debugLog(1, 'Checking browser APIs...');
  
  try {
    const checks = {
      hasWebSocket: typeof WebSocket !== 'undefined',
      hasAudioContext: typeof AudioContext !== 'undefined',
      hasGetUserMedia: !!(navigator.mediaDevices?.getUserMedia),
      hasLocalStorage: typeof localStorage !== 'undefined',
      hasElectronAPI: !!(window.electronAPI),
      userAgent: navigator.userAgent
    };
    
    debugLog(1, 'Browser API check results', checks);
    
    const missing = Object.entries(checks)
      .filter(([key, value]) => key !== 'userAgent' && !value)
      .map(([key]) => key);
    
    if (missing.length > 0) {
      throw new Error(`Missing APIs: ${missing.join(', ')}`);
    }
    
    return checks;
  } catch (error) {
    debugError(1, error);
    throw error;
  }
}

// Step 2: Check API key availability
async function step2_checkAPIKey() {
  debugLog(2, 'Checking API key availability...');
  
  try {
    const sources = {
      electronAPI: window.electronAPI?.env?.GEMINI_API_KEY,
      localStorage: localStorage.getItem('gemini-api-key'),
      settingsDB: null
    };
    
    // Try to get from database
    try {
      if (window.DatabaseService) {
        const settings = await window.DatabaseService.getSettings();
        sources.settingsDB = settings?.geminiApiKey;
      }
    } catch (dbError) {
      debugLog(2, 'Database access failed', dbError.message);
    }
    
    const apiKey = sources.electronAPI || sources.settingsDB || sources.localStorage;
    
    debugLog(2, 'API key sources', {
      hasElectronAPI: !!sources.electronAPI,
      hasLocalStorage: !!sources.localStorage,
      hasSettingsDB: !!sources.settingsDB,
      finalAPIKey: !!apiKey
    });
    
    if (!apiKey) {
      throw new Error('No API key found in any source');
    }
    
    return { apiKey: apiKey.substring(0, 10) + '...', sources };
  } catch (error) {
    debugError(2, error);
    throw error;
  }
}

// Step 3: Test microphone permission (most common crash point)
async function step3_testMicrophone() {
  debugLog(3, 'Testing microphone permission...');
  
  try {
    debugLog(3, 'Requesting microphone access...');
    
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    
    debugLog(3, 'Microphone access granted', {
      streamId: stream.id,
      tracks: stream.getTracks().length,
      audioTracks: stream.getAudioTracks().length
    });
    
    // Store for cleanup
    window.geminiDebugState.audioStream = stream;
    
    // Test audio track properties
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      debugLog(3, 'Audio track details', {
        label: audioTrack.label,
        kind: audioTrack.kind,
        enabled: audioTrack.enabled,
        readyState: audioTrack.readyState,
        settings: audioTrack.getSettings()
      });
    }
    
    return { stream, audioTrack };
  } catch (error) {
    debugError(3, error);
    
    // Provide specific error guidance
    if (error.name === 'NotAllowedError') {
      debugLog(3, 'Microphone permission denied - user needs to allow access');
    } else if (error.name === 'NotFoundError') {
      debugLog(3, 'No microphone found - check hardware');
    } else if (error.name === 'NotSupportedError') {
      debugLog(3, 'Microphone not supported in this browser');
    } else if (error.name === 'NotReadableError') {
      debugLog(3, 'Microphone already in use by another application');
    }
    
    throw error;
  }
}

// Step 4: Test AudioContext creation (another common crash point)
async function step4_testAudioContext() {
  debugLog(4, 'Testing AudioContext creation...');
  
  try {
    debugLog(4, 'Creating AudioContext...');
    
    const audioContext = new AudioContext({
      sampleRate: 16000
    });
    
    debugLog(4, 'AudioContext created', {
      state: audioContext.state,
      sampleRate: audioContext.sampleRate,
      baseLatency: audioContext.baseLatency,
      outputLatency: audioContext.outputLatency
    });
    
    // Store for cleanup
    window.geminiDebugState.audioContext = audioContext;
    
    // Test if we can create audio nodes
    if (window.geminiDebugState.audioStream) {
      debugLog(4, 'Testing audio processing chain...');
      
      const source = audioContext.createMediaStreamSource(window.geminiDebugState.audioStream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      
      debugLog(4, 'Audio nodes created successfully', {
        sourceNode: !!source,
        processorNode: !!processor
      });
      
      // Test connection
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      debugLog(4, 'Audio processing chain connected successfully');
      
      // Disconnect immediately to avoid feedback
      source.disconnect();
      processor.disconnect();
    }
    
    return { audioContext };
  } catch (error) {
    debugError(4, error);
    throw error;
  }
}

// Step 5: Test WebSocket connection (potential crash point)
async function step5_testWebSocket() {
  debugLog(5, 'Testing WebSocket connection...');
  
  try {
    const apiKeyResult = await step2_checkAPIKey();
    const apiKey = apiKeyResult.sources.electronAPI || apiKeyResult.sources.settingsDB || apiKeyResult.sources.localStorage;
    
    if (!apiKey) {
      throw new Error('No API key available for WebSocket test');
    }
    
    debugLog(5, 'Creating WebSocket connection...');
    
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    const ws = new WebSocket(wsUrl);
    
    // Store for cleanup
    window.geminiDebugState.websocket = ws;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        debugError(5, new Error('WebSocket connection timeout'));
        ws.close();
        reject(new Error('WebSocket connection timeout'));
      }, 10000);
      
      ws.onopen = () => {
        debugLog(5, 'WebSocket connected successfully', {
          readyState: ws.readyState,
          url: wsUrl.replace(apiKey, '[API_KEY_HIDDEN]')
        });
        clearTimeout(timeout);
        resolve({ websocket: ws });
      };
      
      ws.onerror = (error) => {
        debugError(5, new Error(`WebSocket error: ${error}`));
        clearTimeout(timeout);
        reject(error);
      };
      
      ws.onclose = (event) => {
        debugLog(5, 'WebSocket closed', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        });
        
        if (event.code === 4001) {
          debugError(5, new Error('Invalid API key'));
        } else if (event.code === 4003) {
          debugError(5, new Error('API quota exceeded'));
        }
      };
      
      ws.onmessage = (event) => {
        debugLog(5, 'WebSocket message received', {
          dataType: typeof event.data,
          dataLength: event.data.length
        });
      };
    });
  } catch (error) {
    debugError(5, error);
    throw error;
  }
}

// Step 6: Test Gemini Live service initialization
async function step6_testGeminiLiveService() {
  debugLog(6, 'Testing Gemini Live service...');
  
  try {
    // Import the service
    if (!window.geminiLiveService) {
      debugLog(6, 'Gemini Live service not found in window object');
      
      // Try to access it through the module system
      try {
        const module = await import('./src/services/gemini-live.js');
        window.geminiLiveService = module.geminiLiveService;
        debugLog(6, 'Gemini Live service imported successfully');
      } catch (importError) {
        debugError(6, importError);
        throw new Error('Cannot import Gemini Live service');
      }
    }
    
    const service = window.geminiLiveService;
    
    debugLog(6, 'Gemini Live service status', {
      isAvailable: service.isAvailable,
      isStreaming: service.isStreaming
    });
    
    if (!service.isAvailable) {
      throw new Error('Gemini Live service is not available');
    }
    
    return { service };
  } catch (error) {
    debugError(6, error);
    throw error;
  }
}

// Step 7: Test actual streaming start (the crash point)
async function step7_testStreamingStart() {
  debugLog(7, 'Testing Gemini Live streaming start...');
  
  try {
    const serviceResult = await step6_testGeminiLiveService();
    const service = serviceResult.service;
    
    debugLog(7, 'Starting Gemini Live streaming...');
    
    // Set up error callback
    service.onError((error) => {
      debugError(7, error);
    });
    
    // Set up result callback
    service.onResult((result) => {
      debugLog(7, 'Received result', result);
    });
    
    // Start streaming with minimal options
    await service.startStreaming({
      sampleRateHertz: 16000,
      encoding: 'LINEAR16',
      enableSpeakerDiarization: false,
      maxSpeakerCount: 2,
      languageCode: 'en-US'
    });
    
    debugLog(7, 'Gemini Live streaming started successfully');
    
    // Wait a bit to see if it crashes
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    debugLog(7, 'Streaming stable after 2 seconds');
    
    return { service };
  } catch (error) {
    debugError(7, error);
    throw error;
  }
}

// Cleanup function
function cleanup() {
  debugLog(0, 'Cleaning up debug resources...');
  
  try {
    if (window.geminiDebugState.audioStream) {
      window.geminiDebugState.audioStream.getTracks().forEach(track => track.stop());
      window.geminiDebugState.audioStream = null;
    }
    
    if (window.geminiDebugState.audioContext) {
      window.geminiDebugState.audioContext.close();
      window.geminiDebugState.audioContext = null;
    }
    
    if (window.geminiDebugState.websocket) {
      window.geminiDebugState.websocket.close();
      window.geminiDebugState.websocket = null;
    }
    
    if (window.geminiLiveService && window.geminiLiveService.isStreaming) {
      window.geminiLiveService.stopStreaming();
    }
    
    debugLog(0, 'Cleanup completed');
  } catch (error) {
    debugError(0, error);
  }
}

// Run all steps
async function runAllSteps() {
  debugLog(0, 'Starting comprehensive Gemini Live debug test...');
  
  try {
    await step1_checkBrowserAPIs();
    await step2_checkAPIKey();
    await step3_testMicrophone();
    await step4_testAudioContext();
    await step5_testWebSocket();
    await step6_testGeminiLiveService();
    await step7_testStreamingStart();
    
    console.log('🎉 All debug steps completed successfully!');
    console.log('📊 Debug results:', window.geminiDebugState.results);
    
    if (window.geminiDebugState.errors.length > 0) {
      console.warn('⚠️ Errors encountered:', window.geminiDebugState.errors);
    }
    
  } catch (error) {
    console.error('❌ Debug test failed at step:', error);
    console.log('📊 Partial results:', window.geminiDebugState.results);
    console.log('🚨 All errors:', window.geminiDebugState.errors);
  } finally {
    // Don't auto-cleanup so we can inspect the state
    console.log('💡 Run cleanup() manually when done inspecting');
  }
}

// Run individual steps
async function runStep(stepNumber) {
  const steps = {
    1: step1_checkBrowserAPIs,
    2: step2_checkAPIKey,
    3: step3_testMicrophone,
    4: step4_testAudioContext,
    5: step5_testWebSocket,
    6: step6_testGeminiLiveService,
    7: step7_testStreamingStart
  };
  
  if (steps[stepNumber]) {
    try {
      const result = await steps[stepNumber]();
      console.log(`✅ Step ${stepNumber} completed:`, result);
      return result;
    } catch (error) {
      console.error(`❌ Step ${stepNumber} failed:`, error);
      throw error;
    }
  } else {
    console.error(`❌ Invalid step number: ${stepNumber}`);
  }
}

// Export functions to window for manual testing
window.geminiDebug = {
  runAllSteps,
  runStep,
  cleanup,
  step1_checkBrowserAPIs,
  step2_checkAPIKey,
  step3_testMicrophone,
  step4_testAudioContext,
  step5_testWebSocket,
  step6_testGeminiLiveService,
  step7_testStreamingStart,
  state: window.geminiDebugState
};

console.log('🚀 Debug script loaded. Run geminiDebug.runAllSteps() to start testing');
console.log('💡 Or run individual steps with geminiDebug.runStep(1-7)');
console.log('🧹 Run geminiDebug.cleanup() when done'); 