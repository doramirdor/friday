const { spawn, exec } = require("node:child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const { dialog } = require("electron");
const { checkPermissions } = require("./permission");

const execAsync = promisify(exec);
let recordingProcess = null;

// Convert FLAC to MP3
const convertFlacToMp3 = async (flacPath) => {
  try {
    // Create the MP3 path by replacing the extension
    const mp3Path = flacPath.replace(".flac", ".mp3");
    
    console.log(`Converting ${flacPath} to ${mp3Path}`);
    
    // Run ffmpeg to convert
    await execAsync(`ffmpeg -i "${flacPath}" -codec:a libmp3lame -qscale:a 2 "${mp3Path}" -y`);
    
    console.log(`Conversion complete: ${mp3Path}`);
    
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
    const args = ["--record", filepath];
    if (filename) args.push("--filename", filename);

    recordingProcess = spawn("./src/swift/Recorder", args);

    recordingProcess.stdout.on("data", (data) => {
      const response = data
        .toString()
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line))
        .at(0);

      if (response.code !== "RECORDING_STARTED" && response.code !== "RECORDING_STOPPED") {
        resolve(false);
      } else {
        const timestamp = new Date(response.timestamp).getTime();

        if (response.code === "RECORDING_STOPPED" && response.path) {
          // Convert FLAC to MP3 when recording is stopped
          convertFlacToMp3(response.path)
            .then(({ success, mp3Path, error }) => {
              if (success) {
                // Use MP3 path instead of FLAC
                global.mainWindow.webContents.send("recording-status", "STOP_RECORDING", timestamp, mp3Path);
              } else {
                console.error("Conversion failed:", error);
                global.mainWindow.webContents.send("recording-status", "STOP_RECORDING", timestamp, response.path);
              }
            });
        } else {
          global.mainWindow.webContents.send("recording-status", response.code === "RECORDING_STARTED" ? "START_RECORDING" : "STOP_RECORDING", timestamp, response.path);
        }

        resolve(true);
      }
    });
  });
};

module.exports.startRecording = async ({ filepath, filename }) => {
  const isPermissionGranted = await checkPermissions();

  if (!isPermissionGranted) {
    global.mainWindow.loadFile("./src/electron/screens/permission-denied/screen.html");

    return;
  }

  const fullPath = path.join(filepath, filename + ".flac");
  if (fs.existsSync(fullPath)) {
    dialog.showMessageBox({
      type: "error",
      title: "Recording Error",
      message: "File already exists. Please choose a different filename or delete the existing file.",
      buttons: ["OK"],
    });

    global.mainWindow.loadFile("./src/electron/screens/recording/screen.html");

    return;
  }

  while (true) {
    const recordingStarted = await initRecording(filepath, filename);

    if (recordingStarted) {
      break;
    }
  }
};

module.exports.stopRecording = () => {
  if (recordingProcess !== null) {
    recordingProcess.kill("SIGINT");
    recordingProcess = null;
  }
};

// Export the conversion function so it can be used elsewhere
module.exports.convertFlacToMp3 = convertFlacToMp3; 