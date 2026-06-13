import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';
import { cmd } from '../commands';

const COLLAPSED_WIDTH = 16;
const COLLAPSED_HEIGHT = 100;

export function useScratchpad() {
  const [isVisible, setIsVisible] = useState(false);
  const [feedback, setFeedback] = useState<'on' | 'off' | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clipWindow = useMemo(() => getCurrentWindow(), []);

  const flashFeedback = useCallback((next: 'on' | 'off') => {
    setFeedback(next);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), 900);
  }, []);

  const refreshVisibility = useCallback(async () => {
    const win = await WebviewWindow.getByLabel('scratchpad');
    if (!win) {
      setIsVisible(false);
      return;
    }
    setIsVisible(await win.isVisible().catch(() => false));
  }, []);

  useEffect(() => {
    refreshVisibility();
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, [refreshVisibility]);

  // Toolbar toggle: create/show the side panel, or hide it completely if it is already visible.
  const toggle = useCallback(async () => {
    const win = await WebviewWindow.getByLabel('scratchpad');
    if (win) {
      const visible = await win.isVisible().catch(() => false);
      if (visible) {
        await win.hide();
        setIsVisible(false);
        flashFeedback('off');
        return;
      }

      await cmd.capturePrevForeground();
      await cmd.focusWindow('scratchpad').catch(() => win.show());
      await win.emit('scratchpad-open');
      await clipWindow.hide().catch(() => {});
      setIsVisible(true);
      flashFeedback('on');
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

    const scratchpadWin = new WebviewWindow('scratchpad', {
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
    scratchpadWin.once('tauri://created', () => {
      clipWindow.hide().catch(() => {});
      setIsVisible(true);
      flashFeedback('on');
    });
  }, [clipWindow, flashFeedback]);

  return { toggle, isVisible, feedback };
}
