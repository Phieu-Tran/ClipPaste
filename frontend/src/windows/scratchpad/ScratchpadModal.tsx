import { useTranslation } from 'react-i18next';
import { X, ClipboardPaste, Pencil, ChevronLeft } from 'lucide-react';
import { clsx } from 'clsx';
import { NOTE_COLORS } from './scratchpadShared';

interface ScratchpadModalProps {
  isPaste: boolean;
  itemTitle: string;
  goBack: () => void;
  pasteTextareaRef: React.RefObject<HTMLTextAreaElement>;
  pasteContent: string;
  setPasteContent: (v: string) => void;
  doPaste: () => void;
  isPasting: boolean;
  titleRef: React.RefObject<HTMLInputElement>;
  editTitle: string;
  setEditTitle: (v: string) => void;
  editColor: string | null;
  setEditColor: (v: string | null) => void;
  editContent: string;
  setEditContent: (v: string) => void;
  saveEdit: () => void;
}

export function ScratchpadModal({
  isPaste,
  itemTitle,
  goBack,
  pasteTextareaRef,
  pasteContent,
  setPasteContent,
  doPaste,
  isPasting,
  titleRef,
  editTitle,
  setEditTitle,
  editColor,
  setEditColor,
  editContent,
  setEditContent,
  saveEdit,
}: ScratchpadModalProps) {
  const { t } = useTranslation();
  return (
    <div
      data-scratchpad-shell
      className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border/20 bg-background/95 text-foreground shadow-2xl backdrop-blur-xl"
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 border-b border-border/30 px-3 py-2"
        data-tauri-drag-region
      >
        <button
          onClick={goBack}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          title={t('scratchpad.back')}
        >
          <ChevronLeft size={15} />
        </button>
        {isPaste ? (
          <ClipboardPaste size={14} className="text-primary" />
        ) : (
          <Pencil size={14} className="text-amber-400" />
        )}
        <span className="flex-1 truncate text-sm font-semibold text-foreground/90">
          {isPaste ? itemTitle || t('scratchpad.pasteSnippet') : t('scratchpad.editNote')}
        </span>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col overflow-y-auto p-3">
        {isPaste ? (
          <textarea
            ref={pasteTextareaRef}
            value={pasteContent}
            onChange={(e) => setPasteContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') goBack();
              if (e.key === 'Enter' && e.ctrlKey) doPaste();
            }}
            className="h-full w-full flex-1 resize-none rounded-lg border border-border/30 bg-input/30 px-3 py-2 text-[13px] leading-relaxed text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-ring"
          />
        ) : (
          <>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Title
            </label>
            <input
              ref={titleRef}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') goBack();
              }}
              className="mb-2.5 w-full rounded-lg border border-border/30 bg-input/30 px-3 py-2 text-[13px] font-semibold text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-ring"
              placeholder={t('scratchpad.titlePlaceholder')}
            />
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {t('folderModal.color')}
            </label>
            <div className="mb-2.5 flex items-center gap-1.5">
              <button
                onClick={() => setEditColor(null)}
                className={clsx(
                  'rounded-full border-2 p-1',
                  !editColor ? 'border-foreground/60' : 'border-transparent'
                )}
                title={t('scratchpad.noColor')}
              >
                <X size={10} className="text-muted-foreground/60" />
              </button>
              {NOTE_COLORS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setEditColor(c.key)}
                  className={clsx(
                    'h-5 w-5 rounded-full border-2 transition-transform',
                    c.dot,
                    editColor === c.key
                      ? 'scale-110 border-foreground/70'
                      : 'border-transparent hover:scale-110'
                  )}
                  title={c.key}
                />
              ))}
            </div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {t('scratchpad.content')}
            </label>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') goBack();
                if (e.key === 'Enter' && e.ctrlKey) saveEdit();
              }}
              className="w-full flex-1 resize-none rounded-lg border border-border/30 bg-input/30 px-3 py-2 text-[13px] leading-relaxed text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-ring"
              rows={10}
              placeholder={t('scratchpad.contentPlaceholder')}
            />
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-border/30 px-3 py-2">
        <span className="text-[10px] text-muted-foreground/60">
          {t(isPaste ? 'scratchpad.pasteHint' : 'scratchpad.saveHint')}
        </span>
        {isPaste ? (
          <button
            onClick={doPaste}
            disabled={isPasting}
            className={clsx(
              'flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/80',
              isPasting && 'cursor-wait opacity-60'
            )}
          >
            <ClipboardPaste size={14} /> {t('common.paste')}
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={goBack}
              className="rounded-md px-3.5 py-1.5 text-xs text-muted-foreground hover:bg-accent"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={saveEdit}
              className="rounded-md bg-primary/20 px-3.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/30"
            >
              {t('common.save')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
