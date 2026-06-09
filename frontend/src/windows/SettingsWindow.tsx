import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Settings } from '../types';
import { SettingsPanel } from '../components/SettingsPanel';
import { useTheme } from '../hooks/useTheme';
import { cmd } from '../commands';

import { Toaster } from 'sonner';

export function SettingsWindow() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = useMemo(() => getCurrentWindow(), []);

  const effectiveTheme = useTheme(
    settings?.theme || 'system',
    settings?.interface_theme,
    settings?.font_family,
    settings?.ui_density,
    settings?.mica_effect
  );

  const refreshMaximized = useCallback(async () => {
    try {
      setIsMaximized(await appWindow.isMaximized());
    } catch (e) {
      console.error('Failed to read settings window state:', e);
    }
  }, [appWindow]);

  useEffect(() => {
    cmd.getSettings().then(setSettings).catch(console.error);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    refreshMaximized();
    appWindow
      .onResized(() => {
        refreshMaximized();
      })
      .then((fn) => {
        if (disposed) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((e) => console.error('Failed to listen for settings window resize:', e));

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [appWindow, refreshMaximized]);

  const handleToggleMaximize = async () => {
    try {
      await appWindow.toggleMaximize();
      await refreshMaximized();
    } catch (e) {
      console.error('Failed to toggle settings window size:', e);
    }
  };

  const handleClose = async () => {
    try {
      await appWindow.close();
    } catch (e) {
      console.error('Failed to close settings window:', e);
    }
  };

  if (!settings) {
    return <div className="flex h-screen items-center justify-center text-white">Loading...</div>;
  }

  return (
    <div className="h-screen bg-background text-foreground">
      <SettingsPanel
        settings={settings}
        isMaximized={isMaximized}
        onToggleMaximize={handleToggleMaximize}
        onClose={handleClose}
      />
      <Toaster richColors position="bottom-center" theme={effectiveTheme} />
    </div>
  );
}
