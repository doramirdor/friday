/**
 * PouchDB Constructor Patch
 * This script patches PouchDB constructor issues in different environments, 
 * especially Electron with ESM modules.
 */
(function() {
  // This will run before PouchDB is loaded
  console.log('🔧 PouchDB patch initialized');
  
  // Store the original define function if it exists (used by AMD modules)
  const originalDefine = window.define;
  
  if (originalDefine && typeof originalDefine === 'function' && originalDefine.amd) {
    console.log('🔍 AMD environment detected, patching define');
    
    // Intercept AMD define for PouchDB modules
    window.define = function() {
      const args = Array.prototype.slice.call(arguments);
      
      // Check if this is a PouchDB module definition
      if (args.length >= 3 && 
          typeof args[0] === 'string' && 
          (args[0].includes('pouchdb') || args[0].includes('PouchDB'))) {
        
        console.log(`📦 Patching module: ${args[0]}`);
        
        // The factory function is the last argument
        const originalFactory = args[args.length - 1];
        
        // Replace the factory with our patched version
        args[args.length - 1] = function() {
          // Call the original factory
          const result = originalFactory.apply(this, arguments);
          
          // If this is the main PouchDB module and result needs fixing
          if (args[0].includes('pouchdb/lib/index') || args[0].includes('pouchdb')) {
            console.log('🛠️ Patching PouchDB constructor');
            
            // Fix the constructor if it's an object
            if (result && typeof result === 'object' && !result.prototype) {
              console.log('⚠️ PouchDB is an object, not a constructor - applying fix');
              
              // If 'default' property exists and is a constructor, use that
              if (result.default && typeof result.default === 'function') {
                console.log('✅ Using PouchDB.default as constructor');
                return result.default;
              }
            }
          }
          
          return result;
        };
      }
      
      // Call the original define with our modified arguments
      return originalDefine.apply(this, args);
    };
    
    // Copy properties from the original define
    for (const prop in originalDefine) {
      window.define[prop] = originalDefine[prop];
    }
  }
  
  // Global patch for ESM modules
  const originalImport = window.import;
  if (originalImport) {
    window.import = function() {
      return originalImport.apply(this, arguments)
        .then(module => {
          // Check if this is PouchDB
          if (module && 
              module.default && 
              typeof module.default === 'object' && 
              module.default.name === 'PouchDB') {
            
            console.log('🛠️ Patching ESM PouchDB module');
            return module.default.default || module.default;
          }
          return module;
        });
    };
  }
  
  console.log('✅ PouchDB patch ready');
})(); 