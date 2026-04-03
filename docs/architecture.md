# ClipPaste Architecture Diagram

## System Overview

```
+-----------------------------------------------------------------------------------+
|                              ClipPaste Application                                 |
|                                                                                    |
|  +----------------------------------+    +-------------------------------------+  |
|  |         Tauri v2 (Rust)          |    |     React 18 + TypeScript (Frontend) |  |
|  |                                  |    |                                      |  |
|  |  +----------------------------+  |    |  +--------------------------------+  |  |
|  |  |       lib.rs (Entry)       |  |    |  |          App.tsx               |  |  |
|  |  | - App setup & plugins      |  |    |  | - Orchestrates hooks           |  |  |
|  |  | - Tray icon & menu         |  |    |  | - Window focus/blur logic      |  |  |
|  |  | - Window animation         |  |    |  | - Batch IPC (get_initial_state)|  |  |
|  |  | - Mica/Vibrancy effects    |  |    |  +--------+-----------------------+  |  |
|  |  | - Multi-monitor detect     |  |    |           |                          |  |
|  |  | - Hotkey registration      |  |    |  +--------v-----------------------+  |  |
|  |  +----------------------------+  |    |  |         Custom Hooks           |  |  |
|  |                                  |    |  | useClipActions  useFolderActions|  |  |
|  |  +----------------------------+  |    |  | useDragDrop    useFolderPreview|  |  |
|  |  |    clipboard.rs (Core)     |  |    |  | useKeyboard    useTheme       |  |  |
|  |  | - Clipboard monitoring     |  |    |  | useContextMenu useFolderModal |  |  |
|  |  | - 150ms debounce           |  |    |  | useBatchActions               |  |  |
|  |  | - SHA256 dedup             |  |    |  +--------+-----------------------+  |  |
|  |  | - Source app detection     |  |    |           |                          |  |
|  |  | - Icon extraction (Win32)  |  |    |  +--------v-----------------------+  |  |
|  |  | - Sensitive detection      |  |    |  |        UI Components          |  |  |
|  |  | - Incognito mode           |  |    |  | ControlBar  (search, folders)  |  |  |
|  |  | - Paste simulation         |  |    |  | ClipList    (virtual scroll)   |  |  |
|  |  +----------------------------+  |    |  | ClipCard    (card rendering)   |  |  |
|  |                                  |    |  | ContextMenu  FolderModal      |  |  |
|  |  +----------------------------+  |    |  | EditClipModal  NoteModal      |  |  |
|  |  |     commands/ (IPC)        |  |    |  | SettingsPanel  ConfirmDialog  |  |  |
|  |  | clips.rs    folders.rs     |  |    |  +--------------------------------+  |  |
|  |  | settings.rs data.rs       |  |    |                                      |  |
|  |  | window.rs   helpers.rs     |  |    +-------------------------------------+  |
|  |  +----------------------------+  |                                              |
|  |                                  |                                              |
|  |  +----------------------------+  |                                              |
|  |  |    database.rs (SQLite)    |  |                                              |
|  |  | - Connection pool (5 conn) |  |                                              |
|  |  | - WAL mode, 8MB cache      |  |                                              |
|  |  | - Migrations v1-v5         |  |                                              |
|  |  | - enforce_max_items        |  |                                              |
|  |  | - enforce_auto_delete      |  |                                              |
|  |  | - cleanup_orphan_images    |  |                                              |
|  |  +----------------------------+  |                                              |
|  +----------------------------------+                                              |
+-----------------------------------------------------------------------------------+
```

## Data Flow: Clipboard Capture

```
  System Clipboard Change
         |
         v
  tauri-plugin-clipboard-x
  fires "clipboard_changed" event
         |
         v
  +------+--------+
  | IS_INCOGNITO? |---yes---> (skip, return)
  +------+--------+
         | no
         v
  Capture source app info IMMEDIATELY
  (Win32: GetClipboardOwner + GetModuleBaseName + extract_icon)
  (macOS: NSWorkspace.frontmostApplication)
         |
         v
  +------+--------+
  | DEBOUNCE 150ms|  (AtomicU64 counter, discard older events)
  +------+--------+
         |
         v
  CLIPBOARD_SYNC mutex lock
         |
         v
  +------+---------+
  | Try read_image |---fail---> Try read_text
  +------+---------+            +------+-------+
         |                             |
         v                             v
  Save to disk:                 clip_content = text bytes
  {images_dir}/{hash}.png      clip_preview = first 2000 chars
  content = filename only      detect_subtype (url/email/color/path)
  metadata = {w,h,format,size} detect_sensitive (API keys/CC/JWT)
         |                             |
         +-------------+---------------+
                       |
                       v
              +--------+----------+
              | HASH_STATE check  |
              | Dedup + self-paste|
              +--------+----------+
                       |
         +-------------+-------------+
         |                           |
    Hash exists                 Hash new
         |                           |
         v                           v
  UPDATE created_at            INSERT new clip
  (re-copy moves to top)      + add_to_search_cache
         |                           |
         +-------------+-------------+
                       |
                       v
              app.emit("clipboard-change")
                       |
                       v
              Frontend refreshes clip list
```

## Data Flow: Paste Clip

```
  User double-clicks card / presses Enter
         |
         v
  +------+---------+
  | Is image clip? |
  +--+----------+--+
     |          |
    yes         no
     |          |
     v          v
  Frontend:   Backend:
  fetch()     clipboard_write_text()
  from        - Stop listener
  asset://    - write_text (5 retries)
  URL         - Start listener
     |          |
     v          |
  navigator.   |
  clipboard.   |
  write()      |
     |          |
     +----+-----+
          |
          v
  UPDATE last_pasted_at, paste_count++
          |
          v
  +-------+---------+
  | auto_paste=true? |
  +--+----------+---+
     |          |
    yes         no
     |          |
     v          v
  animate_    animate_
  window_     window_
  hide +      hide only
  callback:
  200ms delay
  then send_paste_input()
  (Shift+Insert on Windows)
  (Cmd+V on macOS)
```

## Storage Architecture

```
  %APPDATA%/ClipPaste/             (or custom path from config.json)
  +-- clipboard.db                  SQLite database (WAL mode)
  |   +-- clips                     Main table (id, uuid, content, ...)
  |   +-- folders                   User folders (name, icon, color, position)
  |   +-- settings                  Key-value settings
  |   +-- ignored_apps              Excluded app names
  |   +-- schema_version            Migration tracking (currently v5)
  |
  +-- images/                       Image files (PNG)
  |   +-- {sha256hash}.png          Each image named by content hash
  |   +-- {sha256hash}.png          Dedup: same content = same filename
  |
  %APPCONFIG%/ClipPaste/
  +-- config.json                   Custom data_directory (if set)
```

## In-Memory Caches

```
  +--------------------------------------------------+
  |              SEARCH_CACHE (HashMap)               |
  |  uuid -> (preview_lowercase, folder_id, note_lc) |
  |  Cap: 50,000 entries (most recent first)          |
  |  Updated: on clip add/remove/note change          |
  |  Rebuilt: after bulk ops, import, startup          |
  +--------------------------------------------------+

  +--------------------------------------------------+
  |             SETTINGS_CACHE (HashMap)              |
  |  key -> value (e.g. "auto_paste" -> "true")       |
  |  Unbounded (small, ~10-20 entries)                |
  |  Reloaded: after save_settings                    |
  +--------------------------------------------------+

  +--------------------------------------------------+
  |          ICON_CACHE (LRU, Windows only)           |
  |  exe_path -> Option<base64_png>                   |
  |  Cap: 100 entries (LRU eviction)                  |
  |  Populated: lazily on clipboard change            |
  +--------------------------------------------------+

  +--------------------------------------------------+
  |           HASH_STATE (Mutex)                      |
  |  ignore_hash: Option<String>  (self-paste skip)   |
  |  last_stable_hash: Option<String> (dedup)         |
  |  Atomic: both checked/set under single lock       |
  +--------------------------------------------------+

  +--------------------------------------------------+
  |          Atomic Flags                             |
  |  IS_ANIMATING: AtomicBool   (window show/hide)    |
  |  IS_DRAGGING:  AtomicBool   (drag to external)    |
  |  IS_INCOGNITO: AtomicBool   (pause capture)        |
  |  LAST_SHOW_TIME: AtomicI64  (blur debounce)       |
  |  DEBOUNCE_COUNTER: AtomicU64 (clipboard debounce) |
  +--------------------------------------------------+
```

## IPC Commands (Tauri invoke)

```
  Frontend                          Backend (Rust)
  --------                          ---------------
  get_initial_state  ------------>  clips + folders + count (parallel)
  get_clips          ------------>  clips by folder/all, paginated
  get_clip           ------------>  single clip full content
  search_clips       ------------>  multi-word + fuzzy, in-memory cache
  paste_clip         ------------>  write clipboard + hide + auto-paste
  copy_clip          ------------>  write clipboard only
  paste_text         ------------>  write arbitrary text + paste
  delete_clip        ------------>  hard delete + image cleanup + cache
  bulk_delete_clips  ------------>  batch delete + PRAGMA optimize
  bulk_move_clips    ------------>  batch move + cache update
  toggle_pin         ------------>  flip is_pinned
  update_note        ------------>  set/clear note + cache update
  move_to_folder     ------------>  change folder_id + cache update

  get_folders        ------------>  all folders with counts
  create_folder      ------------>  insert (UNIQUE name constraint)
  rename_folder      ------------>  update name/color/icon
  delete_folder      ------------>  transaction: delete clips + folder
  reorder_folders    ------------>  transaction: update positions

  get_settings       ------------>  all settings + autostart status
  save_settings      ------------>  upsert + re-apply theme/mica/hotkey
  register_global_shortcut ------> toggle show/hide behavior
  clear_all_clips    ------------>  delete unfiled+unpinned + OPTIMIZE
  remove_duplicate_clips --------> dedup by hash + OPTIMIZE

  toggle_incognito   ------------>  flip IS_INCOGNITO flag
  get_incognito_status ----------> read IS_INCOGNITO flag

  show_window        ------------>  position + slide-up animation
  hide_window        ------------>  slide-down + hide behind taskbar
  focus_window       ------------>  unminimize + show + focus
  set_dragging       ------------>  IS_DRAGGING flag (prevent auto-hide)

  export_data        ------------>  ZIP: clipboard.db + images/
  import_data        ------------>  extract ZIP to temp, backup old DB
  get_dashboard_stats -----------> aggregated analytics
  get_clips_by_date  ------------>  timeline view
  get_clip_dates     ------------>  calendar highlighting
  get_data_directory ------------>  current data path
  set_data_directory ------------>  migrate DB + config update
  pick_file / pick_folder -------> platform file dialog
```

## Database Schema (v5)

```sql
clips (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT NOT NULL UNIQUE,
  clip_type       TEXT NOT NULL,        -- 'text' | 'image'
  content         BLOB NOT NULL,        -- text bytes or image filename
  text_preview    TEXT,                 -- first 2000 chars (lowercase search)
  content_hash    TEXT NOT NULL,        -- SHA256 for dedup
  folder_id       INTEGER REFERENCES folders(id),
  is_deleted      INTEGER DEFAULT 0,   -- legacy, always 0
  source_app      TEXT,                 -- e.g. "VS Code", "Chrome"
  source_icon     TEXT,                 -- base64 PNG (Windows only)
  metadata        TEXT,                 -- JSON: {width, height, format, size_bytes}
  subtype         TEXT,                 -- 'url' | 'email' | 'color' | 'path'
  note            TEXT,                 -- user annotation
  paste_count     INTEGER DEFAULT 0,
  is_pinned       INTEGER DEFAULT 0,
  is_sensitive    INTEGER DEFAULT 0,   -- auto-detected (API keys, CC, JWT)
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_accessed   DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_pasted_at  DATETIME
)

folders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,            -- UNIQUE index
  icon       TEXT,                     -- lucide icon key
  color      TEXT,                     -- tailwind color key
  is_system  INTEGER DEFAULT 0,
  position   INTEGER DEFAULT 0,       -- drag-reorder position
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)

settings    (key TEXT PK, value TEXT)
ignored_apps (id INTEGER PK, app_name TEXT UNIQUE)
schema_version (version INTEGER)

-- Indexes
idx_clips_hash            ON clips(content_hash)
idx_clips_folder          ON clips(folder_id)
idx_clips_created         ON clips(created_at)
idx_clips_folder_created  ON clips(folder_id, created_at DESC)  -- v5 covering
idx_folders_name          UNIQUE ON folders(name)                -- v3
```

## Platform-Specific Code

```
                    Windows              macOS               Linux
                    -------              -----               -----
Clipboard monitor   plugin-clipboard-x   plugin-clipboard-x  plugin-clipboard-x
Source app detect   GetClipboardOwner    NSWorkspace          (none)
                    GetModuleBaseName    frontmostApplication
Source app icon     SHGetFileInfo        (none)               (none)
                    DrawIconEx+DIBits
Auto-paste          Shift+Insert         Cmd+V (CGEvent)     (none)
                    via SendInput        via CGEventSource
Window effects      Mica/MicaAlt/Clear   Vibrancy             (none)
                    window-vibrancy fork  window-vibrancy-macos
Monitor detection   Win32 APIs           Tauri API            Tauri API
                    GetCursorPos
                    MonitorFromPoint
                    GetDpiForMonitor
File picker         PowerShell           osascript            zenity
Folder picker       IFileOpenDialog      osascript            zenity
Hide animation      Z-order: topmost     Standard slide       Standard slide
                    → behind taskbar
```
