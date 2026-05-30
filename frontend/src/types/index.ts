export interface ClipboardItem {
  id: string;
  clip_type: string;
  content: string;
  preview: string;
  folder_id: string | null;
  created_at: string;
  source_app: string | null;
  source_icon: string | null;
  metadata: string | null;
  is_pinned: boolean;
  subtype: string | null;
  note: string | null;
  paste_count: number;
  is_sensitive: boolean;
  thumbnail: string | null;
}

export interface FolderItem {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  is_system: boolean;
  item_count: number;
}

export interface Settings {
  max_items: number;
  auto_delete_days: number;
  image_auto_delete: boolean;
  image_delete_days: number;
  startup_with_windows: boolean;
  show_in_taskbar: boolean;
  hotkey: string;
  theme: string;
  mica_effect?: string;
  auto_paste: boolean;
  ignore_ghost_clips: boolean;
  data_directory?: string;
}

export interface ScratchpadItem {
  id: string;
  uuid: string;
  title: string;
  content: string;
  is_pinned: boolean;
  color: string | null;
  position: number;
  created_at: string;
  updated_at: string | null;
}

export interface DashboardStats {
  total: number;
  today: number;
  images: number;
  text: number;
  folders: number;
  pinned: number;
  sensitive: number;
  in_folders: number;
  urls: number;
  daily: { day: string; count: number }[];
  top_apps: { app: string; count: number }[];
  most_pasted: { id: string; preview: string; count: number }[];
  db_size: number;
  images_size: number;
  old_images_14d: {
    days: number;
    count: number;
    bytes: number;
    protected_count: number;
    oldest_created_at: string | null;
    newest_created_at: string | null;
  };
}

export interface DashClip {
  id: string;
  clip_type: string;
  content: string;
  preview: string;
  created_at: string;
  source_app: string | null;
  subtype: string | null;
}

export interface ImageCleanupPreview {
  days: number;
  count: number;
  bytes: number;
  protected_count: number;
  oldest_created_at: string | null;
  newest_created_at: string | null;
}

export interface SyncStatus {
  state: 'disabled' | 'idle' | 'syncing' | 'error' | 'offline';
  last_sync_at: string | null;
  pending_changes: number;
  error_message: string | null;
  connected_email: string | null;
  token_expires_at: number | null;
  last_report: {
    pushed_clips: number;
    pushed_folders: number;
    pulled_clips: number;
    pulled_folders: number;
    deleted: number;
    skipped: boolean;
    completed_at: string;
    message: string;
  } | null;
}

export interface SyncSettings {
  enabled: boolean;
  interval_seconds: number;
  sync_images: boolean;
}

export interface PickedApp {
  app_name: string | null;
  exe_name: string | null;
  full_path: string | null;
}

export type ClipType = 'text' | 'image' | 'html' | 'rtf' | 'file' | 'url';

export const CLIP_TYPE_LABELS: Record<ClipType, string> = {
  text: 'Text',
  image: 'Image',
  html: 'HTML',
  rtf: 'Rich Text',
  file: 'File',
  url: 'URL',
};

export const CLIP_TYPE_ICONS: Record<ClipType, string> = {
  text: 'FileText',
  image: 'Image',
  html: 'Code',
  rtf: 'Type',
  file: 'File',
  url: 'Link',
};
