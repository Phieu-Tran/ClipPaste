import {
  Code,
  File as FileIcon,
  FileText,
  Folder as FolderIcon,
  Image as ImageIcon,
  Link2,
  Type,
} from 'lucide-react';
import { clsx } from 'clsx';
import { FolderItem } from '../../types';
import { COLOR_OPTIONS, FOLDER_ICON_MAP } from '../FolderModal';

export function ClipTypeIcon({ type, className }: { type: string; className?: string }) {
  const props = { size: 14, className: className ?? 'text-muted-foreground shrink-0' };
  switch (type) {
    case 'image':
      return <ImageIcon {...props} />;
    case 'url':
      return <Link2 {...props} />;
    case 'html':
      return <Code {...props} />;
    case 'rtf':
      return <Type {...props} />;
    case 'file':
      return <FileIcon {...props} />;
    default:
      return <FileText {...props} />;
  }
}

export function FolderGlyph({ folder, size = 16 }: { folder: FolderItem; size?: number }) {
  if (folder.icon && FOLDER_ICON_MAP[folder.icon]) {
    const { Icon, color } = FOLDER_ICON_MAP[folder.icon];
    return <Icon size={size} className={clsx('shrink-0', color || 'text-blue-400')} />;
  }

  return <FolderIcon size={size} className="shrink-0 text-blue-400" />;
}

export function FolderColorDot({ color }: { color: string | null }) {
  const option = COLOR_OPTIONS.find((item) => item.key === color);
  return (
    <span
      className={clsx(
        'h-2.5 w-2.5 shrink-0 rounded-full border border-white/20',
        option?.bg ?? 'bg-muted'
      )}
    />
  );
}
