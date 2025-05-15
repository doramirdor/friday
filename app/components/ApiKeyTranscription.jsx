import React, { useState, useRef } from 'react';
import { Button, Spinner, Text, Box, VStack, Badge, useToast } from '@chakra-ui/react';

export function ApiKeyTranscription() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [savedFiles, setSavedFiles] = useState([]);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const toast = useToast();

  const startRecording = async () => {
    try {
      chunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Try to use MP3 encoding directly if supported by the browser
      const mimeType = MediaRecorder.isTypeSupported('audio/mp3') 
        ? 'audio/mp3' 
        : MediaRecorder.isTypeSupported('audio/webm;codecs=mp3') 
          ? 'audio/webm;codecs=mp3' 
          : 'audio/webm';
      
      console.log(`🎤 Using media recorder with mime type: ${mimeType}`);
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = handleRecordingStop;
      
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setSavedFiles([]);
      
      toast({
        title: 'Recording started',
        status: 'info',
        duration: 2000,
      });
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: 'Recording Error',
        description: error.message,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const handleRecordingStop = async () => {
    try {
      setIsProcessing(true);
      
      // Create blob from recorded chunks
      const mimeType = mediaRecorderRef.current.mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const buffer = await blob.arrayBuffer();
      
      // Generate a timestamp-based filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `recording-${timestamp}`;
      
      // Save the audio file with preference for MP3 format
      if (window.electronAPI && window.electronAPI.saveAudioFile) {
        const result = await window.electronAPI.saveAudioFile(
          new Uint8Array(buffer), 
          filename, 
          ['mp3', 'wav'] // Prioritize MP3 over WAV
        );
        
        if (result.success) {
          setSavedFiles(result.files);
          console.log('📁 Audio saved successfully:', result.files);
          
          // Find the MP3 file in saved files
          const mp3File = result.files.find(f => f.format === 'mp3');
          
          if (mp3File) {
            // Use the MP3 file for transcription
            await transcribeAudioFile(mp3File.path);
          } else if (result.files.length > 0) {
            // Fallback to the first available file
            await transcribeAudioFile(result.files[0].path);
          } else {
            throw new Error('No audio files were saved');
          }
        } else {
          throw new Error(result.message || 'Failed to save audio file');
        }
      } else {
        // Fallback to direct buffer transcription if file saving isn't available
        await transcribeAudioBuffer(buffer);
      }
    } catch (error) {
      console.error('Error processing audio:', error);
      toast({
        title: 'Processing Error',
        description: error.message,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setIsProcessing(false);
    }
  };
  
  const transcribeAudioFile = async (filePath) => {
    try {
      console.log(`🔍 Transcribing audio file: ${filePath}`);
      
      // Use the test function for transcribing from file
      if (window.electronAPI && window.electronAPI.testSpeechWithFile) {
        const result = await window.electronAPI.testSpeechWithFile(filePath);
        
        if (result && typeof result === 'string' && !result.startsWith('Error:')) {
          setTranscript(result);
          toast({
            title: 'Transcription successful',
            status: 'success',
            duration: 2000,
          });
        } else {
          throw new Error(result || 'Transcription failed');
        }
      } else {
        throw new Error('Speech file transcription method not available');
      }
    } catch (error) {
      console.error('Error transcribing audio file:', error);
      // Fallback to buffer transcription
      await transcribeAudioBuffer(chunksRef.current);
    }
  };
  
  const transcribeAudioBuffer = async (buffer) => {
    try {
      console.log('🔍 Transcribing audio from buffer');
      
      // Use the API key-based transcription method
      if (window.api && window.api.transcribeAudioWithApiKey) {
        const result = await window.api.transcribeAudioWithApiKey(
          buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
        );
        
        if (result.success) {
          setTranscript(result.transcript);
          toast({
            title: 'Transcription successful',
            status: 'success',
            duration: 2000,
          });
        } else {
          throw new Error(result.error || 'Transcription failed');
        }
      } else {
        throw new Error('API key transcription method not available');
      }
    } catch (error) {
      console.error('Error transcribing audio buffer:', error);
      throw error;
    }
  };

  return (
    <VStack spacing={4} align="stretch" p={4}>
      <Box borderWidth="1px" borderRadius="lg" p={4}>
        <VStack spacing={4}>
          <Badge colorScheme="blue">Using Google API Key Authentication</Badge>
          
          <Button
            colorScheme={isRecording ? "red" : "blue"}
            onClick={isRecording ? stopRecording : startRecording}
            isDisabled={isProcessing}
            leftIcon={isRecording ? "🔴" : "🎙️"}
            width="full"
          >
            {isRecording ? "Stop Recording" : "Start Recording"}
          </Button>
          
          {isProcessing && (
            <Box textAlign="center">
              <Spinner size="md" />
              <Text>Processing audio...</Text>
            </Box>
          )}
          
          {savedFiles.length > 0 && (
            <Box borderWidth="1px" borderRadius="md" p={3} bg="gray.50" width="full">
              <Text fontWeight="bold" mb={2}>Saved files:</Text>
              {savedFiles.map((file, index) => (
                <Text key={index} fontSize="sm">
                  {file.format.toUpperCase()}: {file.path}
                </Text>
              ))}
            </Box>
          )}
          
          {transcript && (
            <Box borderWidth="1px" borderRadius="md" p={3} bg="gray.50" width="full">
              <Text fontWeight="bold" mb={2}>Transcript:</Text>
              <Text>{transcript}</Text>
            </Box>
          )}
        </VStack>
      </Box>
    </VStack>
  );
}

export default ApiKeyTranscription; 