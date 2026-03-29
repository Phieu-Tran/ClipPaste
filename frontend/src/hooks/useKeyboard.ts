import { useEffect } from 'react';

interface KeyboardOptions {
  onClose?: () => void;
  onSearch?: () => void;
  onDelete?: () => void;
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
  onPaste?: () => void;
  onEdit?: () => void;
  onPin?: () => void;
}

export function useKeyboard(options: KeyboardOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && options.onClose) {
        e.preventDefault();
        options.onClose();
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'f' && options.onSearch) {
        e.preventDefault();
        options.onSearch();
      }

      if (e.key === 'Delete' && (e.ctrlKey || e.metaKey) && options.onDelete) {
        e.preventDefault();
        options.onDelete();
      }

      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Arrow keys work even when typing in search input
      if (e.key === 'ArrowUp' && options.onNavigateUp) {
        e.preventDefault();
        options.onNavigateUp();
      }

      if (e.key === 'ArrowDown' && options.onNavigateDown) {
        e.preventDefault();
        options.onNavigateDown();
      }

      if (e.key === 'Enter' && options.onPaste) {
        e.preventDefault();
        options.onPaste();
      }

      if (e.key === 'e' && !e.metaKey && !e.ctrlKey && !isTyping && options.onEdit) {
        e.preventDefault();
        options.onEdit();
      }

      if (e.key === 'p' && !e.metaKey && !e.ctrlKey && !isTyping && options.onPin) {
        e.preventDefault();
        options.onPin();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [options]);
}
