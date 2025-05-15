import React, { useState, useRef } from 'react';
import { Button, Spinner, Text, Box, VStack, Badge, useToast } from '@chakra-ui/react';

export function ApiKeyTranscription() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const toast = useToast();

  const startRecording = async () => {
    try {
      chunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = handleRecordingStop;
      
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      
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
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const buffer = await blob.arrayBuffer();
      
      // Use the API key-based transcription method
      if (window.api && window.api.transcribeAudioWithApiKey) {
        const result = await window.api.transcribeAudioWithApiKey(new Uint8Array(buffer));
        
        if (result.success) {
          setTranscript(result.transcript);
          toast({
            title: 'Transcription successful',
            status: 'success',
            duration: 2000,
          });
        } else {
          toast({
            title: 'Transcription failed',
            description: result.error,
            status: 'error',
            duration: 4000,
            isClosable: true,
          });
        }
      } else {
        throw new Error('API key transcription method not available');
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