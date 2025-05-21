/**
 * PouchDB Direct Fix
 * This script directly overrides the PouchDB module in the bundler's module cache
 * to fix the "Class extends value [object Object] is not a constructor" error.
 */
(function() {
  console.log('🔧 PouchDB direct fix script initialized');

  // Function to monitor when PouchDB is loaded
  function monitorPouchDBLoading() {
    console.log('👀 Setting up PouchDB monitoring');

    // Create a proxy for the module system
    if (window.__VITE_PLUGIN_SSR__?.__vitePageContext?.modules?.cache) {
      console.log('🔍 Detected Vite module system');
      // Handle Vite's module cache
      monitorViteModules();
    } else {
      // Use MutationObserver as a fallback to detect script loading
      setupMutationObserver();
    }

    // Also try to directly fix webpack/other bundlers
    try {
      monitorWebpackModules();
    } catch (e) {
      console.log('ℹ️ No webpack detected');
    }
  }

  // Monitor Vite modules
  function monitorViteModules() {
    const cache = window.__VITE_PLUGIN_SSR__.__vitePageContext.modules.cache;
    Object.keys(cache).forEach(key => {
      if (key.includes('pouchdb')) {
        console.log(`⚡ Found PouchDB module: ${key}`);
        fixPouchDBModule(cache[key].exports);
      }
    });

    // Set up a watcher for new modules
    const originalSet = Map.prototype.set;
    Map.prototype.set = function(key, value) {
      if (typeof key === 'string' && key.includes('pouchdb')) {
        console.log(`⚡ Intercepted PouchDB module load: ${key}`);
        if (value.exports) {
          fixPouchDBModule(value.exports);
        }
      }
      return originalSet.apply(this, arguments);
    };
  }

  // Monitor webpack modules
  function monitorWebpackModules() {
    // Try to find webpack's modules object
    const webpackModules = window.webpackJsonp || 
                           window.__webpack_modules__ || 
                           window.__webpack_require__?.m;
    
    if (webpackModules) {
      console.log('🔍 Detected webpack module system');
      
      // Check existing modules
      Object.keys(webpackModules).forEach(key => {
        const mod = webpackModules[key];
        if (mod && typeof mod === 'function' && mod.toString().includes('PouchDB')) {
          console.log(`⚡ Found PouchDB webpack module: ${key}`);
          // Replace the module with our fixed version
          const originalModule = webpackModules[key];
          webpackModules[key] = function(module, exports, __webpack_require__) {
            originalModule(module, exports, __webpack_require__);
            fixPouchDBModule(exports);
          };
        }
      });
    }
  }

  // Use MutationObserver as a fallback
  function setupMutationObserver() {
    console.log('👀 Setting up MutationObserver to detect PouchDB load');
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeName === 'SCRIPT') {
              const scriptNode = node;
              if (scriptNode.src && scriptNode.src.includes('pouchdb')) {
                console.log('⚡ PouchDB script detected:', scriptNode.src);
                // Wait a bit for the script to execute
                setTimeout(fixGlobalPouchDB, 100);
              }
            }
          });
        }
      });
    });
    
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  // Fix the global PouchDB object if it exists
  function fixGlobalPouchDB() {
    if (window.PouchDB) {
      console.log('🔧 Fixing global PouchDB object');
      fixPouchDBModule(window.PouchDB);
    }
  }

  // The actual fix for PouchDB module
  function fixPouchDBModule(pouchdbExports) {
    console.log('🛠️ Applying fix to PouchDB module', pouchdbExports);
    
    try {
      // If PouchDB is an object but not a constructor
      if (pouchdbExports && typeof pouchdbExports === 'object' && !pouchdbExports.prototype) {
        console.log('⚠️ PouchDB is not a constructor - attempting to fix');
        
        // First try the default property
        if (typeof pouchdbExports.default === 'function') {
          console.log('✅ Found valid constructor in pouchdbExports.default');
          
          // Replace the object with the constructor
          Object.getOwnPropertyNames(pouchdbExports.default).forEach(key => {
            pouchdbExports[key] = pouchdbExports.default[key];
          });
          
          // Copy prototype 
          pouchdbExports.prototype = pouchdbExports.default.prototype;
          
          // Replace the object's constructor
          Object.defineProperty(window, 'PouchDB', {
            value: pouchdbExports.default,
            writable: true,
            configurable: true
          });
          
          console.log('✅ Global PouchDB replaced with constructor from default');
        }
      }
    } catch (error) {
      console.error('❌ Error fixing PouchDB:', error);
    }
  }

  // Start monitoring for PouchDB
  monitorPouchDBLoading();

  // Also attempt to define a global PouchDB constructor that works
  window.PouchDBFallback = function PouchDB(name, options) {
    if (!(this instanceof PouchDB)) {
      return new PouchDB(name, options);
    }
    this.name = name;
    this.options = options || {};
    
    // These would normally be initialized by the real PouchDB
    this._id = '';
    this._rev = '';
    
    console.log('⚠️ Using PouchDB fallback constructor');
  };

  console.log('✅ PouchDB fix script initialized');
})(); 