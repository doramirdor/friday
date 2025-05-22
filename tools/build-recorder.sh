#!/bin/bash

# Build the Swift recorder binary

echo "Building Swift recorder..."
echo "=========================="

# Check if Swift is installed
if ! command -v swiftc &> /dev/null; then
    echo "ERROR: Swift compiler not found. Please install Swift."
    exit 1
fi

# Navigate to the project root
cd "$(dirname "$0")/.." || exit 1

# Make sure the swift directory exists
if [ ! -d "src/swift" ]; then
    echo "ERROR: Swift source directory not found at src/swift"
    exit 1
fi

# Check if the source files exist
if [ ! -f "src/swift/Recorder.swift" ]; then
    echo "ERROR: Recorder.swift not found"
    exit 1
fi

# Create build directory if it doesn't exist
mkdir -p build

# Compile the Swift code
echo "Compiling Swift recorder..."
# Compile all Swift files at once to ensure proper imports
swiftc -O -o src/swift/Recorder src/swift/AudioDeviceManager.swift src/swift/Recorder.swift src/swift/main.swift

# Check if compilation was successful
if [ $? -eq 0 ]; then
    echo "Successfully compiled Swift recorder"
    echo "Binary location: $(pwd)/src/swift/Recorder"
    
    # Make the binary executable
    chmod +x src/swift/Recorder
    
    # Create a symlink in the build directory
    ln -sf "$(pwd)/src/swift/Recorder" build/Recorder
    echo "Created symlink in build directory: $(pwd)/build/Recorder"
else
    echo "ERROR: Failed to compile Swift recorder"
    exit 1
fi

echo "Build completed successfully" 