import { useState } from 'react';
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

function backupPreviewDetails(preview: ImportBackupPreview): string[] {
  const dateRange =
    preview.oldest_clip_at && preview.newest_clip_at
      ? `Clip dates: ${preview.oldest_clip_at.slice(0, 10)} to ${preview.newest_clip_at.slice(0, 10)}.`
      : 'Clip dates: not available.';

  return [
    `${preview.clip_count.toLocaleString()} clips (${preview.image_clip_count.toLocaleString()} image clips).`,
    `${preview.folder_count.toLocaleString()} folders, ${preview.scratchpad_count.toLocaleString()} scratchpad notes.`,
    `${preview.image_count.toLocaleString()} image files, ${formatBytes(preview.image_bytes)}.`,
    `Database: ${formatBytes(preview.db_size)}. Total extracted size: ${formatBytes(preview.total_uncompressed_bytes)}.`,
    `${preview.settings_count.toLocaleString()} settings rows.`,
    dateRange,
    `Backup file: ${preview.path}`,
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
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);

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
    if (dataAction) return;
    setDataAction('import');
    const previewToast = toast.loading('Reading backup...');
    let preview: ImportBackupPreview;
    try {
      preview = await cmd.previewImportBackup();
    } catch (error) {
      const message = String(error);
      if (message === 'Import cancelled') {
        onResult?.({ status: 'cancelled' });
      } else {
        onResult?.({ status: 'error', error: message });
        toast.error(`Import preview failed: ${message}`);
      }
      return;
    } finally {
      toast.dismiss(previewToast);
      setDataAction(null);
    }

    requestConfirm({
      title: 'Import Backup',
      message:
        'Importing this backup replaces the current database and image folder for this data directory. Create an export first if you need a rollback point.',
      confirmText: 'Import Backup',
      variant: 'warning',
      details: [
        ...backupPreviewDetails(preview),
        'Restart ClipPaste after import so every window reads the imported data.',
      ],
      action: async () => {
        if (dataAction) return;
        setDataAction('import');
        const loadingToast = toast.loading('Importing backup...');
        try {
          await cmd.importData(preview.path);
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
