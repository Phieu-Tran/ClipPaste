import { useTranslation } from 'react-i18next';
import { Keyboard } from 'lucide-react';

interface Shortcut {
  keys: string[];
  description: string;
  configurable?: boolean;
}

interface HotkeysTabProps {
  currentHotkey?: string;
}

function KeyBadge({ label }: { label: string }) {
  return (
    <kbd className="inline-flex min-w-[24px] items-center justify-center rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium text-foreground shadow-sm">
      {label}
    </kbd>
  );
}

function parseHotkey(hotkey: string): string[] {
  return hotkey.split('+').map((k) => k.trim());
}

export function HotkeysTab({ currentHotkey }: HotkeysTabProps) {
  const { t } = useTranslation();
  const globalKeys = currentHotkey ? parseHotkey(currentHotkey) : ['Ctrl', 'Shift', 'V'];

  const shortcuts: { section: string; items: Shortcut[] }[] = [
    {
      section: t('hotkeys.sectionGeneral'),
      items: [
        { keys: globalKeys, description: t('hotkeys.toggleApp'), configurable: true },
        { keys: ['Ctrl', 'Shift', 'S'], description: t('hotkeys.toggleScratchpad') },
        { keys: ['Esc'], description: t('hotkeys.closeWindow') },
        { keys: ['Ctrl', 'F'], description: t('hotkeys.focusSearchBar') },
      ],
    },
    {
      section: t('hotkeys.sectionClipList'),
      items: [
        { keys: ['↑'], description: t('hotkeys.prevClip') },
        { keys: ['↓'], description: t('hotkeys.nextClip') },
        { keys: ['Enter'], description: t('hotkeys.pasteClip') },
        { keys: ['E'], description: t('hotkeys.editBeforePaste') },
        { keys: ['P'], description: t('hotkeys.togglePin') },
        { keys: ['Ctrl', 'Delete'], description: t('hotkeys.deleteClip') },
      ],
    },
    {
      section: t('hotkeys.sectionScratchpad'),
      items: [
        { keys: ['↑'], description: t('hotkeys.prevNote') },
        { keys: ['↓'], description: t('hotkeys.nextNote') },
        { keys: ['Enter'], description: t('hotkeys.openNoteModal') },
        { keys: ['E'], description: t('hotkeys.editNote') },
        { keys: ['Delete'], description: t('hotkeys.deleteNote') },
        { keys: ['/'], description: t('hotkeys.focusSearch') },
        { keys: ['Ctrl', 'Enter'], description: t('hotkeys.saveOrConfirm') },
        { keys: ['Esc'], description: t('hotkeys.cancelCollapse') },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Keyboard size={20} className="text-muted-foreground" />
        <h3 className="text-base font-semibold">{t('hotkeys.title')}</h3>
      </div>

      {shortcuts.map((group) => (
        <div key={group.section} className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">{group.section}</h4>
          <div className="rounded-lg border border-border bg-card/50">
            {group.items.map((item, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between px-4 py-2.5 ${idx !== group.items.length - 1 ? 'border-b border-border' : ''}`}
              >
                <span className="text-sm">
                  {item.description}
                  {item.configurable && (
                    <span className="ml-1.5 text-[10px] text-muted-foreground/60">
                      configurable
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1">
                  {item.keys.map((k, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <span className="text-[10px] text-muted-foreground">+</span>}
                      <KeyBadge label={k} />
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="text-xs text-muted-foreground">{t('hotkeys.footnote')}</p>
    </div>
  );
}
