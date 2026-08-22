import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { cmd } from '../commands';
import { clearImageDataUrlCache } from '../imageQueue';
import { ImportBackupPreview, ImportBackupResult } from '../types';
import { formatBytes } from '../utils/format';

export type DataAction = 'directory' | 'export' | 'import' | 'duplicates' | 'clear' | null;

export interface UpdateProgress {
  percent: number;
  downloaded: number;
  total: number;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  details?: string[];
  action: () => Promise<void>;
}

/** Takes `t` as an argument rather than calling a hook: this runs outside a
 *  component, so there is no React context to read the instance from. */
function backupPreviewDetails(preview: ImportBackupPreview, t: TFunction): string[] {
  const dateRange =
    preview.oldest_clip_at && preview.newest_clip_at
      ? t('backup.clipDates', {
          from: preview.oldest_clip_at.slice(0, 10),
          to: preview.newest_clip_at.slice(0, 10),
        })
      : t('backup.clipDatesUnavailable');

  return [
    t('backup.clipCounts', {
      clips: preview.clip_count.toLocaleString(),
      images: preview.image_clip_count.toLocaleString(),
    }),
    t('backup.folderCounts', {
      folders: preview.folder_count.toLocaleString(),
      notes: preview.scratchpad_count.toLocaleString(),
    }),
    t('backup.imageFiles', {
      count: preview.image_count.toLocaleString(),
      size: formatBytes(preview.image_bytes),
    }),
    t('backup.dbSize', {
      db: formatBytes(preview.db_size),
      total: formatBytes(preview.total_uncompressed_bytes),
    }),
    t('backup.settingsRows', { count: preview.settings_count.toLocaleString() }),
    dateRange,
    t('backup.file', { path: preview.path }),
  ];
}

interface SettingsDataActionDeps {
  dataAction: DataAction;
  setDataAction: (a: DataAction) => void;
  setHistorySize: React.Dispatch<React.SetStateAction<number>>;
  refreshDashboardStats: (forceRefresh?: boolean) => Promise<void>;
  requestConfirm: (options: ConfirmOptions) => void;
  setDataDirectory: (v: string) => void;
  setImportRestartRequired: (v: boolean) => void;
}

/**
 * Data/backup actions for the Settings panel: app update, data directory,
 * clear history, dedupe, export/import backup, and DB integrity check.
 * Extracted from SettingsPanel so the panel stays a thin orchestrator.
 */
export function useSettingsDataActions({
  dataAction,
  setDataAction,
  setHistorySize,
  refreshDashboardStats,
  requestConfirm,
  setDataDirectory,
  setImportRestartRequired,
}: SettingsDataActionDeps) {
  const { t } = useTranslation();
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);

  const handleCheckUpdate = async () => {
    const loadingToast = toast.loading(t('update.checking'));
    try {
      const update = await check();
      toast.dismiss(loadingToast);

      if (update && update.available) {
        toast.info(t('update.available', { version: update.version }), {
          duration: 10000,
          action: {
            label: t('update.downloadAndRestart'),
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
                toast.success(t('update.installed'));
                await relaunch();
              } catch (e) {
                setUpdateProgress(null);
                toast.error(t('update.failed', { error: String(e) }));
              }
            },
          },
        });
      } else {
        toast.success(t('update.upToDate'));
      }
    } catch (e) {
      toast.dismiss(loadingToast);
      toast.error(t('update.checkFailed', { error: String(e) }));
    }
  };

  const handleSelectDataDirectory = async () => {
    if (dataAction) return;
    setDataAction('directory');
    const loadingToast = toast.loading(t('backup.preparingDir'));
    try {
      const selectedPath = await cmd.pickFolder();
      if (selectedPath) {
        await cmd.setDataDirectory(selectedPath);
        setDataDirectory(selectedPath);
        toast.success(t('backup.dirChanged'), {
          duration: 5000,
        });
      }
    } catch (e) {
      console.error('Failed to select data directory:', e);
      toast.error(t('backup.selectFolderFailed', { error: String(e) }));
    } finally {
      toast.dismiss(loadingToast);
      setDataAction(null);
    }
  };

  const confirmClearHistory = () => {
    requestConfirm({
      title: t('backup.clearHistoryTitle'),
      message: t('backup.clearHistoryMessage'),
      confirmText: t('backup.clearHistoryTitle'),
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
          toast.success(t('backup.historyCleared'));
        } catch (error) {
          console.error('Failed to clear history:', error);
          toast.error(t('backup.clearHistoryFailed', { error: String(error) }));
        } finally {
          setDataAction(null);
        }
      },
    });
  };

  const handleRemoveDuplicates = async () => {
    requestConfirm({
      title: t('backup.dedupeTitle'),
      message: t('backup.dedupeMessage'),
      confirmText: t('backup.dedupeTitle'),
      variant: 'warning',
      details: [t('backup.dedupeDetail')],
      action: async () => {
        if (dataAction) return;
        setDataAction('duplicates');
        try {
          const count = await cmd.removeDuplicateClips();
          clearImageDataUrlCache();
          toast.success(t('backup.dedupeDone', { count }));
          const newSize = await cmd.getClipboardHistorySize();
          setHistorySize(newSize);
          await refreshDashboardStats(true);
        } catch (error) {
          console.error(error);
          toast.error(t('backup.dedupeFailed', { error: String(error) }));
        } finally {
          setDataAction(null);
        }
      },
    });
  };

  const handleExportBackup = async () => {
    if (dataAction) return;
    setDataAction('export');
    const loadingToast = toast.loading(t('backup.exporting'));
    try {
      const path = await cmd.exportData();
      toast.success(t('backup.exported', { path }));
    } catch (error) {
      if (String(error) !== 'Export cancelled') {
        toast.error(t('backup.exportFailed', { error: String(error) }));
      }
    } finally {
      toast.dismiss(loadingToast);
      setDataAction(null);
    }
  };

  const handleCheckDbIntegrity = async () => {
    const loadingToast = toast.loading(t('backup.integrityChecking'));
    try {
      const result = await cmd.checkDbIntegrity();
      if (result === 'ok') {
        toast.success(t('backup.integrityOk'));
      } else {
        toast.error(t('backup.integrityIssue', { result }));
      }
    } catch (error) {
      toast.error(t('backup.integrityFailed', { error: String(error) }));
    } finally {
      toast.dismiss(loadingToast);
    }
  };

  const handleImportBackup = async (onResult?: (result: ImportBackupResult) => void) => {
    if (dataAction) return;
    setDataAction('import');
    const previewToast = toast.loading(t('backup.reading'));
    let preview: ImportBackupPreview;
    try {
      preview = await cmd.previewImportBackup();
    } catch (error) {
      const message = String(error);
      if (message === 'Import cancelled') {
        onResult?.({ status: 'cancelled' });
      } else {
        onResult?.({ status: 'error', error: message });
        toast.error(t('backup.previewFailed', { error: message }));
      }
      return;
    } finally {
      toast.dismiss(previewToast);
      setDataAction(null);
    }

    requestConfirm({
      title: t('backup.importTitle'),
      message: t('backup.importMessage'),
      confirmText: t('backup.importTitle'),
      variant: 'warning',
      details: [...backupPreviewDetails(preview, t), t('backup.importRestartHint')],
      action: async () => {
        if (dataAction) return;
        setDataAction('import');
        const loadingToast = toast.loading(t('backup.importing'));
        try {
          await cmd.importData(preview.path);
          clearImageDataUrlCache();
          setImportRestartRequired(true);
          onResult?.({ status: 'success' });
          toast.success(t('backup.imported'), {
            duration: 10000,
            action: {
              label: t('backup.restart'),
              onClick: () =>
                relaunch().catch((error) =>
                  toast.error(t('backup.restartFailed', { error: String(error) }))
                ),
            },
          });
        } catch (error) {
          const message = String(error);
          if (message === 'Import cancelled') {
            onResult?.({ status: 'cancelled' });
          } else {
            onResult?.({ status: 'error', error: message });
            toast.error(t('backup.importFailed', { error: message }));
          }
        } finally {
          toast.dismiss(loadingToast);
          setDataAction(null);
        }
      },
    });
  };

  return {
    updateProgress,
    handleCheckUpdate,
    handleSelectDataDirectory,
    confirmClearHistory,
    handleRemoveDuplicates,
    handleExportBackup,
    handleCheckDbIntegrity,
    handleImportBackup,
  };
}
