import { useEffect } from 'react';

interface KeyboardOptions {
  onClose?: () => void;
  onSearch?: () => void;
  onDelete?: () => void;
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
  onPaste?: () => void;
  onEdit?: () => void;
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

      if (e.key === 'e' && !e.metaKey && !e.ctrlKey && options.onEdit) {
        e.preventDefault();
        options.onEdit();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [options]);
}
