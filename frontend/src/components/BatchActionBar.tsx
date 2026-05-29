import { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { Clipboard, FolderInput, Inbox, Pin, PinOff, Search, Trash2, X } from 'lucide-react';
import { FolderItem } from '../types';

interface BatchActionBarProps {
  selectedClipIds: Set<string>;
  folders: FolderItem[];
  selectedFolder: string | null;
  onPaste: () => void;
  onPin: () => void;
  onUnpin: () => void;
  onDelete: () => void;
  onMove: (folderId: string | null) => Promise<void>;
  onCancel: () => void;
}

export function BatchActionBar({
  selectedClipIds,
  folders,
  selectedFolder,
  onPaste,
  onPin,
  onUnpin,
  onDelete,
  onMove,
  onCancel,
}: BatchActionBarProps) {
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkMoveSearch, setBulkMoveSearch] = useState('');
  const bulkMoveRef = useRef<HTMLDivElement | null>(null);

  // Close folder dropdown on outside click
  useEffect(() => {
    if (!bulkMoveOpen) return;
    const onDown = (e: MouseEvent) => {
      if (bulkMoveRef.current && !bulkMoveRef.current.contains(e.target as Node)) {
        setBulkMoveOpen(false);
        setBulkMoveSearch('');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [bulkMoveOpen]);

  const filteredFolders = useMemo(() => {
    const query = bulkMoveSearch.trim().toLowerCase();
    return folders
      .filter((f) => !f.is_system)
      .filter((f) => (query ? f.name.toLowerCase().includes(query) : true));
  }, [bulkMoveSearch, folders]);

  const handleMove = useCallback(
    async (folderId: string | null) => {
      await onMove(folderId);
      setBulkMoveOpen(false);
      setBulkMoveSearch('');
    },
    [onMove]
  );

  const showMoveButton = folders.filter((f) => !f.is_system).length > 0 || selectedFolder;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 pointer-events-none absolute bottom-5 left-0 right-0 z-40 flex justify-center duration-200">
      <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border/60 bg-background/95 px-3 py-2 shadow-xl backdrop-blur-md">
        <span className="min-w-[82px] text-xs font-semibold text-primary">
          {selectedClipIds.size} selected
        </span>
        <div className="h-3.5 w-px bg-border/50" />
        <button
          onClick={onPaste}
          className="flex items-center gap-1.5 rounded-md bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/25"
        >
          <Clipboard size={13} />
          Paste
        </button>
        <button
          onClick={onPin}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Pin size={13} />
          Pin
        </button>
        <button
          onClick={onUnpin}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <PinOff size={13} />
          Unpin
        </button>
        <button
          onClick={onDelete}
          className="flex items-center gap-1.5 rounded-md bg-destructive/15 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/25"
        >
          <Trash2 size={13} />
          Delete
        </button>
        {showMoveButton && (
          <div ref={bulkMoveRef} className="relative">
            <button
              onClick={() => setBulkMoveOpen((open) => !open)}
              className="flex items-center gap-1.5 rounded-md border border-border/50 bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <FolderInput size={13} className="text-muted-foreground" />
              Move
            </button>
            {bulkMoveOpen && (
              <div className="absolute bottom-full left-0 z-50 mb-2 w-64 overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
                <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
                  <Search size={13} className="text-muted-foreground" />
                  <input
                    autoFocus
                    value={bulkMoveSearch}
                    onChange={(e) => setBulkMoveSearch(e.target.value)}
                    placeholder="Search folders..."
                    className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  <button
                    onClick={() => handleMove(null)}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-accent"
                  >
                    <Inbox size={13} className="text-muted-foreground" />
                    <span className="flex-1">All</span>
                  </button>
                  {filteredFolders.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() => handleMove(folder.id)}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-accent"
                    >
                      <FolderInput size={13} className="text-blue-400" />
                      <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {folder.item_count}
                      </span>
                    </button>
                  ))}
                  {filteredFolders.length === 0 && (
                    <div className="px-2.5 py-3 text-center text-[11px] text-muted-foreground">
                      No matching folder
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="h-3.5 w-px bg-border/50" />
        <button
          onClick={onCancel}
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X size={13} />
          Cancel
        </button>
      </div>
    </div>
  );
}
