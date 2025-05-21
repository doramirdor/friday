import { useState, useEffect, useCallback } from 'react';
import { UserSettings } from '@/models/types';
import { DatabaseService } from '@/services/database';
import { toast } from 'sonner';

// Define default settings
const defaultSettings: Omit<UserSettings, 'type' | 'updatedAt'> = {
  liveTranscript: false,
  theme: 'system',
  autoLaunch: false,
  saveLocation: '',
  recordingSource: 'system',
  systemAudioDevice: '',
  microphoneDevice: '',
  isVolumeBoostEnabled: false,
  volumeLevel: 80
};

/**
 * Hook for managing application settings with database persistence
 * @returns Settings state and functions
 */
export const useSettings = () => {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load settings from database
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const dbSettings = await DatabaseService.getSettings();
        
        if (dbSettings) {
          // Settings exist in database
          setSettings(dbSettings);
          // Also update localStorage for compatibility with existing code
          localStorage.setItem('friday-settings', JSON.stringify({
            liveTranscript: dbSettings.liveTranscript,
            theme: dbSettings.theme || 'system',
            recordingSource: dbSettings.recordingSource || 'system'
          }));
        } else {
          // No settings in database, check localStorage for legacy settings
          const localSettings = localStorage.getItem('friday-settings');
          
          if (localSettings) {
            // Convert legacy localStorage settings to new format
            const parsedLocalSettings = JSON.parse(localSettings);
            const newSettings: UserSettings = {
              ...defaultSettings,
              ...parsedLocalSettings,
              type: 'settings',
              updatedAt: new Date().toISOString()
            };
            
            // Save the converted settings to database
            const savedSettings = await DatabaseService.saveSettings(newSettings);
            setSettings(savedSettings);
          } else {
            // No settings anywhere, create default settings
            const newSettings: UserSettings = {
              ...defaultSettings,
              type: 'settings',
              updatedAt: new Date().toISOString()
            };
            
            const savedSettings = await DatabaseService.saveSettings(newSettings);
            setSettings(savedSettings);
          }
        }
      } catch (err) {
        console.error('Error loading settings:', err);
        setError(err instanceof Error ? err.message : 'Unknown error loading settings');
        
        // Fallback to localStorage if database fails
        const localSettings = localStorage.getItem('friday-settings');
        if (localSettings) {
          try {
            const parsedLocalSettings = JSON.parse(localSettings);
            setSettings({
              ...defaultSettings,
              ...parsedLocalSettings,
              type: 'settings',
              updatedAt: new Date().toISOString()
            });
          } catch (parseErr) {
            console.error('Error parsing localStorage settings:', parseErr);
          }
        }
      } finally {
        setIsLoading(false);
      }
    };
    
    loadSettings();
  }, []);

  /**
   * Update settings in both database and state
   * @param newSettings - Partial settings to update
   */
  const updateSettings = useCallback(async (newSettings: Partial<UserSettings>) => {
    try {
      if (!settings) return;
      
      const updatedSettings: UserSettings = {
        ...settings,
        ...newSettings,
        updatedAt: new Date().toISOString()
      };
      
      // Update database
      const savedSettings = await DatabaseService.saveSettings(updatedSettings);
      
      // Update state
      setSettings(savedSettings);
      
      // Update localStorage for compatibility with existing code
      localStorage.setItem('friday-settings', JSON.stringify({
        liveTranscript: savedSettings.liveTranscript,
        theme: savedSettings.theme || 'system',
        recordingSource: savedSettings.recordingSource || 'system'
      }));
      
      return savedSettings;
    } catch (err) {
      console.error('Error updating settings:', err);
      toast.error('Failed to save settings');
      throw err;
    }
  }, [settings]);

  /**
   * Reset settings to defaults
   */
  const resetSettings = useCallback(async () => {
    try {
      const newSettings: UserSettings = {
        ...defaultSettings,
        type: 'settings',
        updatedAt: new Date().toISOString()
      };
      
      const savedSettings = await DatabaseService.saveSettings(newSettings);
      setSettings(savedSettings);
      
      // Update localStorage
      localStorage.setItem('friday-settings', JSON.stringify({
        liveTranscript: savedSettings.liveTranscript,
        theme: savedSettings.theme || 'system',
        recordingSource: savedSettings.recordingSource || 'system'
      }));
      
      toast.success('Settings reset to defaults');
      return savedSettings;
    } catch (err) {
      console.error('Error resetting settings:', err);
      toast.error('Failed to reset settings');
      throw err;
    }
  }, []);

  return {
    settings,
    isLoading,
    error,
    updateSettings,
    resetSettings
  };
};

export default useSettings; 