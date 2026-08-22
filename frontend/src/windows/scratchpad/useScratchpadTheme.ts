import { setLanguage } from '../../i18n';
import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Settings } from '../../types';
import { useTheme } from '../../hooks/useTheme';
import { cmd } from '../../commands';

/** Load theme-related settings, apply them, and keep them in sync with the settings window. */
export function useScratchpadTheme() {
  const [themeSetting, setThemeSetting] = useState('system');
  const [interfaceTheme, setInterfaceTheme] = useState('default');
  const [fontFamily, setFontFamily] = useState('system');
  const [uiDensity, setUiDensity] = useState('comfortable');
  const [windowEffect, setWindowEffect] = useState('clear');
  useEffect(() => {
    const applySettings = (s: Settings) => {
      if (s.theme) setThemeSetting(s.theme);
      if (s.interface_theme) setInterfaceTheme(s.interface_theme);
      if (s.font_family) setFontFamily(s.font_family);
      if (s.ui_density) setUiDensity(s.ui_density);
      if (s.mica_effect) setWindowEffect(s.mica_effect);
      setLanguage(s.language);
    };

    cmd
      .getSettings()
      .then(applySettings)
      .catch(() => {});

    const unlisten = listen<Settings>('settings-changed', (event) => {
      applySettings(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, []);
  useTheme(themeSetting, interfaceTheme, fontFamily, uiDensity, windowEffect);
}
