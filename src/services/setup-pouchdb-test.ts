// PouchDB Setup Test Script
// This script tests if PouchDB is properly set up and functioning
import PouchDBLoader, { getPouchDB, createDatabase } from './pouchdb-setup';
import checkAndUpgradePouchDB from './pouchdb-upgrade';

// Types for our test data
interface TestDocument {
  _id?: string;
  _rev?: string;
  title: string;
  createdAt: string;
  type: 'test';
}

export async function testPouchDBSetup(): Promise<{success: boolean, message: string}> {
  console.log('🔍 Starting PouchDB setup test...');
  
  try {
    // First run the upgrade check to fix any corrupted data
    console.log('🧹 Checking for and cleaning up any corrupted PouchDB data...');
    await checkAndUpgradePouchDB();
    
    // Test PouchDB loading
    console.log('🔄 Testing PouchDB constructor loading...');
    const PouchDB = await PouchDBLoader();
    console.log('✅ PouchDB constructor loaded successfully');
    
    // Verify PouchDB is a constructor
    if (typeof PouchDB !== 'function') {
      throw new Error(`PouchDB is not a constructor, but a ${typeof PouchDB}`);
    }
    
    // Create a test database
    console.log('🏗️ Creating test database...');
    const testDb = await createDatabase<TestDocument>('setup-test');
    
    // Test basic operations
    console.log('📝 Testing basic database operations...');
    
    // Create a document
    const testDoc: TestDocument = {
      title: 'Test Document',
      createdAt: new Date().toISOString(),
      type: 'test'
    };
    
    // Put the document in the database
    const putResult = await testDb.put(testDoc);
    console.log('✅ Document created:', putResult);
    
    // Retrieve the document
    const retrievedDoc = await testDb.get(putResult.id);
    console.log('✅ Document retrieved:', retrievedDoc);
    
    // Update the document
    retrievedDoc.title = 'Updated Test Document';
    const updateResult = await testDb.put(retrievedDoc);
    console.log('✅ Document updated:', updateResult);
    
    // Delete the document
    const deletedDoc = await testDb.get(updateResult.id);
    const deleteResult = await testDb.remove(deletedDoc);
    console.log('✅ Document deleted:', deleteResult);
    
    // Clean up - destroy the test database
    await testDb.destroy();
    console.log('🧹 Test database destroyed');
    
    // Final success message
    console.log('🎉 PouchDB setup test completed successfully!');
    return {
      success: true,
      message: 'PouchDB is correctly set up and functioning. All database operations worked as expected.'
    };
  } catch (error) {
    console.error('❌ PouchDB setup test failed:', error);
    let errorMessage = 'Unknown error occurred';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      // Check if it's a common PouchDB error
      if (errorMessage.includes('Class extends value')) {
        errorMessage = 'PouchDB initialization error: Class extends value is not a constructor. ' +
          'This is likely due to a problem with how PouchDB is imported.';
      } else if (errorMessage.includes('constructor')) {
        errorMessage = 'PouchDB initialization error: Constructor issue. ' +
          'This might be related to module import problems.';
      }
    }
    
    return {
      success: false,
      message: `PouchDB setup test failed: ${errorMessage}`
    };
  }
}

// Export a function to run the test
export default testPouchDBSetup; 