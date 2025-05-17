const { ipcRenderer, shell } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");

let selectedFolderPath = path.join(os.homedir(), "Desktop");
document.getElementById("selected-folder-path").textContent = selectedFolderPath;

let recordingFilename = null;
let currentRecordingPath = null;

document.getElementById("select-folder").addEventListener("click", () => {
  ipcRenderer.send("open-folder-dialog");
});

ipcRenderer.on("selected-folder", (_, path) => {
  selectedFolderPath = path;

  document.getElementById("selected-folder-path").textContent = selectedFolderPath;
});

document.getElementById("recording-filename").addEventListener("input", (event) => {
  recordingFilename = event.target.value;
});

document.getElementById("start-recording").addEventListener("click", () => {
  const startButton = document.getElementById("start-recording");
  startButton.innerHTML = `Starting <span class="inline-block ml-4 w-4 h-4 border-4 border-t-transparent border-white rounded-full animate-spin"></span>`;

  ipcRenderer.send("start-recording", {
    filepath: selectedFolderPath,
    filename: recordingFilename,
  });
});

document.getElementById("stop-recording").addEventListener("click", () => {
  const stopButton = document.getElementById("stop-recording");
  stopButton.innerHTML = `Stopping <span class="inline-block ml-4 w-4 h-4 border-4 border-t-transparent border-white rounded-full animate-spin"></span>`;
  stopButton.disabled = true;
  
  ipcRenderer.send("stop-recording");
});

// Add audio player to the page
const createAudioPlayer = (filePath) => {
  // Remove any existing player
  const existingPlayer = document.getElementById("audio-player-container");
  if (existingPlayer) {
    existingPlayer.remove();
  }

  // Only create player for MP3 files
  if (!filePath.toLowerCase().endsWith('.mp3')) {
    return;
  }

  const playerContainer = document.createElement("div");
  playerContainer.id = "audio-player-container";
  playerContainer.className = "mt-4 p-4 border border-gray-300 rounded-md";

  const audioTitle = document.createElement("h3");
  audioTitle.textContent = "Recording Preview";
  audioTitle.className = "text-lg font-medium mb-2";
  
  const player = document.createElement("audio");
  player.controls = true;
  player.className = "w-full";
  player.src = `file://${filePath}`;
  
  playerContainer.appendChild(audioTitle);
  playerContainer.appendChild(player);
  
  // Add to page
  document.querySelector(".bg-white").appendChild(playerContainer);
};

let startTime;
let updateTimer;

ipcRenderer.on("recording-status", (_, status, timestamp, filepath) => {
  const startButton = document.getElementById("start-recording");
  const stopButton = document.getElementById("stop-recording");

  if (status === "START_RECORDING") {
    startTime = timestamp;
    updateElapsedTime();

    startButton.innerHTML = "Start Recording";

    document.getElementById("start-recording").disabled = true;
    document.getElementById("recording-filename").disabled = true;
    document.getElementById("select-folder").disabled = true;
    document.getElementById("stop-recording").disabled = false;
    document.getElementById("output-file-path").textContent = filepath;
    currentRecordingPath = filepath;
  }

  if (status === "STOP_RECORDING") {
    clearTimeout(updateTimer);
    
    stopButton.innerHTML = "Stop Recording";
    stopButton.disabled = true;

    document.getElementById("start-recording").disabled = false;
    document.getElementById("recording-filename").disabled = false;
    document.getElementById("select-folder").disabled = false;
    
    // Update the current recording path
    currentRecordingPath = filepath;
    
    // Display file information
    const fileExt = path.extname(filepath).toLowerCase();
    const fileSize = fs.existsSync(filepath) ? 
      `(${(fs.statSync(filepath).size / 1024 / 1024).toFixed(2)} MB)` : '';
    
    const fileTypeEmoji = fileExt === '.mp3' ? '🎵 MP3' : '🔊 FLAC';
    document.getElementById("output-file-path").innerHTML = 
      `<span class="font-bold">${fileTypeEmoji}</span> ${filepath} ${fileSize}`;
    
    // Create audio player for MP3 files
    createAudioPlayer(filepath);
  }
});

document.getElementById("output-file-path").addEventListener("click", () => {
  if (!currentRecordingPath) return;
  
  const filePath = currentRecordingPath;
  const parentDir = path.dirname(filePath);

  // Open the folder containing the file
  shell.openPath(parentDir);
});

function updateElapsedTime() {
  const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
  document.getElementById("elapsed-time").textContent = `${elapsedTime}s`;

  updateTimer = setTimeout(updateElapsedTime, 1000);
} 