const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const os = require("os");
const path = require("path");
const fs = require("fs");

const { checkPermissions } = require("./utils/permission");
const { startRecording, stopRecording } = require("./utils/recording");

// Create or ensure the Recordings directory exists
const ensureRecordingsDirectory = () => {
  const recordingsPath = path.join(app.getPath("documents"), "Friday Recordings");
  if (!fs.existsSync(recordingsPath)) {
    fs.mkdirSync(recordingsPath, { recursive: true });
  }
  return recordingsPath;
};

const createWindow = async () => {
  // Create the browser window
  global.mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Check if we have permission to record system audio
  const isPermissionGranted = await checkPermissions();

  // If we have permission, load the main app, otherwise show permission request screen
  if (isPermissionGranted) {
    // In development, use Vite's dev server
    if (process.env.NODE_ENV === "development") {
      global.mainWindow.loadURL("http://localhost:8082");
      global.mainWindow.webContents.openDevTools();
    } else {
      // In production, load the built app
      global.mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
    }
  } else {
    global.mainWindow.loadFile(path.join(__dirname, "screens/permission-denied/screen.html"));
  }
};

// IPC handlers for recording functionality
ipcMain.on("open-folder-dialog", async (event) => {
  const defaultPath = ensureRecordingsDirectory();

  const { filePaths, canceled } = await dialog.showOpenDialog(global.mainWindow, {
    properties: ["openDirectory"],
    buttonLabel: "Select Folder",
    title: "Select a folder",
    message: "Please select a folder for saving the recording",
    defaultPath: defaultPath,
  });

  if (!canceled) {
    event.sender.send("selected-folder", filePaths[0]);
  }
});

// Start recording
ipcMain.handle("start-system-recording", async (_, options = {}) => {
  try {
    const filepath = options.filepath || ensureRecordingsDirectory();
    const filename = options.filename || `recording-${Date.now()}`;

    await startRecording({
      filepath,
      filename,
    });

    return { success: true, filepath, filename };
  } catch (error) {
    console.error("Error starting recording:", error);
    return { success: false, error: error.message };
  }
});

// Stop recording
ipcMain.handle("stop-system-recording", async () => {
  try {
    stopRecording();
    return { success: true };
  } catch (error) {
    console.error("Error stopping recording:", error);
    return { success: false, error: error.message };
  }
});

// Check permissions
ipcMain.handle("check-system-audio-permissions", async () => {
  const isPermissionGranted = await checkPermissions();

  if (!isPermissionGranted) {
    const response = await dialog.showMessageBox(global.mainWindow, {
      type: "warning",
      title: "Permission Required",
      message: "You need to grant permission for screen recording to capture system audio. Would you like to open System Preferences now?",
      buttons: ["Open System Preferences", "Cancel"],
    });

    if (response.response === 0) {
      shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
    }
  }

  return { granted: isPermissionGranted };
});

// Listen for recording status events
ipcMain.on("recording-status", (_, status, timestamp, filepath) => {
  global.mainWindow.webContents.send("recording-status", status, timestamp, filepath);
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
}); 