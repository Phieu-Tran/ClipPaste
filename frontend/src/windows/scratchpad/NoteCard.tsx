import { useTranslation } from 'react-i18next';
import { Trash2, Copy, Check, Pin, ClipboardPaste, Pencil } from 'lucide-react';
import { clsx } from 'clsx';
import { ScratchpadItem } from '../../types';
import { getNoteColorStyle, renderMarkdownPreview } from './scratchpadShared';

// ── Single note card in the list view ──
interface NoteCardProps {
  item: ScratchpadItem;
  isSelected: boolean;
  showPinnedDivider: boolean;
  isDragTarget: boolean;
  copied: boolean;
  onSelect: (id: string) => void;
  onDragStartItem: (id: string) => void;
  onDragOverItem: (e: React.DragEvent) => void;
  onDropItem: () => void;
  onDragEndItem: () => void;
  onPaste: (item: ScratchpadItem) => void;
  onEdit: (item: ScratchpadItem) => void;
  onTogglePin: (id: string) => void;
  onCopy: (text: string, id: string) => void;
  onDelete: (id: string) => void;
}

export function NoteCard({
  item,
  isSelected,
  showPinnedDivider,
  isDragTarget,
  copied,
  onSelect,
  onDragStartItem,
  onDragOverItem,
  onDropItem,
  onDragEndItem,
  onPaste,
  onEdit,
  onTogglePin,
  onCopy,
  onDelete,
}: NoteCardProps) {
  const { t } = useTranslation();
  const colorStyle = getNoteColorStyle(item.color);
  const hasColor = !!item.color;
  const charCount = item.content.length;
  return (
    <div>
      {showPinnedDivider && (
        <div className="my-2 flex items-center gap-2 px-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/40">
          <div className="h-px flex-1 bg-white/[0.06]" />
          <span>{t('scratchpad.others')}</span>
          <div className="h-px flex-1 bg-white/[0.06]" />
        </div>
      )}
      <div
        draggable
        onClick={(e) => {
          e.stopPropagation();
          onSelect(item.id);
        }}
        onDragStart={(e) => {
          const text = item.title ? `${item.title}\n${item.content}` : item.content;
          e.dataTransfer.setData('text/plain', text);
          e.dataTransfer.effectAllowed = 'copyMove';
          onDragStartItem(item.id);
        }}
        onDragOver={onDragOverItem}
        onDrop={onDropItem}
        onDragEnd={onDragEndItem}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onPaste(item);
        }}
        className={clsx(
          'group relative mb-2 flex overflow-hidden rounded-xl border transition-all duration-200 ease-out',
          item.is_pinned ? 'border-amber-400/30' : 'border-white/[0.08]',
          isSelected
            ? 'ring-2 ring-primary/50'
            : 'hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10',
          isDragTarget && 'ring-1 ring-primary/30'
        )}
        style={{
          ...colorStyle,
          ...(!hasColor ? { background: 'hsl(var(--card) / 0.5)' } : {}),
        }}
      >
        {/* Left paste strip */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPaste(item);
          }}
          className="flex w-7 flex-shrink-0 items-center justify-center border-r border-white/[0.06] text-muted-foreground/60 transition-colors hover:bg-primary/15 hover:text-primary"
          title={t('common.paste')}
        >
          <ClipboardPaste size={12} />
        </button>

        {/* Content */}
        <div className="min-w-0 flex-1 px-2.5 py-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
              {item.is_pinned && <Pin size={10} className="flex-shrink-0 text-amber-400" />}
              {item.title ? (
                <span className="truncate text-xs font-semibold text-foreground/95">
                  {item.title}
                </span>
              ) : (
                <span className="text-[11px] italic text-muted-foreground/50">
                  {t('scratchpad.untitled')}
                </span>
              )}
            </div>
            <div className="flex flex-shrink-0 items-center gap-0.5 rounded-md bg-background/80 px-0.5 opacity-0 shadow-sm ring-1 ring-border/30 backdrop-blur-sm transition-all group-hover:opacity-100">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePin(item.id);
                }}
                className={clsx(
                  'rounded p-1.5 transition-colors',
                  item.is_pinned
                    ? 'text-amber-400'
                    : 'text-muted-foreground/70 hover:bg-amber-400/15 hover:text-amber-400'
                )}
                title={t(item.is_pinned ? 'common.unpin' : 'common.pin')}
              >
                <Pin size={12} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(item);
                }}
                className="rounded p-1.5 text-muted-foreground/70 transition-colors hover:bg-amber-400/15 hover:text-amber-400"
                title={t('scratchpad.edit')}
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy(item.title ? `${item.title}\n${item.content}` : item.content, item.id);
                }}
                className="rounded p-1.5 text-muted-foreground/70 transition-colors hover:bg-white/[0.08] hover:text-foreground/90"
                title={t('scratchpad.copy')}
              >
                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              </button>
              <div className="mx-0.5 h-4 w-px bg-border/40" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item.id);
                }}
                className="rounded p-1.5 text-muted-foreground/70 transition-colors hover:bg-red-400/15 hover:text-red-400"
                title={t('common.delete')}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
          {item.content ? (
            <div className="line-clamp-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-foreground/70">
              {renderMarkdownPreview(item.content)}
            </div>
          ) : null}
          {/* Char counter — subtle, shows on hover only */}
          {charCount > 0 && (
            <div className="mt-1 text-right text-[9px] font-medium text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100">
              {/* `n`, not `count`: i18next treats `count` as the plural selector and
                  this value is a pre-formatted string like "1.2k". */}
              {t('scratchpad.chars', {
                n: charCount >= 1000 ? `${(charCount / 1000).toFixed(1)}k` : String(charCount),
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
