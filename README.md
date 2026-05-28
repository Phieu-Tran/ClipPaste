# ClipPaste

ClipPaste is a private clipboard history manager built with Rust, Tauri 2,
React 18, TypeScript, and SQLite.

Current version: `1.10.11`

The app is designed for fast local clipboard recall, rich image handling,
folders, scratchpad notes, and optional Google Drive sync. Clipboard content is
stored locally by default and is not sent to external analytics services.

## Highlights

- Local-first clipboard history with SQLite WAL storage.
- Text, image, URL, email, color, path, and sensitive-content detection.
- Fast in-memory search cache with multi-word and fuzzy matching.
- Image clips stored as files under the active data directory, not as large DB
  blobs.
- Configurable data directory for local storage or sync-friendly folders.
- Storage dashboard with database size, image size, content mix, activity, and
  source-app stats.
- Dashboard quick actions for storage settings, old-image preview, duplicate
  cleanup, backup export, and stats refresh.
- Retention controls for max clip count, old clip cleanup, and old image cleanup.
- Preview-before-delete flow for old image cleanup.
- Folders, pinned clips, notes, drag/drop organization, and a bulk action bar for
  paste, delete, move, pin, and unpin.
- Scratchpad side panel for reusable notes, with global hotkey and optional sync.
- Optional Google Drive sync for clips, folders, images, and scratchpad notes.
- Sync health panel with pending changes, token expiry, last run report, and
  last error.
- Least-privilege Tauri capabilities and no Aptabase analytics integration.

## Installation

Download the latest release:

https://github.com/Phieu-Tran/ClipPaste/releases/latest

Windows builds are distributed as NSIS `.exe` and MSI installers. The app also
contains Linux-oriented code paths, but current development and verification are
focused on Windows.

## Keyboard Shortcuts

Global shortcuts:

| Shortcut | Action |
| --- | --- |
| `Ctrl+Shift+V` | Toggle clipboard window |
| `Ctrl+Shift+S` | Toggle scratchpad panel |

Clipboard window:

| Shortcut | Action |
| --- | --- |
| `Ctrl+F` | Focus search |
| `Escape` | Clear search, close panels, or hide window depending on state |
| `Enter` | Paste selected clip |
| `Ctrl+Delete` | Delete selected clip |
| `P` | Pin or unpin selected clip |
| `E` | Edit text before paste |
| `Arrow Up/Down` | Navigate clips |

Scratchpad:

| Shortcut | Action |
| --- | --- |
| `/` | Focus note search |
| `Arrow Up/Down` | Navigate notes |
| `Enter` | Open paste modal |
| `E` | Edit selected note |
| `Delete` | Delete selected note with undo toast |
| `Ctrl+Enter` | Confirm paste or save edit |
| `Escape` | Cancel modal or collapse panel |

## Storage And Retention

ClipPaste stores data in the configured data directory:

```text
<data-dir>/
  clipboard.db
  clipboard.db-wal
  clipboard.db-shm
  images/
    <sha256>.png
    <sha256>_thumb.jpg
```

The default data directory is app-local, but users can choose another folder in
Settings. When switching directories, ClipPaste stages the current database and
image files into the selected folder if it does not already contain
`clipboard.db`. If the selected folder already has a database, ClipPaste switches
to it without overwriting it.

Retention controls are available in Settings:

- Max Clips: trim oldest unprotected clips when the limit is exceeded.
- Auto-delete clips: delete old unprotected clips after a configured number of
  days.
- Auto-delete image clips: delete old unprotected image clips after a configured
  number of days.
- Clean old images: preview the old image cleanup impact, then delete manually.

Protected clips are not removed by retention cleanup:

- Pinned clips.
- Clips stored inside folders.

Orphan managed image files are quarantined under:

```text
images/.cleanup_quarantine/<timestamp>/
```

Rows for missing image files are preserved by default. Automatic deletion of
missing image rows requires `CLIPPASTE_DELETE_MISSING_IMAGE_CLIPS=true`.

## Dashboard

The Settings dashboard includes:

- Total clips, clips today, image clips, and folder count.
- Local storage split between `clipboard.db` and `images/`.
- 14-day old-image cleanup estimate.
- Content mix for text, links, pinned clips, and sensitive clips.
- Quick actions for storage settings, old-image preview, backup export,
  duplicate cleanup, and stats refresh.
- Timeline browsing by date.
- Per-day activity chart.
- Top source apps.
- Most pasted clips.

## Privacy And Security

ClipPaste is local-first:

- Clipboard data is stored on disk in the configured data directory.
- No Aptabase analytics integration is included.
- The global Tauri JS API is disabled.
- The asset protocol scope is restricted to app/data/resource paths.
- Clipboard plugin permissions are explicit and least-privilege.
- Sensitive content detection can blur likely secrets such as API keys, tokens,
  private keys, JWTs, and credit card numbers.

Google Drive sync is optional. Sync data is written to the app data folder on
Drive and uses encrypted sync payloads.

## Development

Prerequisites:

- Node.js
- pnpm
- Rust toolchain
- Tauri prerequisites for Windows

Install dependencies:

```powershell
pnpm install
```

Run frontend only:

```powershell
pnpm dev
```

Run the desktop app in development:

```powershell
pnpm tauri dev
```

Build frontend:

```powershell
pnpm build
```

Build Tauri app without bundling installers:

```powershell
pnpm tauri build -- --no-bundle
```

Build full installer bundles:

```powershell
pnpm tauri build
```

If updater signing is configured with a public key, full bundling requires:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "<private-key>"
```

Without the private key, the release app can still build with `--no-bundle`.

## Testing

Run the full test pipeline:

```powershell
pnpm test
```

Run frontend checks only:

```powershell
pnpm test:fe
```

Run backend checks only:

```powershell
pnpm test:be
```

Useful lower-level commands:

```powershell
pnpm format:check
pnpm build
cd src-tauri
cargo fmt
cargo clippy -- -D warnings
cargo test
```

## Benchmark CLI

The app binary includes a read-only benchmark mode:

```powershell
src-tauri\target\debug\clippaste.exe --bench
src-tauri\target\debug\clippaste.exe --bench http
```

The benchmark reports:

- Active data directory.
- Database path and size.
- Image file count and size.
- Total clip, image, folder, pinned, sensitive counts.
- Latest clips query timing.
- Search timing.
- Startup cache query timing.

This mode does not modify or delete data.

## CLI Utilities

Debug builds also support utility commands:

```powershell
src-tauri\target\debug\clippaste.exe --help
src-tauri\target\debug\clippaste.exe --stats
src-tauri\target\debug\clippaste.exe --count
src-tauri\target\debug\clippaste.exe --verify
```

## Project Structure

```text
ClipPaste/
  frontend/
    src/
      components/
      hooks/
      types/
      App.tsx
  src-tauri/
    src/
      clipboard.rs
      database.rs
      lib.rs
      main.rs
      models.rs
      commands/
      sync/
      tests.rs
    Cargo.toml
    tauri.conf.json
  scripts/
    test.ps1
    test.sh
  package.json
  README.md
  CHANGELOG.md
```

## Backend Overview

Main Rust modules:

- `clipboard.rs`: clipboard monitoring, deduplication, subtype detection,
  sensitive detection, incognito handling, search/settings/icon caches.
- `database.rs`: SQLite connection pool, migrations, image storage helpers,
  cleanup and retention policies.
- `commands/`: Tauri IPC commands for clips, folders, settings, data, sync,
  scratchpad, and windows.
- `sync/`: Google Drive OAuth, Drive API client, sync protocol, encryption.
- `cli.rs`: debug/maintenance CLI commands and benchmark mode.

## Frontend Overview

Main frontend areas:

- `App.tsx`: application orchestration.
- `components/ControlBar.tsx`: search, filters, and folder controls.
- `components/ClipList.tsx`: virtualized clip list.
- `components/ClipCard.tsx`: clip rendering, image thumbnails, badges, actions.
- `components/SettingsPanel.tsx`: settings shell and tab routing.
- `components/settings/DashboardTab.tsx`: storage and usage dashboard.
- `components/settings/GeneralTab.tsx`: behavior, privacy exceptions, storage,
  retention, cleanup, and data management.
- `windows/ScratchpadWindow.tsx`: scratchpad side-panel experience.

## Sync Overview

Google Drive sync is optional and can sync:

- Clips.
- Folders.
- Image files.
- Scratchpad notes.
- Deletion tombstones.

The sync protocol uses append-only operation files, full-state compaction, LWW
merge behavior, tombstone cleanup, image content-hash deduplication, and bounded
image upload concurrency.

The Sync tab shows operational health:

- Connected account.
- Auto-sync state and interval.
- Pending local changes.
- Last sync time.
- Access token expiry estimate.
- Last pushed, pulled, and deleted counts.
- Last sync error with retry through Sync Now.

## Backup And Restore

Backup export writes a zip containing the database and image folder. Backup
import is guarded by a confirmation dialog and, after success, shows a
restart-required banner with a Restart Now action. Restarting ensures all
windows and in-memory caches read the imported database.

## Release Checklist

1. Update versions in:
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.lock`
2. Update `CHANGELOG.md`.
3. Run:

```powershell
pnpm format:check
pnpm test
pnpm tauri build -- --no-bundle
```

4. For signed installer/update builds, set `TAURI_SIGNING_PRIVATE_KEY` and run:

```powershell
pnpm tauri build
```

## License

GPL-3.0. See `LICENSE`.
