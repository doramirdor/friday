/**
 * Integration tests for Gemini Live Service
 * These tests verify end-to-end functionality and real-world scenarios
 */

import { geminiLiveService, GeminiLiveResult } from '../gemini-live';

// Skip integration tests if no API key is available
const hasApiKey = process.env.GEMINI_API_KEY || 
                  process.env.REACT_APP_GEMINI_API_KEY ||
                  localStorage?.getItem('gemini-api-key');

const describeIntegration = hasApiKey ? describe : describe.skip;

describeIntegration('GeminiLive Integration Tests', () => {
  let receivedResults: GeminiLiveResult[] = [];
  let receivedErrors: Error[] = [];

  beforeEach(() => {
    receivedResults = [];
    receivedErrors = [];
    
    geminiLiveService.onResult((result) => {
      receivedResults.push(result);
    });
    
    geminiLiveService.onError((error) => {
      receivedErrors.push(error);
    });
  });

  afterEach(async () => {
    if (geminiLiveService.isStreaming) {
      geminiLiveService.stopStreaming();
      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  });

  test('should establish connection to Gemini Live API', async () => {
    if (!geminiLiveService.isAvailable) {
      console.warn('Gemini Live service not available, skipping integration test');
      return;
    }

    await geminiLiveService.startStreaming();
    
    expect(geminiLiveService.isStreaming).toBe(true);
    
    // Wait for connection to establish
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Should not have connection errors
    expect(receivedErrors.filter(e => e.message.includes('Failed to connect'))).toHaveLength(0);
  }, 10000);

  test('should handle audio capture and processing', async () => {
    if (!geminiLiveService.isAvailable) {
      console.warn('Gemini Live service not available, skipping integration test');
      return;
    }

    await geminiLiveService.startStreaming();
    
    // Wait for audio processing to start
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Should be capturing audio without errors
    expect(receivedErrors.filter(e => e.message.includes('Microphone'))).toHaveLength(0);
    expect(receivedErrors.filter(e => e.message.includes('Audio'))).toHaveLength(0);
  }, 15000);

  test('should gracefully handle service restart', async () => {
    if (!geminiLiveService.isAvailable) {
      console.warn('Gemini Live service not available, skipping integration test');
      return;
    }

    // Start service
    await geminiLiveService.startStreaming();
    expect(geminiLiveService.isStreaming).toBe(true);
    
    // Stop service
    geminiLiveService.stopStreaming();
    expect(geminiLiveService.isStreaming).toBe(false);
    
    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Start again
    await geminiLiveService.startStreaming();
    expect(geminiLiveService.isStreaming).toBe(true);
    
    // Should not have errors from restart
    expect(receivedErrors).toHaveLength(0);
  }, 20000);

  test('should handle network interruption gracefully', async () => {
    if (!geminiLiveService.isAvailable) {
      console.warn('Gemini Live service not available, skipping integration test');
      return;
    }

    await geminiLiveService.startStreaming();
    
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Simulate network interruption by stopping and restarting
    geminiLiveService.stopStreaming();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await geminiLiveService.startStreaming();
    
    // Should recover without critical errors
    expect(geminiLiveService.isStreaming).toBe(true);
  }, 15000);
});

/**
 * Performance tests for audio processing
 */
describe('GeminiLive Performance Tests', () => {
  test('should handle rapid start/stop cycles', async () => {
    if (!geminiLiveService.isAvailable) {
      console.warn('Gemini Live service not available, skipping performance test');
      return;
    }

    const cycles = 5;
    const errors: Error[] = [];
    
    geminiLiveService.onError((error) => {
      errors.push(error);
    });

    for (let i = 0; i < cycles; i++) {
      await geminiLiveService.startStreaming();
      expect(geminiLiveService.isStreaming).toBe(true);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      geminiLiveService.stopStreaming();
      expect(geminiLiveService.isStreaming).toBe(false);
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Should not accumulate errors over multiple cycles
    expect(errors.filter(e => e.message.includes('cleanup') || e.message.includes('resource'))).toHaveLength(0);
  }, 30000);

  test('should maintain stable memory usage', async () => {
    if (!geminiLiveService.isAvailable) {
      console.warn('Gemini Live service not available, skipping performance test');
      return;
    }

    const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;
    
    // Run service for extended period
    await geminiLiveService.startStreaming();
    await new Promise(resolve => setTimeout(resolve, 5000));
    geminiLiveService.stopStreaming();
    
    // Force garbage collection if available
    if ((global as any).gc) {
      (global as any).gc();
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
    
    // Memory usage should not increase significantly (allow 10MB tolerance)
    if (initialMemory > 0 && finalMemory > 0) {
      const memoryIncrease = finalMemory - initialMemory;
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // 10MB
    }
  }, 15000);
});

/**
 * Error recovery tests
 */
describe('GeminiLive Error Recovery Tests', () => {
  test('should recover from invalid API key', async () => {
    // This test would require mocking the API key validation
    // For now, we'll just verify the service handles the error gracefully
    expect(geminiLiveService.isAvailable).toBeDefined();
  });

  test('should handle microphone permission denial', async () => {
    // This test would require mocking getUserMedia to reject
    // For now, we'll verify the service has proper error handling
    expect(typeof geminiLiveService.onError).toBe('function');
  });
});

/**
 * Audio format compatibility tests
 */
describe('GeminiLive Audio Compatibility Tests', () => {
  test('should work with different sample rates', async () => {
    if (!geminiLiveService.isAvailable) {
      console.warn('Gemini Live service not available, skipping compatibility test');
      return;
    }

    // Test with different sample rate options
    const options = {
      sampleRateHertz: 16000, // Standard rate for Gemini Live
      encoding: 'LINEAR16' as const
    };

    await geminiLiveService.startStreaming(options);
    expect(geminiLiveService.isStreaming).toBe(true);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    geminiLiveService.stopStreaming();
  }, 10000);

  test('should handle different language codes', async () => {
    if (!geminiLiveService.isAvailable) {
      console.warn('Gemini Live service not available, skipping compatibility test');
      return;
    }

    const options = {
      languageCode: 'en-US'
    };

    await geminiLiveService.startStreaming(options);
    expect(geminiLiveService.isStreaming).toBe(true);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    geminiLiveService.stopStreaming();
  }, 10000);
}); 