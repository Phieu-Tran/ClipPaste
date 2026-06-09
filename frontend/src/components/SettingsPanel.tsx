import { Settings, FolderItem, DashClip, DashboardStats, ImportBackupResult } from '../types';
import {
  X,
  Maximize2,
  Minimize2,
  Settings as SettingsIcon,
  Folder as FolderIcon,
  ClipboardList,
  BarChart3,
  Archive,
  Activity,
  Keyboard,
  Cloud,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useTheme } from '../hooks/useTheme';
import { emit } from '@tauri-apps/api/event';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { toast } from 'sonner';
import { ConfirmDialog } from './ConfirmDialog';
import { useShortcutRecorder } from 'use-shortcut-recorder';
import { clsx } from 'clsx';
import { cmd } from '../commands';
import { clearImageDataUrlCache } from '../imageQueue';

// Tabs are lazy-loaded so each becomes its own chunk, fetched only when opened.
const DashboardTab = lazy(() =>
  import('./settings/DashboardTab').then((m) => ({ default: m.DashboardTab }))
);
const GeneralTab = lazy(() =>
  import('./settings/GeneralTab').then((m) => ({ default: m.GeneralTab }))
);
const FoldersTab = lazy(() =>
  import('./settings/FoldersTab').then((m) => ({ default: m.FoldersTab }))
);
const HotkeysTab = lazy(() =>
  import('./settings/HotkeysTab').then((m) => ({ default: m.HotkeysTab }))
);
const SyncTab = lazy(() => import('./settings/SyncTab').then((m) => ({ default: m.SyncTab })));
const LibraryTab = lazy(() =>
  import('./settings/LibraryTab').then((m) => ({ default: m.LibraryTab }))
);
const BackupTab = lazy(() =>
  import('./settings/BackupTab').then((m) => ({ default: m.BackupTab }))
);
const DiagnosticsTab = lazy(() =>
  import('./settings/DiagnosticsTab').then((m) => ({ default: m.DiagnosticsTab }))
);

interface SettingsPanelProps {
  settings: Settings;
  isMaximized: boolean;
  onToggleMaximize: () => void;
  onClose: () => void;
}

type Tab =
  | 'dashboard'
  | 'library'
  | 'general'
  | 'folders'
  | 'backup'
  | 'diagnostics'
  | 'hotkeys'
  | 'sync';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type DataAction = 'directory' | 'export' | 'import' | 'duplicates' | 'clear' | null;

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function SettingsPanel({
  settings: initialSettings,
  isMaximized,
  onToggleMaximize,
  onClose,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [importRestartRequired, setImportRestartRequired] = useState(false);
  const [dataAction, setDataAction] = useState<DataAction>(null);
  const [_historySize, setHistorySize] = useState<number>(0);
  const [isRecordingMode, setIsRecordingMode] = useState(false);

  // Folder Management State
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Data Directory State
  const [dataDirectory, setDataDirectory] = useState<string>('');

  // Dashboard State
  const [dashStats, setDashStats] = useState<DashboardStats | null>(null);
  const [dashStatsError, setDashStatsError] = useState('');
  const [dashDate, setDashDate] = useState(toDateStr(new Date()));
  const [dashSearch, setDashSearch] = useState('');
  const [dashSourceApp, setDashSourceApp] = useState<string | null>(null);
  const [dashClips, setDashClips] = useState<DashClip[]>([]);
  const [dashClipsLoading, setDashClipsLoading] = useState(false);
  const [dashClipsHasMore, setDashClipsHasMore] = useState(false);
  const [dashClipsOffset, setDashClipsOffset] = useState(0);

  // Debounced dashboard search
  const dashSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedDashSearch, setDebouncedDashSearch] = useState('');

  // Apply theme immediately when settings.theme changes
  useTheme(settings.theme);

  // Generic handler for immediate settings updates
  const updateSettings = async (updates: Partial<Settings>) => {
    const prevSettings = settings;
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    setSaveStatus('saving');

    const hotkeyChanged =
      typeof updates.hotkey === 'string' && updates.hotkey !== prevSettings.hotkey;

    try {
      if (hotkeyChanged) {
        await cmd.registerGlobalShortcut(newSettings.hotkey);
      }

      await cmd.saveSettings(newSettings);
      await emit('settings-changed', newSettings);
    } catch (error) {
      console.error(`Failed to save settings:`, error);
      if (hotkeyChanged) {
        try {
          await cmd.registerGlobalShortcut(prevSettings.hotkey);
        } catch (rollbackError) {
          console.error('Failed to restore previous hotkey:', rollbackError);
        }
      }
      setSettings(prevSettings); // Rollback on failure
      setSaveStatus('error');
      toast.error(`Failed to save settings`);
      return; // Don't show success toast
    }

    setSaveStatus('saved');
    saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 1800);
  };

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    return updateSettings({ [key]: value });
  };

  const handleThemeChange = (newTheme: string) => {
    updateSetting('theme', newTheme);
  };

  // Use use-shortcut-recorder for recording (shows current keys held in real-time)
  const {
    shortcut,
    savedShortcut,
    startRecording: startRecordingLib,
    stopRecording: stopRecordingLib,
    clearLastRecording,
  } = useShortcutRecorder({
    minModKeys: 1, // Require at least one modifier
  });

  // Start recording mode
  const handleStartRecording = () => {
    setIsRecordingMode(true);
    startRecordingLib();
  };

  const [ignoredApps, setIgnoredApps] = useState<string[]>([]);
  const [newIgnoredApp, setNewIgnoredApp] = useState('');
  const [appVersion, setAppVersion] = useState('');

  // Confirmation Dialog State
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    variant: 'danger' as 'danger' | 'warning' | 'info',
    details: [] as string[],
    action: async () => {},
  });

  const requestConfirm = (options: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
    details?: string[];
    action: () => Promise<void>;
  }) => {
    setConfirmDialog({
      isOpen: true,
      title: options.title,
      message: options.message,
      confirmText: options.confirmText ?? 'Confirm',
      cancelText: options.cancelText ?? 'Cancel',
      variant: options.variant ?? 'danger',
      details: options.details ?? [],
      action: options.action,
    });
  };

  const loadFolders = async () => {
    try {
      const data = await cmd.getFolders();
      setFolders(data);
    } catch (error) {
      console.error('Failed to load folders:', error);
    }
  };

  const refreshDashboardStats = async (forceRefresh = false) => {
    try {
      setDashStatsError('');
      const stats = await cmd.getDashboardStats({ forceRefresh });
      setDashStats(stats);
    } catch (error) {
      console.error('Failed to load dashboard stats:', error);
      setDashStatsError(String(error));
    }
  };

  const handleLibraryDataChanged = async () => {
    await Promise.all([loadFolders(), refreshDashboardStats(true)]);
  };

  useEffect(() => {
    cmd.getClipboardHistorySize().then(setHistorySize).catch(console.error);
    cmd.getIgnoredApps().then(setIgnoredApps).catch(console.error);
    getVersion().then(setAppVersion).catch(console.error);
    loadFolders();
    cmd.getDataDirectory().then(setDataDirectory).catch(console.error);
    refreshDashboardStats();
    return () => {
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    };
  }, []);

  // Debounce dashboard search input
  useEffect(() => {
    if (dashSearchTimerRef.current) clearTimeout(dashSearchTimerRef.current);
    dashSearchTimerRef.current = setTimeout(() => {
      setDebouncedDashSearch(dashSearch);
      setDashClipsOffset(0);
    }, 200);
    return () => {
      if (dashSearchTimerRef.current) clearTimeout(dashSearchTimerRef.current);
    };
  }, [dashSearch]);

  // Reset offset when date/filter changes
  useEffect(() => {
    setDashClipsOffset(0);
  }, [dashDate, dashSourceApp]);

  // Load clips for selected date
  useEffect(() => {
    if (activeTab !== 'dashboard') return;
    setDashClipsLoading(true);
    const search = debouncedDashSearch.trim() || undefined;
    const sourceApp = dashSourceApp || undefined;
    cmd
      .getClipsByDate({
        date: dashDate,
        search,
        sourceApp,
        offset: dashClipsOffset,
      })
      .then((data) => {
        if (dashClipsOffset === 0) {
          setDashClips(data);
        } else {
          setDashClips((prev) => [...prev, ...data]);
        }
        setDashClipsHasMore(data.length === 100);
      })
      .catch(console.error)
      .finally(() => setDashClipsLoading(false));
  }, [dashDate, debouncedDashSearch, dashSourceApp, dashClipsOffset, activeTab]);

  const handleLoadMoreDashClips = () => {
    setDashClipsOffset((prev) => prev + 100);
  };

  // Format shortcut array into Tauri-compatible string
  const formatHotkey = (keys: string[]): string => {
    return keys
      .map((k) => {
        if (k === 'Control') return 'Ctrl';
        if (k === 'Alt') return 'Alt';
        if (k === 'Shift') return 'Shift';
        if (k === 'Meta') return 'Cmd';
        if (k.startsWith('Key')) return k.slice(3);
        if (k.startsWith('Digit')) return k.slice(5);
        return k;
      })
      .join('+');
  };

  const handleSaveHotkey = async () => {
    if (savedShortcut.length > 0) {
      const newHotkey = formatHotkey(savedShortcut);
      await updateSetting('hotkey', newHotkey);
    }
    stopRecordingLib();
    setIsRecordingMode(false);
  };

  const handleCancelRecording = () => {
    stopRecordingLib();
    clearLastRecording();
    setIsRecordingMode(false);
  };

  const [updateProgress, setUpdateProgress] = useState<{
    percent: number;
    downloaded: number;
    total: number;
  } | null>(null);

  const handleCheckUpdate = async () => {
    const loadingToast = toast.loading('Checking for updates...');
    try {
      const update = await check();
      toast.dismiss(loadingToast);

      if (update && update.available) {
        toast.info(`Update v${update.version} available!`, {
          duration: 10000,
          action: {
            label: 'Download & Restart',
            onClick: async () => {
              try {
                setUpdateProgress({ percent: 0, downloaded: 0, total: 0 });
                let totalBytes = 0;
                let downloadedBytes = 0;

                await update.downloadAndInstall((event) => {
                  if (event.event === 'Started' && event.data.contentLength) {
                    totalBytes = event.data.contentLength;
                    setUpdateProgress({ percent: 0, downloaded: 0, total: totalBytes });
                  } else if (event.event === 'Progress') {
                    downloadedBytes += event.data.chunkLength;
                    const percent =
                      totalBytes > 0
                        ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
                        : 0;
                    setUpdateProgress({ percent, downloaded: downloadedBytes, total: totalBytes });
                  } else if (event.event === 'Finished') {
                    setUpdateProgress({ percent: 100, downloaded: totalBytes, total: totalBytes });
                  }
                });

                setUpdateProgress(null);
                toast.success('Update installed. Restarting...');
                await relaunch();
              } catch (e) {
                setUpdateProgress(null);
                toast.error(`Update failed: ${e}`);
              }
            },
          },
        });
      } else {
        toast.success('You are on the latest version.');
      }
    } catch (e) {
      toast.dismiss(loadingToast);
      toast.error(`Check failed: ${e}`);
    }
  };

  const handleSelectDataDirectory = async () => {
    if (dataAction) return;
    setDataAction('directory');
    const loadingToast = toast.loading('Preparing data directory...');
    try {
      const selectedPath = await cmd.pickFolder();
      if (selectedPath) {
        await cmd.setDataDirectory(selectedPath);
        setDataDirectory(selectedPath);
        toast.success(
          'Data directory changed. Please restart the application for changes to take effect.',
          {
            duration: 5000,
          }
        );
      }
    } catch (e) {
      console.error('Failed to select data directory:', e);
      toast.error(`Failed to select folder: ${e}`);
    } finally {
      toast.dismiss(loadingToast);
      setDataAction(null);
    }
  };

  const confirmClearHistory = () => {
    requestConfirm({
      title: 'Clear History',
      message:
        'Are you sure you want to clear your clipboard history? This will only remove items that are not in folders. Items saved in folders will be preserved.',
      confirmText: 'Clear History',
      variant: 'danger',
      action: async () => {
        if (dataAction) return;
        setDataAction('clear');
        try {
          await cmd.clearAllClips();
          clearImageDataUrlCache();
          // Refresh the history size after clearing
          const newSize = await cmd.getClipboardHistorySize();
          setHistorySize(newSize);
          await refreshDashboardStats(true);
          toast.success('Clipboard history cleared successfully.');
        } catch (error) {
          console.error('Failed to clear history:', error);
          toast.error(`Failed to clear history: ${error}`);
        } finally {
          setDataAction(null);
        }
      },
    });
  };

  const handleRemoveDuplicates = async () => {
    requestConfirm({
      title: 'Remove Duplicates',
      message:
        'ClipPaste will keep one copy per content hash and remove duplicate unprotected clips.',
      confirmText: 'Remove Duplicates',
      variant: 'warning',
      details: ['Pinned clips and clips inside folders are preserved.'],
      action: async () => {
        if (dataAction) return;
        setDataAction('duplicates');
        try {
          const count = await cmd.removeDuplicateClips();
          clearImageDataUrlCache();
          toast.success(`Removed ${count} duplicate clips`);
          const newSize = await cmd.getClipboardHistorySize();
          setHistorySize(newSize);
          await refreshDashboardStats(true);
        } catch (error) {
          console.error(error);
          toast.error(`Failed to remove duplicates: ${error}`);
        } finally {
          setDataAction(null);
        }
      },
    });
  };

  const handleExportBackup = async () => {
    if (dataAction) return;
    setDataAction('export');
    const loadingToast = toast.loading('Exporting backup...');
    try {
      const path = await cmd.exportData();
      toast.success(`Exported to ${path}`);
    } catch (error) {
      if (String(error) !== 'Export cancelled') {
        toast.error(`Export failed: ${error}`);
      }
    } finally {
      toast.dismiss(loadingToast);
      setDataAction(null);
    }
  };

  const handleCheckDbIntegrity = async () => {
    const loadingToast = toast.loading('Checking database integrity...');
    try {
      const result = await cmd.checkDbIntegrity();
      if (result === 'ok') {
        toast.success('Database integrity: OK');
      } else {
        toast.error(`Database integrity issue: ${result}`);
      }
    } catch (error) {
      toast.error(`Integrity check failed: ${error}`);
    } finally {
      toast.dismiss(loadingToast);
    }
  };

  const handleImportBackup = async (onResult?: (result: ImportBackupResult) => void) => {
    requestConfirm({
      title: 'Import Backup',
      message:
        'Importing a backup replaces the current database and image folder for this data directory. Create an export first if you need a rollback point.',
      confirmText: 'Import Backup',
      variant: 'warning',
      details: [
        'The app will ask you to choose a backup file.',
        'Restart ClipPaste after import so every window reads the imported data.',
      ],
      action: async () => {
        if (dataAction) return;
        setDataAction('import');
        const loadingToast = toast.loading('Importing backup...');
        try {
          await cmd.importData();
          clearImageDataUrlCache();
          setImportRestartRequired(true);
          onResult?.({ status: 'success' });
          toast.success('Backup imported. Restart to apply.', {
            duration: 10000,
            action: {
              label: 'Restart',
              onClick: () => relaunch().catch((error) => toast.error(`Restart failed: ${error}`)),
            },
          });
        } catch (error) {
          const message = String(error);
          if (message === 'Import cancelled') {
            onResult?.({ status: 'cancelled' });
          } else {
            onResult?.({ status: 'error', error: message });
            toast.error(`Import failed: ${message}`);
          }
        } finally {
          toast.dismiss(loadingToast);
          setDataAction(null);
        }
      },
    });
  };

  const renderSaveStatus = () => {
    if (saveStatus === 'saving') {
      return (
        <span className="flex items-center gap-1 rounded-full border border-border bg-card px-2 py-1 text-xs text-muted-foreground">
          <Loader2 size={12} className="animate-spin" />
          Saving
        </span>
      );
    }
    if (saveStatus === 'saved') {
      return (
        <span className="flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400">
          <CheckCircle2 size={12} />
          Saved
        </span>
      );
    }
    if (saveStatus === 'error') {
      return (
        <span className="flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/10 px-2 py-1 text-xs text-destructive">
          <AlertCircle size={12} />
          Save failed
        </span>
      );
    }
    return null;
  };

  return (
    <>
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        variant={confirmDialog.variant}
        details={confirmDialog.details}
        onConfirm={async () => {
          await confirmDialog.action();
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
      <div className="flex h-full flex-col bg-background text-foreground">
        {/* Header */}
        <div
          className="drag-area flex items-center justify-between border-b border-border p-4"
          onDoubleClick={onToggleMaximize}
        >
          <h2 className="text-lg font-semibold">Settings</h2>
          <div
            className="no-drag flex items-center gap-2"
            onDoubleClick={(event) => event.stopPropagation()}
          >
            {renderSaveStatus()}
            <button
              onClick={onToggleMaximize}
              className="icon-button"
              title={isMaximized ? 'Restore' : 'Maximize'}
              aria-label={isMaximized ? 'Restore settings window' : 'Maximize settings window'}
            >
              {isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button
              onClick={onClose}
              className="icon-button"
              title="Close"
              aria-label="Close settings"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-48 flex-shrink-0 border-r border-border bg-card/50 p-2">
            <div className="flex flex-col gap-1">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={clsx(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  activeTab === 'dashboard'
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                <BarChart3 size={16} />
                Dashboard
              </button>
              <button
                onClick={() => setActiveTab('library')}
                className={clsx(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  activeTab === 'library'
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                <ClipboardList size={16} />
                Clips & Images
              </button>
              <button
                onClick={() => setActiveTab('general')}
                className={clsx(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  activeTab === 'general'
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                <SettingsIcon size={16} />
                General
              </button>
              <button
                onClick={() => setActiveTab('folders')}
                className={clsx(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  activeTab === 'folders'
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                <FolderIcon size={16} />
                Folders
              </button>
              <button
                onClick={() => setActiveTab('backup')}
                className={clsx(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  activeTab === 'backup'
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                <Archive size={16} />
                Backup
              </button>
              <button
                onClick={() => setActiveTab('diagnostics')}
                className={clsx(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  activeTab === 'diagnostics'
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                <Activity size={16} />
                Diagnostics
              </button>
              <button
                onClick={() => setActiveTab('hotkeys')}
                className={clsx(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  activeTab === 'hotkeys'
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                <Keyboard size={16} />
                Hotkeys
              </button>
              <button
                onClick={() => setActiveTab('sync')}
                className={clsx(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  activeTab === 'sync'
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                <Cloud size={16} />
                Sync
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6">
            <div
              className={clsx(
                'mx-auto space-y-8',
                activeTab === 'library' ||
                  activeTab === 'folders' ||
                  activeTab === 'backup' ||
                  activeTab === 'diagnostics'
                  ? 'max-w-6xl'
                  : 'max-w-2xl'
              )}
            >
              {importRestartRequired && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-amber-300">Backup imported</div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">
                        Restart ClipPaste so every window and cache reads the imported database.
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        relaunch().catch((error) => toast.error(`Restart failed: ${error}`))
                      }
                      className="btn btn-secondary flex-shrink-0 text-xs"
                    >
                      Restart Now
                    </button>
                  </div>
                </div>
              )}

              <Suspense
                fallback={
                  <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
                }
              >
                {activeTab === 'dashboard' && (
                  <DashboardTab
                    dashStats={dashStats}
                    dashStatsError={dashStatsError}
                    dashDate={dashDate}
                    setDashDate={setDashDate}
                    dashSearch={dashSearch}
                    setDashSearch={setDashSearch}
                    dashSourceApp={dashSourceApp}
                    setDashSourceApp={setDashSourceApp}
                    dashClips={dashClips}
                    dashClipsLoading={dashClipsLoading}
                    dashClipsHasMore={dashClipsHasMore}
                    onLoadMoreDashClips={handleLoadMoreDashClips}
                    onOpenStorageSettings={() => setActiveTab('general')}
                    onExportBackup={handleExportBackup}
                    onRemoveDuplicates={handleRemoveDuplicates}
                    onRefreshStats={() => refreshDashboardStats(true)}
                    onCheckDbIntegrity={handleCheckDbIntegrity}
                  />
                )}

                {activeTab === 'library' && (
                  <LibraryTab
                    folders={folders}
                    onDataChanged={handleLibraryDataChanged}
                    requestConfirm={requestConfirm}
                  />
                )}

                {activeTab === 'general' && (
                  <GeneralTab
                    settings={settings}
                    updateSetting={updateSetting}
                    handleThemeChange={handleThemeChange}
                    isRecordingMode={isRecordingMode}
                    shortcut={shortcut}
                    savedShortcut={savedShortcut}
                    formatHotkey={formatHotkey}
                    handleStartRecording={handleStartRecording}
                    handleSaveHotkey={handleSaveHotkey}
                    handleCancelRecording={handleCancelRecording}
                    ignoredApps={ignoredApps}
                    setIgnoredApps={setIgnoredApps}
                    newIgnoredApp={newIgnoredApp}
                    setNewIgnoredApp={setNewIgnoredApp}
                    dataDirectory={dataDirectory}
                    handleSelectDataDirectory={handleSelectDataDirectory}
                    dashStats={dashStats}
                    refreshDashboardStats={refreshDashboardStats}
                    requestConfirm={requestConfirm}
                    setHistorySize={setHistorySize}
                    confirmClearHistory={confirmClearHistory}
                    handleRemoveDuplicates={handleRemoveDuplicates}
                    handleExportBackup={handleExportBackup}
                    handleImportBackup={handleImportBackup}
                    dataAction={dataAction}
                    updateProgress={updateProgress}
                    handleCheckUpdate={handleCheckUpdate}
                    appVersion={appVersion}
                  />
                )}

                {activeTab === 'folders' && (
                  <FoldersTab
                    folders={folders}
                    newFolderName={newFolderName}
                    setNewFolderName={setNewFolderName}
                    editingFolderId={editingFolderId}
                    setEditingFolderId={setEditingFolderId}
                    renameValue={renameValue}
                    setRenameValue={setRenameValue}
                    loadFolders={loadFolders}
                    requestConfirm={requestConfirm}
                  />
                )}

                {activeTab === 'backup' && (
                  <BackupTab
                    settings={settings}
                    dashStats={dashStats}
                    dataDirectory={dataDirectory}
                    dataAction={dataAction}
                    handleSelectDataDirectory={handleSelectDataDirectory}
                    handleExportBackup={handleExportBackup}
                    handleImportBackup={handleImportBackup}
                    handleRemoveDuplicates={handleRemoveDuplicates}
                    confirmClearHistory={confirmClearHistory}
                    handleCheckDbIntegrity={handleCheckDbIntegrity}
                    refreshDashboardStats={refreshDashboardStats}
                    setHistorySize={setHistorySize}
                    requestConfirm={requestConfirm}
                  />
                )}

                {activeTab === 'diagnostics' && <DiagnosticsTab />}

                {activeTab === 'hotkeys' && <HotkeysTab currentHotkey={settings.hotkey} />}

                {activeTab === 'sync' && <SyncTab />}
              </Suspense>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col items-center gap-1 border-t border-border bg-background px-4 py-3 text-center">
          <button
            onClick={() => openUrl('https://github.com/Phieu-Tran/ClipPaste').catch(console.error)}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            ClipPaste {appVersion || '...'}
          </button>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <span>&copy; 2026</span>
            <span>&bull;</span>
            <button
              onClick={handleCheckUpdate}
              className="underline hover:text-foreground"
              disabled={!!updateProgress}
            >
              {updateProgress ? 'Updating...' : 'Check for Updates'}
            </button>
          </div>
          {updateProgress && (
            <div className="mt-2 w-full max-w-[280px]">
              <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                <span>{updateProgress.percent}%</span>
                <span>
                  {(updateProgress.downloaded / 1024 / 1024).toFixed(1)} /{' '}
                  {(updateProgress.total / 1024 / 1024).toFixed(1)} MB
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${updateProgress.percent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
