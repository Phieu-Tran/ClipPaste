import { SettingsPanel } from '../components/SettingsPanel';
import { LibraryTab } from '../components/settings/LibraryTab';
import type { Settings } from '../types';

const smokeSettings: Settings = {
  max_items: 500,
  auto_delete_days: 30,
  image_auto_delete: false,
  image_delete_days: 14,
  startup_with_windows: false,
  show_in_taskbar: false,
  hotkey: 'Ctrl+Alt+V',
  theme: 'system',
  auto_paste: true,
  ignore_ghost_clips: true,
};

const confirmNoop = (options: { action: () => Promise<void> }) => {
  void options;
};

export const settingsSmokeCases = [
  <SettingsPanel
    key="settings-panel"
    settings={smokeSettings}
    isMaximized={false}
    onToggleMaximize={() => {}}
    onClose={() => {}}
  />,
  <LibraryTab
    key="library-tab"
    folders={[]}
    onDataChanged={async () => {}}
    requestConfirm={confirmNoop}
  />,
];
