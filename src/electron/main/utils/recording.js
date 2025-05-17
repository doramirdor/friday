import { spawn } from "node:child_process";
import fs from "fs";
import path from "path";
import { dialog } from "electron";
import { checkPermissions } from "./permission.js";

let recordingProcess = null;

const initRecording = (filepath, filename) => {
  return new Promise((resolve) => {
    const args = ["--record", filepath];
    if (filename) args.push("--filename", filename);

    recordingProcess = spawn("./src/swift/Recorder", args);

    recordingProcess.stdout.on("data", (data) => {
      try {
        const response = data
          .toString()
          .split("\n")
          .filter((line) => line !== "")
          .map((line) => JSON.parse(line))
          .at(0);

        if (response.code !== "RECORDING_STARTED" && response.code !== "RECORDING_STOPPED") {
          console.error("Recording error:", response);
          resolve(false);
        } else {
          const timestamp = new Date(response.timestamp).getTime();

          global.mainWindow.webContents.send("recording-status", response.code === "RECORDING_STARTED" ? "START_RECORDING" : "STOP_RECORDING", timestamp, response.path);

          resolve(true);
        }
      } catch (error) {
        console.error("Error parsing recorder output:", error, data.toString());
        resolve(false);
      }
    });

    recordingProcess.stderr.on("data", (data) => {
      console.error("Recorder stderr:", data.toString());
    });

    recordingProcess.on("error", (error) => {
      console.error("Recorder process error:", error);
      resolve(false);
    });
  });
};

export async function startRecording({ filepath, filename }) {
  const isPermissionGranted = await checkPermissions();

  if (!isPermissionGranted) {
    global.mainWindow.loadFile("./src/electron/renderer/screens/permission-denied/screen.html");
    return;
  }

  // Process the filename to ensure it has the right extension
  let filenameWithoutExt = (filename || "recording").replace(/\.\w+$/, '');
  const fullPath = path.join(filepath, `${filenameWithoutExt}.flac`);

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

  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    const recordingStarted = await initRecording(filepath, filename);

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
      recordingProcess.kill("SIGINT");
    } catch (error) {
      console.error("Error stopping recording:", error);
    } finally {
      recordingProcess = null;
    }
  }
} 