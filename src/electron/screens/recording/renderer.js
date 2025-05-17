const { ipcRenderer, shell } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { exec } = require("child_process");
const { promisify } = require("util");

const execAsync = promisify(exec);

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

// Convert FLAC to MP3 directly from the renderer
async function convertFlacToMp3(flacPath) {
  try {
    // Create status container
    const statusContainer = document.createElement("div");
    statusContainer.id = "conversion-status";
    statusContainer.className = "mt-2 p-2 bg-blue-100 text-blue-700 rounded-md";
    statusContainer.innerText = "Converting FLAC to MP3...";
    document.querySelector(".bg-white").appendChild(statusContainer);
    
    // Create the MP3 path by replacing the extension
    const mp3Path = flacPath.replace(".flac", ".mp3");
    
    console.log(`Converting ${flacPath} to ${mp3Path}`);
    
    // Run ffmpeg to convert
    await execAsync(`ffmpeg -i "${flacPath}" -codec:a libmp3lame -qscale:a 2 "${mp3Path}" -y`);
    
    // Verify the conversion worked
    if (!fs.existsSync(mp3Path)) {
      throw new Error("MP3 file wasn't created");
    }
    
    // Delete the original FLAC file
    fs.unlinkSync(flacPath);
    
    // Update status
    statusContainer.className = "mt-2 p-2 bg-green-100 text-green-700 rounded-md";
    statusContainer.innerText = "Conversion complete!";
    
    // Remove status after a delay
    setTimeout(() => {
      statusContainer.remove();
    }, 3000);
    
    return mp3Path;
  } catch (error) {
    console.error("Conversion error:", error);
    
    // Update status
    const statusContainer = document.getElementById("conversion-status");
    if (statusContainer) {
      statusContainer.className = "mt-2 p-2 bg-red-100 text-red-700 rounded-md";
      statusContainer.innerText = `Conversion failed: ${error.message}`;
      
      // Remove status after a delay
      setTimeout(() => {
        statusContainer.remove();
      }, 5000);
    }
    
    return null;
  }
}

// Add audio player to the page
const createAudioPlayer = (filePath) => {
  // Remove any existing player
  const existingPlayer = document.getElementById("audio-player-container");
  if (existingPlayer) {
    existingPlayer.remove();
  }

  const playerContainer = document.createElement("div");
  playerContainer.id = "audio-player-container";
  playerContainer.className = "mt-4 p-4 border border-gray-300 rounded-md";

  const audioTitle = document.createElement("h3");
  audioTitle.textContent = "Recording Preview";
  audioTitle.className = "text-lg font-medium mb-2";
  
  // If it's a FLAC file, show a conversion button
  if (filePath.toLowerCase().endsWith('.flac')) {
    audioTitle.textContent = "FLAC Recording (Convert to listen)";
    
    const convertButton = document.createElement("button");
    convertButton.textContent = "Convert to MP3";
    convertButton.className = "bg-blue-500 hover:bg-blue-600 text-white font-medium py-1 px-2 rounded-md text-sm mt-2";
    
    convertButton.addEventListener("click", async () => {
      convertButton.disabled = true;
      convertButton.textContent = "Converting...";
      
      const mp3Path = await convertFlacToMp3(filePath);
      if (mp3Path) {
        // Update UI to show the MP3 file
        currentRecordingPath = mp3Path;
        
        // Display file information
        const fileSize = fs.existsSync(mp3Path) ? 
          `(${(fs.statSync(mp3Path).size / 1024 / 1024).toFixed(2)} MB)` : '';
        
        document.getElementById("output-file-path").innerHTML = 
          `<span class="font-bold">🎵 MP3</span> ${mp3Path} ${fileSize}`;
        
        // Create MP3 player
        createAudioPlayer(mp3Path);
      } else {
        convertButton.disabled = false;
        convertButton.textContent = "Try Again";
      }
    });
    
    playerContainer.appendChild(audioTitle);
    playerContainer.appendChild(convertButton);
  } else {
    // For MP3 files, show the audio player
    const player = document.createElement("audio");
    player.controls = true;
    player.className = "w-full";
    player.src = `file://${filePath}`;
    
    playerContainer.appendChild(audioTitle);
    playerContainer.appendChild(player);
  }
  
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
    
    // Check if the file actually exists
    const fileExists = fs.existsSync(filepath);
    
    // Display file information
    const fileExt = path.extname(filepath).toLowerCase();
    const fileSize = fileExists ? 
      `(${(fs.statSync(filepath).size / 1024 / 1024).toFixed(2)} MB)` : '';
    
    const fileTypeEmoji = fileExt === '.mp3' ? '🎵 MP3' : '🔊 FLAC';
    document.getElementById("output-file-path").innerHTML = 
      `<span class="font-bold">${fileTypeEmoji}</span> ${filepath} ${fileSize}`;
    
    if (fileExists) {
      // Create audio player for the file
      createAudioPlayer(filepath);
    } else {
      // Show error message if file doesn't exist
      const errorContainer = document.createElement("div");
      errorContainer.className = "mt-4 p-4 bg-red-100 text-red-700 rounded-md";
      errorContainer.innerHTML = `
        <h3 class="font-bold">Error: File Not Found</h3>
        <p>The recording file could not be found at: ${filepath}</p>
        <p class="mt-2">Please try recording again.</p>
      `;
      document.querySelector(".bg-white").appendChild(errorContainer);
    }
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