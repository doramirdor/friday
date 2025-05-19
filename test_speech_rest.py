import argparse
import base64
import json
import os
import requests

def transcribe_audio(audio_file, api_key):
    # Read audio file and encode it in base64
    with open(audio_file, "rb") as f:
        audio_content = base64.b64encode(f.read()).decode("utf-8")
    
    # Determine encoding based on file extension
    if audio_file.lower().endswith('.wav'):
        encoding = 'LINEAR16'
        print(f"Detected WAV format, using {encoding}")
    elif audio_file.lower().endswith('.mp3'):
        encoding = 'MP3'
        print(f"Detected MP3 format, using {encoding}")
    else:
        encoding = 'LINEAR16'  # Default
        print(f"Unknown format, defaulting to {encoding}")
    
    # Prepare request to Speech-to-Text API
    url = f"https://speech.googleapis.com/v1/speech:recognize?key={api_key}"
    
    payload = {
        "config": {
            "encoding": encoding,
            "sampleRateHertz": 16000,
            "languageCode": "en-US",
            "enableAutomaticPunctuation": True,
            "model": "default"
        },
        "audio": {
            "content": audio_content
        }
    }
    
    print(f"Sending request to Google Speech API...")
    response = requests.post(url, json=payload)
    
    # Print the response
    if response.status_code == 200:
        result = response.json()
        print(f"Response status: {response.status_code}")
        
        if not result.get("results"):
            print("No transcription returned")
            return "No speech detected"
        
        transcript = ""
        for res in result["results"]:
            alternatives = res.get("alternatives", [])
            if alternatives:
                transcript += alternatives[0].get("transcript", "") + " "
        
        print(f"Transcription: {transcript.strip()}")
        return transcript.strip()
    else:
        print(f"Error: {response.status_code}")
        print(response.text)
        return f"Error: {response.status_code} - {response.text}"

def main():
    parser = argparse.ArgumentParser(description="Transcribe audio using Google Speech-to-Text API")
    parser.add_argument("--file", help="Path to audio file", required=True)
    parser.add_argument("--key", help="Google API Key", default=os.environ.get("GOOGLE_SPEECH_API_KEY"))
    
    args = parser.parse_args()
    
    if not args.key:
        print("Error: GOOGLE_SPEECH_API_KEY environment variable not set and --key not provided")
        return
    
    transcribe_audio(args.file, args.key)

if __name__ == "__main__":
    main() 