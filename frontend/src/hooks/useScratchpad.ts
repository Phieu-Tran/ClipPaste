import { useCallback } from 'react';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { currentMonitor } from '@tauri-apps/api/window';
import { cmd } from '../commands';

const COLLAPSED_WIDTH = 16;
const COLLAPSED_HEIGHT = 100;

export function useScratchpad() {
  // Toggle: create if not exists, otherwise ask the existing scratchpad window
  // to switch between its side rail and expanded list.
  const toggle = useCallback(async () => {
    const win = await WebviewWindow.getByLabel('scratchpad');
    if (win) {
      await cmd.capturePrevForeground();
      await win.show();
      await win.emit('scratchpad-toggle');
      return;
    }

    let x = 0;
    let y = 400;
    try {
      const monitor = await currentMonitor();
      if (monitor) {
        const scale = monitor.scaleFactor;
        const workW = monitor.size.width / scale;
        const workH = monitor.size.height / scale;
        const workX = monitor.position.x / scale;
        const workY = monitor.position.y / scale;
        x = workX + workW - COLLAPSED_WIDTH;
        y = workY + Math.round((workH - COLLAPSED_HEIGHT) / 2);
      }
    } catch {}

    new WebviewWindow('scratchpad', {
      url: 'index.html?window=scratchpad&open=1',
      title: 'Scratchpad',
      width: COLLAPSED_WIDTH,
      height: COLLAPSED_HEIGHT,
      x,
      y,
      resizable: false,
      decorations: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focus: true,
    });
  }, []);

  return { toggle };
}
