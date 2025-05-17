const { spawn, exec } = require("node:child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const { dialog, shell } = require("electron");
const { checkPermissions } = require("./permission");

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
    console.error("Conversion error:", error);
    return { 
      success: false, 
      error: error.message 
    };
  }
};

const initRecording = (filepath, filename) => {
  return new Promise((resolve) => {
    // Ensure the filename doesn't already have an extension
    const cleanFilename = filename.replace(/\.\w+$/, '');
    const args = ["--record", filepath];
    
    if (cleanFilename) args.push("--filename", cleanFilename);

    console.log(`Starting recording with args: ${args.join(' ')}`);
    recordingProcess = spawn("./src/swift/Recorder", args);

    recordingProcess.stdout.on("data", (data) => {
      const responseText = data.toString();
      console.log(`Recorder output: ${responseText}`);
      
      try {
        const responses = responseText
          .split("\n")
          .filter((line) => line !== "")
          .map((line) => JSON.parse(line));
        
        if (responses.length === 0) {
          console.log("No valid JSON responses found in recorder output");
          resolve(false);
          return;
        }
        
        const response = responses[0];
        console.log(`Processing recorder response: ${JSON.stringify(response)}`);
        
        if (response.code !== "RECORDING_STARTED" && response.code !== "RECORDING_STOPPED") {
          console.log(`Unexpected response code: ${response.code}`);
          resolve(false);
          return;
        }
        
        const timestamp = new Date(response.timestamp).getTime();

        if (response.code === "RECORDING_STOPPED" && response.path) {
          // Verify the file exists before attempting conversion
          if (!fs.existsSync(response.path)) {
            console.error(`Recording file doesn't exist: ${response.path}`);
            
            // Try to list directory contents to debug
            try {
              const dir = path.dirname(response.path);
              const files = fs.readdirSync(dir);
              console.log(`Directory ${dir} contains: ${files.join(", ")}`);
            } catch (err) {
              console.error(`Error listing directory: ${err.message}`);
            }
            
            global.mainWindow.webContents.send("recording-status", "STOP_RECORDING", timestamp, response.path);
            resolve(true);
            return;
          }
          
          console.log(`Recording file exists: ${response.path} (Size: ${fs.statSync(response.path).size} bytes)`);
          
          // Convert FLAC to MP3 when recording is stopped
          convertFlacToMp3(response.path)
            .then(({ success, mp3Path, error }) => {
              if (success) {
                // Show the file in finder/explorer
                shell.showItemInFolder(mp3Path);
                
                // Use MP3 path instead of FLAC
                global.mainWindow.webContents.send("recording-status", "STOP_RECORDING", timestamp, mp3Path);
              } else {
                console.error(`Conversion failed: ${error}`);
                global.mainWindow.webContents.send("recording-status", "STOP_RECORDING", timestamp, response.path);
              }
            })
            .catch(err => {
              console.error(`Unexpected error during conversion: ${err.message}`);
              global.mainWindow.webContents.send("recording-status", "STOP_RECORDING", timestamp, response.path);
            });
        } else {
          global.mainWindow.webContents.send(
            "recording-status", 
            response.code === "RECORDING_STARTED" ? "START_RECORDING" : "STOP_RECORDING", 
            timestamp, 
            response.path
          );
        }

        resolve(true);
      } catch (error) {
        console.error(`Error processing recorder output: ${error.message}`);
        console.error(`Raw output: ${responseText}`);
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
  });
};

module.exports.startRecording = async ({ filepath, filename }) => {
  const isPermissionGranted = await checkPermissions();

  if (!isPermissionGranted) {
    global.mainWindow.loadFile("./src/electron/screens/permission-denied/screen.html");
    return;
  }

  // Ensure the filename doesn't have an extension
  const cleanFilename = filename ? filename.replace(/\.\w+$/, '') : `recording-${Date.now()}`;
  
  // Check for existing FLAC file
  const flacPath = path.join(filepath, `${cleanFilename}.flac`);
  if (fs.existsSync(flacPath)) {
    const response = await dialog.showMessageBox({
      type: "error",
      title: "Recording Error",
      message: "File already exists. Do you want to replace it?",
      buttons: ["Replace", "Cancel"],
    });
    
    if (response.response === 0) {
      // Delete the existing file
      try {
        fs.unlinkSync(flacPath);
        console.log(`Deleted existing file: ${flacPath}`);
      } catch (err) {
        console.error(`Error deleting existing file: ${err.message}`);
        return;
      }
    } else {
      global.mainWindow.loadFile("./src/electron/screens/recording/screen.html");
      return;
    }
  }
  
  // Also check for existing MP3 file
  const mp3Path = path.join(filepath, `${cleanFilename}.mp3`);
  if (fs.existsSync(mp3Path)) {
    const response = await dialog.showMessageBox({
      type: "error",
      title: "Recording Error",
      message: "An MP3 file with this name already exists. Do you want to replace it?",
      buttons: ["Replace", "Cancel"],
    });
    
    if (response.response === 0) {
      // Delete the existing file
      try {
        fs.unlinkSync(mp3Path);
        console.log(`Deleted existing file: ${mp3Path}`);
      } catch (err) {
        console.error(`Error deleting existing file: ${err.message}`);
        return;
      }
    } else {
      global.mainWindow.loadFile("./src/electron/screens/recording/screen.html");
      return;
    }
  }

  // Try up to 3 times to start the recording
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    attempts++;
    console.log(`Recording attempt ${attempts}/${maxAttempts}`);
    
    const recordingStarted = await initRecording(filepath, cleanFilename);
    
    if (recordingStarted) {
      console.log(`Recording started successfully on attempt ${attempts}`);
      break;
    } else if (attempts === maxAttempts) {
      console.error(`Failed to start recording after ${maxAttempts} attempts`);
      dialog.showMessageBox({
        type: "error",
        title: "Recording Error",
        message: "Failed to start recording after multiple attempts.",
        buttons: ["OK"],
      });
      global.mainWindow.loadFile("./src/electron/screens/recording/screen.html");
    } else {
      console.log(`Recording attempt ${attempts} failed, retrying...`);
      // Wait a moment before retrying
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
};

module.exports.stopRecording = () => {
  if (recordingProcess !== null) {
    console.log('Stopping recording process...');
    recordingProcess.kill("SIGINT");
    recordingProcess = null;
  } else {
    console.log('No recording process to stop');
  }
};

// Export the conversion function so it can be used elsewhere
module.exports.convertFlacToMp3 = convertFlacToMp3; 