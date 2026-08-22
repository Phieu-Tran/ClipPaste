import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useState, type ElementType } from 'react';
import {
  Activity,
  AlertTriangle,
  Bug,
  Database,
  HardDrive,
  Image as ImageIcon,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cmd } from '../../commands';
import {
  clearErrorLog,
  getErrorLogEntries,
  subscribeErrorLog,
  type ErrorLogEntry,
} from '../../errorLog';
import { clearIconCache, getIconCacheStats } from '../../iconCache';
import { clearImageDataUrlCache, getImageDataUrlCacheStats } from '../../imageQueue';
import type { RuntimeDiagnostics } from '../../types';

function formatBytes(bytes: number): string {
  if (!bytes) return '0 MB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: ElementType;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3 shadow-sm shadow-black/5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-background/60 text-primary">
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
          <div className="mt-0.5 truncate text-lg font-semibold leading-6">{value}</div>
          {detail && (
            <div className="mt-1 truncate text-[11px] text-muted-foreground">{detail}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function DiagnosticsTab() {
  const { t } = useTranslation();
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics | null>(null);
  const [historySize, setHistorySize] = useState<number | null>(null);
  const [logs, setLogs] = useState<ErrorLogEntry[]>(() => getErrorLogEntries());
  const [refreshing, setRefreshing] = useState(false);
  const [imageStats, setImageStats] = useState(() => getImageDataUrlCacheStats());
  const [iconStats, setIconStats] = useState(() => getIconCacheStats());

  const devHelperBytes = useMemo(
    () =>
      diagnostics?.dev_helpers.reduce((sum, process) => sum + process.working_set_bytes, 0) ?? 0,
    [diagnostics]
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [nextDiagnostics, nextHistorySize] = await Promise.all([
        cmd.getRuntimeDiagnostics(),
        cmd.getClipboardHistorySize(),
      ]);
      setDiagnostics(nextDiagnostics);
      setHistorySize(nextHistorySize);
      setImageStats(getImageDataUrlCacheStats());
      setIconStats(getIconCacheStats());
      setLogs(getErrorLogEntries());
    } catch (error) {
      console.error('Failed to load diagnostics:', error);
      toast.error(t('diagnostics.loadFailed', { error: String(error) }));
    } finally {
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 5000);
    const unsubscribe = subscribeErrorLog(() => setLogs(getErrorLogEntries()));
    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [refresh]);

  const handleClearCaches = () => {
    clearImageDataUrlCache();
    clearIconCache();
    setImageStats(getImageDataUrlCacheStats());
    setIconStats(getIconCacheStats());
    toast.success(t('diagnostics.cachesCleared'));
  };

  const handleClearLogs = () => {
    clearErrorLog();
    setLogs([]);
    toast.success(t('diagnostics.logCleared'));
  };

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('diagnostics.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('diagnostics.subtitle')}</p>
        </div>
        <button onClick={refresh} disabled={refreshing} className="btn btn-secondary h-8 text-xs">
          <RefreshCw size={13} className={refreshing ? 'mr-1.5 animate-spin' : 'mr-1.5'} />
          {t('diagnostics.refresh')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={Activity}
          label={t('diagnostics.privateRam')}
          value={formatBytes(diagnostics?.app.private_bytes ?? 0)}
          detail={t('diagnostics.workingSet', {
            size: formatBytes(diagnostics?.app.working_set_bytes ?? 0),
          })}
        />
        <StatCard
          icon={HardDrive}
          label={t('diagnostics.devHelpers')}
          value={formatBytes(devHelperBytes)}
          detail={t('diagnostics.matchingProcesses', {
            count: diagnostics?.dev_helpers.length ?? 0,
          })}
        />
        <StatCard
          icon={Database}
          label={t('diagnostics.history')}
          value={historySize == null ? '-' : historySize.toLocaleString()}
          detail={t('diagnostics.totalStoredClips')}
        />
        <StatCard
          icon={ImageIcon}
          label={t('diagnostics.imageCache')}
          value={formatBytes(imageStats.estimatedBytes)}
          detail={t('diagnostics.cacheEntries', {
            entries: imageStats.entries,
            loading: imageStats.inflight,
          })}
        />
      </div>

      <div className="rounded-lg border border-border bg-card/45 p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{t('diagnostics.frontendCache')}</div>
            <div className="text-xs text-muted-foreground">
              {t('diagnostics.iconStats', {
                entries: iconStats.entries,
                size: formatBytes(iconStats.estimatedBytes),
              })}
            </div>
          </div>
          <button onClick={handleClearCaches} className="btn btn-secondary h-8 text-xs">
            <Trash2 size={13} className="mr-1.5" />
            {t('diagnostics.clearCaches')}
          </button>
        </div>
        {diagnostics?.dev_helpers.length ? (
          <div className="overflow-hidden rounded-md border border-border">
            <div className="grid grid-cols-[minmax(0,1fr)_72px_96px] gap-2 bg-background/40 px-3 py-2 text-[10px] font-medium uppercase text-muted-foreground">
              <span>{t('diagnostics.process')}</span>
              <span>{t('diagnostics.pid')}</span>
              <span className="text-right">{t('diagnostics.ram')}</span>
            </div>
            {diagnostics.dev_helpers.slice(0, 6).map((process) => (
              <div
                key={`${process.name}-${process.pid}`}
                className="grid grid-cols-[minmax(0,1fr)_72px_96px] gap-2 border-t border-border/60 px-3 py-2 text-xs"
              >
                <span className="truncate">{process.name}</span>
                <span className="tabular-nums text-muted-foreground">{process.pid}</span>
                <span className="text-right tabular-nums">
                  {formatBytes(process.working_set_bytes)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-border bg-background/30 p-3 text-xs text-muted-foreground">
            {t('diagnostics.noDevHelpers')}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card/45 p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bug size={15} className="text-rose-300" />
            <div>
              <div className="text-sm font-semibold">{t('diagnostics.errorLog')}</div>
              <div className="text-xs text-muted-foreground">
                {logs.length
                  ? t('diagnostics.captured', { count: logs.length })
                  : t('diagnostics.noCaptured')}
              </div>
            </div>
          </div>
          <button
            onClick={handleClearLogs}
            disabled={!logs.length}
            className="btn btn-secondary h-8 text-xs"
          >
            <Trash2 size={13} className="mr-1.5" />
            {t('diagnostics.clearLog')}
          </button>
        </div>

        {logs.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-border bg-background/30 p-3 text-xs text-muted-foreground">
            <AlertTriangle size={14} className="text-muted-foreground/60" />
            {t('diagnostics.noRecentErrors')}
          </div>
        ) : (
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {logs.map((entry) => (
              <article
                key={entry.id}
                className="rounded-md border border-border bg-background/35 p-3"
              >
                <div className="mb-1 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                  <span className="truncate font-medium text-rose-300">{entry.source}</span>
                  <span className="shrink-0 tabular-nums">{formatTime(entry.timestamp)}</span>
                </div>
                <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-foreground/80">
                  {entry.message}
                  {entry.stack ? `\n${entry.stack}` : ''}
                </pre>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
