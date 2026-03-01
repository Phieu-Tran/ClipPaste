import ReactDOM from 'react-dom/client';
import App from './App';
import { SettingsWindow } from './windows/SettingsWindow';
import { attachConsole } from '@tauri-apps/plugin-log';
import './index.css';

attachConsole().catch((err) => console.error('[WinPaste] Failed to attach Tauri console:', err));

const urlParams = new URLSearchParams(window.location.search);
const windowType = urlParams.get('window');

ReactDOM.createRoot(document.getElementById('root')!).render(
  windowType === 'settings' ? <SettingsWindow /> : <App />
);
