import { invoke } from '@tauri-apps/api/core';
import type {
  ClipboardItem,
  FolderItem,
  Settings,
  ScratchpadItem,
  DashboardStats,
  DashClip,
  ClipCleanupPreview,
  ImageCleanupPreview,
  SyncStatus,
  SyncSettings,
  PickedApp,
  RuntimeDiagnostics,
} from './types';

// ---------------------------------------------------------------------------
// Clips
// ---------------------------------------------------------------------------

export const cmd = {
  getClips: (args: {
    filterId?: string | null;
    limit: number;
    offset: number;
    previewOnly?: boolean;
  }) => invoke<ClipboardItem[]>('get_clips', args),

  searchClips: (args: {
    query: string;
    filterId?: string | null;
    typeFilter?: string | null;
    limit: number;
    offset: number;
  }) => invoke<ClipboardItem[]>('search_clips', args),

  getClipsByTypeFilter: (args: {
    typeFilter: string;
    folderId?: string | null;
    limit: number;
    offset: number;
  }) => invoke<ClipboardItem[]>('get_clips_by_type_filter', args),

  getLibraryClips: (args: {
    query?: string | null;
    folderId?: string | null;
    typeFilter?: string | null;
    pinFilter?: string | null;
    dateFilter?: string | null;
    sort?: string | null;
    limit: number;
    offset: number;
  }) => invoke<ClipboardItem[]>('get_library_clips', args),

  getInitialState: () =>
    invoke<{ clips: ClipboardItem[]; folders: FolderItem[]; total_count: number }>(
      'get_initial_state'
    ),

  pasteClip: (id: string) => invoke<void>('paste_clip', { id }),

  pasteClips: (ids: string[]) => invoke<void>('paste_clips', { ids }),

  copyClip: (id: string) => invoke<void>('copy_clip', { id }),

  deleteClip: (id: string) => invoke<void>('delete_clip', { id }),

  togglePin: (id: string) => invoke<boolean>('toggle_pin', { id }),

  updateNote: (id: string, note: string | null) => invoke<void>('update_note', { id, note }),

  pasteText: (content: string) => invoke<void>('paste_text', { content }),

  getClipImageDataUrl: (id: string, thumbnail?: boolean) =>
    invoke<string>('get_clip_image_data_url', { id, thumbnail: thumbnail ?? false }),

  saveClipImageAs: (id: string) => invoke<string>('save_clip_image_as', { id }),

  bulkDeleteClips: (ids: string[]) => invoke<number>('bulk_delete_clips', { ids }),

  bulkMoveClips: (ids: string[], folderId: string | null) =>
    invoke<void>('bulk_move_clips', { ids, folderId }),

  bulkSetPin: (ids: string[], pinned: boolean) => invoke<number>('bulk_set_pin', { ids, pinned }),

  rescanSubtypes: () => invoke<number>('rescan_subtypes'),

  rescanSensitive: () => invoke<number>('rescan_sensitive'),

  // ---------------------------------------------------------------------------
  // Folders
  // ---------------------------------------------------------------------------

  getFolders: () => invoke<FolderItem[]>('get_folders'),

  createFolder: (name: string, icon: string | null, color: string | null) =>
    invoke<FolderItem>('create_folder', { name, icon, color }),

  renameFolder: (id: string, name: string, color: string | null, icon: string | null) =>
    invoke<void>('rename_folder', { id, name, color, icon }),

  deleteFolder: (id: string) => invoke<void>('delete_folder', { id }),

  moveToFolder: (clipId: string, folderId: string | null) =>
    invoke<void>('move_to_folder', { clipId, folderId }),

  moveFolderClips: (sourceFolderId: string, targetFolderId: string | null) =>
    invoke<number>('move_folder_clips', { sourceFolderId, targetFolderId }),

  mergeFolder: (sourceFolderId: string, targetFolderId: string) =>
    invoke<number>('merge_folder', { sourceFolderId, targetFolderId }),

  reorderFolders: (folderIds: string[]) => invoke<void>('reorder_folders', { folderIds }),

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  getSettings: () => invoke<Settings>('get_settings'),

  saveSettings: (settings: Settings) => invoke<void>('save_settings', { settings }),

  getIgnoredApps: () => invoke<string[]>('get_ignored_apps'),

  addIgnoredApp: (appName: string) => invoke<void>('add_ignored_app', { appName }),

  removeIgnoredApp: (appName: string) => invoke<void>('remove_ignored_app', { appName }),

  registerGlobalShortcut: (hotkey: string) => invoke<void>('register_global_shortcut', { hotkey }),

  // ---------------------------------------------------------------------------
  // Window
  // ---------------------------------------------------------------------------

  getIncognitoStatus: () => invoke<boolean>('get_incognito_status'),

  toggleIncognito: () => invoke<boolean>('toggle_incognito'),

  focusWindow: (label: string) => invoke<void>('focus_window', { label }),

  hideWindow: () => invoke<void>('hide_window'),

  setDragging: (dragging: boolean) => invoke<void>('set_dragging', { dragging }),

  capturePrevForeground: () => invoke<void>('capture_prev_foreground'),

  // ---------------------------------------------------------------------------
  // Data / Storage
  // ---------------------------------------------------------------------------

  getClipboardHistorySize: () => invoke<number>('get_clipboard_history_size'),

  getDataDirectory: () => invoke<string>('get_data_directory'),

  setDataDirectory: (newPath: string) => invoke<void>('set_data_directory', { newPath }),

  exportData: () => invoke<string>('export_data'),

  importData: () => invoke<void>('import_data'),

  clearAllClips: () => invoke<void>('clear_all_clips'),

  removeDuplicateClips: () => invoke<number>('remove_duplicate_clips'),

  getDashboardStats: (args: { forceRefresh?: boolean } = {}) =>
    invoke<DashboardStats>('get_dashboard_stats', args),

  getClipsByDate: (args: { date: string; search?: string; sourceApp?: string; offset?: number }) =>
    invoke<DashClip[]>('get_clips_by_date', args),

  getClipDates: () => invoke<{ day: string; count: number }[]>('get_clip_dates'),

  previewOldImageCleanup: (days: number) =>
    invoke<ImageCleanupPreview>('preview_old_image_cleanup', { days }),

  cleanupOldImageClips: (days: number) => invoke<number>('cleanup_old_image_clips', { days }),

  previewOldClipCleanup: (days: number) =>
    invoke<ClipCleanupPreview>('preview_old_clip_cleanup', { days }),

  cleanupOldClips: (days: number) => invoke<number>('cleanup_old_clips', { days }),

  pickFile: () => invoke<string>('pick_file'),

  pickFolder: () => invoke<string>('pick_folder'),

  pickForegroundApp: (delayMs: number) => invoke<PickedApp>('pick_foreground_app', { delayMs }),

  checkDbIntegrity: () => invoke<string>('check_db_integrity'),

  getRuntimeDiagnostics: () => invoke<RuntimeDiagnostics>('get_runtime_diagnostics'),

  // ---------------------------------------------------------------------------
  // Sync
  // ---------------------------------------------------------------------------

  getSyncStatus: () => invoke<SyncStatus>('get_sync_status'),

  getSyncSettings: () => invoke<SyncSettings>('get_sync_settings'),

  saveSyncSettings: (settings: SyncSettings) => invoke<void>('save_sync_settings', { settings }),

  gdriveAuthorize: () => invoke<string>('gdrive_authorize'),

  gdriveDisconnect: () => invoke<void>('gdrive_disconnect'),

  syncNow: () => invoke<string>('sync_now'),

  // ---------------------------------------------------------------------------
  // Scratchpad
  // ---------------------------------------------------------------------------

  getScratchpads: () => invoke<ScratchpadItem[]>('get_scratchpads'),

  createScratchpad: (title: string, content: string) =>
    invoke<ScratchpadItem>('create_scratchpad', { title, content }),

  updateScratchpad: (args: {
    id: string;
    title?: string;
    content?: string;
    color?: string | null;
    position?: number;
  }) => invoke<void>('update_scratchpad', args),

  deleteScratchpad: (id: string) => invoke<void>('delete_scratchpad', { id }),

  reorderScratchpads: (ids: string[]) => invoke<void>('reorder_scratchpads', { ids }),

  toggleScratchpadPin: (id: string) => invoke<boolean>('toggle_scratchpad_pin', { id }),

  scratchpadPaste: (text: string) => invoke<void>('scratchpad_paste', { text }),
};
