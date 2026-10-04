# Our Chronicle

Our Chronicle is a local-first interactive scrapbook / memory book with a warm café and vintage journal theme. Open a physical-style book, turn its pages, and arrange your words and photographs through the browser. Sample content is included.

Built with Next.js App Router, React, TypeScript, and Tailwind CSS. **No database, account, or cloud service is required.**

## Requirements

- **Node.js 20.9 or newer** (validated with Node.js 24).
- **npm** and a writable project folder.

On Windows, use `npm.cmd` / `npx.cmd` if PowerShell blocks the corresponding scripts.

## Quick start

```bash
git clone https://github.com/Adan0108/Our-Chronicle.git
cd Our-Chronicle
npm install
npm run dev
```

Open **http://localhost:3000**. The server binds to the local IPv4 address; if `localhost` does not connect, use **http://127.0.0.1:3000**.

Keep the server running while using the book. No additional configuration is needed; a sample book is created automatically if `storage/book.json` is missing.

## Production / local hosting

```bash
npm run build
npm start
```

Development mode (`npm run dev`) reloads source changes and includes development tools. Production mode serves the optimized build without live source reloading; rebuild after changing application code.

Both modes use the same local data folder and default address. This application needs a running Node.js server with a writable filesystem; it is not a static site.

## How to use

- **Read:** Click the cover or drag its right corner across the spine to open. Turn pages by dragging a corner, clicking a page, using navigation arrows, or choosing a page from **Contents**.
- **Close:** Return to the first spread and drag its left corner rightward across the spine. The close-book control beneath the first spread is a fallback. Reopen the cover normally; closing does not change saved content.
- **Edit:** Choose **Edit scrapbook**. A closed book enters the cover editor; an open book enters the page editor. **Done editing** returns to reading pages, while **Preview cover** returns to the closed cover. Page-turn gestures pause while editing.
- **Text:** Click a text block to edit its content, preset, curated font family, size, color, bold/italic, alignment, and rotation. Use **Text** to add a block and **Delete text** to remove it.
- **Photos:** Select a page, then choose **Photo** to upload a JPEG, PNG, or WebP (up to 10 MB / 24 megapixels). Edit captions/frames, rotate, **Replace photo**, or **Delete image**. Drag to move and drag a corner to resize. **Crop photo** opens a drag/zoom dialog; **Apply crop** saves the crop, while **Reset crop** restores the full photo. Cropping preserves the source image.
- **Drop or paste images:** In Edit Mode, drag JPEG, PNG, or WebP files from your computer onto a page or cover, or paste a copied image with Ctrl/Cmd+V outside text/form fields. Choose **Add as photos** or **Add as decorations**; transparent areas are preserved. Drops follow the pointer position, multiple files cascade, and pasted images start near the active canvas center. A batch is one undo step. Empty pages also offer lightweight text/decoration actions.
- **Quick tools:** Selecting an element opens a compact toolbar beside it for common text/photo controls, crop, replace, duplicate, lock, and delete. **More** or right-click opens layer actions and other contextual choices. Detailed controls remain in the inspector. Clicking empty space or pressing Escape deselects; Reading and Presentation Mode hide all editor overlays.
- **Multi-select:** Shift-click elements or Layers rows to toggle selection on the same page/cover. Drag an unlocked selected element to move the unlocked members together; duplicate, delete, and layer actions apply to the selection. Position-locked members stay fixed during group movement. Selection itself is session-only.
- **Alignment:** Moving elements lightly snaps to page centers, edges, 24-pixel margins, and nearby element edges/centers, with temporary guide lines. Hold Alt/Option during a drag for free positioning. Rotated elements use their original layout boxes for alignment and page bounds.
- **Editor shortcuts:** Outside inputs, dialogs, and menus, Delete/Backspace deletes the selection, Ctrl/Cmd+D duplicates, Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl+Y redoes, and Escape closes contextual UI or deselects. Alt/Option+ArrowUp/ArrowDown moves the selection forward/backward one layer. Normal typing and clipboard paste in fields retain their usual behavior.
- **Photo styles:** Choose plain, polaroid, soft shadow, paper frame, taped photo, or borderless. Frames remain editable styles; they are not baked into the image.
- **Decorations:** Choose **Decorations** for the small built-in tape, botanical, doodle, label, and paper collection, or **Upload decoration** for your own transparent PNG/WebP. Decorations have no photo frame or background. Move, resize, crop, rotate, duplicate, layer, and lock them like other elements; built-in stickers also have editable colors, and date labels have editable text. These controls also work on the cover.
- **Themes:** Expand **Book theme** in the inspector and choose Café, Vintage Journal, Minimal Ivory, Wedding, or Campus Diary. Themes change the environment and paper accents without rewriting your text styles or moving content. Theme changes support undo/redo.
- **Presentation:** In reading mode, choose **Present book** for a centered book with minimal controls. Mouse page turns and native cover opening/closing still work. Use **Enter fullscreen** if desired; **Exit presentation** or Escape returns to reading. Leaving fullscreen also exits presentation.
- **Music:** The compact Music control shows whether a track is not configured, paused, or playing, with Play/Pause available directly. Open its settings to adjust volume from 0–100%; 0% mutes without removing the track. In edit mode, upload one local MP3, WAV, or Ogg (Vorbis/Opus) file up to 20 MB and optionally enable looping. A newly selected or replacement track starts at 40%; existing saved volume stays unchanged on refresh or import. Volume is saved with the book and included in exports. Audio never autoplays, including after refresh or import; playback itself is not an undo step.
- **Layers and locks:** **Layers** lists frontmost elements first, with text previews, photo captions/filenames, and sticker names. Drag a row's handle to reorder; keyboard users can focus the handle, press Space, use Up/Down, and press Space to finish or Escape to cancel. Reordering changes the book immediately, supports undo/redo, and persists. Click a row to select even covered or locked items. **Bring forward** / **Send backward** remain available. **Lock position** prevents movement/resizing while allowing appearance edits and explicit duplicate/delete actions; **Unlock position** restores movement.
- **Pages:** Add a blank page, duplicate a page, move it earlier/later, or choose **New page from template** (journal, single photo, two photos, collage). Select empty photo frames and use **Add photo to frame** to fill them. Deletion asks for confirmation, and at least two pages must remain.
- **Customize the cover:** Use **Edit cover** in the page inspector or choose **Edit scrapbook** with the book closed. Select cover text or add text/photos, then use the same typography, crop, transform, layer, duplicate, and lock controls as pages. Cover editing prioritizes element manipulation, so dragging/resizing does not open the book. Choose **Preview cover** to return to normal click/drag opening, or **Edit pages** to edit the inside.
- **Cover appearance:** Choose **Coffee leather**, **Cream linen**, **Muted sage**, **Dusty rose**, or **Minimal ivory**, then adjust **Cover color**. The page editor's **Book cover details** keeps the book title/subtitle; after customization, visible cover text is edited through its own text blocks.
- **Undo/redo:** Use the header controls or Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (also Ctrl+Y) outside text inputs. Page and cover edits share up to 50 history steps in the current browser session; refresh clears history. Typing/slider changes are grouped until an autosave or another action. Undo/redo changes autosave normally.
- **Autosave:** Changes save after a short pause. Wait for **Saved on this device** before refreshing or closing. Failed saves offer a retry; a stale-tab conflict requires reloading that tab to get the latest book.
- **Book options:** The archive icon in the header opens export, import, and reset controls in either reading or edit mode.
- **Smaller screens:** View full-size pages by scrolling sideways or using **Show left page** / **Show right page**. Use navigation arrows to turn pages. The editor appears below the book; **Edit selected item** and **Back to the page** help you move between them.

## Local data and backups

Personal content is written by the local Next.js server to files on the machine running the app:

- `storage/book.json` — book title, pages, cover appearance/elements, formatting, image references/crops, stickers, positions, layers, locks, theme, and optional audio settings.
- `storage/images/` — sample photographs and uploaded images.
- `storage/audio/` — optional uploaded audio, retained in its original supported format.
- `storage/backups/` — automatic safety ZIPs created before import or reset.

Removed/replaced photos have recovery copies in `storage/images/.trash/` for undo, retained for up to seven days and 3,000 files. They are not served as active images. Cleanup runs on subsequent saves.

Removed/replaced audio has the same recovery mechanism in `storage/audio/.trash/`, bounded to seven days and 100 files. Playback progress and presentation mode are not saved.

Content is stored in this folder, **not in a database, browser storage, or cloud service**. Uploads are served through the API and do not enter `public/` or source folders.

For a portable manual backup, use **Book options → Export Book** and keep the downloaded ZIP on another drive. You can also **back up the entire `storage/` folder while the app is stopped**; copying only the JSON will not preserve the photographs. To restore a folder backup, stop the app, replace `storage/` with your backup, and restart.

Sample-photo attribution and license details are in [storage/images/README.md](storage/images/README.md).

## Export, import, and reset

- **Export Book** saves pending edits and downloads `our-chronicle-YYYY-MM-DD.zip`. The archive contains `book.json`, `manifest.json` (`format: "our-chronicle"`, format version, export timestamp), `images/` with only images referenced by pages or the cover, and `audio/` when a track is selected. Stickers are stored as built-in asset identifiers in JSON. Themes, decorations, expanded photo styles, and audio use `formatVersion: 3`; earlier books still export as version 1 or 2 as appropriate. Shared assets appear once. Recovery files, safety backups, unused uploads, and repository/build files are excluded.
- **Import Book** lets you choose an exported ZIP, then **Import and replace** confirms replacement. The complete archive is validated before changing the book. A safety backup of the current book and all referenced images/audio is saved to `storage/backups/` first. The app reloads at the cover; cover customization, page order, formatting, crop, rotation, layers, locks, stickers, theme, and audio settings are retained. Internal asset filenames may change; image/audio bytes and transparency are preserved.
- **Reset Book → Reset to sample book** explicitly confirms replacing the current book with the sample scrapbook, default cover, Café theme, and no audio. It also creates a safety ZIP first. Canceling makes no replacement. If sample photographs are unavailable or damaged, built-in sample artwork is used.

Import/reset begin a fresh undo session. To recover the previous book, choose **Import Book** and select its safety ZIP from `storage/backups/`. The success message identifies the backup filename. Safety backups stay local and are retained until you remove them; copy important ones elsewhere for protection against disk failure.

Imports accept Our Chronicle format versions 1, 2, and 3. Earlier versions cannot claim newer features; future versions are rejected explicitly. Archive limits are 250 MB ZIP / 500 MB uncompressed content, 1 MB book JSON, 10 MB / 24 megapixels per non-animated JPEG, PNG, or WebP, and 20 MB per supported audio file. Unsafe paths, duplicate entries, encryption, links, missing/invalid assets, and unsupported versions are rejected. Import/reset abort if a safety backup cannot be written or another tab changed the book.

## Scripts and tests

| Command            | Purpose                                      |
| ------------------ | -------------------------------------------- |
| `npm run dev`      | Start the development server.                |
| `npm run build`    | Create the optimized production build.       |
| `npm start`        | Serve the production build; run build first. |
| `npm run lint`     | Check source code with ESLint.               |
| `npm run test:e2e` | Run the Playwright browser and API suite.    |

Before the first test run, install Chromium:

```bash
npx playwright install chromium
npm run test:e2e
```

Use `npm run test:e2e -- --headed` to watch the browser, or `npm run test:e2e:ui` for Playwright's UI. Tests start their own server on port **3001** and use `.test-storage/` and `.next-e2e/`, leaving your scrapbook untouched. Run one suite at a time. Reports, screenshots, and failure traces are written to `playwright-report/` and `test-results/`.

Formatting commands: `npm run format` and `npm run format:check`.

## Known limitations

- One book per storage folder. Run one server instance per folder; there are no accounts or shared multi-user editing.
- Books support 2–100 pages and up to 60 elements per page or cover.
- Desktop/laptop is the primary experience. Narrow screens use horizontal page viewing and an editor below the book.
- Text boxes do not expand automatically; resize them when longer text needs more space.
- Multi-selection stays within one page or cover; there is no grouping, cross-page selection, or collective resize. Alignment follows unrotated layout boxes. Clipboard image support depends on the browser and copied content.
- Cover customization applies to the front cover; its decorative emblem and border are fixed.
- Uploaded images are converted to WebP and limited to 2400 pixels on the longest edge. Images with alpha use lossless WebP encoding without flattening; resizing can still resample pixels. Original uploaded files are not retained. Interrupted uploads can leave unused asset files.
- Undo history is session-only; very long sessions can outlast image-recovery retention. Crop uses the photo frame's aspect ratio.
- One audio track per book; supported codecs depend on the browser. No bundled music, playlist, or saved playback position. Fullscreen depends on browser support.
- Import replaces the whole book; there is no merge or backup-list UI. Safety ZIPs require manual cleanup. No cloud sync.

## Project Structure

```text
Our-Chronicle/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── book/                  # Read/save, export, import, and reset routes
│   │   │   ├── images/               # Upload, serve, and delete images
│   │   │   └── audio/                # Upload, range-serve, and delete audio
│   │   ├── page.tsx                  # Load the book and render the app
│   │   ├── layout.tsx                # Root layout and metadata
│   │   ├── globals.css               # Theme and responsive styles
│   │   ├── editor-canvas.css         # Selection, guides, empty/drop feedback
│   │   └── editor-controls.css       # Floating tools and sortable Layers styles
│   ├── components/
│   │   ├── book/
│   │   │   ├── cover.tsx             # Native front cover and standalone edit canvas
│   │   │   ├── reader.tsx            # Page-flip library integration
│   │   │   ├── book-actions.tsx      # Export/import/reset dialogs
│   │   │   ├── ambience.tsx          # Explicit audio playback and local settings
│   │   │   ├── sticker.tsx           # Lightweight built-in SVG decorations
│   │   │   └── page-renderer.tsx     # Page renderer and shared cover/page element layer
│   │   ├── editor/                   # Inspector, crop/template dialogs, deletion
│   │   │   ├── layers-panel.tsx      # Accessible sortable layer rows
│   │   │   ├── quick-tools.tsx       # Floating toolbar and context menu
│   │   │   ├── editor-context.tsx    # Editor canvas selection/action callbacks
│   │   │   └── image-import-dialog.tsx # Photo/decoration choice for drops and paste
│   │   └── scrapbook.tsx             # Reading/editing UI and interactions
│   ├── hooks/
│   │   └── use-book.ts               # Autosave, revisions, and bounded history
│   ├── lib/
│   │   ├── api.ts                    # Request checks and API errors
│   │   ├── cover.ts                  # Cover palettes, legacy defaults, image references
│   │   ├── editor.ts                 # Data-driven templates and duplication
│   │   ├── editor-geometry.ts        # Bounded group movement, snapping, drop coordinates
│   │   ├── decorations.ts            # Sticker catalog and element defaults
│   │   ├── themes.ts                 # Curated theme identifiers and labels
│   │   └── storage/
│   │       ├── index.ts              # Storage interface and instance
│   │       ├── local.ts              # Filesystem storage and safe writes
│   │       ├── archive.ts            # Versioned ZIP encoding and validation
│   │       ├── audio.ts              # Audio limits and container validation
│   │       ├── errors.ts             # Storage/API error type
│   │       └── sample.ts             # Default book and fallback artwork
│   └── types/
│       └── book.ts                   # Zod schemas and TypeScript types
├── storage/
│   ├── book.json                     # Local book state
│   ├── images/                       # Local images and sample attribution
│   ├── audio/                        # Local audio (created on demand)
│   └── backups/                      # Safety ZIPs (created on demand)
├── tests/
│   ├── scrapbook.spec.ts             # Browser flows and API checks
│   ├── editor-phase.spec.ts           # Formatting, layers, templates, and history
│   ├── editor-ux.spec.ts              # Fresh-page interactions, clipboard, tools, gestures
│   ├── editor-geometry.spec.ts        # Snapping, group bounds, locks, and scaled coordinates
│   ├── cover.spec.ts                  # Cover editing, persistence, and portable round trips
│   ├── cover-storage.spec.ts          # Cover validation, recovery, and archive compatibility
│   ├── portability.spec.ts            # Round trips, backups, and archive safety
│   ├── storage-safety.spec.ts         # Failed backup/commit rollback checks
│   ├── experience.spec.ts            # Decorations, frames, themes, presentation, audio
│   └── experience-storage.spec.ts     # Alpha/audio portability, validation, and recovery
├── playwright.config.ts             # Isolated E2E server configuration
└── package.json                      # Dependencies and scripts
```

Pages and customized covers contain arrays of the same text, image, and sticker elements rather than hard-coded layouts. Array order defines layers from back to front. Images can have an optional photo/decoration kind; sticker elements reference the local SVG catalog. Optional book theme/audio fields leave older books compatible, with Café as the theme fallback. The optional `cover` object stores its style, background color, and elements. Existing books without it render an editable default from their title/subtitle without writing a migration on load. Optional formatting, crop, and lock fields retain their original presets when absent.

Cover and page editing reuse the element renderer, inspector, image/crop controls, autosave, and bounded history. The reader uses `react-pageflip` / StPageFlip, including native cover opening/closing. A standalone cover canvas takes priority while editing. The editor uses `react-rnd`, `react-easy-crop`, `@dnd-kit/sortable` for Layers, and `@floating-ui/react` for viewport-aware tools. These tools render outside the book's measured surface. Audio uses the browser's native media element and `music-metadata` for server-side validation. API routes validate data and call the storage interface, keeping filesystem persistence separate from the UI.

Portability uses `yazl` to write ZIPs, `yauzl` to read bounded entries, and `buffer-crc32` to verify integrity. Imports stage images/audio under fresh safe names and atomically replace the book JSON after creating a safety backup. Earlier files are archived only after that commit; ordinary undo recovery remains bounded and is not exported.

### Where to change things

```text
Page flip:
src/components/book/reader.tsx

Front cover:
src/components/book/cover.tsx

Cover styles and legacy defaults:
src/lib/cover.ts

Page rendering and shared cover/page elements:
src/components/book/page-renderer.tsx

Editor UI:
src/components/editor/

Layer drag ordering:
src/components/editor/layers-panel.tsx

Floating toolbar and context menu:
src/components/editor/quick-tools.tsx

Selection, shortcuts, drops, and clipboard:
src/components/scrapbook.tsx
src/components/editor/editor-context.tsx

Snapping and group movement:
src/lib/editor-geometry.ts
src/components/book/page-renderer.tsx

Templates and duplication:
src/lib/editor.ts

Reading/editing controls:
src/components/scrapbook.tsx

Theme/styles:
src/app/globals.css
src/app/editor-canvas.css
src/app/editor-controls.css
src/lib/themes.ts

Sticker catalog and artwork:
src/lib/decorations.ts
src/components/book/sticker.tsx

Decoration picker:
src/components/editor/decoration-dialog.tsx

Audio controls and validation:
src/components/book/ambience.tsx
src/lib/storage/audio.ts

Autosave and undo/redo:
src/hooks/use-book.ts

Persistence:
src/lib/storage/

Export/import/reset UI:
src/components/book/book-actions.tsx

ZIP format and validation:
src/lib/storage/archive.ts

Default sample book:
src/lib/storage/sample.ts

Book data model:
src/types/book.ts

API:
src/app/api/

E2E tests:
tests/
```
