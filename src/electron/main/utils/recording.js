import { spawn, exec } from "node:child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { dialog, shell } from "electron";
import { checkPermissions } from "./permission.js";

const execAsync = promisify(exec);
let recordingProcess = null;

// Convert FLAC to MP3
const convertFlacToMp3 = async (flacPath) => {
  try {
    // Create the MP3 path by replacing the extension
    const mp3Path = flacPath.replace(".flac", ".mp3");
    
    console.log(`Converting ${flacPath} to ${mp3Path}`);
    
    // Verify FLAC file exists
    if (!fs.existsSync(flacPath)) {
      console.error(`FLAC file doesn't exist: ${flacPath}`);
      // Check if the directory exists and what files it contains
      const dir = path.dirname(flacPath);
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        console.log(`Directory ${dir} contains: ${files.join(", ")}`);
      }
      return { success: false, error: 'Source file not found' };
    }
    
    // Run ffmpeg to convert
    await execAsync(`ffmpeg -i "${flacPath}" -codec:a libmp3lame -qscale:a 2 "${mp3Path}" -y`);
    
    // Verify MP3 file was created
    if (!fs.existsSync(mp3Path)) {
      console.error(`MP3 file wasn't created: ${mp3Path}`);
      return { success: false, error: 'MP3 conversion failed - output file not created' };
    }

    // Get file sizes for logging
    const flacStats = fs.statSync(flacPath);
    const mp3Stats = fs.statSync(mp3Path);
    console.log(`Conversion complete: 
      FLAC: ${flacPath} (${(flacStats.size / 1024 / 1024).toFixed(2)} MB)
      MP3: ${mp3Path} (${(mp3Stats.size / 1024 / 1024).toFixed(2)} MB)`);
    
    // Delete the original FLAC file since conversion was successful
    fs.unlinkSync(flacPath);
    console.log(`Deleted original FLAC file: ${flacPath}`);
    
    return { 
      success: true, 
      mp3Path 
    };
  } catch (error) {
    console.error(`Error converting FLAC to MP3: ${error.message}`);
    return { success: false, error: error.message };
  }
};

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

    // Set up the recorder process
    try {
      recordingProcess = spawn("./src/swift/Recorder", args);
      
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
            // Clear the startup timeout on first response
            clearTimeout(startupTimeout);
            
            console.log(`Processing response with code: ${response.code}`);
            
            if (response.code === "INVALID_PATH" || 
                response.code === "DIRECTORY_NOT_WRITABLE" || 
                response.code === "PERMISSION_DENIED" || 
                response.code === "AUDIO_FILE_CREATION_FAILED" ||
                response.code === "CAPTURE_FAILED" ||
                response.code === "CONTENT_ERROR") {
              // Handle fatal errors
              console.error(`Recording error: ${response.code} - ${response.error || "Unknown error"}`);
              global.mainWindow.webContents.send("recording-error", response.code);
              resolve(false);
            } else if (response.code === "RECORDING_STARTED") {
              // Recording started successfully
              const timestamp = new Date(response.timestamp).getTime();
              console.log(`Recording started at ${response.timestamp}, path: ${response.path}`);
              global.mainWindow.webContents.send("recording-status", "START_RECORDING", timestamp, response.path);
              resolve(true);
            } else if (response.code === "RECORDING_STOPPED") {
              // Recording stopped
              const timestamp = new Date(response.timestamp).getTime();
              const outputPath = response.path;
              
              // If MP3 conversion had an error but we still have a file
              if (response.error && response.error.includes("conversion")) {
                console.warn(`MP3 conversion issue: ${response.error}`);
              }
              
              // Check if file exists
              if (fs.existsSync(outputPath)) {
                console.log(`Recording saved to ${outputPath}`);
                global.mainWindow.webContents.send("recording-status", "STOP_RECORDING", timestamp, outputPath);
                
                // Try to open the directory with the recording
                try {
                  shell.showItemInFolder(outputPath);
                } catch (e) {
                  console.error(`Failed to show file in folder: ${e.message}`);
                }
              } else {
                console.error(`Output file not found at: ${outputPath}`);
                global.mainWindow.webContents.send("recording-error", "FILE_NOT_FOUND");
              }
              
              resolve(true);
            } else if (response.code === "STREAM_FUNCTION_NOT_CALLED") {
              // Stream function never called (permission or other issue)
              console.error(`Recording error: ${response.code} - ${response.error || "The audio capture stream function was not called"}`);
              global.mainWindow.webContents.send("recording-error", "START_FAILED");
              resolve(false);
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
  const isPermissionNeeded = source === 'system';
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