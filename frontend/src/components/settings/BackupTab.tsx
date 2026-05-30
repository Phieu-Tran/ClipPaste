import { useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Database,
  FolderOpen,
  HardDrive,
  ImageOff,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { cmd } from '../../commands';
import { DashboardStats, ImageCleanupPreview, Settings } from '../../types';

type DataAction = 'directory' | 'export' | 'import' | 'duplicates' | 'clear' | null;

interface BackupTabProps {
  settings: Settings;
  dashStats: DashboardStats | null;
  dataDirectory: string;
  dataAction: DataAction;
  handleSelectDataDirectory: () => void;
  handleExportBackup: () => Promise<void>;
  handleImportBackup: () => Promise<void>;
  handleRemoveDuplicates: () => Promise<void>;
  confirmClearHistory: () => void;
  handleCheckDbIntegrity: () => Promise<void>;
  refreshDashboardStats: (forceRefresh?: boolean) => Promise<void>;
  setHistorySize: React.Dispatch<React.SetStateAction<number>>;
  requestConfirm: (options: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
    details?: string[];
    action: () => Promise<void>;
  }) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Database;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <Icon size={15} className={tone} />
      <div className="mt-2 truncate text-lg font-semibold tabular-nums">{value}</div>
      <div className="truncate text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

export function BackupTab({
  settings,
  dashStats,
  dataDirectory,
  dataAction,
  handleSelectDataDirectory,
  handleExportBackup,
  handleImportBackup,
  handleRemoveDuplicates,
  confirmClearHistory,
  handleCheckDbIntegrity,
  refreshDashboardStats,
  setHistorySize,
  requestConfirm,
}: BackupTabProps) {
  const [cleanupDays, setCleanupDays] = useState(settings.image_delete_days || 14);
  const [cleanupPreview, setCleanupPreview] = useState<ImageCleanupPreview | null>(null);
  const [cleanupPreviewLoading, setCleanupPreviewLoading] = useState(false);
  const [cleanupRunning, setCleanupRunning] = useState(false);

  const totalStorage = dashStats ? dashStats.db_size + dashStats.images_size : 0;
  const storageWarning = totalStorage >= 500 * 1024 * 1024;

  const previewOldImages = async () => {
    const days = Math.max(1, cleanupDays);
    setCleanupPreviewLoading(true);
    try {
      const preview = await cmd.previewOldImageCleanup(days);
      setCleanupPreview(preview);
    } catch (error) {
      toast.error(`Failed to preview old images: ${error}`);
    } finally {
      setCleanupPreviewLoading(false);
    }
  };

  const cleanupOldImages = async () => {
    const days = cleanupPreview?.days ?? Math.max(1, cleanupDays);
    const count = cleanupPreview?.count ?? 0;
    const bytes = cleanupPreview?.bytes ?? 0;

    requestConfirm({
      title: 'Delete old images',
      message: `Delete ${count.toLocaleString()} unpinned image clips older than ${days} days?`,
      confirmText: 'Delete Images',
      variant: 'danger',
      details: [
        `${formatBytes(bytes)} estimated reclaimable storage.`,
        `${(cleanupPreview?.protected_count ?? 0).toLocaleString()} old images are protected because they are pinned or in folders.`,
      ],
      action: async () => {
        setCleanupRunning(true);
        try {
          const deleted = await cmd.cleanupOldImageClips(days);
          const newSize = await cmd.getClipboardHistorySize();
          setHistorySize(newSize);
          setCleanupPreview(null);
          await refreshDashboardStats(true);
          toast.success(`Deleted ${deleted.toLocaleString()} old image clips`);
        } catch (error) {
          toast.error(`Failed to clean old images: ${error}`);
        } finally {
          setCleanupRunning(false);
        }
      },
    });
  };

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Backup & Storage</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Export, import, verify, and clean local clipboard data.
          </p>
        </div>
        <button onClick={() => refreshDashboardStats(true)} className="icon-button" title="Refresh">
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          icon={Database}
          label="Database"
          value={dashStats ? formatBytes(dashStats.db_size) : '-'}
          tone="text-indigo-400"
        />
        <Metric
          icon={ImageOff}
          label="Image files"
          value={dashStats ? formatBytes(dashStats.images_size) : '-'}
          tone="text-cyan-400"
        />
        <Metric
          icon={HardDrive}
          label="Total storage"
          value={dashStats ? formatBytes(totalStorage) : '-'}
          tone="text-emerald-400"
        />
        <Metric
          icon={Archive}
          label="Clips"
          value={dashStats ? dashStats.total.toLocaleString() : '-'}
          tone="text-amber-400"
        />
      </div>

      {storageWarning && (
        <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-300" />
          <div>
            <div className="text-sm font-medium text-amber-200">Storage is getting large</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              Current data is {formatBytes(totalStorage)}. Export a backup before cleanup.
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card/40 p-3">
        <div className="mb-2 text-sm font-medium">Data directory</div>
        <div className="flex gap-2">
          <input
            value={dataDirectory}
            readOnly
            className="min-w-0 flex-1 rounded-lg border border-border bg-input px-3 py-2 text-sm text-muted-foreground outline-none"
            placeholder="Default location"
          />
          <button
            onClick={handleSelectDataDirectory}
            disabled={!!dataAction}
            className="btn btn-secondary shrink-0 px-3"
          >
            <FolderOpen size={15} className="mr-2" />
            {dataAction === 'directory' ? 'Preparing...' : 'Choose'}
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-border bg-card/40 p-3">
          <div className="text-sm font-medium">Backup</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleExportBackup}
              disabled={!!dataAction || cleanupRunning}
              className="btn btn-secondary text-xs disabled:opacity-50"
            >
              <Archive size={15} className="mr-2" />
              {dataAction === 'export' ? 'Exporting...' : 'Export'}
            </button>
            <button
              onClick={handleImportBackup}
              disabled={!!dataAction || cleanupRunning}
              className="btn btn-secondary text-xs disabled:opacity-50"
            >
              <Upload size={15} className="mr-2" />
              {dataAction === 'import' ? 'Importing...' : 'Import'}
            </button>
            <button
              onClick={handleCheckDbIntegrity}
              disabled={!!dataAction || cleanupRunning}
              className="btn btn-secondary text-xs disabled:opacity-50"
            >
              <ShieldCheck size={15} className="mr-2" />
              Check DB
            </button>
            <button
              onClick={handleRemoveDuplicates}
              disabled={!!dataAction || cleanupRunning}
              className="btn btn-secondary text-xs disabled:opacity-50"
            >
              <RefreshCw size={15} className="mr-2" />
              {dataAction === 'duplicates' ? 'Removing...' : 'Duplicates'}
            </button>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-card/40 p-3">
          <div className="text-sm font-medium">Cleanup</div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={3650}
              value={cleanupDays}
              onChange={(event) => {
                setCleanupDays(Math.max(1, Number(event.target.value) || 1));
                setCleanupPreview(null);
              }}
              className="h-9 w-24 rounded-md border border-border bg-input px-2 text-sm outline-none"
            />
            <span className="text-xs text-muted-foreground">days</span>
            <button
              onClick={previewOldImages}
              disabled={cleanupPreviewLoading || cleanupRunning}
              className="btn btn-secondary ml-auto h-9 text-xs disabled:opacity-50"
            >
              {cleanupPreviewLoading ? <Loader2 size={13} className="mr-2 animate-spin" /> : null}
              Preview
            </button>
          </div>
          <div className="rounded-md border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
            {cleanupPreview
              ? `${cleanupPreview.count.toLocaleString()} images, ${formatBytes(
                  cleanupPreview.bytes
                )} reclaimable`
              : 'No cleanup preview loaded.'}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={cleanupOldImages}
              disabled={!cleanupPreview || cleanupPreview.count === 0 || cleanupRunning}
              className="btn border border-destructive/20 bg-destructive/10 text-xs text-destructive hover:bg-destructive/20 disabled:opacity-50"
            >
              <ImageOff size={14} className="mr-2" />
              {cleanupRunning ? 'Deleting...' : 'Delete Images'}
            </button>
            <button
              onClick={confirmClearHistory}
              disabled={!!dataAction || cleanupRunning}
              className="btn border border-destructive/20 bg-destructive/10 text-xs text-destructive hover:bg-destructive/20 disabled:opacity-50"
            >
              <Trash2 size={14} className="mr-2" />
              {dataAction === 'clear' ? 'Clearing...' : 'Clear History'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
