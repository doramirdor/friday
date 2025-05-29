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
          // AUTO-SAVE DISABLED: No automatic settings creation to prevent database conflicts
          console.log('🚫 AUTO-SAVE DISABLED: Settings not found in database, using defaults without auto-creation');
          
          // Check localStorage for legacy settings but don't auto-save to database
          const localSettings = localStorage.getItem('friday-settings');
          
          if (localSettings) {
            // Use legacy localStorage settings but don't auto-save to database
            const parsedLocalSettings = JSON.parse(localSettings);
            const newSettings: UserSettings = {
              ...defaultSettings,
              ...parsedLocalSettings,
              type: 'settings',
              updatedAt: new Date().toISOString()
            };
            
            // AUTO-SAVE DISABLED: Don't automatically save settings to prevent conflicts
            // const savedSettings = await DatabaseService.saveSettings(newSettings);
            console.log('🚫 AUTO-SAVE DISABLED: Legacy settings loaded but not automatically saved to database');
            setSettings(newSettings);
          } else {
            // No settings anywhere, use defaults but don't auto-save
            const newSettings: UserSettings = {
              ...defaultSettings,
              type: 'settings',
              updatedAt: new Date().toISOString()
            };
            
            // AUTO-SAVE DISABLED: Don't automatically create default settings to prevent conflicts
            console.log('🚫 AUTO-SAVE DISABLED: Using default settings without auto-creation');
            setSettings(newSettings);
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
        } else {
          // Use default settings if everything fails
          setSettings({
            ...defaultSettings,
            type: 'settings',
            updatedAt: new Date().toISOString()
          });
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
      
      // AUTO-SAVE DISABLED: Settings updates no longer automatically save to database
      console.log('🚫 AUTO-SAVE DISABLED: Settings updated in memory only, not saved to database');
      
      // Update state only (no database save)
      setSettings(updatedSettings);
      
      // Update localStorage for compatibility with existing code
      localStorage.setItem('friday-settings', JSON.stringify({
        liveTranscript: updatedSettings.liveTranscript,
        theme: updatedSettings.theme || 'system',
        recordingSource: updatedSettings.recordingSource || 'system'
      }));
      
      return updatedSettings;
      
      // This code is now disabled to prevent database conflicts:
      // Update database
      // const savedSettings = await DatabaseService.saveSettings(updatedSettings);
      // Update state
      // setSettings(savedSettings);
      
    } catch (err) {
      console.error('Error updating settings:', err);
      toast.error('Failed to update settings');
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
      
      // AUTO-SAVE DISABLED: Settings reset no longer automatically saves to database
      console.log('🚫 AUTO-SAVE DISABLED: Settings reset in memory only, not saved to database');
      setSettings(newSettings);
      
      // Update localStorage
      localStorage.setItem('friday-settings', JSON.stringify({
        liveTranscript: newSettings.liveTranscript,
        theme: newSettings.theme || 'system',
        recordingSource: newSettings.recordingSource || 'system'
      }));
      
      toast.success('Settings reset to defaults (not saved to database)');
      return newSettings;
      
      // This code is now disabled to prevent database conflicts:
      // const savedSettings = await DatabaseService.saveSettings(newSettings);
      // setSettings(savedSettings);
      // toast.success('Settings reset to defaults');
      // return savedSettings;
      
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