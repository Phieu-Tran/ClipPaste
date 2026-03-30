import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import {
  Briefcase, Code, Bookmark, Palette, Lock,
  Star, Heart, Zap, Coffee, Music,
  Globe, Camera, Gamepad2, Rocket, ShoppingBag,
  GraduationCap, Wrench, Lightbulb, MessageSquare, Flame,
  type LucideIcon,
} from 'lucide-react';

export const FOLDER_ICON_OPTIONS: { key: string; Icon: LucideIcon }[] = [
  { key: 'briefcase', Icon: Briefcase },
  { key: 'code', Icon: Code },
  { key: 'bookmark', Icon: Bookmark },
  { key: 'palette', Icon: Palette },
  { key: 'lock', Icon: Lock },
  { key: 'star', Icon: Star },
  { key: 'heart', Icon: Heart },
  { key: 'zap', Icon: Zap },
  { key: 'coffee', Icon: Coffee },
  { key: 'music', Icon: Music },
  { key: 'globe', Icon: Globe },
  { key: 'camera', Icon: Camera },
  { key: 'gamepad', Icon: Gamepad2 },
  { key: 'rocket', Icon: Rocket },
  { key: 'shopping', Icon: ShoppingBag },
  { key: 'graduation', Icon: GraduationCap },
  { key: 'wrench', Icon: Wrench },
  { key: 'lightbulb', Icon: Lightbulb },
  { key: 'message', Icon: MessageSquare },
  { key: 'flame', Icon: Flame },
];

export const FOLDER_ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  FOLDER_ICON_OPTIONS.map(({ key, Icon }) => [key, Icon])
);

const COLOR_OPTIONS = [
  { key: 'red', bg: 'bg-red-500' },
  { key: 'orange', bg: 'bg-orange-500' },
  { key: 'amber', bg: 'bg-amber-400' },
  { key: 'green', bg: 'bg-green-500' },
  { key: 'blue', bg: 'bg-blue-500' },
  { key: 'violet', bg: 'bg-violet-500' },
  { key: 'pink', bg: 'bg-pink-500' },
  { key: 'rose', bg: 'bg-rose-500' },
] as const;

interface FolderModalProps {
  isOpen: boolean;
  mode: 'create' | 'rename';
  initialName: string;
  initialColor?: string | null;
  initialIcon?: string | null;
  onClose: () => void;
  onSubmit: (name: string, color: string | null, icon: string | null) => void;
}

export function FolderModal({ isOpen, mode, initialName, initialColor, initialIcon, onClose, onSubmit }: FolderModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string | null>(initialColor ?? null);
  const [selectedIcon, setSelectedIcon] = useState<string | null>(initialIcon ?? null);

  useEffect(() => {
    if (isOpen) {
      setIsSubmitting(false);
      setSelectedColor(initialColor ?? null);
      setSelectedIcon(initialIcon ?? null);
      if (inputRef.current) {
        setTimeout(() => inputRef.current?.focus(), 50);
        if (mode === 'rename') {
          setTimeout(() => inputRef.current?.select(), 50);
        }
      }
    }
  }, [isOpen, mode, initialColor, initialIcon]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (isSubmitting) return;
    const val = inputRef.current?.value.trim();
    if (!val) return;
    if (val.length > 50 || /[<>:"|?*\\/]/.test(val)) return;
    setIsSubmitting(true);
    await onSubmit(val, selectedColor, selectedIcon);
    setIsSubmitting(false);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-80 rounded-xl border border-border bg-card p-6 shadow-2xl">
        <h3 className="mb-4 text-lg font-semibold text-foreground">
          {mode === 'create' ? 'Create New Folder' : 'Rename Folder'}
        </h3>
        <input
          ref={inputRef}
          type="text"
          placeholder="Folder Name"
          defaultValue={initialName}
          className="mb-4 w-full rounded-md border border-input bg-input px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
            else if (e.key === 'Escape') onClose();
          }}
        />

        {/* Icon Picker */}
        <div className="mb-4">
          <p className="mb-2 text-xs text-muted-foreground">Icon</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setSelectedIcon(null)}
              title="None"
              className={clsx(
                'flex h-7 w-7 items-center justify-center rounded-md border transition-all',
                selectedIcon === null
                  ? 'border-primary bg-primary/20 text-primary'
                  : 'border-transparent text-muted-foreground hover:bg-accent'
              )}
            >
              <span className="text-[10px] font-bold">Aa</span>
            </button>
            {FOLDER_ICON_OPTIONS.map(({ key, Icon }) => (
              <button
                key={key}
                onClick={() => setSelectedIcon(key)}
                title={key}
                className={clsx(
                  'flex h-7 w-7 items-center justify-center rounded-md border transition-all',
                  selectedIcon === key
                    ? 'border-primary bg-primary/20 text-primary'
                    : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
        </div>

        {/* Color Picker */}
        <div className="mb-4">
          <p className="mb-2 text-xs text-muted-foreground">Color</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedColor(null)}
              title="Auto"
              className={clsx(
                'h-5 w-5 rounded-full border-2 bg-gradient-to-br from-gray-300 to-gray-500 transition-all',
                selectedColor === null ? 'scale-125 border-white' : 'border-transparent'
              )}
            />
            {COLOR_OPTIONS.map(({ key, bg }) => (
              <button
                key={key}
                onClick={() => setSelectedColor(key)}
                title={key}
                className={clsx(
                  'h-5 w-5 rounded-full border-2 transition-all',
                  bg,
                  selectedColor === key ? 'scale-125 border-white' : 'border-transparent'
                )}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : mode === 'create' ? 'Create' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
