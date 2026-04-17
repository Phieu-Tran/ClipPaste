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
  const globalKeys = currentHotkey ? parseHotkey(currentHotkey) : ['Ctrl', 'Shift', 'V'];

  const shortcuts: { section: string; items: Shortcut[] }[] = [
    {
      section: 'General',
      items: [
        { keys: globalKeys, description: 'Open / Close ClipPaste (global)', configurable: true },
        { keys: ['Ctrl', 'Shift', 'S'], description: 'Toggle Scratchpad (global)' },
        { keys: ['Esc'], description: 'Close window' },
        { keys: ['Ctrl', 'F'], description: 'Focus search bar' },
      ],
    },
    {
      section: 'Clipboard list',
      items: [
        { keys: ['↑'], description: 'Select previous clip' },
        { keys: ['↓'], description: 'Select next clip' },
        { keys: ['Enter'], description: 'Paste selected clip' },
        { keys: ['E'], description: 'Edit before paste (text only)' },
        { keys: ['P'], description: 'Pin / Unpin selected clip' },
        { keys: ['Ctrl', 'Delete'], description: 'Delete selected clip' },
      ],
    },
    {
      section: 'Scratchpad',
      items: [
        { keys: ['↑'], description: 'Select previous note' },
        { keys: ['↓'], description: 'Select next note' },
        { keys: ['Enter'], description: 'Open paste modal for selected note' },
        { keys: ['E'], description: 'Edit selected note' },
        { keys: ['Delete'], description: 'Delete selected note (with Undo)' },
        { keys: ['/'], description: 'Focus search' },
        { keys: ['Ctrl', 'Enter'], description: 'Save edit / confirm paste (in modal)' },
        { keys: ['Esc'], description: 'Cancel / collapse' },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Keyboard size={20} className="text-muted-foreground" />
        <h3 className="text-base font-semibold">Keyboard Shortcuts</h3>
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
                    <span className="ml-1.5 text-[10px] text-muted-foreground/60">configurable</span>
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

      <p className="text-xs text-muted-foreground">
        The main global shortcut can be changed in <span className="font-medium text-foreground">General</span> settings.
        Single-key shortcuts (E, P, /) only work when no input is focused.
      </p>
    </div>
  );
}
