import { useTranslation } from 'react-i18next';
import { DragEvent } from 'react';
import { Check, GripVertical, X } from 'lucide-react';
import { clsx } from 'clsx';
import { FolderItem } from '../../types';
import { COLOR_OPTIONS, FOLDER_ICON_OPTIONS } from '../FolderModal';
import { FolderColorDot, FolderGlyph } from './FolderVisuals';

interface FolderSidebarItemProps {
  folder: FolderItem;
  isSelected: boolean;
  isEditing: boolean;
  isDragSource: boolean;
  isDropTarget: boolean;
  searchActive: boolean;
  renameValue: string;
  setRenameValue: (v: string) => void;
  editingColor: string | null;
  setEditingColor: (v: string | null) => void;
  editingIcon: string | null;
  setEditingIcon: (v: string | null) => void;
  onSelect: () => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

export function FolderSidebarItem({
  folder,
  isSelected,
  isEditing,
  isDragSource,
  isDropTarget,
  searchActive,
  renameValue,
  setRenameValue,
  editingColor,
  setEditingColor,
  editingIcon,
  setEditingIcon,
  onSelect,
  onSaveRename,
  onCancelRename,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: FolderSidebarItemProps) {
  const { t } = useTranslation();
  return (
    <div
      draggable={!isEditing && !searchActive}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={clsx(
        'rounded-md border transition-colors',
        isSelected ? 'border-primary/40 bg-primary/10' : 'border-transparent',
        isDragSource && 'opacity-45',
        isDropTarget && 'border-primary/60 bg-primary/15'
      )}
    >
      {isEditing ? (
        <div className="space-y-2 p-2">
          <div className="flex items-center gap-1.5">
            <FolderGlyph
              folder={{
                ...folder,
                color: editingColor,
                icon: editingIcon,
              }}
              size={15}
            />
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveRename();
                if (e.key === 'Escape') onCancelRename();
              }}
            />
            <button
              onClick={onSaveRename}
              className="rounded p-1.5 text-primary hover:bg-primary/10"
              title={t('common.save')}
            >
              <Check size={13} />
            </button>
            <button
              onClick={onCancelRename}
              className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              title={t('common.cancel')}
            >
              <X size={13} />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <button
              onClick={() => setEditingIcon(null)}
              title={t('folderModal.noIcon')}
              className={clsx(
                'flex h-6 w-6 items-center justify-center rounded border text-[10px] font-semibold transition-colors',
                editingIcon === null
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              Aa
            </button>
            <div className="flex max-h-[74px] flex-1 flex-wrap gap-1 overflow-y-auto pr-0.5">
              {FOLDER_ICON_OPTIONS.map(({ key, Icon, color }) => (
                <button
                  key={key}
                  onClick={() => setEditingIcon(key)}
                  title={key}
                  className={clsx(
                    'flex h-6 w-6 items-center justify-center rounded border transition-colors',
                    editingIcon === key
                      ? 'border-primary bg-primary/15'
                      : 'border-transparent hover:bg-accent',
                    editingIcon === key ? color : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon size={13} />
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditingColor(null)}
              title={t('folderModal.autoColor')}
              className={clsx(
                'h-5 w-5 rounded-full border-2 bg-gradient-to-br from-gray-300 to-gray-500 transition-transform',
                editingColor === null ? 'scale-110 border-white' : 'border-transparent'
              )}
            />
            {COLOR_OPTIONS.map(({ key, bg }) => (
              <button
                key={key}
                onClick={() => setEditingColor(key)}
                title={key}
                className={clsx(
                  'h-5 w-5 rounded-full border-2 transition-transform',
                  bg,
                  editingColor === key ? 'scale-110 border-white' : 'border-transparent'
                )}
              />
            ))}
          </div>
        </div>
      ) : (
        <button
          onClick={onSelect}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left hover:bg-accent/40"
        >
          <GripVertical
            size={13}
            className={clsx('shrink-0 text-muted-foreground/60', searchActive && 'opacity-30')}
          />
          <FolderGlyph folder={folder} />
          <FolderColorDot color={folder.color} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{folder.name}</span>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            {folder.item_count}
          </span>
        </button>
      )}
    </div>
  );
}
