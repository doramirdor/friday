#!/usr/bin/env node

// This is a simple script to test PouchDB initialization
// Run it with: node test-pouchdb-setup.js

// Import the necessary modules for ESM compatibility
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

async function runPouchDBTest() {
  try {
    console.log('🔍 Testing PouchDB setup and initialization...');
    
    // This will simulate a browser environment for testing PouchDB
    global.localStorage = {
      _data: {},
      setItem: function(id, val) { this._data[id] = String(val); },
      getItem: function(id) { return this._data[id] ? this._data[id] : null; },
      removeItem: function(id) { delete this._data[id]; },
      clear: function() { this._data = {}; },
      key: function(i) { return Object.keys(this._data)[i] || null; },
      get length() { return Object.keys(this._data).length; }
    };
    
    // Since PouchDB uses Object.keys on localStorage
    Object.defineProperty(global.localStorage, 'length', {
      get: function() { return Object.keys(this._data).length; }
    });
    
    // Build from source
    console.log('🏗️ Compiling TypeScript...');
    const { execSync } = require('child_process');
    execSync('npx tsc --skipLibCheck src/services/pouchdb-setup.ts src/services/pouchdb-upgrade.ts src/services/setup-pouchdb-test.ts --outDir dist --esModuleInterop true --moduleResolution node --target ES2020 --module NodeNext', { stdio: 'inherit' });
    console.log('✅ Compilation complete');
    
    // Import and run the test
    console.log('🧪 Running PouchDB test...');
    const { default: testPouchDBSetup } = await import('./dist/src/services/setup-pouchdb-test.js');
    const result = await testPouchDBSetup();
    
    // Display the results
    if (result.success) {
      console.log('\n✅ SUCCESS: PouchDB is correctly set up');
      console.log(result.message);
    } else {
      console.error('\n❌ ERROR: PouchDB setup test failed');
      console.error(result.message);
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 FATAL ERROR:', error);
    process.exit(1);
  }
}

// Run the test
runPouchDBTest(); 