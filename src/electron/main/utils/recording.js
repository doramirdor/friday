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

// Force mode to false and check periodically to make sure it stays false
function forceNativeRecordingMode() {
  // If software mode is true for any reason, force it back to false
  if (useSoftwareRecordingMode === true) {
    console.log("⚠️ Warning: useSoftwareRecordingMode was set to true, forcing to false");
    useSoftwareRecordingMode = false;
  }
}

// Run immediately
forceNativeRecordingMode();

// Check periodically to ensure it stays false
setInterval(forceNativeRecordingMode, 1000);

// Check if the Swift recorder binary exists and log detailed information
function checkRecorderBinary() {
  const isDevMode = process.env.NODE_ENV === 'development';
  const possiblePaths = [
    path.join(process.cwd(), "src", "swift", "Recorder"),
    path.join(app.getAppPath(), "src", "swift", "Recorder"),
    path.join(process.resourcesPath || '', "src", "swift", "Recorder"),
    path.join(app.getAppPath(), "..", "src", "swift", "Recorder"),
    path.join(app.getPath("exe"), "..", "Resources", "src", "swift", "Recorder")
  ];
  
  console.log("🔍 Checking for Swift recorder binary at possible locations:");
  
  let foundPath = null;
  
  for (const pathToCheck of possiblePaths) {
    try {
      if (fs.existsSync(pathToCheck)) {
        const stats = fs.statSync(pathToCheck);
        const permissions = stats.mode.toString(8).slice(-3);
        console.log(`✅ Found recorder at: ${pathToCheck}`);
        console.log(`   - Size: ${(stats.size / 1024).toFixed(2)} KB`);
        console.log(`   - Permissions: ${permissions}`);
        console.log(`   - Last modified: ${stats.mtime}`);
        
        // Check if the file is executable
        if (!(stats.mode & 0o111)) {
          console.warn(`⚠️ WARNING: The recorder binary is not executable! Permissions: ${permissions}`);
          console.log(`   - Attempting to make executable with chmod +x`);
          try {
            fs.chmodSync(pathToCheck, '755');
            console.log(`   - Updated permissions to 755`);
          } catch (chmodErr) {
            console.error(`   - Failed to update permissions: ${chmodErr.message}`);
          }
        }
        
        foundPath = pathToCheck;
        break;
      } else {
        console.log(`❌ Not found at: ${pathToCheck}`);
      }
    } catch (err) {
      console.error(`Error checking path ${pathToCheck}: ${err.message}`);
    }
  }
  
  if (!foundPath) {
    console.error("❌ ERROR: Swift recorder binary not found! System audio recording will not work.");
    console.error("   - Check that the binary is properly installed and executable");
  }

  return foundPath;
}

// Call this function during initialization
const swiftRecorderPath = checkRecorderBinary();

const initRecording = (filepath, filename, source = 'system') => {
  // Force native mode here too in case it was changed
  useSoftwareRecordingMode = false;
  
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

    // Use the recorder path we found during initialization
    let recorderPath = swiftRecorderPath;
    
    // If we didn't find the recorder during initialization, try one more time
    if (!recorderPath) {
      console.log("⚠️ Swift recorder path not found during initialization, trying again...");
      recorderPath = checkRecorderBinary();
    }
    
    // Log the final path for debugging
    console.log(`Using Recorder binary at: ${recorderPath}`);
    if (!recorderPath || !fs.existsSync(recorderPath)) {
      console.error(`ERROR: Swift recorder binary not found! Cannot start recording.`);
      global.mainWindow.webContents.send("recording-error", "RECORDER_NOT_FOUND");
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
        console.error("Recorder startup timed out after 30 seconds");
        resolve(false);
      }, 30000);
      
      // Process stdout for response messages
      recordingProcess.stdout.on("data", (data) => {
        try {
          const responseText = data.toString();
          console.log(`Recorder stdout: ${responseText}`);
          
          // Check for indicators that the recorder is initializing properly
          // This helps detect if the recorder is actually working even before it sends JSON
          if (responseText.includes("Microphone component started successfully") ||
              responseText.includes("Combined recording setup successful") ||
              responseText.includes("Recording started")) {
            console.log("✅ Detected recorder initialization progress, extending timeout");
            // Extend timeout since we know the recorder is starting up
            if (startupTimeout) {
              clearTimeout(startupTimeout);
              startupTimeout = setTimeout(() => {
                console.error("Recorder startup timed out after extended period (60 seconds)");
                resolve(false);
              }, 60000); // 60 seconds
            }
          }
          
          // Check for low microphone volume warnings
          if (responseText.includes("Microphone level is low") || 
              responseText.includes("Microphone input volume:") && responseText.includes("%")) {
            // Try to extract microphone level
            const match = responseText.match(/Microphone input volume: (\d+(\.\d+)?)%/);
            if (match && parseFloat(match[1]) < 20) {
              console.warn(`⚠️ Low microphone volume detected: ${match[1]}%. Recording may be silent.`);
              global.mainWindow.webContents.send("recording-warning", "LOW_MIC_VOLUME", 
                `Your microphone volume is only ${match[1]}%. Recording may be silent. Please increase your microphone volume in System Settings.`);
            }
          }
          
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
        const errorText = data.toString();
        console.error(`Recorder stderr: ${errorText}`);
        
        // Check if the error contains useful debug information
        if (errorText.includes("Permission") || errorText.includes("denied")) {
          console.error("Possible permission issue with the recorder");
        }
        if (errorText.includes("Could not") || errorText.includes("failed to")) {
          console.error("Recorder encountered an initialization error");
        }
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
      console.log(`Creating silence MP3 file at: ${outputPath}`);
      
      // Generate a proper silence MP3 using ffmpeg (directly with specific parameters)
      try {
        // Import child_process dynamically to avoid issues
        const { spawn } = await import('child_process');
        
        // Use spawn for better error handling and progress tracking
        const ffmpegProcess = spawn('ffmpeg', [
          '-f', 'lavfi',              // Use libavfilter virtual input
          '-i', 'anullsrc=r=44100:cl=stereo',  // Generate silence with 44.1kHz sample rate, stereo
          '-t', '60',                 // 60 seconds duration
          '-c:a', 'libmp3lame',       // Use mp3 codec
          '-b:a', '128k',             // 128k bitrate for better quality
          '-y',                       // Overwrite output file if exists
          outputPath                  // Output file path
        ]);
        
        // Process output and errors
        let ffmpegOutput = '';
        let ffmpegError = '';
        
        ffmpegProcess.stdout.on('data', (data) => {
          ffmpegOutput += data.toString();
        });
        
        ffmpegProcess.stderr.on('data', (data) => {
          const msg = data.toString();
          ffmpegError += msg;
          // Log but don't treat as error - ffmpeg sends progress to stderr
          console.log(`ffmpeg: ${msg}`);
        });
        
        // Wait for process to complete
        await new Promise((resolve, reject) => {
          ffmpegProcess.on('close', (code) => {
            if (code === 0) {
              console.log(`Successfully generated 60-second silence MP3 at ${outputPath}`);
              resolve();
            } else {
              console.error(`ffmpeg exited with code ${code}, stderr: ${ffmpegError}`);
              reject(new Error(`ffmpeg exited with code ${code}`));
            }
          });
          
          ffmpegProcess.on('error', (err) => {
            console.error(`Error starting ffmpeg: ${err.message}`);
            reject(err);
          });
        });
        
        // Verify the file exists and has content
        if (fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          if (stats.size > 0) {
            console.log(`Generated silence MP3 file: ${stats.size} bytes`);
            global.mainWindow.webContents.send("recording-status", "STOP_RECORDING", timestamp, outputPath, false);
            return { success: true, path: outputPath };
          } else {
            throw new Error("Generated file has zero size");
          }
        } else {
          throw new Error("Failed to create silence MP3 file");
        }
      } catch (ffmpegError) {
        console.error(`Failed to generate silence with ffmpeg: ${ffmpegError.message}`);
        
        // Try alternative approach as fallback
        try {
          // Use execSync as a last resort
          const { execSync } = await import('child_process');
          execSync(`ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t 60 -c:a libmp3lame -b:a 128k "${outputPath}" -y`);
          
          // Verify the file exists and has content
          if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
            console.log(`Successfully created silence MP3 with execSync: ${fs.statSync(outputPath).size} bytes`);
            global.mainWindow.webContents.send("recording-status", "STOP_RECORDING", timestamp, outputPath, false);
            return { success: true, path: outputPath };
          } else {
            throw new Error("Generated file has zero size or doesn't exist");
          }
        } catch (execSyncError) {
          console.error(`Alternative approach failed: ${execSyncError.message}`);
          
          // If all else fails, create a simple MP3 file directly
          global.mainWindow.webContents.send("recording-error", "FILE_CREATION_FAILED");
          return { success: false, error: "Failed to create valid MP3 file" };
        }
      }
    } catch (error) {
      console.error(`Error creating audio file: ${error.message}`);
      global.mainWindow.webContents.send("recording-error", "FILE_CREATION_FAILED");
      return { success: false, error: error.message };
    }
  }
  
  if (recordingProcess !== null) {
    try {
      console.log("Stopping recording process by sending SIGINT signal...");
      
      // Create a promise that will resolve when the recording stops
      const stopPromise = new Promise((resolve) => {
        // Set up a timeout in case the process doesn't exit
        const killTimeout = setTimeout(() => {
          console.error("Recording process did not exit within 10 seconds, forcing termination");
          try {
            recordingProcess.kill('SIGKILL'); // Force kill if needed
          } catch (e) {
            console.error(`Error force killing process: ${e.message}`);
          }
          resolve({ success: false, error: "Recording process timed out" });
        }, 10000);
        
        // Listen for process exit
        recordingProcess.once('exit', (code) => {
          console.log(`Recording process exited with code ${code}`);
          clearTimeout(killTimeout);
          resolve({ success: true });
        });
        
        // Send the SIGINT signal, which the Swift process is designed to handle
        recordingProcess.kill("SIGINT");
      });
      
      // Wait for the recording to stop
      const result = await stopPromise;
      recordingProcess = null;
      return result;
    } catch (error) {
      console.error(`Error stopping recording: ${error.message}`);
      recordingProcess = null;
      return { success: false, error: error.message };
    }
  } else {
    console.warn("No recording process to stop");
    return { success: false, error: "No active recording" };
  }
} 