import { Settings, DashboardStats, ImageCleanupPreview } from '../../types';
import { useState } from 'react';
import {
  X,
  Trash2,
  Plus,
  FolderOpen,
  Crosshair,
  ImageOff,
  HardDrive,
  Database,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { cmd } from '../../commands';

interface GeneralTabProps {
  settings: Settings;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  handleThemeChange: (newTheme: string) => void;
  // Hotkey
  isRecordingMode: boolean;
  shortcut: string[];
  savedShortcut: string[];
  formatHotkey: (keys: string[]) => string;
  handleStartRecording: () => void;
  handleSaveHotkey: () => void;
  handleCancelRecording: () => void;
  // Ignored apps
  ignoredApps: string[];
  setIgnoredApps: React.Dispatch<React.SetStateAction<string[]>>;
  newIgnoredApp: string;
  setNewIgnoredApp: (v: string) => void;
  // Data directory
  dataDirectory: string;
  handleSelectDataDirectory: () => void;
  dashStats: DashboardStats | null;
  refreshDashboardStats: () => Promise<void>;
  requestConfirm: (options: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
    details?: string[];
    action: () => Promise<void>;
  }) => void;
  // History
  setHistorySize: React.Dispatch<React.SetStateAction<number>>;
  confirmClearHistory: () => void;
  handleRemoveDuplicates: () => Promise<void>;
  handleExportBackup: () => Promise<void>;
  handleImportBackup: () => Promise<void>;
  dataAction: 'directory' | 'export' | 'import' | 'duplicates' | 'clear' | null;
  // Update
  updateProgress: { percent: number; downloaded: number; total: number } | null;
  handleCheckUpdate: () => void;
  // App version
  appVersion: string;
}

const IMAGE_DELETE_DAY_OPTIONS = [7, 14, 30, 60, 90, 180, 365];
const CLIP_DELETE_DAY_OPTIONS = [0, 7, 14, 30, 60, 90, 180, 365];
const MAX_ITEM_OPTIONS = [0, 500, 1000, 2000, 5000, 10000];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function GeneralTab({
  settings,
  updateSetting,
  handleThemeChange,
  isRecordingMode,
  shortcut,
  savedShortcut,
  formatHotkey,
  handleStartRecording,
  handleSaveHotkey,
  handleCancelRecording,
  ignoredApps,
  setIgnoredApps,
  newIgnoredApp,
  setNewIgnoredApp,
  dataDirectory,
  handleSelectDataDirectory,
  dashStats,
  refreshDashboardStats,
  requestConfirm,
  setHistorySize,
  confirmClearHistory,
  handleRemoveDuplicates,
  handleExportBackup,
  handleImportBackup,
  dataAction,
}: GeneralTabProps) {
  const [cleanupPreview, setCleanupPreview] = useState<ImageCleanupPreview | null>(null);
  const [cleanupPreviewLoading, setCleanupPreviewLoading] = useState(false);
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const [reclassifyRunning, setReclassifyRunning] = useState(false);
  const [reclassifyStage, setReclassifyStage] = useState<'subtypes' | 'sensitive' | null>(null);

  const handleAddIgnoredApp = async () => {
    if (!newIgnoredApp.trim()) return;
    try {
      await cmd.addIgnoredApp(newIgnoredApp.trim());
      setIgnoredApps((prev) => [...prev, newIgnoredApp.trim()].sort());
      setNewIgnoredApp('');
      toast.success(`Added ${newIgnoredApp.trim()} to ignored apps`);
    } catch (e) {
      toast.error(`Failed to add ignored app: ${e}`);
      console.error(e);
    }
  };

  // Target mode: countdown that captures whichever app is focused when it expires.
  const [targetCountdown, setTargetCountdown] = useState<number | null>(null);

  const handleTargetApp = async () => {
    if (targetCountdown !== null) return;
    const DELAY_SEC = 4;
    setTargetCountdown(DELAY_SEC);
    toast.info(`Switch to the app you want to block — capturing in ${DELAY_SEC}s`);

    const tick = setInterval(() => {
      setTargetCountdown((v) => (v !== null && v > 1 ? v - 1 : v));
    }, 1000);

    try {
      const picked = await cmd.pickForegroundApp(DELAY_SEC * 1000);
      // Prefer exe name (what the ignore check compares against). Fall back to display name.
      const target = picked.exe_name || picked.app_name || '';
      if (!target || target.toLowerCase().includes('clippaste')) {
        toast.error(
          'Could not capture a different app — try again and switch to the target app before the countdown ends.'
        );
      } else {
        setNewIgnoredApp(target);
        toast.success(`Captured: ${target} — click + to block`);
      }
    } catch (e) {
      toast.error(`Failed to capture app: ${e}`);
    } finally {
      clearInterval(tick);
      setTargetCountdown(null);
    }
  };

  const handleBrowseFile = async () => {
    try {
      const path = await cmd.pickFile();
      const filename = path.split('\\').pop() || path;
      setNewIgnoredApp(filename);
    } catch (e) {
      console.log('File picker cancelled or failed', e);
    }
  };

  const handleReclassifyClips = async () => {
    if (reclassifyRunning) return;
    setReclassifyRunning(true);
    try {
      setReclassifyStage('subtypes');
      const subtypeUpdated = await cmd.rescanSubtypes();
      setReclassifyStage('sensitive');
      const sensitiveUpdated = await cmd.rescanSensitive();
      await refreshDashboardStats();
      toast.success(
        `Reclassified ${subtypeUpdated.toLocaleString()} clips; updated ${sensitiveUpdated.toLocaleString()} sensitive flags`
      );
    } catch (error) {
      console.error(error);
      toast.error(`Failed to reclassify clips: ${error}`);
    } finally {
      setReclassifyStage(null);
      setReclassifyRunning(false);
    }
  };

  const previewOldImages = async () => {
    const days = Math.max(1, settings.image_delete_days || 14);
    setCleanupPreviewLoading(true);
    try {
      const preview = await cmd.previewOldImageCleanup(days);
      setCleanupPreview(preview);
    } catch (error) {
      console.error(error);
      toast.error(`Failed to preview old images: ${error}`);
    } finally {
      setCleanupPreviewLoading(false);
    }
  };

  const handleCleanupOldImages = async () => {
    const days = cleanupPreview?.days || Math.max(1, settings.image_delete_days || 14);
    const count = cleanupPreview?.count ?? 0;
    const reclaimable = cleanupPreview ? formatBytes(cleanupPreview.bytes) : 'unknown size';

    requestConfirm({
      title: 'Delete Old Images',
      message: `Delete ${count.toLocaleString()} unpinned image clips older than ${days} days?`,
      confirmText: 'Delete Images',
      variant: 'danger',
      details: [
        `${reclaimable} estimated reclaimable storage.`,
        `${(cleanupPreview?.protected_count ?? 0).toLocaleString()} old image clips are protected because they are pinned or in folders.`,
      ],
      action: async () => {
        try {
          setCleanupRunning(true);
          const deleted = await cmd.cleanupOldImageClips(days);
          toast.success(
            deleted === 1 ? 'Deleted 1 old image clip' : `Deleted ${deleted} old image clips`
          );
          const newSize = await cmd.getClipboardHistorySize();
          setHistorySize(newSize);
          setCleanupPreview(null);
          await refreshDashboardStats();
        } catch (error) {
          console.error(error);
          toast.error(`Failed to clean old images: ${error}`);
        } finally {
          setCleanupRunning(false);
        }
      },
    });
  };

  const handleRemoveIgnoredApp = async (app: string) => {
    try {
      await cmd.removeIgnoredApp(app);
      setIgnoredApps((prev) => prev.filter((a) => a !== app));
      toast.success(`Removed ${app} from ignored apps`);
    } catch (e) {
      toast.error(`Failed to remove ignored app: ${e}`);
      console.error(e);
    }
  };

  return (
    <>
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground">Appearance & Behavior</h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm font-medium">Theme</span>
            </label>
            <select
              value={settings.theme}
              onChange={(e) => handleThemeChange(e.target.value)}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="text-sm font-medium">Window Effect</span>
            </label>
            <select
              value={settings.mica_effect || 'clear'}
              onChange={(e) => updateSetting('mica_effect', e.target.value)}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="mica_alt">Mica Alt</option>
              <option value="mica">Mica</option>
              <option value="acrylic">Acrylic</option>
              <option value="blur">Blur</option>
              <option value="clear">Clear</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border bg-accent/20 p-3">
          <div>
            <span className="text-sm font-medium">Startup with Windows</span>
            <p className="text-xs text-muted-foreground">Automatically start when Windows boots</p>
          </div>
          <button
            onClick={() => updateSetting('startup_with_windows', !settings.startup_with_windows)}
            className={`h-6 w-11 rounded-full transition-colors ${settings.startup_with_windows ? 'bg-primary' : 'bg-accent'}`}
          >
            <div
              className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${settings.startup_with_windows ? 'translate-x-5' : 'translate-x-0.5'}`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border bg-accent/20 p-3">
          <div>
            <span className="text-sm font-medium">Auto Paste</span>
            <p className="text-xs text-muted-foreground">
              Automatically paste when selecting a clip
            </p>
          </div>
          <button
            onClick={() => updateSetting('auto_paste', !settings.auto_paste)}
            className={`h-6 w-11 rounded-full transition-colors ${settings.auto_paste ? 'bg-primary' : 'bg-accent'}`}
          >
            <div
              className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${settings.auto_paste ? 'translate-x-5' : 'translate-x-0.5'}`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border bg-accent/20 p-3">
          <div>
            <span className="text-sm font-medium">Ignore Ghost Clips</span>
            <p className="text-xs text-muted-foreground">
              Ignore content from unknown background apps
            </p>
          </div>
          <button
            onClick={() => updateSetting('ignore_ghost_clips', !settings.ignore_ghost_clips)}
            className={`h-6 w-11 rounded-full transition-colors ${settings.ignore_ghost_clips ? 'bg-primary' : 'bg-accent'}`}
          >
            <div
              className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${settings.ignore_ghost_clips ? 'translate-x-5' : 'translate-x-0.5'}`}
            />
          </button>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground">Shortcuts</h3>
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium">Global Hotkey</span>
            <p className="text-xs text-muted-foreground">Toggle the clipboard window</p>
          </label>
          {isRecordingMode ? (
            <div className="space-y-2">
              <div className="flex w-full items-center gap-2 rounded-lg border border-primary bg-input px-3 py-2 text-sm ring-2 ring-primary">
                <span className="animate-pulse text-primary">
                  {shortcut.length > 0
                    ? formatHotkey(shortcut)
                    : savedShortcut.length > 0
                      ? formatHotkey(savedShortcut)
                      : 'Press keys...'}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveHotkey}
                  disabled={savedShortcut.length === 0}
                  className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={handleCancelRecording}
                  className="rounded bg-muted px-3 py-1 text-xs text-muted-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleStartRecording}
              className="flex w-full items-center gap-2 rounded-lg border border-border bg-input px-3 py-2 text-sm transition-colors hover:border-primary"
            >
              <span className="rounded bg-accent px-2 py-0.5 font-mono text-xs font-medium">
                {settings.hotkey}
              </span>
            </button>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground">Privacy Exceptions</h3>
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium">Ignored Applications</span>
            <p className="text-xs text-muted-foreground">
              Prevent recording from specific apps (filename or path).
            </p>
          </label>

          <div className="flex gap-2">
            <input
              type="text"
              value={newIgnoredApp}
              onChange={(e) => setNewIgnoredApp(e.target.value)}
              placeholder="e.g. notepad.exe"
              className="flex-1 rounded-lg border border-border bg-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              onKeyDown={(e) => e.key === 'Enter' && handleAddIgnoredApp()}
            />
            <button
              onClick={handleTargetApp}
              disabled={targetCountdown !== null}
              className="btn btn-secondary px-3"
              title="Target a running app — switch to it within the countdown"
            >
              {targetCountdown !== null ? (
                <span className="text-xs font-semibold">{targetCountdown}s</span>
              ) : (
                <Crosshair size={16} />
              )}
            </button>
            <button
              onClick={handleBrowseFile}
              className="btn btn-secondary px-3"
              title="Browse executable"
            >
              <FolderOpen size={16} />
            </button>
            <button
              onClick={handleAddIgnoredApp}
              disabled={!newIgnoredApp.trim()}
              className="btn btn-secondary px-3"
              title="Add to list"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
            {ignoredApps.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-center">
                <p className="text-xs text-muted-foreground">No ignored applications</p>
              </div>
            ) : (
              ignoredApps.map((app) => (
                <div
                  key={app}
                  className="group flex items-center justify-between rounded-md border border-transparent bg-accent/30 px-3 py-2 text-sm hover:border-border hover:bg-accent/50"
                >
                  <span className="font-mono text-xs">{app}</span>
                  <button
                    onClick={() => handleRemoveIgnoredApp(app)}
                    className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground">Storage & Retention</h3>
        {dashStats && (
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-lg border border-border bg-card/50 p-3">
              <Database size={14} className="mb-1 text-indigo-400" />
              <div className="text-sm font-semibold">{dashStats.total.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground">Clips</div>
            </div>
            <div className="rounded-lg border border-border bg-card/50 p-3">
              <ImageOff size={14} className="mb-1 text-cyan-400" />
              <div className="text-sm font-semibold">{dashStats.images.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground">Images</div>
            </div>
            <div className="rounded-lg border border-border bg-card/50 p-3">
              <HardDrive size={14} className="mb-1 text-emerald-400" />
              <div className="text-sm font-semibold">{formatBytes(dashStats.db_size)}</div>
              <div className="text-[10px] text-muted-foreground">Database</div>
            </div>
            <div className="rounded-lg border border-border bg-card/50 p-3">
              <FolderOpen size={14} className="mb-1 text-amber-400" />
              <div className="text-sm font-semibold">{formatBytes(dashStats.images_size)}</div>
              <div className="text-[10px] text-muted-foreground">Image files</div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium">Data Directory</span>
            <p className="text-xs text-muted-foreground">
              Choose where to store the database and image files.
            </p>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={dataDirectory}
              readOnly
              className="flex-1 rounded-lg border border-border bg-input px-3 py-2 text-sm text-muted-foreground focus:outline-none"
              placeholder="Default location"
            />
            <button
              onClick={handleSelectDataDirectory}
              disabled={!!dataAction}
              className="btn btn-secondary px-4"
              title="Choose folder"
            >
              <FolderOpen size={16} className="mr-2" />
              {dataAction === 'directory' ? 'Preparing...' : 'Choose Folder'}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Current: {dataDirectory || 'Default location'}
          </p>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-card/30 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Max Clips</span>
            <select
              value={MAX_ITEM_OPTIONS.includes(settings.max_items) ? settings.max_items : 'custom'}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'custom') updateSetting('max_items', 1000);
                else updateSetting('max_items', parseInt(v));
              }}
              className="rounded-lg border border-border bg-input px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              style={{ colorScheme: 'dark' }}
            >
              <option value={0}>Unlimited</option>
              <option value={500}>500</option>
              <option value={1000}>1,000</option>
              <option value={2000}>2,000</option>
              <option value={5000}>5,000</option>
              <option value={10000}>10,000</option>
              <option value="custom">Custom...</option>
            </select>
          </div>
          {!MAX_ITEM_OPTIONS.includes(settings.max_items) && (
            <div className="flex items-center justify-end gap-2">
              <input
                type="number"
                min={10}
                max={100000}
                value={settings.max_items}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  if (v >= 10) updateSetting('max_items', v);
                }}
                className="w-28 rounded-lg border border-border bg-input px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Enter number"
              />
              <span className="text-xs text-muted-foreground">clips</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Auto-delete clips after</span>
            <select
              value={
                CLIP_DELETE_DAY_OPTIONS.includes(settings.auto_delete_days)
                  ? settings.auto_delete_days
                  : 'custom'
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'custom') updateSetting('auto_delete_days', 30);
                else updateSetting('auto_delete_days', parseInt(v));
              }}
              className="rounded-lg border border-border bg-input px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              style={{ colorScheme: 'dark' }}
            >
              <option value={0}>Never</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
              <option value={180}>6 months</option>
              <option value={365}>1 year</option>
              <option value="custom">Custom...</option>
            </select>
          </div>
          {!CLIP_DELETE_DAY_OPTIONS.includes(settings.auto_delete_days) && (
            <div className="flex items-center justify-end gap-2">
              <input
                type="number"
                min={1}
                max={3650}
                value={settings.auto_delete_days}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  if (v >= 1) updateSetting('auto_delete_days', v);
                }}
                className="w-28 rounded-lg border border-border bg-input px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Enter days"
              />
              <span className="text-xs text-muted-foreground">days</span>
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-card/30 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Auto-delete image clips</span>
            <button
              onClick={() => updateSetting('image_auto_delete', !settings.image_auto_delete)}
              className={`h-6 w-11 rounded-full transition-colors ${
                settings.image_auto_delete ? 'bg-primary' : 'bg-accent'
              }`}
              aria-label="Toggle image auto-delete"
            >
              <span
                className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  settings.image_auto_delete ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Delete images older than</span>
            <select
              value={
                IMAGE_DELETE_DAY_OPTIONS.includes(settings.image_delete_days)
                  ? settings.image_delete_days
                  : 'custom'
              }
              onChange={(e) => {
                const v = e.target.value;
                setCleanupPreview(null);
                if (v === 'custom') updateSetting('image_delete_days', 14);
                else updateSetting('image_delete_days', parseInt(v));
              }}
              className="rounded-lg border border-border bg-input px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              style={{ colorScheme: 'dark' }}
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
              <option value={180}>6 months</option>
              <option value={365}>1 year</option>
              <option value="custom">Custom...</option>
            </select>
          </div>
          {!IMAGE_DELETE_DAY_OPTIONS.includes(settings.image_delete_days) && (
            <div className="flex items-center justify-end gap-2">
              <input
                type="number"
                min={1}
                max={3650}
                value={settings.image_delete_days}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  if (v >= 1) updateSetting('image_delete_days', v);
                }}
                className="w-28 rounded-lg border border-border bg-input px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Enter days"
              />
              <span className="text-xs text-muted-foreground">days</span>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Cleanup only applies to clips not in folders and not pinned.
          </p>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background/40 p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">Cleanup preview</div>
              <div className="text-xs text-muted-foreground">
                {cleanupPreview
                  ? `${cleanupPreview.count.toLocaleString()} image clips, ${formatBytes(
                      cleanupPreview.bytes
                    )} reclaimable`
                  : 'Preview what will be deleted before running cleanup.'}
              </div>
              {cleanupPreview && cleanupPreview.protected_count > 0 && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {cleanupPreview.protected_count.toLocaleString()} old image clips are kept because
                  they are pinned or in folders.
                </div>
              )}
            </div>
            <div className="flex flex-shrink-0 gap-2">
              <button
                onClick={previewOldImages}
                disabled={cleanupPreviewLoading || cleanupRunning}
                className="btn btn-secondary text-xs"
              >
                {cleanupPreviewLoading ? 'Checking...' : 'Preview'}
              </button>
              <button
                onClick={handleCleanupOldImages}
                disabled={!cleanupPreview || cleanupPreview.count === 0 || cleanupRunning}
                className="btn border border-destructive/20 bg-destructive/10 text-xs text-destructive hover:bg-destructive/20 disabled:opacity-50"
              >
                {cleanupRunning ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-medium text-red-500/80">Data Management</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={confirmClearHistory}
            disabled={!!dataAction || reclassifyRunning}
            className="btn border border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/20"
          >
            <Trash2 size={16} className="mr-2" />
            {dataAction === 'clear' ? 'Clearing...' : 'Clear History'}
          </button>

          <button
            onClick={handleRemoveDuplicates}
            disabled={!!dataAction || reclassifyRunning}
            className="btn btn-secondary text-xs disabled:opacity-50"
          >
            {dataAction === 'duplicates' ? 'Removing...' : 'Remove Duplicates'}
          </button>

          <button
            onClick={handleExportBackup}
            disabled={!!dataAction || reclassifyRunning}
            className="btn btn-secondary text-xs disabled:opacity-50"
          >
            {dataAction === 'export' ? 'Exporting...' : 'Export Backup'}
          </button>

          <button
            onClick={handleImportBackup}
            disabled={!!dataAction || reclassifyRunning}
            className="btn btn-secondary text-xs disabled:opacity-50"
          >
            {dataAction === 'import' ? 'Importing...' : 'Import Backup'}
          </button>

          <button
            onClick={handleReclassifyClips}
            disabled={!!dataAction || reclassifyRunning}
            className="btn btn-secondary text-xs disabled:opacity-50"
          >
            <RefreshCw size={14} className={`mr-2 ${reclassifyRunning ? 'animate-spin' : ''}`} />
            {reclassifyStage === 'subtypes'
              ? 'Scanning Types...'
              : reclassifyStage === 'sensitive'
                ? 'Scanning Sensitive...'
                : 'Reclassify Clips'}
          </button>
        </div>
      </section>
    </>
  );
}
