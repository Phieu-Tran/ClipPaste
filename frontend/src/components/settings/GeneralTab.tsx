import {
  Settings,
  DashboardStats,
  ImageCleanupPreview,
  ImportBackupResult,
  WindowEffectSupport,
} from '../../types';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, DEFAULT_LANGUAGE } from '../../i18n';
import {
  Trash2,
  FolderOpen,
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
import { formatBytes } from '../../utils/format';
import { IgnoredAppsSection } from './IgnoredAppsSection';
import {
  CLIP_DELETE_DAY_OPTIONS,
  DENSITY_OPTIONS,
  FONT_OPTIONS,
  IMAGE_DELETE_DAY_OPTIONS,
  INTERFACE_THEMES,
  MAX_ITEM_OPTIONS,
  QUICK_THEME_IDS,
  THEME_GROUPS,
  ThemeMiniPreview,
  WINDOW_EFFECTS,
} from './generalTabOptions';

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
  const { t } = useTranslation();
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
    if (effectId === 'best') return t('general.badgeAuto');
    const nativeEffectId = getNativeEffectId(effectId);
    const isNativePreset = nativeEffectId === effectId;
    if (isNativePreset && windowEffectSupport?.best_effect === nativeEffectId)
      return t('general.badgeBest');
    if (isEffectSupported(effectId))
      return isNativePreset ? t('general.badgeNative') : t('general.badgeStyle');
    return t('general.badgeFallback');
  };

  const getThemeById = (themeId: string) =>
    INTERFACE_THEMES.find((themeOption) => themeOption.id === themeId) ?? INTERFACE_THEMES[0];
  const selectedInterfaceTheme = settings.interface_theme || 'default';
  const selectedThemeOption = getThemeById(selectedInterfaceTheme);
  const quickThemes = QUICK_THEME_IDS.map((themeId) => getThemeById(themeId));

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
        t('general.reclassifyDone', {
          clips: subtypeUpdated.toLocaleString(),
          flags: sensitiveUpdated.toLocaleString(),
        })
      );
    } catch (error) {
      console.error(error);
      toast.error(t('general.reclassifyFailed', { error: String(error) }));
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
      toast.error(
        t('backup.previewCleanupFailed', {
          label: t('backup.oldImages'),
          error: String(error),
        })
      );
    } finally {
      setCleanupPreviewLoading(false);
    }
  };

  const handleCleanupOldImages = async () => {
    const days = cleanupPreview?.days || Math.max(1, settings.image_delete_days || 14);
    const count = cleanupPreview?.count ?? 0;
    const reclaimable = cleanupPreview
      ? formatBytes(cleanupPreview.bytes)
      : t('general.unknownSize');

    requestConfirm({
      title: t('backup.deleteOldImagesTitle'),
      message: t('backup.deleteOldImagesMessage', { count: count.toLocaleString(), days }),
      confirmText: t('backup.deleteImages'),
      variant: 'danger',
      details: [
        t('backup.reclaimable', { size: reclaimable }),
        t('backup.protectedImages', {
          count: (cleanupPreview?.protected_count ?? 0).toLocaleString(),
        }),
      ],
      action: async () => {
        try {
          setCleanupRunning(true);
          const deleted = await cmd.cleanupOldImageClips(days);
          clearImageDataUrlCache();
          toast.success(t('general.deletedOldImages', { count: deleted }));
          const newSize = await cmd.getClipboardHistorySize();
          setHistorySize(newSize);
          setCleanupPreview(null);
          await refreshDashboardStats();
        } catch (error) {
          console.error(error);
          toast.error(
            t('backup.cleanupFailed', {
              label: t('backup.oldImages'),
              error: String(error),
            })
          );
        } finally {
          setCleanupRunning(false);
        }
      },
    });
  };

  return (
    <>
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground">{t('general.appearance')}</h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Paintbrush size={14} className="text-primary" />
              <span className="text-sm font-medium">{t('general.theme')}</span>
            </div>
            <span className="rounded-full border border-border bg-card/60 px-2 py-0.5 text-[11px] text-muted-foreground">
              {t('general.presetCount', { count: INTERFACE_THEMES.length })}
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
                          {t(themeOption.descriptionKey)}
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
                  className="field w-full"
                >
                  {THEME_GROUPS.map((group) => (
                    <optgroup key={group.labelKey} label={t(group.labelKey)}>
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
                    {t(selectedThemeOption.categoryKey)} - {t(selectedThemeOption.descriptionKey)}
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
              <span className="text-sm font-medium">{t('general.mode')}</span>
            </label>
            <select
              value={settings.theme}
              onChange={(e) => handleThemeChange(e.target.value)}
              className="field w-full"
            >
              <option value="dark">{t('general.modeDark')}</option>
              <option value="light">{t('general.modeLight')}</option>
              <option value="system">{t('general.modeSystem')}</option>
            </select>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="text-sm font-medium">{t('settings.language')}</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {t('settings.languageHint')}
              </span>
            </label>
            <select
              value={settings.language || DEFAULT_LANGUAGE}
              onChange={(e) => updateSetting('language', e.target.value)}
              className="field w-full"
            >
              {LANGUAGES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="text-sm font-medium">{t('general.font')}</span>
            </label>
            <select
              value={settings.font_family || 'system'}
              onChange={(e) => updateSetting('font_family', e.target.value)}
              className="field w-full"
            >
              {FONT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="text-sm font-medium">{t('general.density')}</span>
            </label>
            <select
              value={settings.ui_density || 'comfortable'}
              onChange={(e) => updateSetting('ui_density', e.target.value)}
              className="field w-full"
            >
              {DENSITY_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-primary" />
              <span className="text-sm font-medium">{t('general.windowEffect')}</span>
            </div>
            <span className="rounded-full border border-border bg-card/60 px-2 py-0.5 text-[11px] text-muted-foreground">
              {t(
                windowEffectSupport?.platform === 'windows'
                  ? 'general.windowsNative'
                  : 'general.backdrop'
              )}
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
                  title={`${effect.label}: ${t(effect.descriptionKey)}`}
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
                      {t(effect.descriptionKey)}
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
            <span className="text-sm font-medium">{t('general.startup')}</span>
            <p className="text-xs text-muted-foreground">{t('general.startupHint')}</p>
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
            <span className="text-sm font-medium">{t('general.autoPaste')}</span>
            <p className="text-xs text-muted-foreground">{t('general.autoPasteHint')}</p>
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
              <span className="text-sm font-medium">{t('general.sensitiveDetection')}</span>
              <p className="text-xs text-muted-foreground">{t('general.sensitiveDetectionHint')}</p>
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
            <span className="text-sm font-medium">{t('general.ghostClips')}</span>
            <p className="text-xs text-muted-foreground">{t('general.ghostClipsHint')}</p>
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
        <h3 className="text-sm font-medium text-muted-foreground">{t('general.shortcuts')}</h3>
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium">{t('general.globalHotkey')}</span>
            <p className="text-xs text-muted-foreground">{t('general.globalHotkeyHint')}</p>
          </label>
          {isRecordingMode ? (
            <div className="space-y-2">
              <div className="flex w-full items-center gap-2 rounded-lg border border-primary bg-input px-3 py-2 text-sm ring-2 ring-primary">
                <span className="animate-pulse text-primary">
                  {shortcut.length > 0
                    ? formatHotkey(shortcut)
                    : savedShortcut.length > 0
                      ? formatHotkey(savedShortcut)
                      : t('general.pressKeys')}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveHotkey}
                  disabled={savedShortcut.length === 0}
                  className="btn btn-primary btn-sm"
                >
                  {t('common.save')}
                </button>
                <button
                  onClick={handleCancelRecording}
                  className="rounded bg-muted px-3 py-1 text-xs text-muted-foreground"
                >
                  {t('common.cancel')}
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

      <IgnoredAppsSection
        ignoredApps={ignoredApps}
        setIgnoredApps={setIgnoredApps}
        newIgnoredApp={newIgnoredApp}
        setNewIgnoredApp={setNewIgnoredApp}
      />

      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground">
          {t('general.storageRetention')}
        </h3>
        {dashStats && (
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-lg border border-border bg-card/50 p-3">
              <Database size={14} className="mb-1 text-indigo-400" />
              <div className="text-sm font-semibold">{dashStats.total.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground">{t('backup.clips')}</div>
            </div>
            <div className="rounded-lg border border-border bg-card/50 p-3">
              <ImageOff size={14} className="mb-1 text-cyan-400" />
              <div className="text-sm font-semibold">{dashStats.images.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground">{t('subtype.image')}</div>
            </div>
            <div className="rounded-lg border border-border bg-card/50 p-3">
              <HardDrive size={14} className="mb-1 text-emerald-400" />
              <div className="text-sm font-semibold">{formatBytes(dashStats.db_size)}</div>
              <div className="text-[10px] text-muted-foreground">{t('backup.database')}</div>
            </div>
            <div className="rounded-lg border border-border bg-card/50 p-3">
              <FolderOpen size={14} className="mb-1 text-amber-400" />
              <div className="text-sm font-semibold">{formatBytes(dashStats.images_size)}</div>
              <div className="text-[10px] text-muted-foreground">{t('backup.imageFiles')}</div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium">{t('backup.dataDirectory')}</span>
            <p className="text-xs text-muted-foreground">{t('general.dataDirectoryHint')}</p>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={dataDirectory}
              readOnly
              className="field flex-1 text-muted-foreground"
              placeholder={t('backup.defaultLocation')}
            />
            <button
              onClick={handleSelectDataDirectory}
              disabled={!!dataAction}
              className="btn btn-secondary px-4"
              title={t('general.chooseFolder')}
            >
              <FolderOpen size={16} className="mr-2" />
              {dataAction === 'directory' ? t('backup.preparing') : t('general.chooseFolder')}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('general.currentDirectory', {
              path: dataDirectory || t('backup.defaultLocation'),
            })}
          </p>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-card/30 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('general.maxClips')}</span>
            <select
              value={MAX_ITEM_OPTIONS.includes(settings.max_items) ? settings.max_items : 'custom'}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'custom') updateSetting('max_items', 1000);
                else updateSetting('max_items', parseInt(v));
              }}
              className="field"
            >
              <option value={0}>{t('general.unlimited')}</option>
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
                className="field w-28"
                placeholder={t('general.enterNumber')}
              />
              <span className="text-xs text-muted-foreground">{t('general.clipsUnit')}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('general.autoDeleteClips')}</span>
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
              className="field"
            >
              <option value={0}>{t('general.never')}</option>
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
                className="field w-28"
                placeholder={t('general.enterDays')}
              />
              <span className="text-xs text-muted-foreground">{t('backup.days')}</span>
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-card/30 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('general.autoDeleteImages')}</span>
            <button
              onClick={() => updateSetting('image_auto_delete', !settings.image_auto_delete)}
              className={`h-6 w-11 rounded-full transition-colors ${
                settings.image_auto_delete ? 'bg-primary' : 'bg-accent'
              }`}
              aria-label={t('general.toggleImageAutoDelete')}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  settings.image_auto_delete ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('general.deleteImagesOlderThan')}</span>
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
              className="field"
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
                className="field w-28"
                placeholder={t('general.enterDays')}
              />
              <span className="text-xs text-muted-foreground">{t('backup.days')}</span>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t('general.cleanupScopeHint')}</p>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background/40 p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">{t('general.cleanupPreview')}</div>
              <div className="text-xs text-muted-foreground">
                {cleanupPreview
                  ? t('backup.imagePreviewResult', {
                      count: cleanupPreview.count.toLocaleString(),
                      size: formatBytes(cleanupPreview.bytes),
                    })
                  : t('general.cleanupPreviewHint')}
              </div>
              {cleanupPreview && cleanupPreview.protected_count > 0 && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {t('backup.protectedImages', {
                    count: cleanupPreview.protected_count.toLocaleString(),
                  })}
                </div>
              )}
            </div>
            <div className="flex flex-shrink-0 gap-2">
              <button
                onClick={previewOldImages}
                disabled={cleanupPreviewLoading || cleanupRunning}
                className="btn btn-secondary text-xs"
              >
                {cleanupPreviewLoading ? t('dashboard.checking') : t('backup.preview')}
              </button>
              <button
                onClick={handleCleanupOldImages}
                disabled={!cleanupPreview || cleanupPreview.count === 0 || cleanupRunning}
                className="btn btn-destructive text-xs disabled:opacity-50"
              >
                {cleanupRunning ? t('backup.deleting') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-medium text-red-500/80">{t('general.dataManagement')}</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={confirmClearHistory}
            disabled={!!dataAction || reclassifyRunning}
            className="btn btn-destructive"
          >
            <Trash2 size={16} className="mr-2" />
            {dataAction === 'clear' ? t('backup.clearing') : t('backup.clearHistoryTitle')}
          </button>

          <button
            onClick={handleRemoveDuplicates}
            disabled={!!dataAction || reclassifyRunning}
            className="btn btn-secondary text-xs disabled:opacity-50"
          >
            {dataAction === 'duplicates' ? t('backup.removing') : t('backup.dedupeTitle')}
          </button>

          <button
            onClick={handleExportBackup}
            disabled={!!dataAction || reclassifyRunning}
            className="btn btn-secondary text-xs disabled:opacity-50"
          >
            {dataAction === 'export' ? t('backup.exportingShort') : t('dashboard.exportBackup')}
          </button>

          <button
            onClick={() => void handleImportBackup()}
            disabled={!!dataAction || reclassifyRunning}
            className="btn btn-secondary text-xs disabled:opacity-50"
          >
            {dataAction === 'import' ? t('backup.importingShort') : t('backup.importTitle')}
          </button>

          <button
            onClick={handleReclassifyClips}
            disabled={!!dataAction || reclassifyRunning}
            className="btn btn-secondary text-xs disabled:opacity-50"
          >
            <RefreshCw size={14} className={`mr-2 ${reclassifyRunning ? 'animate-spin' : ''}`} />
            {reclassifyStage === 'subtypes'
              ? t('general.scanningTypes')
              : reclassifyStage === 'sensitive'
                ? t('general.scanningSensitive')
                : t('general.reclassifyClips')}
          </button>
        </div>
      </section>
    </>
  );
}
