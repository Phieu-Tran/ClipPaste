import {
  Settings,
  DashboardStats,
  ImageCleanupPreview,
  ImportBackupResult,
  WindowEffectSupport,
} from '../../types';
import { useEffect, useState } from 'react';
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
  Paintbrush,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { cmd } from '../../commands';
import { clearImageDataUrlCache } from '../../imageQueue';

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
  handleImportBackup: (onResult?: (result: ImportBackupResult) => void) => Promise<void>;
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
const INTERFACE_THEMES = [
  {
    id: 'default',
    label: 'Default',
    description: 'Balanced ClipPaste look',
    category: 'Balanced',
    swatches: ['#6d28d9', '#2b2d30', '#171a1e'],
  },
  {
    id: 'glass',
    label: 'Glass',
    description: 'Bright translucent depth',
    category: 'Balanced',
    swatches: ['#22d3ee', '#1d4ed8', '#0f172a'],
  },
  {
    id: 'graphite',
    label: 'Graphite',
    description: 'Focused neutral contrast',
    category: 'Focus',
    swatches: ['#10b981', '#2f3338', '#121417'],
  },
  {
    id: 'ember',
    label: 'Ember',
    description: 'Warm command surface',
    category: 'Balanced',
    swatches: ['#f97316', '#3a2a25', '#151821'],
  },
  {
    id: 'mint',
    label: 'Mint',
    description: 'Clean calm highlight',
    category: 'Balanced',
    swatches: ['#14b8a6', '#12342f', '#0b1720'],
  },
  {
    id: 'mono',
    label: 'Mono',
    description: 'Technical blue-gray',
    category: 'Focus',
    swatches: ['#3b82f6', '#2a2d31', '#111318'],
  },
  {
    id: 'aurora',
    label: 'Aurora',
    description: 'Cool glow, high clarity',
    category: 'Balanced',
    swatches: ['#06b6d4', '#8b5cf6', '#10202a'],
  },
  {
    id: 'cobalt',
    label: 'Cobalt',
    description: 'Blue control surface',
    category: 'Balanced',
    swatches: ['#2563eb', '#f59e0b', '#0f172a'],
  },
  {
    id: 'rose',
    label: 'Rose',
    description: 'Soft warm highlight',
    category: 'Balanced',
    swatches: ['#e11d48', '#fb7185', '#21141a'],
  },
  {
    id: 'solar',
    label: 'Solar',
    description: 'Bright productive contrast',
    category: 'Balanced',
    swatches: ['#ca8a04', '#0ea5e9', '#1c1917'],
  },
  {
    id: 'forest',
    label: 'Forest',
    description: 'Calm green workspace',
    category: 'Focus',
    swatches: ['#16a34a', '#84cc16', '#111b14'],
  },
  {
    id: 'circuit',
    label: 'Circuit',
    description: 'Sharp terminal energy',
    category: 'Focus',
    swatches: ['#84cc16', '#22c55e', '#08110c'],
  },
  {
    id: 'cyber',
    label: 'Cyber',
    description: 'Cyan magenta pulse',
    category: 'Colorful',
    swatches: ['#22d3ee', '#f472b6', '#0b1020'],
  },
  {
    id: 'synthwave',
    label: 'Synth',
    description: 'Retro neon warmth',
    category: 'Colorful',
    swatches: ['#a855f7', '#fb7185', '#f59e0b'],
  },
  {
    id: 'candy',
    label: 'Candy',
    description: 'Pink mint pop',
    category: 'Colorful',
    swatches: ['#ec4899', '#5eead4', '#fdf2f8'],
  },
  {
    id: 'ocean',
    label: 'Ocean',
    description: 'Deep blue clarity',
    category: 'Colorful',
    swatches: ['#0284c7', '#2dd4bf', '#082f49'],
  },
  {
    id: 'sunset',
    label: 'Sunset',
    description: 'Orange rose violet',
    category: 'Colorful',
    swatches: ['#f97316', '#e11d48', '#6d28d9'],
  },
  {
    id: 'royal',
    label: 'Royal',
    description: 'Cobalt gold polish',
    category: 'Colorful',
    swatches: ['#2563eb', '#facc15', '#312e81'],
  },
  {
    id: 'ice',
    label: 'Ice',
    description: 'Bright cold glass',
    category: 'Colorful',
    swatches: ['#38bdf8', '#818cf8', '#f8fafc'],
  },
  {
    id: 'bloom',
    label: 'Bloom',
    description: 'Fuchsia green spark',
    category: 'Colorful',
    swatches: ['#d946ef', '#22c55e', '#fef08a'],
  },
] as const;
const QUICK_THEME_IDS = ['default', 'glass', 'aurora', 'cyber', 'sunset', 'candy'] as const;
const THEME_GROUPS = [
  {
    label: 'Balanced',
    themeIds: ['default', 'glass', 'ember', 'mint', 'aurora', 'cobalt', 'rose', 'solar'],
  },
  {
    label: 'Colorful',
    themeIds: ['cyber', 'synthwave', 'candy', 'ocean', 'sunset', 'royal', 'ice', 'bloom'],
  },
  {
    label: 'Focus',
    themeIds: ['graphite', 'mono', 'forest', 'circuit'],
  },
] as const;
type InterfaceThemeOption = (typeof INTERFACE_THEMES)[number];

function ThemeMiniPreview({
  themeOption,
  compact = false,
}: {
  themeOption: InterfaceThemeOption;
  compact?: boolean;
}) {
  const [primary, accent, surface] = themeOption.swatches;
  return (
    <span
      className={`block overflow-hidden rounded-md border border-border/60 ring-1 ring-white/5 ${
        compact ? 'h-10' : 'h-[76px]'
      }`}
      style={{
        background: `linear-gradient(135deg, ${surface}, ${accent}33 58%, ${primary}22)`,
      }}
      aria-hidden="true"
    >
      <span
        className={`flex items-center gap-1 border-b px-1.5 ${compact ? 'h-3' : 'h-5'}`}
        style={{ borderColor: `${primary}44`, backgroundColor: `${surface}cc` }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: primary }} />
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
        <span
          className="ml-auto h-1 w-5 rounded-full"
          style={{ backgroundColor: `${primary}88` }}
        />
      </span>
      <span
        className={`grid flex-1 gap-1 ${compact ? 'grid-cols-[0.7fr_1fr] p-1' : 'grid-cols-[0.64fr_1fr] p-1.5'}`}
      >
        <span className="space-y-1">
          <span className="block h-1.5 rounded-full" style={{ backgroundColor: `${primary}dd` }} />
          <span
            className="block h-1.5 w-3/4 rounded-full"
            style={{ backgroundColor: `${accent}aa` }}
          />
          {!compact && (
            <span className="grid grid-cols-3 gap-0.5 pt-1">
              {themeOption.swatches.map((swatch) => (
                <span
                  key={`${themeOption.id}-preview-${swatch}`}
                  className="h-3 rounded-sm"
                  style={{ backgroundColor: swatch }}
                />
              ))}
            </span>
          )}
        </span>
        <span className="space-y-1">
          <span
            className={`${compact ? 'h-3' : 'h-5'} block rounded border`}
            style={{ borderColor: `${primary}66`, backgroundColor: `${primary}22` }}
          />
          <span
            className={`${compact ? 'h-3' : 'h-5'} block rounded border`}
            style={{ borderColor: `${accent}55`, backgroundColor: `${accent}1f` }}
          />
        </span>
      </span>
    </span>
  );
}
const FONT_OPTIONS = [
  { id: 'system', label: 'System' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'mono', label: 'Mono' },
  { id: 'readable', label: 'Readable' },
] as const;
const DENSITY_OPTIONS = [
  { id: 'comfortable', label: 'Comfortable' },
  { id: 'compact', label: 'Compact' },
] as const;
const WINDOW_EFFECTS = [
  {
    id: 'best',
    label: 'Auto',
    description: 'Native best',
    nativeEffect: 'best',
    preview: 'from-primary/80 via-cyan-300/40 to-white/10',
  },
  {
    id: 'best_glow',
    label: 'Auto Glow',
    description: 'Best + glow',
    nativeEffect: 'best',
    preview: 'from-violet-400/80 via-cyan-300/45 to-emerald-300/25',
  },
  {
    id: 'mica_alt',
    label: 'Tabbed',
    description: 'Win11 layered',
    nativeEffect: 'mica_alt',
    preview: 'from-sky-400/70 via-cyan-300/35 to-white/10',
  },
  {
    id: 'mica_alt_luxe',
    label: 'Luxe',
    description: 'Layered shine',
    nativeEffect: 'mica_alt',
    preview: 'from-amber-300/75 via-slate-200/25 to-violet-400/25',
  },
  {
    id: 'mica',
    label: 'Mica',
    description: 'Quiet native',
    nativeEffect: 'mica',
    preview: 'from-indigo-400/65 via-violet-400/30 to-white/10',
  },
  {
    id: 'mica_soft',
    label: 'Soft',
    description: 'Calm surface',
    nativeEffect: 'mica',
    preview: 'from-slate-300/50 via-emerald-300/25 to-blue-300/20',
  },
  {
    id: 'acrylic',
    label: 'Acrylic',
    description: 'Glass native',
    nativeEffect: 'acrylic',
    preview: 'from-teal-300/70 via-blue-400/30 to-white/10',
  },
  {
    id: 'acrylic_frost',
    label: 'Frost',
    description: 'Frosted glass',
    nativeEffect: 'acrylic',
    preview: 'from-white/70 via-cyan-200/35 to-slate-400/20',
  },
  {
    id: 'acrylic_tint',
    label: 'Prism',
    description: 'Color tint',
    nativeEffect: 'acrylic',
    preview: 'from-cyan-300/70 via-fuchsia-300/35 to-amber-200/25',
  },
  {
    id: 'blur',
    label: 'Blur',
    description: 'Classic blur',
    nativeEffect: 'blur',
    preview: 'from-slate-300/60 via-slate-500/30 to-white/10',
  },
  {
    id: 'blur_vivid',
    label: 'Vivid',
    description: 'Strong depth',
    nativeEffect: 'blur',
    preview: 'from-blue-400/75 via-emerald-300/35 to-rose-300/20',
  },
  {
    id: 'clear',
    label: 'Clear',
    description: 'Solid surface',
    nativeEffect: 'clear',
    preview: 'from-zinc-500/30 via-zinc-300/20 to-zinc-950/10',
  },
  {
    id: 'clear_focus',
    label: 'Focus',
    description: 'Sharp edges',
    nativeEffect: 'clear',
    preview: 'from-zinc-200/70 via-slate-500/30 to-primary/25',
  },
  {
    id: 'clear_neon',
    label: 'Neon',
    description: 'High contrast',
    nativeEffect: 'clear',
    preview: 'from-lime-300/75 via-emerald-400/35 to-zinc-950/30',
  },
] as const;

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
  const [windowEffectSupport, setWindowEffectSupport] = useState<WindowEffectSupport | null>(null);

  useEffect(() => {
    cmd.getWindowEffectSupport().then(setWindowEffectSupport).catch(console.error);
  }, []);

  const getNativeEffectId = (effectId: string) =>
    WINDOW_EFFECTS.find((effect) => effect.id === effectId)?.nativeEffect ?? effectId;

  const isEffectSupported = (effectId: string) => {
    const nativeEffectId = getNativeEffectId(effectId);
    if (nativeEffectId === 'best' || nativeEffectId === 'clear') return true;
    return (
      windowEffectSupport?.effects.some(
        (effect) => effect.id === nativeEffectId && effect.supported
      ) ?? false
    );
  };

  const getEffectBadge = (effectId: string) => {
    if (effectId === 'best') return 'Auto';
    const nativeEffectId = getNativeEffectId(effectId);
    const isNativePreset = nativeEffectId === effectId;
    if (isNativePreset && windowEffectSupport?.best_effect === nativeEffectId) return 'Best';
    if (isEffectSupported(effectId)) return isNativePreset ? 'Native' : 'Style';
    return 'Fallback';
  };

  const getThemeById = (themeId: string) =>
    INTERFACE_THEMES.find((themeOption) => themeOption.id === themeId) ?? INTERFACE_THEMES[0];
  const selectedInterfaceTheme = settings.interface_theme || 'default';
  const selectedThemeOption = getThemeById(selectedInterfaceTheme);
  const quickThemes = QUICK_THEME_IDS.map((themeId) => getThemeById(themeId));

  const showIgnoredAppAddedToast = (app: string) => {
    toast.success(`Ignoring future clips from ${app}`, {
      action: {
        label: 'Undo',
        onClick: async () => {
          try {
            await cmd.removeIgnoredApp(app);
            setIgnoredApps((prev) => prev.filter((existing) => existing !== app));
            toast.success(`Removed ${app} from ignored apps`);
          } catch (e) {
            toast.error(`Failed to remove ignored app: ${e}`);
            console.error(e);
          }
        },
      },
    });
  };

  const addIgnoredAppValue = async (rawValue: string) => {
    const app = rawValue.trim();
    if (!app) return;

    if (ignoredApps.some((existing) => existing.toLowerCase() === app.toLowerCase())) {
      setNewIgnoredApp('');
      toast.info(`${app} is already ignored`);
      return;
    }

    await cmd.addIgnoredApp(app);
    setIgnoredApps((prev) =>
      [...prev.filter((existing) => existing.toLowerCase() !== app.toLowerCase()), app].sort()
    );
    setNewIgnoredApp('');
    showIgnoredAppAddedToast(app);
  };

  const handleAddIgnoredApp = async () => {
    try {
      await addIgnoredAppValue(newIgnoredApp);
    } catch (e) {
      toast.error(`Failed to add ignored app: ${e}`);
      console.error(e);
    }
  };

  // Target mode: countdown that captures whichever app is focused when it expires.
  const [targetCountdown, setTargetCountdown] = useState<number | null>(null);

  const pickTargetApp = async () => {
    if (targetCountdown !== null) return null;
    const DELAY_SEC = 4;
    setTargetCountdown(DELAY_SEC);
    toast.info(`Switch to the app you want to block. Capturing in ${DELAY_SEC}s`);

    const tick = setInterval(() => {
      setTargetCountdown((v) => (v !== null && v > 1 ? v - 1 : v));
    }, 1000);

    try {
      const picked = await cmd.pickForegroundApp(DELAY_SEC * 1000);
      // Prefer exe name (what the ignore check compares against). Fall back to display name.
      const target = picked.exe_name || picked.app_name || '';
      if (!target || target.toLowerCase().includes('clippaste')) {
        toast.error(
          'Could not capture a different app. Try again and switch before the countdown ends.'
        );
        return null;
      } else {
        return target;
      }
    } catch (e) {
      toast.error(`Failed to capture app: ${e}`);
      return null;
    } finally {
      clearInterval(tick);
      setTargetCountdown(null);
    }
  };

  const handleTargetApp = async () => {
    const target = await pickTargetApp();
    if (!target) return;
    setNewIgnoredApp(target);
    toast.success(`Captured: ${target}`);
  };

  const handleTargetAndIgnoreApp = async () => {
    const target = await pickTargetApp();
    if (!target) return;
    try {
      await addIgnoredAppValue(target);
    } catch (e) {
      toast.error(`Failed to add ignored app: ${e}`);
      console.error(e);
    }
  };

  const handleBrowseFile = async () => {
    try {
      const path = await cmd.pickFile();
      const filename = path.split('\\').pop() || path;
      setNewIgnoredApp(filename);
    } catch {
      // User cancelled the picker.
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
          clearImageDataUrlCache();
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

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Paintbrush size={14} className="text-primary" />
              <span className="text-sm font-medium">Theme</span>
            </div>
            <span className="rounded-full border border-border bg-card/60 px-2 py-0.5 text-[11px] text-muted-foreground">
              {INTERFACE_THEMES.length} presets
            </span>
          </div>
          <div className="rounded-lg border border-border bg-card/30 p-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {quickThemes.map((themeOption) => {
                const selected = selectedInterfaceTheme === themeOption.id;
                return (
                  <button
                    key={themeOption.id}
                    type="button"
                    onClick={() => updateSetting('interface_theme', themeOption.id)}
                    className={`group min-h-[68px] overflow-hidden rounded-md border p-2 text-left transition-all ${
                      selected
                        ? 'border-primary bg-primary/10 text-foreground shadow-lg shadow-primary/10 ring-1 ring-primary/40'
                        : 'border-border/60 bg-background/35 text-muted-foreground hover:border-primary/50 hover:bg-accent/40 hover:text-foreground'
                    }`}
                    aria-pressed={selected}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold">
                          {themeOption.label}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                          {themeOption.description}
                        </span>
                      </span>
                    </span>
                    <span className="mt-2 block">
                      <ThemeMiniPreview themeOption={themeOption} compact />
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_260px]">
              <label className="block min-w-0">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  All themes
                </span>
                <select
                  value={selectedInterfaceTheme}
                  onChange={(e) => updateSetting('interface_theme', e.target.value)}
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {THEME_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.themeIds.map((themeId) => {
                        const themeOption = getThemeById(themeId);
                        return (
                          <option key={themeOption.id} value={themeOption.id}>
                            {themeOption.label}
                          </option>
                        );
                      })}
                    </optgroup>
                  ))}
                </select>
              </label>

              <div className="grid min-h-[92px] gap-2 rounded-md border border-border/70 bg-background/35 p-2 sm:grid-cols-[minmax(0,1fr)_118px]">
                <span className="min-w-0 self-center">
                  <span className="block truncate text-sm font-semibold">
                    {selectedThemeOption.label}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {selectedThemeOption.category} - {selectedThemeOption.description}
                  </span>
                  <span className="mt-2 flex items-center gap-1">
                    {selectedThemeOption.swatches.map((swatch) => (
                      <span
                        key={`${selectedThemeOption.id}-${swatch}`}
                        className="h-2 flex-1 rounded-full"
                        style={{ backgroundColor: swatch }}
                      />
                    ))}
                  </span>
                </span>
                <ThemeMiniPreview themeOption={selectedThemeOption} />
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm font-medium">Mode</span>
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
              <span className="text-sm font-medium">Font</span>
            </label>
            <select
              value={settings.font_family || 'system'}
              onChange={(e) => updateSetting('font_family', e.target.value)}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {FONT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="text-sm font-medium">Density</span>
            </label>
            <select
              value={settings.ui_density || 'comfortable'}
              onChange={(e) => updateSetting('ui_density', e.target.value)}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {DENSITY_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-primary" />
              <span className="text-sm font-medium">Window Effect</span>
            </div>
            <span className="rounded-full border border-border bg-card/60 px-2 py-0.5 text-[11px] text-muted-foreground">
              {windowEffectSupport?.platform === 'windows' ? 'Windows native' : 'Backdrop'}
            </span>
          </div>
          <div
            data-window-effect-panel
            className="grid max-h-[242px] grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-border bg-card/30 p-2 sm:grid-cols-3"
          >
            {WINDOW_EFFECTS.map((effect) => {
              const selected = (settings.mica_effect || 'clear') === effect.id;
              const badge = getEffectBadge(effect.id);
              return (
                <button
                  key={effect.id}
                  type="button"
                  onClick={() => updateSetting('mica_effect', effect.id)}
                  title={`${effect.label}: ${effect.description}`}
                  className={`group grid min-h-[52px] grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-all ${
                    selected
                      ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary/40'
                      : 'border-border/60 bg-background/35 text-muted-foreground hover:border-primary/50 hover:bg-accent/40 hover:text-foreground'
                  }`}
                  aria-pressed={selected}
                >
                  <span
                    className={`h-7 w-8 shrink-0 rounded bg-gradient-to-br ${effect.preview} ring-1 ring-white/10`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{effect.label}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {effect.description}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                      badge === 'Auto' || badge === 'Best'
                        ? 'bg-primary text-primary-foreground'
                        : badge === 'Native' || badge === 'Style'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-background/75 text-muted-foreground'
                    }`}
                  >
                    {badge}
                  </span>
                </button>
              );
            })}
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
          <div className="flex min-w-0 items-start gap-2">
            <ShieldAlert size={15} className="mt-0.5 shrink-0 text-red-400" />
            <div className="min-w-0">
              <span className="text-sm font-medium">Sensitive Detection</span>
              <p className="text-xs text-muted-foreground">
                Auto-blur likely secrets. Turn off if it marks normal clips too often.
              </p>
            </div>
          </div>
          <button
            onClick={() => updateSetting('sensitive_detection', !settings.sensitive_detection)}
            className={`h-6 w-11 shrink-0 rounded-full transition-colors ${settings.sensitive_detection ? 'bg-primary' : 'bg-accent'}`}
          >
            <div
              className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${settings.sensitive_detection ? 'translate-x-5' : 'translate-x-0.5'}`}
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
            <p className="text-xs text-muted-foreground">
              Toggle the clipboard window. Use Ctrl+Shift or Ctrl+Alt plus one key.
            </p>
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

          <button
            onClick={handleTargetAndIgnoreApp}
            disabled={targetCountdown !== null}
            className="btn btn-secondary w-full justify-center gap-2"
            title="Capture the foreground app after the countdown and add it to ignored apps"
          >
            {targetCountdown !== null ? (
              <span className="text-xs font-semibold">{targetCountdown}s</span>
            ) : (
              <>
                <Crosshair size={16} />
                <span>Pick &amp; Ignore active app</span>
              </>
            )}
          </button>

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
            onClick={() => void handleImportBackup()}
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
