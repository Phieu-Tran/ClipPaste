import { useEffect, useRef } from 'react';

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
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const opts = optionsRef.current;

      if (e.key === 'Escape' && opts.onClose) {
        e.preventDefault();
        opts.onClose();
      }

      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key === 'f' && opts.onSearch) {
        e.preventDefault();
        opts.onSearch();
        return;
      }

      // Arrow keys + Enter work even while typing in search (for quick navigation)
      if (e.key === 'ArrowUp' && opts.onNavigateUp) {
        e.preventDefault();
        opts.onNavigateUp();
      }

      if (e.key === 'ArrowDown' && opts.onNavigateDown) {
        e.preventDefault();
        opts.onNavigateDown();
      }

      if (e.key === 'Enter' && opts.onPaste) {
        e.preventDefault();
        opts.onPaste();
      }

      // These shortcuts are blocked while typing in inputs
      if (isTyping) return;

      if (e.key === 'Delete' && (e.ctrlKey || e.metaKey) && opts.onDelete) {
        e.preventDefault();
        opts.onDelete();
      }

      if (e.key === 'e' && !e.metaKey && !e.ctrlKey && opts.onEdit) {
        e.preventDefault();
        opts.onEdit();
      }

      if (e.key === 'p' && opts.onPin) {
        e.preventDefault();
        opts.onPin();
      }
    };

    // Listen on window during the capture phase so Ctrl+F is handled before
    // WebView2 (or a child control that stops propagation) can open its native
    // find UI. That native UI lives outside the document and can also make the
    // Tauri window report itself as unfocused, which interferes with the global
    // toggle shortcut until the window is reopened.
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []); // Subscribe once — options accessed via ref
}
