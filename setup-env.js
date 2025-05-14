#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { execSync } from 'child_process';

// ES modules don't have __dirname, so we need to create it
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Determine platform for appropriate command syntax
const isWindows = process.platform === 'win32';
const envFilePath = path.join(__dirname, '.env.local');

console.log('Google Speech-to-Text API Setup Helper');
console.log('=====================================');
console.log('This script will help you set up authentication for Google Speech-to-Text API.');
console.log('Choose an authentication method:\n');

rl.question('1. Use API Key (easier for development)\n2. Use Service Account credentials file\n\nEnter your choice (1 or 2): ', (choice) => {
  if (choice === '1') {
    rl.question('\nEnter your Google Cloud API Key: ', (apiKey) => {
      rl.question('Enter your Google Cloud Project ID: ', (projectId) => {
        // Save to .env.local file
        const envContent = `GOOGLE_SPEECH_API_KEY=${apiKey}\nGOOGLE_PROJECT_ID=${projectId}\n`;
        fs.writeFileSync(envFilePath, envContent);
        
        console.log('\nEnvironment variables saved to .env.local');
        console.log('To use these variables in development:');
        
        if (isWindows) {
          console.log('Run: set-env.bat (to be created)');
          // Create a batch file to set env vars on Windows
          const batchContent = `@echo off\nset GOOGLE_SPEECH_API_KEY=${apiKey}\nset GOOGLE_PROJECT_ID=${projectId}\necho Environment variables set successfully!\n`;
          fs.writeFileSync(path.join(__dirname, 'set-env.bat'), batchContent);
        } else {
          console.log('Run: source .env.local');
          // Make .env.local sourceable on Unix
          try {
            execSync(`chmod +x ${envFilePath}`);
          } catch (error) {
            // Ignore chmod errors
          }
        }
        
        // Add to .gitignore if not already there
        let gitignore = '';
        const gitignorePath = path.join(__dirname, '.gitignore');
        if (fs.existsSync(gitignorePath)) {
          gitignore = fs.readFileSync(gitignorePath, 'utf8');
        }
        
        if (!gitignore.includes('.env.local') && !gitignore.includes('set-env.bat')) {
          fs.appendFileSync(gitignorePath, '\n# Local environment files\n.env.local\nset-env.bat\n');
          console.log('\nAdded .env.local and set-env.bat to .gitignore');
        }
        
        rl.close();
      });
    });
  } else if (choice === '2') {
    console.log('\nTo use a service account:');
    console.log('1. Download your service account key JSON file from Google Cloud Console');
    console.log('2. Save it as "google-credentials.json" in the "electron" directory');
    console.log('3. The application will automatically use this file for authentication\n');
    rl.close();
  } else {
    console.log('\nInvalid choice. Please run the script again and enter 1 or 2.');
    rl.close();
  }
});

rl.on('close', () => {
  console.log('\nSetup complete. Thank you!');
  process.exit(0);
}); 