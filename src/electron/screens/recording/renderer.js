const { ipcRenderer, shell } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { exec } = require("child_process");
const { promisify } = require("util");
const diagnostics = require("../../utils/diagnostics");

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

  // First run diagnostics to ensure everything is ready
  diagnostics.runRecordingDiagnostics(selectedFolderPath)
    .then(results => {
      // If there are issues, show them but proceed
      if (results.issues && results.issues.length > 0) {
        console.warn('Diagnostic issues found:', results.issues);
      }
      
      // Start recording
      ipcRenderer.send("start-recording", {
        filepath: selectedFolderPath,
        filename: recordingFilename,
      });
    })
    .catch(error => {
      console.error('Error running diagnostics:', error);
      // Start recording anyway
      ipcRenderer.send("start-recording", {
        filepath: selectedFolderPath,
        filename: recordingFilename,
      });
    });
});

document.getElementById("stop-recording").addEventListener("click", () => {
  const stopButton = document.getElementById("stop-recording");
  stopButton.innerHTML = `Stopping <span class="inline-block ml-4 w-4 h-4 border-4 border-t-transparent border-white rounded-full animate-spin"></span>`;
  stopButton.disabled = true;
  
  ipcRenderer.send("stop-recording");
});

// Diagnostic tool buttons
document.getElementById("run-diagnostics").addEventListener("click", async () => {
  showStatus("Running diagnostics...", "blue");
  
  try {
    const results = await diagnostics.runRecordingDiagnostics(selectedFolderPath);
    await diagnostics.showDiagnosticResults(results);
    showStatus(`Diagnostics complete. ${results.issues.length} issues found.`, 
      results.issues.length > 0 ? "orange" : "green");
  } catch (error) {
    console.error("Error running diagnostics:", error);
    showStatus(`Error running diagnostics: ${error.message}`, "red");
  }
});

document.getElementById("fix-issues").addEventListener("click", async () => {
  showStatus("Attempting to fix common issues...", "blue");
  
  try {
    const fixes = await diagnostics.fixCommonIssues(selectedFolderPath);
    showDiagnosticResults(fixes);
    showStatus(`Auto-fix complete. ${fixes.length} items addressed.`, "green");
  } catch (error) {
    console.error("Error fixing issues:", error);
    showStatus(`Error fixing issues: ${error.message}`, "red");
  }
});

document.getElementById("find-flac").addEventListener("click", async () => {
  showStatus("Looking for FLAC files to convert...", "blue");
  
  try {
    // Find all FLAC files recursively
    const { stdout } = await execAsync(`find "${selectedFolderPath}" -name "*.flac" -type f`);
    const flacFiles = stdout.trim().split('\n').filter(line => line.length > 0);
    
    if (flacFiles.length === 0) {
      showStatus("No FLAC files found.", "orange");
      return;
    }
    
    showStatus(`Found ${flacFiles.length} FLAC files. Converting...`, "blue");
    
    // Convert each FLAC file
    const results = [];
    for (const flacPath of flacFiles) {
      try {
        const mp3Path = await convertFlacToMp3(flacPath, true);
        if (mp3Path) {
          results.push(`✓ Converted: ${path.basename(flacPath)} → ${path.basename(mp3Path)}`);
        } else {
          results.push(`✗ Failed to convert: ${path.basename(flacPath)}`);
        }
      } catch (error) {
        results.push(`✗ Error converting ${path.basename(flacPath)}: ${error.message}`);
      }
    }
    
    showDiagnosticResults(results);
    showStatus(`Conversion complete. ${results.filter(r => r.startsWith('✓')).length}/${flacFiles.length} files converted.`, "green");
  } catch (error) {
    console.error("Error finding/converting FLAC files:", error);
    showStatus(`Error finding/converting FLAC files: ${error.message}`, "red");
  }
});

document.getElementById("check-permissions").addEventListener("click", async () => {
  showStatus("Checking permissions and paths...", "blue");
  
  try {
    // Check Swift recorder permissions
    const recorderPath = './src/swift/Recorder';
    let results = [];
    
    // Check if recorder exists
    if (fs.existsSync(recorderPath)) {
      results.push(`✓ Swift recorder exists at ${recorderPath}`);
      
      // Check permissions
      const { stdout } = await execAsync(`ls -la ${recorderPath}`);
      results.push(`File info: ${stdout.trim()}`);
      
      // Check if executable
      const hasExecute = stdout.includes('x');
      if (hasExecute) {
        results.push('✓ Recorder has execute permissions');
      } else {
        results.push('✗ Recorder MISSING execute permissions');
        
        // Fix permissions
        await execAsync(`chmod +x ${recorderPath}`);
        results.push('✓ Fixed permissions with chmod +x');
      }
    } else {
      results.push(`✗ Swift recorder NOT FOUND at ${recorderPath}`);
    }
    
    // Check if output directory exists and is writable
    if (fs.existsSync(selectedFolderPath)) {
      results.push(`✓ Output directory exists: ${selectedFolderPath}`);
      
      // Check if writable
      try {
        const testFile = path.join(selectedFolderPath, `test-${Date.now()}.txt`);
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        results.push('✓ Output directory is writable');
      } catch (error) {
        results.push(`✗ Output directory is NOT writable: ${error.message}`);
      }
    } else {
      results.push(`✗ Output directory does NOT exist: ${selectedFolderPath}`);
      
      // Try to create it
      try {
        fs.mkdirSync(selectedFolderPath, { recursive: true });
        results.push(`✓ Created output directory: ${selectedFolderPath}`);
      } catch (error) {
        results.push(`✗ Failed to create output directory: ${error.message}`);
      }
    }
    
    showDiagnosticResults(results);
    showStatus("Permission check complete", "green");
  } catch (error) {
    console.error("Error checking permissions:", error);
    showStatus(`Error checking permissions: ${error.message}`, "red");
  }
});

// Helper function to show status messages
function showStatus(message, color) {
  const container = document.getElementById("diagnostic-results");
  container.className = `mt-4 p-2 bg-${color}-100 text-${color}-700 rounded-md`;
  container.textContent = message;
  container.classList.remove("hidden");
}

// Helper function to show diagnostic results
function showDiagnosticResults(results) {
  const container = document.getElementById("diagnostic-results");
  container.innerHTML = '';
  container.className = "mt-4 p-3 bg-gray-100 text-gray-800 rounded-md";
  
  const title = document.createElement("h4");
  title.className = "font-medium mb-2";
  title.textContent = "Diagnostic Results";
  container.appendChild(title);
  
  const list = document.createElement("ul");
  list.className = "text-sm space-y-1";
  
  results.forEach(result => {
    const item = document.createElement("li");
    item.className = result.startsWith('✓') ? "text-green-600" : 
                     result.startsWith('✗') ? "text-red-600" : 
                     "text-gray-600";
    item.textContent = result;
    list.appendChild(item);
  });
  
  container.appendChild(list);
  container.classList.remove("hidden");
}

// Convert FLAC to MP3 directly from the renderer
async function convertFlacToMp3(flacPath, silent = false) {
  try {
    if (!silent) {
      // Create status container
      const statusContainer = document.createElement("div");
      statusContainer.id = "conversion-status";
      statusContainer.className = "mt-2 p-2 bg-blue-100 text-blue-700 rounded-md";
      statusContainer.innerText = "Converting FLAC to MP3...";
      document.querySelector(".bg-white").appendChild(statusContainer);
    }
    
    // Create the MP3 path by replacing the extension
    const mp3Path = flacPath.replace(".flac", ".mp3");
    
    console.log(`Converting ${flacPath} to ${mp3Path}`);
    
    // First check if the FLAC file exists
    if (!fs.existsSync(flacPath)) {
      console.error(`FLAC file doesn't exist: ${flacPath}`);
      
      if (!silent) {
        const statusContainer = document.getElementById("conversion-status");
        if (statusContainer) {
          statusContainer.className = "mt-2 p-2 bg-red-100 text-red-700 rounded-md";
          statusContainer.innerText = `Error: FLAC file not found: ${flacPath}`;
          
          // Remove status after a delay
          setTimeout(() => {
            statusContainer.remove();
          }, 5000);
        }
      }
      
      return null;
    }
    
    // Run ffmpeg with explicit verbose mode
    await execAsync(`ffmpeg -v verbose -i "${flacPath}" -codec:a libmp3lame -qscale:a 2 "${mp3Path}" -y`);
    
    // Verify the conversion worked
    if (!fs.existsSync(mp3Path)) {
      throw new Error("MP3 file wasn't created");
    }
    
    // Get file sizes for reporting
    const flacSize = fs.statSync(flacPath).size;
    const mp3Size = fs.statSync(mp3Path).size;
    
    console.log(`Conversion successful:
      FLAC: ${flacPath} (${(flacSize / 1024 / 1024).toFixed(2)} MB)
      MP3: ${mp3Path} (${(mp3Size / 1024 / 1024).toFixed(2)} MB)`);
    
    // Delete the original FLAC file
    fs.unlinkSync(flacPath);
    
    if (!silent) {
      // Update status
      const statusContainer = document.getElementById("conversion-status");
      if (statusContainer) {
        statusContainer.className = "mt-2 p-2 bg-green-100 text-green-700 rounded-md";
        statusContainer.innerText = "Conversion complete!";
        
        // Remove status after a delay
        setTimeout(() => {
          statusContainer.remove();
        }, 3000);
      }
    }
    
    return mp3Path;
  } catch (error) {
    console.error("Conversion error:", error);
    
    if (!silent) {
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
      
      // Run auto-diagnostics
      if (fileExt === '.flac') {
        showStatus("Recording saved as FLAC. Running auto-conversion...", "blue");
        
        // Try to auto-convert
        convertFlacToMp3(filepath)
          .then(mp3Path => {
            if (mp3Path) {
              currentRecordingPath = mp3Path;
              showStatus("Auto-conversion to MP3 successful", "green");
              
              // Update UI
              const fileSize = fs.existsSync(mp3Path) ? 
                `(${(fs.statSync(mp3Path).size / 1024 / 1024).toFixed(2)} MB)` : '';
              
              document.getElementById("output-file-path").innerHTML = 
                `<span class="font-bold">🎵 MP3</span> ${mp3Path} ${fileSize}`;
              
              // Create MP3 player
              createAudioPlayer(mp3Path);
            } else {
              showStatus("Auto-conversion to MP3 failed. Please use manual conversion.", "orange");
            }
          })
          .catch(error => {
            console.error("Auto-conversion error:", error);
            showStatus(`Auto-conversion error: ${error.message}`, "red");
          });
      }
    } else {
      // Show error message if file doesn't exist
      const errorContainer = document.createElement("div");
      errorContainer.className = "mt-4 p-4 bg-red-100 text-red-700 rounded-md";
      errorContainer.innerHTML = `
        <h3 class="font-bold">Error: File Not Found</h3>
        <p>The recording file could not be found at: ${filepath}</p>
        <p class="mt-2">Please try recording again or run diagnostics.</p>
      `;
      document.querySelector(".bg-white").appendChild(errorContainer);
      
      // Suggest running diagnostics
      showStatus("Recording file not found. Run diagnostics to troubleshoot.", "red");
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