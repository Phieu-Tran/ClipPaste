import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';
import { cmd } from '../commands';

const EXPANDED_WIDTH = 320;
const FALLBACK_EXPANDED_HEIGHT = 540;
const EXPANDED_HEIGHT_RATIO = 0.75;
const FOCUS_SETTLE_MS = 90;

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

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

  useEffect(() => {
    const unlistenVisibilityP = listen<{ visible: boolean }>(
      'scratchpad-visibility-changed',
      (event) => {
        setIsVisible(event.payload.visible);
      }
    );
    const unlistenFocusP = clipWindow.onFocusChanged(({ payload: focused }) => {
      if (focused) refreshVisibility();
    });

    return () => {
      unlistenVisibilityP.then((fn) => fn()).catch(() => {});
      unlistenFocusP.then((fn) => fn()).catch(() => {});
    };
  }, [clipWindow, refreshVisibility]);

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

      await clipWindow.hide().catch(() => {});
      await sleep(FOCUS_SETTLE_MS);
      await cmd.capturePrevForeground();
      await cmd.focusWindow('scratchpad').catch(() => win.show());
      await win.emit('scratchpad-open');
      setIsVisible(true);
      flashFeedback('on');
      return;
    }

    let width = EXPANDED_WIDTH;
    let height = FALLBACK_EXPANDED_HEIGHT;
    let x = 0;
    let y = 120;
    try {
      const monitor = await currentMonitor();
      if (monitor) {
        const scale = monitor.scaleFactor;
        const workW = monitor.size.width / scale;
        const workH = monitor.size.height / scale;
        const workX = monitor.position.x / scale;
        const workY = monitor.position.y / scale;
        height = Math.round(workH * EXPANDED_HEIGHT_RATIO);
        x = workX + workW - width;
        y = workY + Math.round((workH - height) / 2);
      }
    } catch {}

    await clipWindow.hide().catch(() => {});
    await sleep(FOCUS_SETTLE_MS);
    await cmd.capturePrevForeground();

    const scratchpadWin = new WebviewWindow('scratchpad', {
      url: 'index.html?window=scratchpad&open=1',
      title: 'Scratchpad',
      width,
      height,
      x,
      y,
      resizable: false,
      decorations: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focus: true,
    });
    scratchpadWin.once('tauri://created', () => {
      setIsVisible(true);
      flashFeedback('on');
    });
  }, [clipWindow, flashFeedback]);

  return { toggle, isVisible, feedback };
}
