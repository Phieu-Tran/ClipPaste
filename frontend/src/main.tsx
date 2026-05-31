import ReactDOM from 'react-dom/client';
import { lazy, Suspense } from 'react';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { attachConsole } from '@tauri-apps/plugin-log';
import { installErrorLogging } from './errorLog';
import './index.css';

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
