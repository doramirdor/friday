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

  // Create a memory store for our fallback implementation
  const memoryStore = {};

  // Also attempt to define a global PouchDB constructor that works
  window.PouchDBFallback = function PouchDB(name, options) {
    if (!(this instanceof PouchDB)) {
      return new PouchDB(name, options);
    }
    
    this.name = name;
    this.options = options || {};
    
    // Initialize an in-memory store for this database
    if (!memoryStore[name]) {
      memoryStore[name] = {
        docs: {},
        indexes: {}
      };
    }
    
    // Store reference to this database's store
    this._store = memoryStore[name];
    
    console.log('⚠️ Using PouchDB fallback constructor for', name);
  };

  // Add methods to the fallback PouchDB
  window.PouchDBFallback.prototype = {
    // Basic operations
    put: async function(doc) {
      const id = doc._id || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const rev = doc._rev || `1-${Math.random().toString(36).substr(2, 9)}`;
      
      // Check if doc exists and rev matches
      const existingDoc = this._store.docs[id];
      if (existingDoc && doc._rev !== existingDoc._rev) {
        throw { status: 409, name: 'conflict', message: 'Document update conflict' };
      }
      
      // Create new revision
      const newRev = (existingDoc ? parseInt(existingDoc._rev.split('-')[0]) + 1 : 1) + 
                     `-${Math.random().toString(36).substr(2, 9)}`;
      
      // Store the document
      this._store.docs[id] = {
        ...doc,
        _id: id,
        _rev: newRev
      };
      
      return { ok: true, id: id, rev: newRev };
    },
    
    get: async function(id) {
      const doc = this._store.docs[id];
      if (!doc) {
        throw { status: 404, name: 'not_found', message: 'Document not found' };
      }
      return { ...doc };
    },
    
    remove: async function(docOrId) {
      let id, rev;
      
      if (typeof docOrId === 'string') {
        id = docOrId;
        const doc = this._store.docs[id];
        if (!doc) {
          throw { status: 404, name: 'not_found', message: 'Document not found' };
        }
        rev = doc._rev;
      } else {
        id = docOrId._id;
        rev = docOrId._rev;
        
        const doc = this._store.docs[id];
        if (!doc) {
          throw { status: 404, name: 'not_found', message: 'Document not found' };
        }
        
        if (rev !== doc._rev) {
          throw { status: 409, name: 'conflict', message: 'Document update conflict' };
        }
      }
      
      delete this._store.docs[id];
      return { ok: true, id: id, rev: rev };
    },
    
    // Bulk operations
    bulkDocs: async function(docs) {
      const results = [];
      for (const doc of docs) {
        try {
          if (doc._deleted) {
            const result = await this.remove(doc);
            results.push(result);
          } else {
            const result = await this.put(doc);
            results.push(result);
          }
        } catch (error) {
          results.push(error);
        }
      }
      return results;
    },
    
    // Find plugin methods
    createIndex: async function(options) {
      const indexName = `idx_${Date.now()}`;
      this._store.indexes[indexName] = options.index;
      return { result: 'created', id: indexName, name: indexName };
    },
    
    find: async function(options) {
      const selector = options.selector || {};
      const sort = options.sort || [];
      
      // Filter docs by selector
      let results = Object.values(this._store.docs);
      
      // Apply selector filtering
      Object.entries(selector).forEach(([key, value]) => {
        results = results.filter(doc => {
          if (typeof value === 'object') {
            // Handle operators like $eq, $gt, etc.
            return true; // Simplified - you'd implement real operators here
          }
          return doc[key] === value;
        });
      });
      
      // Apply sorting (simplified)
      if (sort.length > 0) {
        // Sort by the first sort field
        const sortField = Object.keys(sort[0])[0];
        const sortDir = sort[0][sortField] === 'desc' ? -1 : 1;
        
        results.sort((a, b) => {
          if (a[sortField] < b[sortField]) return -1 * sortDir;
          if (a[sortField] > b[sortField]) return 1 * sortDir;
          return 0;
        });
      }
      
      return { docs: results };
    },
    
    // Database info
    info: async function() {
      const docCount = Object.keys(this._store.docs).length;
      return {
        db_name: this.name,
        doc_count: docCount,
        update_seq: docCount,
        auto_compaction: false,
        adapter: 'memory'
      };
    },
    
    // Cleanup
    destroy: async function() {
      delete memoryStore[this.name];
      return { ok: true };
    }
  };

  // Add plugin support to fallback
  window.PouchDBFallback.plugin = function(plugin) {
    if (typeof plugin === 'function') {
      plugin(window.PouchDBFallback);
    } else if (typeof plugin === 'object') {
      Object.assign(window.PouchDBFallback.prototype, plugin);
    }
  };

  console.log('✅ PouchDB fix script initialized with enhanced fallback implementation');
})(); 