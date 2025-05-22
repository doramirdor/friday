import { spawn, exec } from "node:child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { dialog, shell, app } from "electron";
import { checkPermissions } from "./permission.js";

const execAsync = promisify(exec);
let recordingProcess = null;

// Change the useSoftwareRecordingMode flag to false to use the native Swift recorder
// Start with software recording mode set to false and ensure it stays false
let useSoftwareRecordingMode = false;

// Force to false in case it's being set elsewhere
setTimeout(() => {
  if (useSoftwareRecordingMode === true) {
    console.log("⚠️ Warning: useSoftwareRecordingMode was set to true, forcing to false");
    useSoftwareRecordingMode = false;
  }
}, 1000);

const initRecording = (filepath, filename, source = 'system') => {
  return new Promise(async (resolve) => {
    // Always use Documents/Friday Recordings/ directory regardless of passed filepath
    const documentsPath = app.getPath("documents");
    const fridayRecordingsPath = path.join(documentsPath, "Friday Recordings");
    
    // Override filepath with our standard path
    filepath = fridayRecordingsPath;
    
    // Ensure the filepath exists and is writable
    if (!fs.existsSync(filepath)) {
      try {
        fs.mkdirSync(filepath, { recursive: true });
        console.log(`Created recording directory: ${filepath}`);
      } catch (error) {
        console.error(`Failed to create recording directory: ${error.message}`);
        resolve(false);
        return;
      }
    }
    
    // If we're using software recording mode, use that instead
    if (useSoftwareRecordingMode) {
      console.log(`Using software recording mode for source: ${source}`);
      
      // We need to set up a simple signal to let the UI know recording has started
      // This simulates the Swift recorder's response
      const timestamp = Date.now();
      const outputPath = path.join(filepath, `${filename}.mp3`);
      
      global.mainWindow.webContents.send("recording-status", "START_RECORDING", timestamp, outputPath, source === 'both');
      resolve(true);
      return;
    }
    
    console.log(`Starting Swift recorder with path: ${filepath}, filename: ${filename || "auto-generated"}, source: ${source}`);
    
    const args = ["--record", filepath];
    if (filename) args.push("--filename", filename);
    args.push("--source", source);

    // Get the correct path to the Recorder binary based on whether we're in development or production
    const isDevMode = process.env.NODE_ENV === 'development';
    let recorderPath;
    
    if (isDevMode) {
      // In development mode, the binary is directly in the src/swift directory
      recorderPath = path.join(process.cwd(), "src", "swift", "Recorder");
    } else {
      // In production, the binary should be in the app's resources directory
      recorderPath = path.join(app.getAppPath(), "src", "swift", "Recorder");
      
      // Alternative paths to try if the first one fails
      const alternativePaths = [
        path.join(process.resourcesPath, "src", "swift", "Recorder"),
        path.join(app.getAppPath(), "..", "src", "swift", "Recorder"),
        path.join(app.getPath("exe"), "..", "Resources", "src", "swift", "Recorder")
      ];
      
      if (!fs.existsSync(recorderPath)) {
        console.log(`Recorder not found at primary path: ${recorderPath}, trying alternatives...`);
        for (const altPath of alternativePaths) {
          if (fs.existsSync(altPath)) {
            recorderPath = altPath;
            console.log(`Found Recorder at alternative path: ${recorderPath}`);
            break;
          } else {
            console.log(`Recorder not found at alternative path: ${altPath}`);
          }
        }
      }
    }
    
    // Log the final path for debugging
    console.log(`Using Recorder binary at: ${recorderPath}`);
    if (!fs.existsSync(recorderPath)) {
      console.error(`ERROR: Recorder binary not found at ${recorderPath}`);
      
      // Display an error and return false instead of switching to software mode
      resolve(false);
      return;
    }

    // Set up the recorder process
    try {
      recordingProcess = spawn(recorderPath, args);
      
      // Handle process exit
      recordingProcess.on("exit", (code) => {
        console.log(`Recorder process exited with code ${code}`);
        if (code !== 0) {
          resolve(false);
        }
      });
      
      // Set up longer timeout for startup
      const startupTimeout = setTimeout(() => {
        console.error("Recorder startup timed out after 10 seconds");
        resolve(false);
      }, 10000);
      
      // Process stdout for response messages
      recordingProcess.stdout.on("data", (data) => {
        try {
          const responseText = data.toString();
          console.log(`Recorder output: ${responseText}`);
          
          // Parse JSON responses (one per line)
          const jsonResponses = responseText
            .split("\n")
            .filter((line) => line.trim() !== "")
            .map((line) => {
              try {
                return JSON.parse(line);
              } catch (e) {
                console.log(`Line is not valid JSON: ${line}`);
                return null;
              }
            })
            .filter(response => response !== null);
          
          if (jsonResponses.length === 0) {
            console.log("No valid JSON responses found in output");
            return;
          }
          
          // Process each JSON response
          for (const response of jsonResponses) {
            console.log(`Processing recorder response: ${JSON.stringify(response)}`);
            
            // Check if this is a response we should handle
            if (!response.code) {
              console.log("Response missing code field");
              continue;
            }

            // Track combined flag for specialized handling
            const isCombined = response.combined === true;
            
            // Handle all possible response codes
            if (response.code === "PERMISSION_DENIED") {
              // Permission was denied for screen recording
              console.log("Permission denied for screen recording");
              global.mainWindow.webContents.send("recording-error", "PERMISSION_DENIED");
              resolve(false);
            } else if (response.code === "CAPTURE_FAILED") {
              // Capture setup failed
              console.error(`Capture failed: ${response.error || "Unknown capture error"}`);
              global.mainWindow.webContents.send("recording-error", "CAPTURE_FAILED");
              resolve(false);
            } else if (response.code === "RECORDING_STARTED") {
              // Recording started successfully
              const timestamp = response.timestamp ? new Date(response.timestamp).getTime() : Date.now();
              console.log(`Recording started at ${response.timestamp}, path: ${response.path}`);
              console.log(`Recording is combined: ${isCombined}`);
              global.mainWindow.webContents.send("recording-status", "START_RECORDING", timestamp, response.path, isCombined);
              clearTimeout(startupTimeout);
              resolve(true);
            } else if (response.code === "RECORDING_STOPPED") {
              // Recording stopped
              const timestamp = response.timestamp ? new Date(response.timestamp).getTime() : Date.now();
              const outputPath = response.path;
              
              console.log(`Recording stopped at ${response.timestamp}, path: ${outputPath}`);
              
              // Check if file exists
              if (fs.existsSync(outputPath)) {
                console.log(`Recording saved to ${outputPath}`);
                global.mainWindow.webContents.send("recording-status", "STOP_RECORDING", timestamp, outputPath, isCombined);
                
                // Try to show the file in folder
                try {
                  shell.showItemInFolder(outputPath);
                } catch (e) {
                  console.error(`Failed to show file in folder: ${e.message}`);
                }
              } else {
                console.error(`Output file not found at: ${outputPath}`);
                global.mainWindow.webContents.send("recording-error", "FILE_NOT_FOUND");
              }
            } else {
              // Other response codes
              console.log(`Unhandled response code: ${response.code}`);
            }
          }
        } catch (error) {
          console.error(`Error processing recorder output: ${error.message}`);
          resolve(false);
        }
      });
      
      recordingProcess.stderr.on("data", (data) => {
        console.error(`Recorder stderr: ${data.toString()}`);
      });
      
      recordingProcess.on("error", (error) => {
        console.error(`Recorder process error: ${error.message}`);
        resolve(false);
      });
    } catch (error) {
      console.error(`Failed to start recorder process: ${error.message}`);
      resolve(false);
    }
  });
};

export async function startRecording({ filepath, filename, source = 'system' }) {
  // For microphone recording, we don't need screen capture permission
  // For combined recording, we do need screen capture permission
  const isPermissionNeeded = source === 'system' || source === 'both';
  let isPermissionGranted = true;
  
  if (isPermissionNeeded && !useSoftwareRecordingMode) {
    isPermissionGranted = await checkPermissions();
  }

  if (isPermissionNeeded && !isPermissionGranted && !useSoftwareRecordingMode) {
    global.mainWindow.webContents.send("recording-error", "PERMISSION_DENIED");
    return;
  }

  // Process the filename to ensure it has the right extension
  let filenameWithoutExt = (filename || `recording_${Date.now()}`).replace(/\.\w+$/, '');
  
  // Add suffix based on source for clearer identification
  if (source === 'both') {
    filenameWithoutExt = `${filenameWithoutExt}_combined`;
  } else if (source === 'mic') {
    filenameWithoutExt = `${filenameWithoutExt}_mic`;
  } else {
    filenameWithoutExt = `${filenameWithoutExt}_system`;
  }
  
  // Validate filename to avoid characters that might cause issues
  filenameWithoutExt = filenameWithoutExt.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  
  // Always use Documents/Friday Recordings/ directory
  const documentsPath = app.getPath("documents");
  const fridayRecordingsPath = path.join(documentsPath, "Friday Recordings");
  
  // Create the directory if it doesn't exist
  if (!fs.existsSync(fridayRecordingsPath)) {
    try {
      fs.mkdirSync(fridayRecordingsPath, { recursive: true });
      console.log(`Created recordings directory at ${fridayRecordingsPath}`);
    } catch (error) {
      console.error(`Failed to create recordings directory: ${error.message}`);
    }
  }
  
  // Override filepath with our standard path
  filepath = fridayRecordingsPath;
  
  // Always use MP3 format
  const fullPath = path.join(filepath, `${filenameWithoutExt}.mp3`);
  if (fs.existsSync(fullPath)) {
    dialog.showMessageBox({
      type: "error",
      title: "Recording Error",
      message: "File already exists. Please choose a different filename or delete the existing file.",
      buttons: ["OK"],
    });

    global.mainWindow.webContents.send("recording-error", "FILE_EXISTS");
    return;
  }

  console.log(`Starting ${source} recording with path: ${filepath}, filename: ${filenameWithoutExt}`);
  
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    console.log(`Recording attempt ${attempts + 1} of ${maxAttempts}`);
    const recordingStarted = await initRecording(filepath, filenameWithoutExt, source);

    if (recordingStarted) {
      console.log("Recording started successfully");
      break;
    }
    
    attempts++;
    if (attempts >= maxAttempts) {
      console.error("Failed to start recording after multiple attempts");
      global.mainWindow.webContents.send("recording-error", "START_FAILED");
    }
    
    // Wait a bit before retrying
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

export async function stopRecording() {
  if (useSoftwareRecordingMode) {
    // For software mode, just send the stop signal directly
    const timestamp = Date.now();
    
    // Use the pre-generated silence MP3 file
    const resourcesPath = process.env.NODE_ENV === 'development' 
      ? path.join(process.cwd(), 'src', 'assets') 
      : path.join(process.resourcesPath, 'assets');
    
    // Save to Documents/Friday Recordings/ directory
    const documentsPath = app.getPath("documents");
    const fridayRecordingsPath = path.join(documentsPath, "Friday Recordings");
    
    // Create the directory if it doesn't exist
    if (!fs.existsSync(fridayRecordingsPath)) {
      try {
        fs.mkdirSync(fridayRecordingsPath, { recursive: true });
        console.log(`Created recordings directory at ${fridayRecordingsPath}`);
      } catch (error) {
        console.error(`Failed to create recordings directory: ${error.message}`);
      }
    }
    
    // Use MP3 format as requested
    const outputPath = path.join(fridayRecordingsPath, `recording_${timestamp}.mp3`);
    
    try {
      console.log(`Creating recording file at: ${outputPath}`);
      
      // Look for silence.mp3 in various locations
      const silencePaths = [
        path.join(resourcesPath, 'silence.mp3'),
        path.join(process.cwd(), 'src', 'assets', 'silence.mp3'),
        path.join(process.resourcesPath || '', 'assets', 'silence.mp3'),
        path.join(app.getAppPath(), 'src', 'assets', 'silence.mp3')
      ];
      
      let silencePath = null;
      for (const tryPath of silencePaths) {
        if (fs.existsSync(tryPath)) {
          try {
            // Verify it's a real MP3 file, not HTML
            const buffer = fs.readFileSync(tryPath, { encoding: null }).slice(0, 50);
            const asText = buffer.toString('utf8');
            
            if (!asText.includes('<!DOCTYPE') && !asText.includes('<html')) {
              silencePath = tryPath;
              console.log(`Found valid silence MP3 at: ${silencePath}`);
              break;
            } else {
              console.log(`Found HTML file instead of MP3 at: ${tryPath}`);
            }
          } catch (err) {
            console.error(`Error checking file at ${tryPath}: ${err.message}`);
          }
        }
      }
      
      if (silencePath) {
        // Copy the silence file
        fs.copyFileSync(silencePath, outputPath);
        console.log(`Copied silence MP3 to ${outputPath}`);
        
        // Verify the copy was successful
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          console.log(`Copy successful: ${fs.statSync(outputPath).size} bytes`);
          global.mainWindow.webContents.send("recording-status", "STOP_RECORDING", timestamp, outputPath, false);
        } else {
          throw new Error("Copy failed or resulted in empty file");
        }
      } else {
        // If no silence file is found, use ffmpeg to generate one
        console.log("No silence.mp3 found, generating one with ffmpeg");
        
        // Make sure directory exists
        if (!fs.existsSync(path.dirname(resourcesPath))) {
          fs.mkdirSync(path.dirname(resourcesPath), { recursive: true });
        }
        
        // Path to generate the silence file
        const generatedSilencePath = path.join(resourcesPath, 'silence.mp3');
        
        try {
          // Use ffmpeg to generate a silence file
          // This is more reliable than manually creating MP3 frames
          const { spawn } = await import('child_process');
          
          const ffmpegProcess = spawn('ffmpeg', [
            '-f', 'lavfi',
            '-i', 'anullsrc=r=44100:cl=stereo',
            '-t', '60',
            '-q:a', '2',
            outputPath
          ]);
          
          await new Promise((resolve, reject) => {
            ffmpegProcess.on('close', (code) => {
              if (code === 0) {
                console.log(`Successfully generated silence MP3 at ${outputPath}`);
                
                // Also create one in the assets directory for future use
                try {
                  fs.copyFileSync(outputPath, generatedSilencePath);
                  console.log(`Copied silence MP3 to assets directory: ${generatedSilencePath}`);
                } catch (err) {
                  console.error(`Failed to save silence MP3 to assets: ${err.message}`);
                }
                
                resolve();
              } else {
                reject(new Error(`ffmpeg exited with code ${code}`));
              }
            });
            
            ffmpegProcess.on('error', (err) => {
              reject(err);
            });
          });
          
          global.mainWindow.webContents.send("recording-status", "STOP_RECORDING", timestamp, outputPath, false);
        } catch (ffmpegError) {
          console.error(`Failed to generate silence with ffmpeg: ${ffmpegError.message}`);
          
          // Last resort - use a different approach with ffmpeg
          try {
            await import('child_process').then(({ execSync }) => {
              execSync(`ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t 60 -q:a 2 "${outputPath}"`);
            });
            
            if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
              console.log(`Successfully created silence MP3 with execSync: ${fs.statSync(outputPath).size} bytes`);
              global.mainWindow.webContents.send("recording-status", "STOP_RECORDING", timestamp, outputPath, false);
            } else {
              throw new Error("Failed to create silence MP3 with execSync");
            }
          } catch (execSyncError) {
            console.error(`Final ffmpeg attempt failed: ${execSyncError.message}`);
            throw new Error("All methods to create valid MP3 file failed");
          }
        }
      }
    } catch (error) {
      console.error(`Error creating audio file: ${error.message}`);
      global.mainWindow.webContents.send("recording-error", "FILE_CREATION_FAILED");
    }
    
    return { success: true };
  }
  
  if (recordingProcess !== null) {
    try {
      console.log("Stopping recording process...");
      recordingProcess.kill("SIGINT");
      return { success: true };
    } catch (error) {
      console.error(`Error stopping recording: ${error.message}`);
      return { success: false, error: error.message };
    } finally {
      recordingProcess = null;
    }
  } else {
    console.warn("No recording process to stop");
    return { success: false, error: "No active recording" };
  }
} 