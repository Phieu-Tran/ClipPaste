import ReactDOM from 'react-dom/client';
import { lazy, Suspense } from 'react';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { attachConsole } from '@tauri-apps/plugin-log';
import { installErrorLogging } from './errorLog';
import './index.css';
import './i18n';

// Lazy-load the secondary windows so the main clipboard window doesn't ship the
// Settings/Scratchpad code (LibraryTab, BackupTab, charts, …) in its chunk.
const SettingsWindow = lazy(() =>
  import('./windows/SettingsWindow').then((m) => ({ default: m.SettingsWindow }))
);
const ScratchpadWindow = lazy(() =>
  import('./windows/ScratchpadWindow').then((m) => ({ default: m.ScratchpadWindow }))
);

installErrorLogging();
attachConsole().catch((err) => console.error('[ClipPaste] Failed to attach Tauri console:', err));

// WebView2 treats Ctrl+F as a browser accelerator and opens its native find bar.
// That bar lives outside the document, so the Tauri window starts reporting
// itself as unfocused and the global hotkey stops toggling it. App.tsx turns
// Ctrl+F into the in-app search; Settings and Scratchpad have no use for it.
// Kill the accelerator here, for every window, before React mounts — without
// stopPropagation so App's own handler still sees the key.
window.addEventListener(
  'keydown',
  (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
    }
  },
  true
);

const urlParams = new URLSearchParams(window.location.search);
const windowType = urlParams.get('window');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <Suspense fallback={null}>
      {windowType === 'settings' ? (
        <SettingsWindow />
      ) : windowType === 'scratchpad' ? (
        <ScratchpadWindow />
      ) : (
        <App />
      )}
    </Suspense>
  </ErrorBoundary>
);
