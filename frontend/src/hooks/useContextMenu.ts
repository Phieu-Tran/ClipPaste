import { useCallback, useState } from 'react';

interface ContextMenuState {
  type: 'card' | 'folder';
  x: number;
  y: number;
  itemId: string;
}

export function useContextMenu() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, type: 'card' | 'folder', itemId: string) => {
      e.preventDefault();
      setContextMenu({ type, x: e.clientX, y: e.clientY, itemId });
    },
    []
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return {
    contextMenu,
    handleContextMenu,
    handleCloseContextMenu,
  };
}
