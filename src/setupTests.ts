// Jest setup file for Gemini Live tests
import '@testing-library/jest-dom';

// Mock Web APIs that aren't available in Jest environment
global.WebSocket = jest.fn();
global.AudioContext = jest.fn();
global.MediaRecorder = jest.fn();

// Mock navigator.mediaDevices
Object.defineProperty(global.navigator, 'mediaDevices', {
  writable: true,
  value: {
    getUserMedia: jest.fn(),
  },
});

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

// Mock window.setInterval and clearInterval
global.setInterval = jest.fn();
global.clearInterval = jest.fn();

// Mock performance API
Object.defineProperty(global, 'performance', {
  value: {
    memory: {
      usedJSHeapSize: 1000000,
    },
  },
});

// Mock Blob constructor
global.Blob = jest.fn().mockImplementation((parts, options) => ({
  size: parts?.reduce((acc: number, part: any) => acc + (part.length || part.byteLength || 0), 0) || 0,
  type: options?.type || '',
  arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
  text: jest.fn().mockResolvedValue('{}'),
}));

// Mock ArrayBuffer and related types
global.ArrayBuffer = ArrayBuffer;
global.Uint8Array = Uint8Array;
global.Int16Array = Int16Array;
global.Float32Array = Float32Array;

// Mock btoa for base64 encoding
global.btoa = jest.fn().mockImplementation((str) => Buffer.from(str, 'binary').toString('base64'));

// Suppress console warnings during tests
const originalWarn = console.warn;
console.warn = (...args) => {
  if (args[0]?.includes?.('Gemini Live service not available')) {
    return; // Suppress expected warnings
  }
  originalWarn(...args);
}; 