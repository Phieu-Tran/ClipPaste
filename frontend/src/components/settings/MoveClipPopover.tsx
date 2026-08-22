import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { Folder as FolderIcon, Inbox, Search } from 'lucide-react';
import { FolderItem } from '../../types';

interface MoveClipPopoverProps {
  folders: FolderItem[];
  excludeFolderId: string;
  onSelect: (folderId: string | null) => void;
  onClose: () => void;
}

export function MoveClipPopover({
  folders,
  excludeFolderId,
  onSelect,
  onClose,
}: MoveClipPopoverProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  const lowerSearch = search.toLowerCase();
  const matchingFolders = folders
    .filter((folder) => folder.id !== excludeFolderId)
    .filter((folder) => folder.name.toLowerCase().includes(lowerSearch));

  return (
    <div
      ref={popoverRef}
      className="absolute right-0 top-8 z-30 w-64 overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
        <Search size={12} className="text-muted-foreground" />
        <input
          autoFocus
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('batchBar.searchFolders')}
          className="min-w-0 flex-1 bg-transparent text-xs focus:outline-none"
        />
      </div>
      <div className="max-h-56 overflow-y-auto py-1">
        {'all'.includes(lowerSearch) && (
          <button
            onClick={() => onSelect(null)}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-accent"
          >
            <Inbox size={13} className="text-muted-foreground" />
            <span>{t('folders.moveToAll')}</span>
          </button>
        )}
        {matchingFolders.map((folder) => (
          <button
            key={folder.id}
            onClick={() => onSelect(folder.id)}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-accent"
          >
            <FolderIcon size={13} className="text-blue-400" />
            <span className="min-w-0 flex-1 truncate">{folder.name}</span>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {folder.item_count}
            </span>
          </button>
        ))}
        {matchingFolders.length === 0 && !'all'.includes(lowerSearch) && (
          <div className="px-2.5 py-3 text-center text-[11px] text-muted-foreground">
            No matching folder
          </div>
        )}
      </div>
    </div>
  );
}
