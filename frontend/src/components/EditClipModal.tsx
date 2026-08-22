import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardItem } from '../types';

interface EditClipModalProps {
  clip: ClipboardItem | null;
  onPaste: (editedText: string) => void;
  onClose: () => void;
}

export function EditClipModal({ clip, onPaste, onClose }: EditClipModalProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef(text);
  textRef.current = text;
  const onPasteRef = useRef(onPaste);
  onPasteRef.current = onPaste;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (clip) {
      setText(clip.content);
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select();
      }, 50);
    }
  }, [clip]);

  useEffect(() => {
    if (!clip) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onPasteRef.current(textRef.current);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [clip]);

  if (!clip) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} /* bg-black/50 */
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-[90%] flex-col gap-2 rounded-lg border border-border bg-popover p-3 shadow-xl">
        <p className="text-xs text-muted-foreground">{t('editClipModal.hint')}</p>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="field h-28 w-full resize-none"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1 text-sm text-muted-foreground hover:bg-accent"
          >
            {t('common.cancel')}
          </button>
          <button onClick={() => onPaste(text)} className="btn btn-primary btn-sm">
            {t('common.paste')}
          </button>
        </div>
      </div>
    </div>
  );
}
