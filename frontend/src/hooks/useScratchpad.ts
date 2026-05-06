import { useCallback } from 'react';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { currentMonitor } from '@tauri-apps/api/window';

const COLLAPSED_WIDTH = 16;
const COLLAPSED_HEIGHT = 100;

export function useScratchpad() {

  // Toggle: create if not exists, otherwise show/focus
  const toggle = useCallback(async () => {
    const win = await WebviewWindow.getByLabel('scratchpad');
    if (win) {
      await win.close();
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
      url: 'index.html?window=scratchpad',
      title: 'Scratchpad',
      width: COLLAPSED_WIDTH,
      height: COLLAPSED_HEIGHT,
      x,
      y,
      resizable: false,
      decorations: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focus: false,
    });
  }, []);

  return { toggle };
}
