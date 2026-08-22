import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import {
  Cloud,
  RefreshCw,
  LogOut,
  Loader2,
  Check,
  AlertCircle,
  Image,
  Clock,
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Trash2,
  KeyRound,
} from 'lucide-react';
import { clsx } from 'clsx';
import { cmd } from '../../commands';
import { SyncSettings, SyncStatus } from '../../types';

const INTERVAL_OPTIONS = [
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' },
  { value: 900, label: '15 minutes' },
  { value: 1800, label: '30 minutes' },
  { value: 3600, label: '1 hour' },
];

export function SyncTab() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [settings, setSettings] = useState<SyncSettings>({
    enabled: false,
    interval_seconds: 300,
    sync_images: true,
  });
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadStatus = async () => {
    try {
      const s = await cmd.getSyncStatus();
      setStatus(s);
    } catch (e) {
      console.error('Failed to load sync status:', e);
    }
  };

  const loadSettings = async () => {
    try {
      const s = await cmd.getSyncSettings();
      setSettings(s);
    } catch (e) {
      console.error('Failed to load sync settings:', e);
    }
  };

  useEffect(() => {
    loadStatus();
    loadSettings();

    const unlisten = listen('sync-status-changed', () => {
      loadStatus();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const email = await cmd.gdriveAuthorize();
      toast.success(t('sync.connectedAs', { email }));
      await loadStatus();
    } catch (e) {
      toast.error(t('sync.connectFailed', { error: String(e) }));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await cmd.gdriveDisconnect();
      toast.success(t('sync.disconnected'));
      await loadStatus();
    } catch (e) {
      toast.error(t('sync.disconnectFailed', { error: String(e) }));
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const msg = await cmd.syncNow();
      toast.success(msg);
      await loadStatus();
    } catch (e) {
      toast.error(t('sync.syncFailed', { error: String(e) }));
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleEnabled = async (enabled: boolean) => {
    const newSettings = { ...settings, enabled };
    setSettings(newSettings);
    try {
      await cmd.saveSyncSettings(newSettings);
      toast.success(t(enabled ? 'sync.autoSyncOn' : 'sync.autoSyncOff'));
      await loadStatus();
    } catch (e) {
      toast.error(t('sync.saveFailed', { error: String(e) }));
      setSettings(settings);
    }
  };

  const handleChangeInterval = async (interval: number) => {
    const newSettings = { ...settings, interval_seconds: interval };
    setSettings(newSettings);
    try {
      await cmd.saveSyncSettings(newSettings);
    } catch (e) {
      toast.error(t('sync.saveFailed', { error: String(e) }));
      setSettings(settings);
    }
  };

  const handleToggleSyncImages = async (sync_images: boolean) => {
    const newSettings = { ...settings, sync_images };
    setSettings(newSettings);
    try {
      await cmd.saveSyncSettings(newSettings);
      toast.success(t(sync_images ? 'sync.imageSyncOn' : 'sync.imageSyncOff'));
    } catch (e) {
      toast.error(t('sync.saveFailed', { error: String(e) }));
      setSettings(settings);
    }
  };

  const isConnected = status?.connected_email != null;

  const formatLastSync = (ts: string | null) => {
    if (!ts) return t('sync.never');
    try {
      const date = new Date(ts);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      if (diff < 60000) return t('sync.justNow');
      if (diff < 3600000) return t('sync.minutesAgo', { count: Math.floor(diff / 60000) });
      if (diff < 86400000) return t('sync.hoursAgo', { count: Math.floor(diff / 3600000) });
      return date.toLocaleDateString();
    } catch {
      return ts;
    }
  };

  const formatTokenExpiry = (expiresAt: number | null | undefined) => {
    if (!expiresAt) return t('sync.unknown');
    const ms = expiresAt * 1000 - Date.now();
    if (ms <= 0) return t('sync.expired');
    if (ms < 3600000) return `${Math.max(1, Math.floor(ms / 60000))}m`;
    if (ms < 86400000) return `${Math.floor(ms / 3600000)}h`;
    return `${Math.floor(ms / 86400000)}d`;
  };

  const stateLabel =
    status?.state === 'syncing'
      ? t('sync.stateSyncing')
      : status?.state === 'error'
        ? t('sync.stateError')
        : status?.state === 'offline'
          ? t('sync.stateOffline')
          : isConnected
            ? settings.enabled
              ? t('sync.stateHealthy')
              : t('sync.stateConnected')
            : t('sync.stateDisconnected');

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">{t('sync.title')}</h3>

      {/* Google Account Section */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h4 className="mb-3 text-sm font-medium text-foreground">{t('sync.googleDrive')}</h4>
        {isConnected ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cloud size={16} className="text-green-500" />
                <span className="text-sm">{status?.connected_email}</span>
              </div>
              <button
                onClick={handleDisconnect}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
              >
                <LogOut size={14} />
                Disconnect
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-md border border-border/60 bg-background/40 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Activity size={12} />
                  Status
                </div>
                <div
                  className={clsx(
                    'text-sm font-semibold',
                    status?.state === 'error'
                      ? 'text-red-400'
                      : status?.state === 'syncing'
                        ? 'text-blue-400'
                        : 'text-green-400'
                  )}
                >
                  {stateLabel}
                </div>
              </div>
              <div className="rounded-md border border-border/60 bg-background/40 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Clock size={12} />
                  Last sync
                </div>
                <div className="text-sm font-semibold">{formatLastSync(status?.last_sync_at)}</div>
              </div>
              <div className="rounded-md border border-border/60 bg-background/40 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <RefreshCw size={12} />
                  Pending
                </div>
                <div className="text-sm font-semibold text-amber-400">
                  {(status?.pending_changes ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="rounded-md border border-border/60 bg-background/40 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <KeyRound size={12} />
                  Token
                </div>
                <div className="text-sm font-semibold">
                  {formatTokenExpiry(status?.token_expires_at)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {status?.state === 'syncing' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : status?.state === 'error' ? (
                <AlertCircle size={12} className="text-red-400" />
              ) : (
                <Check size={12} className="text-green-500" />
              )}
              <span>
                {t('sync.lastSync', { when: formatLastSync(status?.last_sync_at ?? null) })}
                {status?.state === 'syncing' && ` — ${t('sync.syncingSuffix')}`}
                {status?.state === 'error' && ` — ${status.error_message || t('sync.errorSuffix')}`}
              </span>
              {status?.pending_changes ? (
                <span className="ml-auto text-amber-400">
                  {t('sync.pending', { count: status.pending_changes })}
                </span>
              ) : null}
            </div>

            {status?.error_message && (
              <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
                {status.error_message}
              </div>
            )}

            {status?.last_report && (
              <div className="rounded-md border border-border/60 bg-background/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">
                    {t('sync.lastReport')}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatLastSync(status.last_report.completed_at)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="flex items-center gap-1.5 rounded bg-card/60 px-2 py-1.5">
                    <ArrowUpFromLine size={12} className="text-blue-400" />
                    <span>
                      {t('sync.pushed', {
                        count: status.last_report.pushed_clips + status.last_report.pushed_folders,
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded bg-card/60 px-2 py-1.5">
                    <ArrowDownToLine size={12} className="text-emerald-400" />
                    <span>
                      {status.last_report.pulled_clips + status.last_report.pulled_folders} pulled
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded bg-card/60 px-2 py-1.5">
                    <Trash2 size={12} className="text-rose-400" />
                    <span>{status.last_report.deleted} deleted</span>
                  </div>
                </div>
                <div className="mt-2 truncate text-[11px] text-muted-foreground">
                  {status.last_report.message}
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={handleConnect}
            disabled={connecting}
            className={clsx(
              'flex w-full items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm transition-colors',
              connecting ? 'cursor-not-allowed opacity-50' : 'hover:bg-accent'
            )}
          >
            {connecting ? <Loader2 size={16} className="animate-spin" /> : <Cloud size={16} />}
            {connecting ? t('sync.connecting') : t('sync.connect')}
          </button>
        )}
      </div>

      {/* Sync Settings — only show when connected */}
      {isConnected && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h4 className="mb-3 text-sm font-medium text-foreground">{t('common.settings')}</h4>
          <div className="space-y-4">
            {/* Auto-sync toggle */}
            <label className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-muted-foreground" />
                <span className="text-sm">{t('sync.autoSync')}</span>
              </div>
              <button
                onClick={() => handleToggleEnabled(!settings.enabled)}
                className={clsx(
                  'relative h-5 w-9 rounded-full transition-colors',
                  settings.enabled ? 'bg-blue-500' : 'bg-muted'
                )}
              >
                <div
                  className={clsx(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                    settings.enabled ? 'translate-x-4' : 'translate-x-0.5'
                  )}
                />
              </button>
            </label>

            {/* Interval */}
            {settings.enabled && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('sync.syncEvery')}</span>
                <select
                  value={settings.interval_seconds}
                  onChange={(e) => handleChangeInterval(Number(e.target.value))}
                  className="field field-sm"
                >
                  {INTERVAL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Sync images toggle */}
            <label className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Image size={14} className="text-muted-foreground" />
                <span className="text-sm">{t('sync.syncImages')}</span>
              </div>
              <button
                onClick={() => handleToggleSyncImages(!settings.sync_images)}
                className={clsx(
                  'relative h-5 w-9 rounded-full transition-colors',
                  settings.sync_images ? 'bg-blue-500' : 'bg-muted'
                )}
              >
                <div
                  className={clsx(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                    settings.sync_images ? 'translate-x-4' : 'translate-x-0.5'
                  )}
                />
              </button>
            </label>

            {/* Manual sync button */}
            <button
              onClick={handleSyncNow}
              disabled={syncing}
              className={clsx(
                'flex w-full items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm transition-colors',
                syncing ? 'cursor-not-allowed opacity-50' : 'hover:bg-accent'
              )}
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              {syncing ? t('sync.syncingNow') : t('sync.syncNow')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
