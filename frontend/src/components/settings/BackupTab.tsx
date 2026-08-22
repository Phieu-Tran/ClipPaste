import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
import { formatBytes } from '../../utils/format';
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

type ImportNoticeTone = 'success' | 'warning' | 'danger';

interface ImportNotice {
  tone: ImportNoticeTone;
  title: string;
  message: string;
  error?: string;
}

function describeBackupImportError(error: string, t: TFunction): string {
  const message = error.trim();
  const lower = message.toLowerCase();

  if (lower.includes('clipboard.db not found')) {
    return t('importError.missingDb');
  }
  if (lower.includes('too many entries')) {
    return t('importError.tooManyEntries');
  }
  if (lower.includes('duplicate entry')) {
    return t('importError.duplicateEntry');
  }
  if (
    lower.includes('too large') ||
    lower.includes('exceeded size limit') ||
    lower.includes('extracted data exceeded') ||
    lower.includes('size mismatch')
  ) {
    return t('importError.tooLarge');
  }
  if (
    lower.includes('path escapes') ||
    lower.includes('missing parent') ||
    lower.includes('invalid backup path')
  ) {
    return t('importError.unsafePath');
  }
  if (lower.includes('invalid zip')) {
    return t('importError.invalidZip');
  }
  if (lower.includes('failed to open zip')) {
    return t('importError.openFailed');
  }

  return message.replace(/^Invalid backup:\s*/i, '') || t('importError.generic');
}

function getImportNotice(result: ImportBackupResult, t: TFunction): ImportNotice {
  if (result.status === 'success') {
    return {
      tone: 'success',
      title: t('settings.backupImported'),
      message: t('backup.importRestartHint'),
    };
  }
  if (result.status === 'cancelled') {
    return {
      tone: 'warning',
      title: t('backup.importCancelled'),
      message: t('backup.importCancelledHint'),
    };
  }

  return {
    tone: 'danger',
    title: t('backup.importBlocked'),
    message: describeBackupImportError(result.error, t),
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
  const { t } = useTranslation();
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
  const importNotice = importResult ? getImportNotice(importResult, t) : null;

  const runImportBackup = () => {
    setImportResult(null);
    void handleImportBackup(setImportResult);
  };

  const previewCleanup = async <T,>(opts: {
    days: number;
    setLoading: (v: boolean) => void;
    fetch: (days: number) => Promise<T>;
    setPreview: (p: T) => void;
    errorLabel: string;
  }) => {
    const days = Math.max(1, opts.days);
    opts.setLoading(true);
    try {
      opts.setPreview(await opts.fetch(days));
    } catch (error) {
      toast.error(
        t('backup.previewCleanupFailed', { label: opts.errorLabel, error: String(error) })
      );
    } finally {
      opts.setLoading(false);
    }
  };

  const confirmCleanup = (opts: {
    preview: ImageCleanupPreview | ClipCleanupPreview | null;
    fallbackDays: number;
    title: string;
    message: (count: string, days: number) => string;
    confirmText: string;
    details: (bytes: number, protectedCount: string) => string[];
    setRunning: (v: boolean) => void;
    execute: (days: number) => Promise<number>;
    onDeleted?: () => void;
    clearPreview: () => void;
    successLabel: string;
    errorLabel: string;
  }) => {
    const days = opts.preview?.days ?? Math.max(1, opts.fallbackDays);
    const count = opts.preview?.count ?? 0;
    const bytes = opts.preview?.bytes ?? 0;

    requestConfirm({
      title: opts.title,
      message: opts.message(count.toLocaleString(), days),
      confirmText: opts.confirmText,
      variant: 'danger',
      details: opts.details(bytes, (opts.preview?.protected_count ?? 0).toLocaleString()),
      action: async () => {
        opts.setRunning(true);
        try {
          const deleted = await opts.execute(days);
          opts.onDeleted?.();
          const newSize = await cmd.getClipboardHistorySize();
          setHistorySize(newSize);
          opts.clearPreview();
          await refreshDashboardStats(true);
          toast.success(
            t('backup.cleanupDone', { count: deleted.toLocaleString(), label: opts.successLabel })
          );
        } catch (error) {
          toast.error(t('backup.cleanupFailed', { label: opts.errorLabel, error: String(error) }));
        } finally {
          opts.setRunning(false);
        }
      },
    });
  };

  const previewOldImages = () =>
    previewCleanup({
      days: imageCleanupDays,
      setLoading: setImagePreviewLoading,
      fetch: cmd.previewOldImageCleanup,
      setPreview: setImageCleanupPreview,
      errorLabel: t('backup.oldImages'),
    });

  const cleanupOldImages = () =>
    confirmCleanup({
      preview: imageCleanupPreview,
      fallbackDays: imageCleanupDays,
      title: t('backup.deleteOldImagesTitle'),
      message: (count, days) => t('backup.deleteOldImagesMessage', { count, days }),
      confirmText: t('backup.deleteImages'),
      details: (bytes, protectedCount) => [
        t('backup.reclaimable', { size: formatBytes(bytes) }),
        t('backup.protectedImages', { count: protectedCount }),
      ],
      setRunning: setImageCleanupRunning,
      execute: cmd.cleanupOldImageClips,
      onDeleted: clearImageDataUrlCache,
      clearPreview: () => setImageCleanupPreview(null),
      successLabel: t('backup.oldImageClips'),
      errorLabel: t('backup.oldImages'),
    });

  const previewOldClips = () =>
    previewCleanup({
      days: clipCleanupDays,
      setLoading: setClipPreviewLoading,
      fetch: cmd.previewOldClipCleanup,
      setPreview: setClipCleanupPreview,
      errorLabel: t('backup.oldClips'),
    });

  const cleanupOldClips = () =>
    confirmCleanup({
      preview: clipCleanupPreview,
      fallbackDays: clipCleanupDays,
      title: t('backup.deleteOldClipsTitle'),
      message: (count, days) => t('backup.deleteOldClipsMessage', { count, days }),
      confirmText: t('backup.deleteClips'),
      details: (bytes, protectedCount) => [
        t('backup.dbPayload', { size: formatBytes(bytes) }),
        t('backup.protectedClips', { count: protectedCount }),
        t('backup.imageClipsSeparate'),
      ],
      setRunning: setClipCleanupRunning,
      execute: cmd.cleanupOldClips,
      clearPreview: () => setClipCleanupPreview(null),
      successLabel: t('backup.oldClips'),
      errorLabel: t('backup.oldClips'),
    });

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">{t('backup.title')}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t('backup.subtitle')}</p>
        </div>
        <button
          onClick={() => refreshDashboardStats(true)}
          className="icon-button"
          title={t('diagnostics.refresh')}
        >
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          icon={Database}
          label={t('backup.database')}
          value={dashStats ? formatBytes(dashStats.db_size) : '-'}
          tone="text-indigo-400"
        />
        <Metric
          icon={ImageOff}
          label={t('backup.imageFiles')}
          value={dashStats ? formatBytes(dashStats.images_size) : '-'}
          tone="text-cyan-400"
        />
        <Metric
          icon={HardDrive}
          label={t('backup.totalStorage')}
          value={dashStats ? formatBytes(totalStorage) : '-'}
          tone="text-emerald-400"
        />
        <Metric
          icon={Archive}
          label={t('backup.clips')}
          value={dashStats ? dashStats.total.toLocaleString() : '-'}
          tone="text-amber-400"
        />
      </div>

      {storageWarning && (
        <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-300" />
          <div>
            <div className="text-sm font-medium text-amber-200">{t('backup.storageWarning')}</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              {t('backup.storageWarningHint', { size: formatBytes(totalStorage) })}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card/40 p-3">
        <div className="mb-2 text-sm font-medium">{t('backup.dataDirectory')}</div>
        <div className="flex gap-2">
          <input
            value={dataDirectory}
            readOnly
            className="field min-w-0 flex-1 text-muted-foreground"
            placeholder={t('backup.defaultLocation')}
          />
          <button
            onClick={handleSelectDataDirectory}
            disabled={!!dataAction}
            className="btn btn-secondary shrink-0 px-3"
          >
            <FolderOpen size={15} className="mr-2" />
            {dataAction === 'directory' ? t('backup.preparing') : t('backup.choose')}
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-border bg-card/40 p-3">
          <div className="text-sm font-medium">{t('backup.section')}</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleExportBackup}
              disabled={!!dataAction || cleanupRunning}
              className="btn btn-secondary text-xs disabled:opacity-50"
            >
              <Archive size={15} className="mr-2" />
              {dataAction === 'export' ? t('backup.exportingShort') : t('backup.export')}
            </button>
            <button
              onClick={runImportBackup}
              disabled={!!dataAction || cleanupRunning}
              className="btn btn-secondary text-xs disabled:opacity-50"
            >
              <Upload size={15} className="mr-2" />
              {dataAction === 'import' ? t('backup.importingShort') : t('backup.import')}
            </button>
            <button
              onClick={handleCheckDbIntegrity}
              disabled={!!dataAction || cleanupRunning}
              className="btn btn-secondary text-xs disabled:opacity-50"
            >
              <ShieldCheck size={15} className="mr-2" />
              {t('backup.checkDb')}
            </button>
            <button
              onClick={handleRemoveDuplicates}
              disabled={!!dataAction || cleanupRunning}
              className="btn btn-secondary text-xs disabled:opacity-50"
            >
              <RefreshCw size={15} className="mr-2" />
              {dataAction === 'duplicates' ? t('backup.removing') : t('backup.duplicates')}
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
            {t('backup.imageCleanup')}
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
              className="field h-9 w-24 px-2"
            />
            <span className="text-xs text-muted-foreground">{t('backup.days')}</span>
            <button
              onClick={previewOldImages}
              disabled={imagePreviewLoading || cleanupRunning}
              className="btn btn-secondary ml-auto h-9 text-xs disabled:opacity-50"
            >
              {imagePreviewLoading ? <Loader2 size={13} className="mr-2 animate-spin" /> : null}
              {t('backup.preview')}
            </button>
          </div>
          <div className="rounded-md border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
            {imageCleanupPreview
              ? t('backup.imagePreviewResult', {
                  count: imageCleanupPreview.count.toLocaleString(),
                  size: formatBytes(imageCleanupPreview.bytes),
                })
              : t('backup.imagePreviewHint')}
            {imageCleanupPreview && imageCleanupPreview.protected_count > 0 ? (
              <div className="mt-1 text-[11px]">
                {t('backup.protectedCount', {
                  count: imageCleanupPreview.protected_count.toLocaleString(),
                })}
              </div>
            ) : null}
          </div>
          <button
            onClick={cleanupOldImages}
            disabled={!imageCleanupPreview || imageCleanupPreview.count === 0 || cleanupRunning}
            className="btn btn-destructive w-full text-xs disabled:opacity-50"
          >
            <ImageOff size={14} className="mr-2" />
            {imageCleanupRunning ? t('backup.deleting') : t('backup.deleteImages')}
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-border bg-card/40 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ClipboardList size={15} className="text-amber-400" />
            {t('backup.clipCleanup')}
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
              className="field h-9 w-24 px-2"
            />
            <span className="text-xs text-muted-foreground">{t('backup.days')}</span>
            <button
              onClick={previewOldClips}
              disabled={clipPreviewLoading || cleanupRunning}
              className="btn btn-secondary ml-auto h-9 text-xs disabled:opacity-50"
            >
              {clipPreviewLoading ? <Loader2 size={13} className="mr-2 animate-spin" /> : null}
              {t('backup.preview')}
            </button>
          </div>
          <div className="rounded-md border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
            {clipCleanupPreview
              ? t('backup.clipPreviewResult', {
                  count: clipCleanupPreview.count.toLocaleString(),
                  size: formatBytes(clipCleanupPreview.bytes),
                })
              : t('backup.clipPreviewHint')}
            {clipCleanupPreview && clipCleanupPreview.protected_count > 0 ? (
              <div className="mt-1 text-[11px]">
                {t('backup.protectedCount', {
                  count: clipCleanupPreview.protected_count.toLocaleString(),
                })}
              </div>
            ) : null}
          </div>
          <button
            onClick={cleanupOldClips}
            disabled={!clipCleanupPreview || clipCleanupPreview.count === 0 || cleanupRunning}
            className="btn btn-destructive w-full text-xs disabled:opacity-50"
          >
            <ClipboardList size={14} className="mr-2" />
            {clipCleanupRunning ? t('backup.deleting') : t('backup.deleteClips')}
          </button>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-card/40 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Trash2 size={15} className="text-destructive" />
            {t('backup.historyCleanup')}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {t('backup.historyCleanupHint')}
          </p>
          <div className="rounded-md border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
            {t('backup.historyCleanupNote')}
          </div>
          <div>
            <button
              onClick={confirmClearHistory}
              disabled={!!dataAction || cleanupRunning}
              className="btn btn-destructive w-full text-xs disabled:opacity-50"
            >
              <Trash2 size={14} className="mr-2" />
              {dataAction === 'clear' ? t('backup.clearing') : t('backup.clearHistoryTitle')}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
