import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { checkVirtualAudioAvailability, checkMicrophonePermission } from "@/utils/audioDeviceCheck";

interface AudioDevice {
  deviceId: string;
  label: string;
  kind: string;
}

export function AudioDeviceInfo() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [virtualAudioStatus, setVirtualAudioStatus] = useState<{ available: boolean; message: string }>({ available: false, message: "Checking..." });
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [permissionStatus, setPermissionStatus] = useState<string>("unknown");

  // Load audio devices and check virtual audio status
  useEffect(() => {
    const loadDevices = async () => {
      try {
        // Check microphone permission first
        const permResult = await checkMicrophonePermission();
        setPermissionStatus(permResult.granted ? "granted" : "denied");
        
        if (permResult.granted) {
          // Check for virtual audio device
          const vaStatus = await checkVirtualAudioAvailability();
          setVirtualAudioStatus(vaStatus);
          
          // Enumerate all devices
          const deviceList = await navigator.mediaDevices.enumerateDevices();
          const audioDevices = deviceList
            .filter(device => device.kind === 'audioinput')
            .map(device => ({
              deviceId: device.deviceId,
              label: device.label || `Audio Device ${device.deviceId.substring(0, 8)}...`,
              kind: device.kind
            }));
          
          setDevices(audioDevices);
          
          // Set default selected device (prefer virtual audio device if available)
          const virtualAudioDevice = audioDevices.find(device => 
            device.label.includes('Virtual') || 
            device.label.includes('VB-Cable') || 
            device.label.includes('BlackHole') ||
            device.label.includes('Soundflower') ||
            device.label.includes('CABLE')
          );
          
          if (virtualAudioDevice) {
            setSelectedDevice(virtualAudioDevice.deviceId);
          } else if (audioDevices.length > 0) {
            setSelectedDevice(audioDevices[0].deviceId);
          }
        }
      } catch (err) {
        console.error("Error loading audio devices:", err);
        toast.error("Failed to load audio devices");
      }
    };
    
    loadDevices();
  }, []);

  const handleRefresh = async () => {
    try {
      const deviceList = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = deviceList
        .filter(device => device.kind === 'audioinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Audio Device ${device.deviceId.substring(0, 8)}...`,
          kind: device.kind
        }));
      
      setDevices(audioDevices);
      
      // Check virtual audio status again
      const vaStatus = await checkVirtualAudioAvailability();
      setVirtualAudioStatus(vaStatus);
      
      toast.success("Audio devices refreshed");
    } catch (err) {
      console.error("Error refreshing devices:", err);
      toast.error("Failed to refresh devices");
    }
  };

  const handleDeviceChange = (deviceId: string) => {
    setSelectedDevice(deviceId);
  };

  const handleTestDevice = async () => {
    if (!selectedDevice) {
      toast.error("No device selected");
      return;
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: selectedDevice }
      });
      
      // Create an audio context to analyze the stream
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      microphone.connect(analyser);
      
      // Set up data array for audio analysis
      analyser.fftSize = 256;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      // Check for audio activity
      const checkAudio = () => {
        analyser.getByteFrequencyData(dataArray);
        
        // Calculate average signal level
        const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
        
        if (average > 5) {
          toast.success("Audio detected from selected device!");
          clearInterval(interval);
          stream.getTracks().forEach(track => track.stop());
        }
      };
      
      // Check for audio every 100ms for 5 seconds
      const interval = setInterval(checkAudio, 100);
      setTimeout(() => {
        clearInterval(interval);
        stream.getTracks().forEach(track => track.stop());
        toast.info("Test completed. If no audio was detected, try making some sound while testing.");
      }, 5000);
      
      toast.info("Testing audio device... Please make some noise!");
    } catch (err) {
      console.error("Error testing device:", err);
      toast.error(`Failed to test device: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Function to check if a device is a virtual audio device
  const isVirtualAudioDevice = (label: string): boolean => {
    return label.includes('Virtual') || 
           label.includes('VB-Cable') || 
           label.includes('BlackHole') ||
           label.includes('Soundflower') ||
           label.includes('CABLE');
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Audio Devices</CardTitle>
        <CardDescription>
          Manage your audio input devices for recording
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span>Microphone Permission:</span>
            <Badge variant={permissionStatus === "granted" ? "default" : "destructive"}>
              {permissionStatus === "granted" ? "Granted" : permissionStatus === "denied" ? "Denied" : "Unknown"}
            </Badge>
          </div>
          
          <div className="flex items-center justify-between">
            <span>Virtual Audio Status:</span>
            <Badge variant={virtualAudioStatus.available ? "default" : "secondary"}>
              {virtualAudioStatus.available ? "Available" : "Not Detected"}
            </Badge>
          </div>
          
          <div>
            <p className="text-xs text-muted-foreground mb-2">{virtualAudioStatus.message}</p>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Audio Device:</label>
            <Select value={selectedDevice} onValueChange={handleDeviceChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a device" />
              </SelectTrigger>
              <SelectContent>
                {devices.map((device) => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {isVirtualAudioDevice(device.label) ? `${device.label} (System Audio)` : device.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {devices.length > 0 ? (
            <div>
              <h4 className="text-sm font-medium mb-2">Available Devices:</h4>
              <ul className="space-y-1">
                {devices.map((device) => (
                  <li key={device.deviceId} className="text-xs truncate">
                    {isVirtualAudioDevice(device.label) ? (
                      <span className="flex items-center">
                        {device.label}
                        <Badge variant="outline" className="ml-2">System Audio</Badge>
                      </span>
                    ) : (
                      device.label
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No audio devices found or permission denied.</p>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={handleRefresh}>
          Refresh Devices
        </Button>
        <Button onClick={handleTestDevice} disabled={!selectedDevice || permissionStatus !== "granted"}>
          Test Selected Device
        </Button>
      </CardFooter>
    </Card>
  );
} 