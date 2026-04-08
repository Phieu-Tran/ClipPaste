import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
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
} from 'lucide-react';
import { clsx } from 'clsx';

interface SyncStatus {
  state: 'disabled' | 'idle' | 'syncing' | 'error' | 'offline';
  last_sync_at: string | null;
  pending_changes: number;
  error_message: string | null;
  connected_email: string | null;
}

interface SyncSettings {
  enabled: boolean;
  interval_seconds: number;
  sync_images: boolean;
}

const INTERVAL_OPTIONS = [
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' },
  { value: 900, label: '15 minutes' },
  { value: 1800, label: '30 minutes' },
  { value: 3600, label: '1 hour' },
];

export function SyncTab() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [settings, setSettings] = useState<SyncSettings>({ enabled: false, interval_seconds: 300, sync_images: true });
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadStatus = async () => {
    try {
      const s = await invoke<SyncStatus>('get_sync_status');
      setStatus(s);
    } catch (e) {
      console.error('Failed to load sync status:', e);
    }
  };

  const loadSettings = async () => {
    try {
      const s = await invoke<SyncSettings>('get_sync_settings');
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
      const email = await invoke<string>('gdrive_authorize');
      toast.success(`Connected as ${email}`);
      await loadStatus();
    } catch (e) {
      toast.error(`Failed to connect: ${e}`);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await invoke('gdrive_disconnect');
      toast.success('Google Drive disconnected');
      await loadStatus();
    } catch (e) {
      toast.error(`Failed to disconnect: ${e}`);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const msg = await invoke<string>('sync_now');
      toast.success(msg);
      await loadStatus();
    } catch (e) {
      toast.error(`Sync failed: ${e}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleEnabled = async (enabled: boolean) => {
    const newSettings = { ...settings, enabled };
    setSettings(newSettings);
    try {
      await invoke('save_sync_settings', { settings: newSettings });
      toast.success(enabled ? 'Auto-sync enabled' : 'Auto-sync disabled');
      await loadStatus();
    } catch (e) {
      toast.error(`Failed to save settings: ${e}`);
      setSettings(settings);
    }
  };

  const handleChangeInterval = async (interval: number) => {
    const newSettings = { ...settings, interval_seconds: interval };
    setSettings(newSettings);
    try {
      await invoke('save_sync_settings', { settings: newSettings });
    } catch (e) {
      toast.error(`Failed to save settings: ${e}`);
      setSettings(settings);
    }
  };

  const handleToggleSyncImages = async (sync_images: boolean) => {
    const newSettings = { ...settings, sync_images };
    setSettings(newSettings);
    try {
      await invoke('save_sync_settings', { settings: newSettings });
      toast.success(sync_images ? 'Image sync enabled' : 'Image sync disabled');
    } catch (e) {
      toast.error(`Failed to save settings: ${e}`);
      setSettings(settings);
    }
  };

  const isConnected = status?.connected_email != null;

  const formatLastSync = (ts: string | null) => {
    if (!ts) return 'Never';
    try {
      const date = new Date(ts);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      if (diff < 60000) return 'Just now';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      return date.toLocaleDateString();
    } catch {
      return ts;
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Sync</h3>

      {/* Google Account Section */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h4 className="mb-3 text-sm font-medium text-foreground">Google Drive</h4>
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
            {/* Sync status */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {status?.state === 'syncing' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : status?.state === 'error' ? (
                <AlertCircle size={12} className="text-red-400" />
              ) : (
                <Check size={12} className="text-green-500" />
              )}
              <span>
                Last sync: {formatLastSync(status?.last_sync_at ?? null)}
                {status?.state === 'syncing' && ' — syncing...'}
                {status?.state === 'error' && ` — ${status.error_message || 'error'}`}
              </span>
              {status?.pending_changes ? (
                <span className="ml-auto text-amber-400">{status.pending_changes} pending</span>
              ) : null}
            </div>
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
            {connecting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Cloud size={16} />
            )}
            {connecting ? 'Connecting...' : 'Connect Google Drive'}
          </button>
        )}
      </div>

      {/* Sync Settings — only show when connected */}
      {isConnected && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h4 className="mb-3 text-sm font-medium text-foreground">Settings</h4>
          <div className="space-y-4">
            {/* Auto-sync toggle */}
            <label className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-muted-foreground" />
                <span className="text-sm">Auto-sync</span>
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
                <span className="text-sm text-muted-foreground">Sync every</span>
                <select
                  value={settings.interval_seconds}
                  onChange={(e) => handleChangeInterval(Number(e.target.value))}
                  className="rounded-md border border-border bg-background px-2 py-1 text-sm"
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
                <span className="text-sm">Sync images</span>
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
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
