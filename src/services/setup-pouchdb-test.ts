// Database Setup Test Script
// This script tests if the IPC-based database is properly set up and functioning
import { createDatabase } from './pouchdb-setup';
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
  console.log('🔍 Starting database setup test...');
  
  try {
    // First run the upgrade check to fix any corrupted data
    console.log('🧹 Checking for and cleaning up any corrupted database data...');
    await checkAndUpgradePouchDB();
    
    // Test database creation via IPC
    console.log('🔄 Testing database creation via IPC...');
    
    // Create a test database
    console.log('🏗️ Creating test database...');
    const testDb = await createDatabase<TestDocument>('setup-test');
    
    // Test basic operations
    console.log('📝 Testing basic database operations...');
    
    // Create a document
    const testDoc: TestDocument = {
      _id: 'test-doc-' + Date.now(),
      title: 'Test Document',
      createdAt: new Date().toISOString(),
      type: 'test'
    };
    
    // Put the document in the database
    const putResult = await testDb.put(testDoc);
    console.log('✅ Document created:', putResult);
    
    // Retrieve the document
    const retrievedDoc = await testDb.get(testDoc._id!);
    console.log('✅ Document retrieved:', retrievedDoc);
    
    // Update the document
    retrievedDoc.title = 'Updated Test Document';
    const updateResult = await testDb.put(retrievedDoc);
    console.log('✅ Document updated:', updateResult);
    
    // Delete the document
    const deletedDoc = await testDb.get(testDoc._id!);
    const deleteResult = await testDb.remove(deletedDoc);
    console.log('✅ Document deleted:', deleteResult);
    
    // Test database info
    const info = await testDb.info();
    console.log('✅ Database info retrieved:', info);
    
    // Final success message
    console.log('🎉 Database setup test completed successfully!');
    return {
      success: true,
      message: 'Database is correctly set up and functioning via IPC. All database operations worked as expected.'
    };
  } catch (error) {
    console.error('❌ Database setup test failed:', error);
    let errorMessage = 'Unknown error occurred';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      // Check if it's a common database error
      if (errorMessage.includes('Class extends value')) {
        errorMessage = 'Database initialization error: Class extends value is not a constructor. ' +
          'This is likely due to a problem with how the database is imported.';
      } else if (errorMessage.includes('constructor')) {
        errorMessage = 'Database initialization error: Constructor issue. ' +
          'This might be related to module import problems.';
      } else if (errorMessage.includes('Electron')) {
        errorMessage = 'Database setup requires Electron environment with proper IPC communication.';
      }
    }
    
    return {
      success: false,
      message: `Database setup test failed: ${errorMessage}`
    };
  }
}

// Export a function to run the test
export default testPouchDBSetup; 