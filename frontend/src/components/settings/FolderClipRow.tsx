import { useTranslation } from 'react-i18next';
import { ReactNode } from 'react';
import { ArrowRightLeft, Check, Pin, Trash2 } from 'lucide-react';
import { ClipboardItem } from '../../types';
import { formatRelativeTime } from '../../utils/format';
import { ClipTypeIcon } from './FolderVisuals';

interface FolderClipRowProps {
  clip: ClipboardItem;
  isChecked: boolean;
  onToggleSelect: () => void;
  onToggleMove: () => void;
  onDelete: () => void;
  /** Rendered when this row's move popover is open. */
  movePopover?: ReactNode;
}

export function FolderClipRow({
  clip,
  isChecked,
  onToggleSelect,
  onToggleMove,
  onDelete,
  movePopover,
}: FolderClipRowProps) {
  const { t } = useTranslation();
  const previewText =
    clip.clip_type === 'image' ? t('subtype.image') : clip.preview?.trim() || '(empty)';

  return (
    <li
      className={`group relative flex items-center gap-2 px-3 py-2 hover:bg-accent/30 ${
        isChecked ? 'bg-primary/5' : ''
      }`}
    >
      <button
        onClick={onToggleSelect}
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
          isChecked
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border text-transparent hover:border-primary/60'
        }`}
        title={t('folders.selectClip')}
      >
        <Check size={11} />
      </button>
      <ClipTypeIcon type={clip.clip_type} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-foreground/90">{previewText}</div>
        {clip.note && (
          <div className="truncate text-[11px] italic text-muted-foreground">{clip.note}</div>
        )}
      </div>
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
        {formatRelativeTime(clip.created_at)}
      </span>
      {clip.is_pinned && (
        <Pin size={11} className="shrink-0 text-amber-400" aria-label={t('folders.pinned')} />
      )}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleMove();
          }}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          title={t('folders.moveToAnother')}
        >
          <ArrowRightLeft size={12} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title={t('folders.deleteClip')}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {movePopover}
    </li>
  );
}
