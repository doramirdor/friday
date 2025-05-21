import { spawn, exec } from "node:child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { dialog, shell, app } from "electron";
import { checkPermissions } from "./permission.js";

const execAsync = promisify(exec);
let recordingProcess = null;


const initRecording = (filepath, filename, source = 'system') => {
  return new Promise((resolve) => {
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
  
  if (isPermissionNeeded) {
    isPermissionGranted = await checkPermissions();
  }

  if (isPermissionNeeded && !isPermissionGranted) {
    global.mainWindow.webContents.send("recording-error", "PERMISSION_DENIED");
    return;
  }

  // Process the filename to ensure it has the right extension
  let filenameWithoutExt = (filename || "recording").replace(/\.\w+$/, '');
  
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
  
  // First check if the file exists
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

export function stopRecording() {
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