import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Crosshair, FolderOpen, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { cmd } from '../../commands';

interface IgnoredAppsSectionProps {
  ignoredApps: string[];
  setIgnoredApps: React.Dispatch<React.SetStateAction<string[]>>;
  newIgnoredApp: string;
  setNewIgnoredApp: (v: string) => void;
}

export function IgnoredAppsSection({
  ignoredApps,
  setIgnoredApps,
  newIgnoredApp,
  setNewIgnoredApp,
}: IgnoredAppsSectionProps) {
  // Target mode: countdown that captures whichever app is focused when it expires.
  const { t } = useTranslation();
  const [targetCountdown, setTargetCountdown] = useState<number | null>(null);

  const showIgnoredAppAddedToast = (app: string) => {
    toast.success(t('toast.ignoringApp', { app }), {
      action: {
        label: t('common.undo'),
        onClick: async () => {
          try {
            await cmd.removeIgnoredApp(app);
            setIgnoredApps((prev) => prev.filter((existing) => existing !== app));
            toast.success(t('toast.unignoredApp', { app }));
          } catch (e) {
            toast.error(t('toast.unignoreAppFailed', { error: String(e) }));
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
      toast.info(t('ignoredApps.alreadyIgnored', { app }));
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
      toast.error(t('toast.addIgnoredAppFailed', { error: String(e) }));
      console.error(e);
    }
  };

  const pickTargetApp = async () => {
    if (targetCountdown !== null) return null;
    const DELAY_SEC = 4;
    setTargetCountdown(DELAY_SEC);
    toast.info(t('ignoredApps.captureCountdown', { seconds: DELAY_SEC }));

    const tick = setInterval(() => {
      setTargetCountdown((v) => (v !== null && v > 1 ? v - 1 : v));
    }, 1000);

    try {
      const picked = await cmd.pickForegroundApp(DELAY_SEC * 1000);
      // Prefer exe name (what the ignore check compares against). Fall back to display name.
      const target = picked.exe_name || picked.app_name || '';
      if (!target || target.toLowerCase().includes('clippaste')) {
        toast.error(t('ignoredApps.captureFailed'));
        return null;
      } else {
        return target;
      }
    } catch (e) {
      toast.error(t('ignoredApps.captureError', { error: String(e) }));
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
    toast.success(t('ignoredApps.captured', { app: target }));
  };

  const handleTargetAndIgnoreApp = async () => {
    const target = await pickTargetApp();
    if (!target) return;
    try {
      await addIgnoredAppValue(target);
    } catch (e) {
      toast.error(t('toast.addIgnoredAppFailed', { error: String(e) }));
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

  const handleRemoveIgnoredApp = async (app: string) => {
    try {
      await cmd.removeIgnoredApp(app);
      setIgnoredApps((prev) => prev.filter((a) => a !== app));
      toast.success(t('toast.unignoredApp', { app }));
    } catch (e) {
      toast.error(t('toast.unignoreAppFailed', { error: String(e) }));
      console.error(e);
    }
  };

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground">{t('ignoredApps.sectionTitle')}</h3>
      <div className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium">{t('ignoredApps.label')}</span>
          <p className="text-xs text-muted-foreground">{t('ignoredApps.hint')}</p>
        </label>

        <button
          onClick={handleTargetAndIgnoreApp}
          disabled={targetCountdown !== null}
          className="btn btn-secondary w-full justify-center gap-2"
          title={t('ignoredApps.pickAndIgnoreTitle')}
        >
          {targetCountdown !== null ? (
            <span className="text-xs font-semibold">{targetCountdown}s</span>
          ) : (
            <>
              <Crosshair size={16} />
              <span>{t('ignoredApps.pickAndIgnore')}</span>
            </>
          )}
        </button>

        <div className="flex gap-2">
          <input
            type="text"
            value={newIgnoredApp}
            onChange={(e) => setNewIgnoredApp(e.target.value)}
            placeholder={t('ignoredApps.placeholder')}
            className="field flex-1"
            onKeyDown={(e) => e.key === 'Enter' && handleAddIgnoredApp()}
          />
          <button
            onClick={handleTargetApp}
            disabled={targetCountdown !== null}
            className="btn btn-secondary px-3"
            title={t('ignoredApps.targetTitle')}
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
            title={t('ignoredApps.browseTitle')}
          >
            <FolderOpen size={16} />
          </button>
          <button
            onClick={handleAddIgnoredApp}
            disabled={!newIgnoredApp.trim()}
            className="btn btn-secondary px-3"
            title={t('ignoredApps.addTitle')}
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
          {ignoredApps.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">{t('ignoredApps.empty')}</p>
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
  );
}
