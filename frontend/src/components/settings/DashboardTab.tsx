import {
  Database,
  ImageIcon,
  CalendarDays,
  Folder as FolderIcon,
  HardDrive,
  Link,
  Pin,
  ShieldAlert,
  Settings,
  Download,
  Layers2,
  RefreshCw,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface DashboardStats {
  total: number;
  today: number;
  images: number;
  text: number;
  folders: number;
  pinned: number;
  sensitive: number;
  in_folders: number;
  urls: number;
  daily: { day: string; count: number }[];
  top_apps: { app: string; count: number }[];
  most_pasted: { id: string; preview: string; count: number }[];
  db_size: number;
  images_size: number;
  old_images_14d: {
    days: number;
    count: number;
    bytes: number;
    protected_count: number;
    oldest_created_at: string | null;
    newest_created_at: string | null;
  };
}

interface DashClip {
  id: string;
  clip_type: string;
  content: string;
  preview: string;
  created_at: string;
  source_app: string | null;
  subtype: string | null;
}

interface DashboardTabProps {
  dashStats: DashboardStats | null;
  dashStatsError: string;
  dashDate: string;
  setDashDate: (v: string) => void;
  dashSearch: string;
  setDashSearch: (v: string) => void;
  dashSourceApp: string | null;
  setDashSourceApp: (v: string | null) => void;
  dashClips: DashClip[];
  dashClipsLoading: boolean;
  onOpenStorageSettings: () => void;
  onExportBackup: () => Promise<void>;
  onRemoveDuplicates: () => Promise<void>;
  onRefreshStats: () => Promise<void>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return days[d.getDay()];
}

function DashboardImageThumb({ clipId }: { clipId: string }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let cancelled = false;
    setSrc('');

    invoke<string>('get_clip_image_data_url', {
      id: clipId,
      thumbnail: true,
    })
      .then((dataUrl) => {
        if (!cancelled) setSrc(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc('');
      });

    return () => {
      cancelled = true;
    };
  }, [clipId]);

  if (!src) {
    return <ImageIcon size={14} className="text-muted-foreground/50" />;
  }

  return <img src={src} alt="" className="h-full w-full object-cover" />;
}

export function DashboardTab({
  dashStats,
  dashStatsError,
  dashDate,
  setDashDate,
  dashSearch,
  setDashSearch,
  dashSourceApp,
  setDashSourceApp,
  dashClips,
  dashClipsLoading,
  onOpenStorageSettings,
  onExportBackup,
  onRemoveDuplicates,
  onRefreshStats,
}: DashboardTabProps) {
  const [runningAction, setRunningAction] = useState<string | null>(null);

  const runAction = async (key: string, action: () => Promise<void>) => {
    if (runningAction) return;
    setRunningAction(key);
    try {
      await action();
    } finally {
      setRunningAction(null);
    }
  };

  if (!dashStats) {
    return (
      <div className="space-y-4">
        {dashStatsError ? (
          <section className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-center">
            <div className="text-sm font-medium text-destructive">Dashboard failed to load</div>
            <div className="mt-1 text-xs text-muted-foreground">{dashStatsError}</div>
            <button
              onClick={() => runAction('refresh', onRefreshStats)}
              className="btn btn-secondary mt-4 text-xs"
            >
              Retry
            </button>
          </section>
        ) : (
          <>
            <section className="grid grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-[86px] animate-pulse rounded-xl border border-border bg-card/40"
                />
              ))}
            </section>
            <section className="rounded-xl border border-border bg-card/40 p-6 text-center">
              <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              <div className="text-sm font-medium">Loading dashboard</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Reading local storage and clipboard stats...
              </div>
            </section>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Stats Cards */}
      <section className="grid grid-cols-4 gap-3">
        <div className="flex flex-col items-center rounded-xl border border-border bg-card/50 p-3">
          <Database size={16} className="mb-1 text-indigo-400" />
          <span className="text-xl font-bold text-indigo-400">
            {dashStats.total.toLocaleString()}
          </span>
          <span className="text-[10px] text-muted-foreground">Total</span>
        </div>
        <div className="flex flex-col items-center rounded-xl border border-border bg-card/50 p-3">
          <CalendarDays size={16} className="mb-1 text-emerald-400" />
          <span className="text-xl font-bold text-emerald-400">{dashStats.today}</span>
          <span className="text-[10px] text-muted-foreground">Today</span>
        </div>
        <div className="flex flex-col items-center rounded-xl border border-border bg-card/50 p-3">
          <ImageIcon size={16} className="mb-1 text-cyan-400" />
          <span className="text-xl font-bold text-cyan-400">{dashStats.images}</span>
          <span className="text-[10px] text-muted-foreground">Images</span>
        </div>
        <div className="flex flex-col items-center rounded-xl border border-border bg-card/50 p-3">
          <FolderIcon size={16} className="mb-1 text-amber-400" />
          <span className="text-xl font-bold text-amber-400">{dashStats.folders}</span>
          <span className="text-[10px] text-muted-foreground">Folders</span>
        </div>
      </section>

      <section className="grid grid-cols-4 gap-2">
        <button
          onClick={onOpenStorageSettings}
          className="flex min-h-[58px] items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-2 text-left text-xs hover:bg-accent/40"
        >
          <Settings size={15} className="text-primary" />
          Storage Settings
        </button>
        <button
          onClick={onOpenStorageSettings}
          className="flex min-h-[58px] items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-2 text-left text-xs hover:bg-accent/40"
        >
          <ImageIcon size={15} className="text-cyan-400" />
          Preview Images
        </button>
        <button
          onClick={() => runAction('export', onExportBackup)}
          disabled={!!runningAction}
          className="flex min-h-[58px] items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-2 text-left text-xs hover:bg-accent/40 disabled:opacity-50"
        >
          <Download size={15} className="text-emerald-400" />
          Export Backup
        </button>
        <button
          onClick={() => runAction('duplicates', onRemoveDuplicates)}
          disabled={!!runningAction}
          className="flex min-h-[58px] items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-2 text-left text-xs hover:bg-accent/40 disabled:opacity-50"
        >
          <Layers2 size={15} className="text-amber-400" />
          Remove Duplicates
        </button>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">Storage Management</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {formatBytes(dashStats.db_size + dashStats.images_size)} total
            </span>
            <button
              onClick={() => runAction('refresh', onRefreshStats)}
              disabled={!!runningAction}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              title="Refresh dashboard"
            >
              <RefreshCw
                size={13}
                className={runningAction === 'refresh' ? 'animate-spin' : undefined}
              />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-[1.2fr_1fr] gap-3">
          <div className="rounded-xl border border-border bg-card/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive size={15} className="text-emerald-400" />
                <span className="text-sm font-medium">Local storage</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {dashStats.images.toLocaleString()} image clips
              </span>
            </div>
            {(() => {
              const totalStorage = Math.max(dashStats.db_size + dashStats.images_size, 1);
              const imagePct = Math.round((dashStats.images_size / totalStorage) * 100);
              const dbPct = Math.max(0, 100 - imagePct);
              return (
                <div className="space-y-3">
                  <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                    <div className="bg-emerald-500" style={{ width: `${dbPct}%` }} />
                    <div className="bg-cyan-500" style={{ width: `${imagePct}%` }} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-background/50 p-2">
                      <div className="text-muted-foreground">Database</div>
                      <div className="font-semibold">{formatBytes(dashStats.db_size)}</div>
                    </div>
                    <div className="rounded-md bg-background/50 p-2">
                      <div className="text-muted-foreground">Image files</div>
                      <div className="font-semibold">{formatBytes(dashStats.images_size)}</div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="rounded-xl border border-border bg-card/50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <ImageIcon size={15} className="text-cyan-400" />
              <span className="text-sm font-medium">14-day cleanup</span>
            </div>
            <div className="text-2xl font-semibold text-cyan-300">
              {dashStats.old_images_14d.count.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatBytes(dashStats.old_images_14d.bytes)} reclaimable
            </div>
            {dashStats.old_images_14d.protected_count > 0 && (
              <div className="mt-2 text-[11px] text-muted-foreground">
                {dashStats.old_images_14d.protected_count.toLocaleString()} old image clips are
                protected.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Content Mix</h3>
        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-lg border border-border bg-card/40 p-3">
            <Database size={14} className="mb-1 text-slate-300" />
            <div className="text-sm font-semibold">{dashStats.text.toLocaleString()}</div>
            <div className="text-[10px] text-muted-foreground">Text</div>
          </div>
          <div className="rounded-lg border border-border bg-card/40 p-3">
            <Link size={14} className="mb-1 text-blue-400" />
            <div className="text-sm font-semibold">{dashStats.urls.toLocaleString()}</div>
            <div className="text-[10px] text-muted-foreground">Links</div>
          </div>
          <div className="rounded-lg border border-border bg-card/40 p-3">
            <Pin size={14} className="mb-1 text-amber-400" />
            <div className="text-sm font-semibold">{dashStats.pinned.toLocaleString()}</div>
            <div className="text-[10px] text-muted-foreground">Pinned</div>
          </div>
          <div className="rounded-lg border border-border bg-card/40 p-3">
            <ShieldAlert size={14} className="mb-1 text-rose-400" />
            <div className="text-sm font-semibold">{dashStats.sensitive.toLocaleString()}</div>
            <div className="text-[10px] text-muted-foreground">Sensitive</div>
          </div>
        </div>
      </section>

      {/* Date picker + Search */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">History Timeline</h3>
        <div className="flex gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const d = new Date(dashDate + 'T00:00:00');
                d.setDate(d.getDate() - 1);
                setDashDate(toDateStr(d));
              }}
              className="rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              &#8249;
            </button>
            <input
              type="date"
              value={dashDate}
              onChange={(e) => setDashDate(e.target.value)}
              max={toDateStr(new Date())}
              className="rounded-lg border border-border bg-input px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              style={{ colorScheme: 'dark' }}
            />
            <button
              onClick={() => {
                const d = new Date(dashDate + 'T00:00:00');
                d.setDate(d.getDate() + 1);
                if (d <= new Date()) setDashDate(toDateStr(d));
              }}
              className="rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              &#8250;
            </button>
            <button
              onClick={() => setDashDate(toDateStr(new Date()))}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
            >
              Today
            </button>
          </div>
          <input
            type="text"
            value={dashSearch}
            onChange={(e) => setDashSearch(e.target.value)}
            placeholder="Search in this day..."
            className="flex-1 rounded-lg border border-border bg-input px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {dashStats && dashStats.top_apps.length > 0 && (
            <select
              value={dashSourceApp || ''}
              onChange={(e) => setDashSourceApp(e.target.value || null)}
              className="rounded-lg border border-border bg-input px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              style={{ colorScheme: 'dark', maxWidth: 130 }}
            >
              <option value="">All apps</option>
              {dashStats.top_apps.map((app) => (
                <option key={app.app} value={app.app}>
                  {app.app}
                </option>
              ))}
            </select>
          )}
        </div>
      </section>

      {/* Clips for selected date */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {dashDate === toDateStr(new Date()) ? 'Today' : dashDate} — {dashClips.length} clips
          </span>
        </div>
        {dashClipsLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          </div>
        ) : dashClips.length === 0 ? (
          <div className="rounded-lg border border-border/50 bg-card/30 py-6 text-center text-sm text-muted-foreground/50">
            No clips on this day
          </div>
        ) : (
          <div className="max-h-[300px] space-y-1 overflow-y-auto rounded-lg border border-border/50 bg-card/30 p-2">
            {dashClips.map((clip) => (
              <div
                key={clip.id}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent/30"
              >
                {/* Time */}
                <span className="w-12 flex-shrink-0 text-[11px] tabular-nums text-muted-foreground/60">
                  {formatTime(clip.created_at)}
                </span>
                {/* Type badge */}
                {clip.clip_type === 'image' ? (
                  <div className="flex h-8 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded border border-border/30">
                    <DashboardImageThumb clipId={clip.id} />
                  </div>
                ) : (
                  <div
                    className={clsx(
                      'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[9px] font-bold',
                      clip.subtype === 'url'
                        ? 'bg-blue-500/20 text-blue-400'
                        : clip.subtype === 'email'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : clip.subtype === 'color'
                            ? 'bg-pink-500/20 text-pink-400'
                            : clip.subtype === 'path'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-muted/30 text-muted-foreground/60'
                    )}
                  >
                    {clip.subtype === 'url'
                      ? '\uD83D\uDD17'
                      : clip.subtype === 'email'
                        ? '\u2709'
                        : clip.subtype === 'color'
                          ? '\uD83C\uDFA8'
                          : clip.subtype === 'path'
                            ? '\uD83D\uDCC1'
                            : 'T'}
                  </div>
                )}
                {/* Content preview */}
                <span className="flex-1 truncate font-mono text-xs text-foreground/80">
                  {clip.clip_type === 'image'
                    ? '[Image]'
                    : clip.preview?.substring(0, 100) || clip.content.substring(0, 100)}
                </span>
                {/* Source app */}
                {clip.source_app && (
                  <span
                    className="flex-shrink-0 truncate text-[10px] text-muted-foreground/40"
                    style={{ maxWidth: 80 }}
                  >
                    {clip.source_app}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Activity Chart */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Activity (last 7 days)</h3>
        {dashStats.daily.length > 0 ? (
          <div className="rounded-xl border border-border bg-card/50 p-4">
            {(() => {
              const maxCount = Math.max(...dashStats.daily.map((d) => d.count), 1);
              return (
                <div className="flex items-end gap-2" style={{ height: 80 }}>
                  {dashStats.daily.map((d) => (
                    <div
                      key={d.day}
                      className="flex flex-1 cursor-pointer flex-col items-center gap-1"
                      onClick={() => setDashDate(d.day)}
                    >
                      <span className="text-[9px] text-muted-foreground/70">{d.count}</span>
                      <div
                        className={clsx(
                          'w-full rounded-t-md transition-all',
                          d.day === dashDate
                            ? 'bg-indigo-400'
                            : 'bg-indigo-500/40 hover:bg-indigo-500/60'
                        )}
                        style={{
                          height: `${(d.count / maxCount) * 60}px`,
                          minHeight: d.count > 0 ? 4 : 0,
                        }}
                      />
                      <span
                        className={clsx(
                          'text-[9px]',
                          d.day === dashDate ? 'font-bold text-indigo-400' : 'text-muted-foreground'
                        )}
                      >
                        {getDayLabel(d.day)}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
            No activity recorded in the last 7 days
          </div>
        )}
      </section>

      {/* Top Source Apps */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Top source apps</h3>
        {dashStats.top_apps.length > 0 ? (
          <div className="space-y-2">
            {(() => {
              const maxApp = Math.max(...dashStats.top_apps.map((a) => a.count), 1);
              return dashStats.top_apps.map((app) => (
                <div
                  key={app.app}
                  className={clsx(
                    'flex cursor-pointer items-center gap-3 rounded-md px-1 py-0.5 transition-colors hover:bg-accent/30',
                    dashSourceApp === app.app && 'bg-indigo-500/15 ring-1 ring-indigo-500/30'
                  )}
                  onClick={() => setDashSourceApp(dashSourceApp === app.app ? null : app.app)}
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/20 text-[9px] font-bold text-indigo-300">
                    {app.app.substring(0, 2).toUpperCase()}
                  </div>
                  <span className="w-20 truncate text-xs font-medium">{app.app}</span>
                  <div className="flex-1">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-indigo-500/80 to-purple-500/60"
                      style={{ width: `${(app.count / maxApp) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-[10px] text-muted-foreground">
                    {app.count}
                  </span>
                </div>
              ));
            })()}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
            Source app data will appear after new clips are captured
          </div>
        )}
      </section>

      {/* Most Pasted + Storage */}
      <div className="grid grid-cols-2 gap-4">
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">Most pasted</h3>
          {dashStats.most_pasted.length > 0 ? (
            <div className="space-y-1">
              {dashStats.most_pasted.map((clip, i) => (
                <div
                  key={clip.id}
                  className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-accent/30"
                >
                  <span className="text-[10px] text-muted-foreground/50">{i + 1}.</span>
                  <span className="flex-1 truncate font-mono text-[10px] text-foreground/70">
                    {clip.preview}
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-400">{clip.count}x</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              Paste counts will appear after clips are reused
            </div>
          )}
        </section>
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">Storage</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card/50 px-3 py-2">
              <HardDrive size={12} className="text-muted-foreground" />
              <span className="text-xs font-medium">{formatBytes(dashStats.db_size)}</span>
              <span className="text-[10px] text-muted-foreground">DB</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card/50 px-3 py-2">
              <ImageIcon size={12} className="text-muted-foreground" />
              <span className="text-xs font-medium">{formatBytes(dashStats.images_size)}</span>
              <span className="text-[10px] text-muted-foreground">Images</span>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
