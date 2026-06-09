import { useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ClipboardList,
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
import { clearImageDataUrlCache } from '../../imageQueue';
import {
  ClipCleanupPreview,
  DashboardStats,
  ImageCleanupPreview,
  ImportBackupResult,
  Settings,
} from '../../types';

type DataAction = 'directory' | 'export' | 'import' | 'duplicates' | 'clear' | null;

interface BackupTabProps {
  settings: Settings;
  dashStats: DashboardStats | null;
  dataDirectory: string;
  dataAction: DataAction;
  handleSelectDataDirectory: () => void;
  handleExportBackup: () => Promise<void>;
  handleImportBackup: (onResult?: (result: ImportBackupResult) => void) => Promise<void>;
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

type ImportNoticeTone = 'success' | 'warning' | 'danger';

interface ImportNotice {
  tone: ImportNoticeTone;
  title: string;
  message: string;
  error?: string;
}

function describeBackupImportError(error: string): string {
  const message = error.trim();
  const lower = message.toLowerCase();

  if (lower.includes('clipboard.db not found')) {
    return 'This zip is missing clipboard.db, so it does not look like a ClipPaste backup.';
  }
  if (lower.includes('too many entries')) {
    return 'This backup contains more files than ClipPaste accepts. Export a fresh ClipPaste backup and import that zip.';
  }
  if (lower.includes('duplicate entry')) {
    return 'This backup contains duplicate file paths. ClipPaste blocked it to avoid importing ambiguous data.';
  }
  if (
    lower.includes('too large') ||
    lower.includes('exceeded size limit') ||
    lower.includes('extracted data exceeded') ||
    lower.includes('size mismatch')
  ) {
    return 'This backup is too large or changed size while extracting. ClipPaste only imports normal exported backups.';
  }
  if (
    lower.includes('path escapes') ||
    lower.includes('missing parent') ||
    lower.includes('invalid backup path')
  ) {
    return 'This backup contains unsafe file paths. ClipPaste blocked the import before changing current data.';
  }
  if (lower.includes('invalid zip')) {
    return 'The selected file is not a readable zip backup.';
  }
  if (lower.includes('failed to open zip')) {
    return 'ClipPaste could not open the selected backup file.';
  }

  return message.replace(/^Invalid backup:\s*/i, '') || 'ClipPaste could not import this backup.';
}

function getImportNotice(result: ImportBackupResult): ImportNotice {
  if (result.status === 'success') {
    return {
      tone: 'success',
      title: 'Backup imported',
      message: 'Restart ClipPaste so every window reads the imported data.',
    };
  }
  if (result.status === 'cancelled') {
    return {
      tone: 'warning',
      title: 'Import cancelled',
      message: 'No backup data was changed.',
    };
  }

  return {
    tone: 'danger',
    title: 'Import blocked',
    message: describeBackupImportError(result.error),
    error: result.error,
  };
}

function getImportNoticeClass(tone: ImportNoticeTone): string {
  if (tone === 'success') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (tone === 'warning') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  return 'border-destructive/30 bg-destructive/10 text-destructive';
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
  const [imageCleanupDays, setImageCleanupDays] = useState(settings.image_delete_days || 14);
  const [imageCleanupPreview, setImageCleanupPreview] = useState<ImageCleanupPreview | null>(null);
  const [imagePreviewLoading, setImagePreviewLoading] = useState(false);
  const [imageCleanupRunning, setImageCleanupRunning] = useState(false);
  const [clipCleanupDays, setClipCleanupDays] = useState(settings.auto_delete_days || 30);
  const [clipCleanupPreview, setClipCleanupPreview] = useState<ClipCleanupPreview | null>(null);
  const [clipPreviewLoading, setClipPreviewLoading] = useState(false);
  const [clipCleanupRunning, setClipCleanupRunning] = useState(false);
  const [importResult, setImportResult] = useState<ImportBackupResult | null>(null);

  const totalStorage = dashStats ? dashStats.db_size + dashStats.images_size : 0;
  const storageWarning = totalStorage >= 500 * 1024 * 1024;
  const cleanupRunning = imageCleanupRunning || clipCleanupRunning;
  const importNotice = importResult ? getImportNotice(importResult) : null;

  const runImportBackup = () => {
    setImportResult(null);
    void handleImportBackup(setImportResult);
  };

  const previewOldImages = async () => {
    const days = Math.max(1, imageCleanupDays);
    setImagePreviewLoading(true);
    try {
      const preview = await cmd.previewOldImageCleanup(days);
      setImageCleanupPreview(preview);
    } catch (error) {
      toast.error(`Failed to preview old images: ${error}`);
    } finally {
      setImagePreviewLoading(false);
    }
  };

  const cleanupOldImages = async () => {
    const days = imageCleanupPreview?.days ?? Math.max(1, imageCleanupDays);
    const count = imageCleanupPreview?.count ?? 0;
    const bytes = imageCleanupPreview?.bytes ?? 0;

    requestConfirm({
      title: 'Delete old images',
      message: `Delete ${count.toLocaleString()} unpinned image clips older than ${days} days?`,
      confirmText: 'Delete Images',
      variant: 'danger',
      details: [
        `${formatBytes(bytes)} estimated reclaimable storage.`,
        `${(imageCleanupPreview?.protected_count ?? 0).toLocaleString()} old images are protected because they are pinned or in folders.`,
      ],
      action: async () => {
        setImageCleanupRunning(true);
        try {
          const deleted = await cmd.cleanupOldImageClips(days);
          clearImageDataUrlCache();
          const newSize = await cmd.getClipboardHistorySize();
          setHistorySize(newSize);
          setImageCleanupPreview(null);
          await refreshDashboardStats(true);
          toast.success(`Deleted ${deleted.toLocaleString()} old image clips`);
        } catch (error) {
          toast.error(`Failed to clean old images: ${error}`);
        } finally {
          setImageCleanupRunning(false);
        }
      },
    });
  };

  const previewOldClips = async () => {
    const days = Math.max(1, clipCleanupDays);
    setClipPreviewLoading(true);
    try {
      const preview = await cmd.previewOldClipCleanup(days);
      setClipCleanupPreview(preview);
    } catch (error) {
      toast.error(`Failed to preview old clips: ${error}`);
    } finally {
      setClipPreviewLoading(false);
    }
  };

  const cleanupOldClips = async () => {
    const days = clipCleanupPreview?.days ?? Math.max(1, clipCleanupDays);
    const count = clipCleanupPreview?.count ?? 0;
    const bytes = clipCleanupPreview?.bytes ?? 0;

    requestConfirm({
      title: 'Delete old clips',
      message: `Delete ${count.toLocaleString()} unpinned non-image clips older than ${days} days?`,
      confirmText: 'Delete Clips',
      variant: 'danger',
      details: [
        `${formatBytes(bytes)} estimated database payload.`,
        `${(clipCleanupPreview?.protected_count ?? 0).toLocaleString()} old clips are protected because they are pinned or in folders.`,
        'Image clips are handled by Image cleanup.',
      ],
      action: async () => {
        setClipCleanupRunning(true);
        try {
          const deleted = await cmd.cleanupOldClips(days);
          const newSize = await cmd.getClipboardHistorySize();
          setHistorySize(newSize);
          setClipCleanupPreview(null);
          await refreshDashboardStats(true);
          toast.success(`Deleted ${deleted.toLocaleString()} old clips`);
        } catch (error) {
          toast.error(`Failed to clean old clips: ${error}`);
        } finally {
          setClipCleanupRunning(false);
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
              onClick={runImportBackup}
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
          {importNotice && (
            <div
              className={`flex gap-2 rounded-md border p-2 ${getImportNoticeClass(
                importNotice.tone
              )}`}
            >
              {importNotice.tone === 'success' ? (
                <ShieldCheck size={15} className="mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-xs font-medium">{importNotice.title}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  {importNotice.message}
                </div>
                {importNotice.error && importNotice.error !== importNotice.message ? (
                  <div className="mt-1 break-words text-[11px] leading-5 opacity-80">
                    {importNotice.error}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-card/40 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ImageOff size={15} className="text-cyan-400" />
            Image cleanup
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={3650}
              value={imageCleanupDays}
              onChange={(event) => {
                setImageCleanupDays(Math.max(1, Number(event.target.value) || 1));
                setImageCleanupPreview(null);
              }}
              className="h-9 w-24 rounded-md border border-border bg-input px-2 text-sm outline-none"
            />
            <span className="text-xs text-muted-foreground">days</span>
            <button
              onClick={previewOldImages}
              disabled={imagePreviewLoading || cleanupRunning}
              className="btn btn-secondary ml-auto h-9 text-xs disabled:opacity-50"
            >
              {imagePreviewLoading ? <Loader2 size={13} className="mr-2 animate-spin" /> : null}
              Preview
            </button>
          </div>
          <div className="rounded-md border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
            {imageCleanupPreview
              ? `${imageCleanupPreview.count.toLocaleString()} images, ${formatBytes(
                  imageCleanupPreview.bytes
                )} reclaimable`
              : 'Preview old unpinned image clips.'}
            {imageCleanupPreview && imageCleanupPreview.protected_count > 0 ? (
              <div className="mt-1 text-[11px]">
                {imageCleanupPreview.protected_count.toLocaleString()} protected
              </div>
            ) : null}
          </div>
          <button
            onClick={cleanupOldImages}
            disabled={!imageCleanupPreview || imageCleanupPreview.count === 0 || cleanupRunning}
            className="btn w-full border border-destructive/20 bg-destructive/10 text-xs text-destructive hover:bg-destructive/20 disabled:opacity-50"
          >
            <ImageOff size={14} className="mr-2" />
            {imageCleanupRunning ? 'Deleting...' : 'Delete Images'}
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-border bg-card/40 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ClipboardList size={15} className="text-amber-400" />
            Clip cleanup
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={3650}
              value={clipCleanupDays}
              onChange={(event) => {
                setClipCleanupDays(Math.max(1, Number(event.target.value) || 1));
                setClipCleanupPreview(null);
              }}
              className="h-9 w-24 rounded-md border border-border bg-input px-2 text-sm outline-none"
            />
            <span className="text-xs text-muted-foreground">days</span>
            <button
              onClick={previewOldClips}
              disabled={clipPreviewLoading || cleanupRunning}
              className="btn btn-secondary ml-auto h-9 text-xs disabled:opacity-50"
            >
              {clipPreviewLoading ? <Loader2 size={13} className="mr-2 animate-spin" /> : null}
              Preview
            </button>
          </div>
          <div className="rounded-md border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
            {clipCleanupPreview
              ? `${clipCleanupPreview.count.toLocaleString()} clips, ${formatBytes(
                  clipCleanupPreview.bytes
                )} database payload`
              : 'Preview old unpinned non-image clips.'}
            {clipCleanupPreview && clipCleanupPreview.protected_count > 0 ? (
              <div className="mt-1 text-[11px]">
                {clipCleanupPreview.protected_count.toLocaleString()} protected
              </div>
            ) : null}
          </div>
          <button
            onClick={cleanupOldClips}
            disabled={!clipCleanupPreview || clipCleanupPreview.count === 0 || cleanupRunning}
            className="btn w-full border border-destructive/20 bg-destructive/10 text-xs text-destructive hover:bg-destructive/20 disabled:opacity-50"
          >
            <ClipboardList size={14} className="mr-2" />
            {clipCleanupRunning ? 'Deleting...' : 'Delete Clips'}
          </button>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-card/40 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Trash2 size={15} className="text-destructive" />
            History cleanup
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Clear all unpinned clips that are not in folders. Pinned and folder clips are kept.
          </p>
          <div className="rounded-md border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
            Use the image or clip cleanup cards for age-based cleanup before clearing the full
            unprotected history.
          </div>
          <div>
            <button
              onClick={confirmClearHistory}
              disabled={!!dataAction || cleanupRunning}
              className="btn w-full border border-destructive/20 bg-destructive/10 text-xs text-destructive hover:bg-destructive/20 disabled:opacity-50"
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
