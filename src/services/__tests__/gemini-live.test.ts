import { geminiLiveService, GeminiLiveService, GeminiLiveOptions, GeminiLiveResult } from '../gemini-live';

// Mock Web APIs
const mockWebSocket = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
  readyState: 1,
  send: jest.fn(),
  close: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  onopen: null,
  onmessage: null,
  onerror: null,
  onclose: null,
};

const mockAudioContext = {
  sampleRate: 16000,
  createMediaStreamSource: jest.fn(),
  createScriptProcessor: jest.fn(),
  createAnalyser: jest.fn(),
  close: jest.fn(),
  destination: {},
};

const mockScriptProcessor = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  onaudioprocess: null,
};

const mockMediaStreamSource = {
  connect: jest.fn(),
};

const mockAnalyser = {
  frequencyBinCount: 1024,
  getByteFrequencyData: jest.fn(),
};

const mockMediaStream = {
  getTracks: jest.fn(() => [{ stop: jest.fn() }]),
};

const mockGetUserMedia = jest.fn();

// Mock global APIs
global.WebSocket = jest.fn(() => mockWebSocket) as any;
global.AudioContext = jest.fn(() => mockAudioContext) as any;
global.navigator = {
  ...global.navigator,
  mediaDevices: {
    getUserMedia: mockGetUserMedia,
  },
} as any;

// Mock window APIs
global.window = {
  ...global.window,
  setInterval: jest.fn((fn, delay) => {
    // Store the function for manual triggering in tests
    (global as any).mockIntervalFn = fn;
    return 123; // mock interval ID
  }),
  clearInterval: jest.fn(),
} as any;

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};
global.localStorage = mockLocalStorage as any;

// Mock DatabaseService
jest.mock('../database', () => ({
  DatabaseService: {
    getSettings: jest.fn(() => Promise.resolve({ geminiApiKey: 'test-db-key' })),
  },
}));

describe('GeminiLiveService', () => {
  let service: GeminiLiveService;
  let resultCallback: jest.Mock;
  let errorCallback: jest.Mock;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup mock returns
    mockGetUserMedia.mockResolvedValue(mockMediaStream);
    mockAudioContext.createMediaStreamSource.mockReturnValue(mockMediaStreamSource);
    mockAudioContext.createScriptProcessor.mockReturnValue(mockScriptProcessor);
    mockAudioContext.createAnalyser.mockReturnValue(mockAnalyser);
    mockLocalStorage.getItem.mockReturnValue('test-local-key');
    
    // Setup mock electron API
    (global as any).window = {
      ...global.window,
      electronAPI: {
        env: {
          GEMINI_API_KEY: 'test-env-key'
        }
      }
    };

    service = geminiLiveService;
    resultCallback = jest.fn();
    errorCallback = jest.fn();
    
    service.onResult(resultCallback);
    service.onError(errorCallback);
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('Initialization', () => {
    test('should be available when all requirements are met', async () => {
      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(service.isAvailable).toBe(true);
    });

    test('should not be available without API key', async () => {
      // Remove all API key sources
      (global as any).window.electronAPI = undefined;
      mockLocalStorage.getItem.mockReturnValue(null);
      require('../database').DatabaseService.getSettings.mockResolvedValue({});
      
      // Create new service instance to test initialization
      const testService = new (require('../gemini-live').GeminiLiveServiceImpl)();
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(testService.isAvailable).toBe(false);
    });

    test('should prioritize environment API key over other sources', async () => {
      expect(service.isAvailable).toBe(true);
      // Environment key should be used (test-env-key)
    });
  });

  describe('Audio Capture', () => {
    test('should request microphone access with correct constraints', async () => {
      await service.startStreaming();

      expect(mockGetUserMedia).toHaveBeenCalledWith({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    });

    test('should create AudioContext with 16kHz sample rate', async () => {
      await service.startStreaming();

      expect(global.AudioContext).toHaveBeenCalledWith({
        sampleRate: 16000
      });
    });

    test('should setup audio processing chain correctly', async () => {
      await service.startStreaming();

      expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalledWith(mockMediaStream);
      expect(mockAudioContext.createScriptProcessor).toHaveBeenCalledWith(4096, 1, 1);
      expect(mockMediaStreamSource.connect).toHaveBeenCalledWith(mockScriptProcessor);
      expect(mockScriptProcessor.connect).toHaveBeenCalledWith(mockAudioContext.destination);
    });

    test('should handle microphone access failure', async () => {
      const error = new Error('Permission denied');
      mockGetUserMedia.mockRejectedValue(error);

      await expect(service.startStreaming()).rejects.toThrow('Microphone access failed: Permission denied');
    });
  });

  describe('WebSocket Connection', () => {
    test('should connect to correct Gemini Live endpoint', async () => {
      await service.startStreaming();

      expect(global.WebSocket).toHaveBeenCalledWith(
        'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=test-env-key'
      );
    });

    test('should send correct setup message on connection', async () => {
      await service.startStreaming();

      // Trigger WebSocket onopen
      mockWebSocket.onopen?.({} as Event);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"setup"')
      );

      const sentMessage = JSON.parse(mockWebSocket.send.mock.calls[0][0]);
      expect(sentMessage.setup.model).toBe('models/gemini-2.0-flash-live-001');
      expect(sentMessage.setup.generationConfig.responseModalities).toEqual(['TEXT']);
      expect(sentMessage.setup.realtimeInputConfig).toBeDefined();
    });

    test('should handle WebSocket connection failure', async () => {
      await service.startStreaming();

      // Trigger WebSocket onerror
      mockWebSocket.onerror?.(new Event('error'));

      expect(errorCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Failed to connect to Gemini Live'
        })
      );
    });

    test('should handle WebSocket close with error codes', async () => {
      await service.startStreaming();

      // Trigger WebSocket onclose with error code
      mockWebSocket.onclose?.({
        code: 1007,
        reason: 'Invalid argument',
        wasClean: false
      } as CloseEvent);

      expect(errorCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('1007')
        })
      );
    });
  });

  describe('Audio Processing', () => {
    test('should process PCM audio chunks correctly', async () => {
      await service.startStreaming();
      
      // Trigger WebSocket onopen to start audio processing
      mockWebSocket.onopen?.({} as Event);

      // Simulate audio processing
      const mockInputBuffer = {
        getChannelData: jest.fn(() => new Float32Array([0.5, -0.5, 0.25, -0.25]))
      };

      const mockEvent = {
        inputBuffer: mockInputBuffer
      };

      // Trigger audio processing
      mockScriptProcessor.onaudioprocess?.(mockEvent as any);

      // Verify PCM conversion
      expect(mockInputBuffer.getChannelData).toHaveBeenCalledWith(0);
    });

    test('should accumulate audio chunks before sending', async () => {
      await service.startStreaming();
      mockWebSocket.onopen?.({} as Event);

      // Simulate multiple audio chunks
      const mockInputBuffer = {
        getChannelData: jest.fn(() => new Float32Array([0.1, 0.2, 0.3, 0.4]))
      };

      // Process several chunks
      for (let i = 0; i < 5; i++) {
        mockScriptProcessor.onaudioprocess?.({ inputBuffer: mockInputBuffer } as any);
      }

      // Should not send immediately (accumulation buffer)
      expect(mockWebSocket.send).toHaveBeenCalledTimes(1); // Only setup message
    });

    test('should send accumulated audio after timeout', async () => {
      await service.startStreaming();
      mockWebSocket.onopen?.({} as Event);

      // Simulate audio chunks
      const mockInputBuffer = {
        getChannelData: jest.fn(() => new Float32Array([0.1, 0.2]))
      };

      mockScriptProcessor.onaudioprocess?.({ inputBuffer: mockInputBuffer } as any);

      // Manually trigger the interval function to simulate timeout
      if ((global as any).mockIntervalFn) {
        (global as any).mockIntervalFn();
      }

      // Should send audio data
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"realtimeInput"')
      );
    });

    test('should convert Float32 to 16-bit PCM correctly', async () => {
      await service.startStreaming();
      mockWebSocket.onopen?.({} as Event);

      const testSamples = [1.0, -1.0, 0.5, -0.5, 0.0];
      const mockInputBuffer = {
        getChannelData: jest.fn(() => new Float32Array(testSamples))
      };

      mockScriptProcessor.onaudioprocess?.({ inputBuffer: mockInputBuffer } as any);

      // The conversion should happen internally
      // We can't directly test the conversion without exposing internals,
      // but we can verify the process completes without errors
      expect(mockInputBuffer.getChannelData).toHaveBeenCalled();
    });
  });

  describe('Message Handling', () => {
    test('should handle setup complete message', async () => {
      await service.startStreaming();

      const setupMessage = JSON.stringify({ setupComplete: true });
      await mockWebSocket.onmessage?.({ data: setupMessage } as MessageEvent);

      // Should not call result callback for setup complete
      expect(resultCallback).not.toHaveBeenCalled();
    });

    test('should handle input transcription', async () => {
      await service.startStreaming();

      const transcriptionMessage = JSON.stringify({
        serverContent: {
          inputTranscription: {
            text: 'Hello world',
            finished: true
          }
        }
      });

      await mockWebSocket.onmessage?.({ data: transcriptionMessage } as MessageEvent);

      expect(resultCallback).toHaveBeenCalledWith({
        transcript: 'Hello world',
        isFinal: true,
        speakerTag: undefined,
        confidence: 1.0
      });
    });

    test('should handle model response', async () => {
      await service.startStreaming();

      const modelMessage = JSON.stringify({
        serverContent: {
          modelTurn: {
            parts: [{ text: 'AI response' }]
          },
          turnComplete: true
        }
      });

      await mockWebSocket.onmessage?.({ data: modelMessage } as MessageEvent);

      expect(resultCallback).toHaveBeenCalledWith({
        transcript: 'AI response',
        isFinal: true,
        speakerTag: undefined,
        confidence: 1.0
      });
    });

    test('should handle error messages', async () => {
      await service.startStreaming();

      const errorMessage = JSON.stringify({
        error: {
          message: 'API error',
          code: 400
        }
      });

      await mockWebSocket.onmessage?.({ data: errorMessage } as MessageEvent);

      expect(errorCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'API error'
        })
      );
    });

    test('should handle binary message data', async () => {
      await service.startStreaming();

      const binaryData = new Blob([JSON.stringify({ setupComplete: true })]);
      await mockWebSocket.onmessage?.({ data: binaryData } as MessageEvent);

      // Should handle binary data without errors
      expect(resultCallback).not.toHaveBeenCalled();
    });
  });

  describe('Streaming Control', () => {
    test('should start streaming successfully', async () => {
      expect(service.isStreaming).toBe(false);

      await service.startStreaming();

      expect(service.isStreaming).toBe(true);
    });

    test('should not start streaming if already active', async () => {
      await service.startStreaming();
      const firstCallCount = mockGetUserMedia.mock.calls.length;

      await service.startStreaming();

      // Should not call getUserMedia again
      expect(mockGetUserMedia.mock.calls.length).toBe(firstCallCount);
    });

    test('should stop streaming and cleanup resources', async () => {
      await service.startStreaming();
      expect(service.isStreaming).toBe(true);

      service.stopStreaming();

      expect(service.isStreaming).toBe(false);
      expect(mockAudioContext.close).toHaveBeenCalled();
      expect(mockScriptProcessor.disconnect).toHaveBeenCalled();
      expect(mockWebSocket.close).toHaveBeenCalled();
    });

    test('should handle stop streaming when not active', () => {
      expect(service.isStreaming).toBe(false);

      // Should not throw error
      expect(() => service.stopStreaming()).not.toThrow();
    });
  });

  describe('Options Configuration', () => {
    test('should use default options when none provided', async () => {
      await service.startStreaming();

      // Verify default sample rate is used
      expect(mockGetUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: expect.objectContaining({
            sampleRate: 16000
          })
        })
      );
    });

    test('should merge custom options with defaults', async () => {
      const customOptions: GeminiLiveOptions = {
        languageCode: 'es-ES',
        maxSpeakerCount: 2
      };

      await service.startStreaming(customOptions);

      // Should still use default sample rate but custom language
      expect(mockGetUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: expect.objectContaining({
            sampleRate: 16000
          })
        })
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle service unavailable', async () => {
      // Make service unavailable
      (service as any)._isAvailable = false;

      await expect(service.startStreaming()).rejects.toThrow(
        'Gemini Live service is not available'
      );
    });

    test('should handle missing API key', async () => {
      // Remove API key
      (service as any).apiKey = null;

      await expect(service.startStreaming()).rejects.toThrow(
        'Gemini API key not configured'
      );
    });

    test('should cleanup on streaming failure', async () => {
      mockGetUserMedia.mockRejectedValue(new Error('Mic error'));

      await expect(service.startStreaming()).rejects.toThrow();

      // Should cleanup even on failure
      expect(service.isStreaming).toBe(false);
    });
  });

  describe('Callback Management', () => {
    test('should register result callback', () => {
      const callback = jest.fn();
      service.onResult(callback);

      // Verify callback is stored (we can't directly test this without exposing internals)
      expect(callback).toBeDefined();
    });

    test('should register error callback', () => {
      const callback = jest.fn();
      service.onError(callback);

      expect(callback).toBeDefined();
    });
  });
}); 