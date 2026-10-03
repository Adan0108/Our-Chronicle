# Our Chronicle

A local-first interactive scrapbook with a warm café / vintage journal theme. Four sample pages and original sample illustrations are included. No accounts, database, or remote services are needed to use the app.

## Run locally

Requires Node.js 20.9+ and npm (Node 24 was used for validation).

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:3000**. The server binds to the loopback interface. On Windows, use `npm.cmd` / `npx.cmd` if PowerShell blocks unsigned `.ps1` scripts.

For production:

```sh
npm run build
npm start
```

## Using your book

- Click the cover to open a two-page spread. Turn pages by clicking a page, dragging a corner across the spine, using the navigation arrows, or selecting a page in the sidebar.
- Choose **Edit scrapbook**. Click either page to select it, then add text or upload a photo in the inspector. Click an element to change its text, caption, style, frame, or tilt.
- Drag a selected element to move it. Drag a selected element's corner to resize it. Page turning is paused while editing.
- Add a page or delete the selected page in the inspector. Your book keeps at least two pages. Page deletion asks for confirmation; Escape cancels the dialog.
- Expand **Book cover details** to change the title and subtitle. **Done editing** returns to reading mode.
- Changes save automatically after a short pause. Wait for **Saved on this device** before refreshing. A failed save keeps your edits in the current tab and offers a retry. Stale tabs show a conflict instead of overwriting newer work; reload the stale tab to get the latest book.
- On narrow screens, scroll the spread horizontally or use **Show left page** / **Show right page** to reach the other side. Use the round navigation arrows to turn pages. The editor sits below the book on smaller screens, and save status stays visible on mobile.

## Storage and architecture

```text
src/app/                    App Router page, layout, theme, and API routes
src/components/book/        Shared data-driven renderer and page-flip reader
src/components/editor/      Inspector and native confirmation dialog
src/components/scrapbook.tsx Workspace and editor interactions
src/hooks/use-book.ts        Autosave, save status, revision handling
src/types/book.ts            Zod schemas and inferred TypeScript types
src/lib/storage/            Storage interface, filesystem adapter, sample data
src/lib/api.ts               Origin checks, body limits, error responses
storage/book.json           Your complete structured book
storage/images/             Sample artwork and uploaded images
tests/                      Playwright browser and API tests
```

Every page contains an array of `text` or `image` elements with position, dimensions, and rotation. The discriminated element schema and shared renderer can later be extended with stickers or shapes. `BookStorage` isolates persistence from the API and UI; replacing the filesystem adapter does not require rewriting the renderer or editor.

The first request creates `storage/book.json` and sample images if the book is missing. The shipped sample book works immediately after installation, including offline use after dependencies are installed. Original fallback illustrations can regenerate sample assets for an empty storage directory. User uploads never enter `public/` or source folders. Copy the **entire `storage/` folder** while the app is stopped to back up or move your memories.

Book writes are Zod-validated, bounded to 1 MB, serialized within the server process, checked against the current revision, and committed through a temporary file and rename. Uploads accept JPEG, PNG, and WebP up to 10 MB / 24 megapixels. Sharp verifies the actual format, decodes and re-encodes the image, applies orientation, strips metadata, and limits the output to 2400 pixels. UUID filenames replace uploaded filenames; image routes reject unsafe path names. Writes reject cross-origin requests.

After a book save commits, files for removed or replaced photos are deleted if the book no longer references them. A failed cleanup does not fail the book save. The image DELETE endpoint also refuses to delete referenced images. An upload interrupted before its first successful book save can leave an unused file; there is no background orphan sweep.

## Packages

- Next.js App Router, React, TypeScript, Tailwind CSS.
- [react-pageflip](https://github.com/Nodlik/react-pageflip) / StPageFlip for page-turn physics; a shared static spread during editing avoids gesture conflicts with the editor.
- [react-rnd](https://github.com/bokuweb/react-rnd) for element dragging and resizing.
- Motion for the cover entrance; Lucide React for UI icons.
- Zod for validation; Sharp for safe image decoding and normalization.
- Playwright for Chromium E2E tests; ESLint and Prettier for maintainable source.

## Verify

```sh
npx playwright install chromium
npm run lint
npm run build
npm run test:e2e
```

The suite launches its own dev server at port **3001** with `.test-storage/` and `.next-e2e/`, leaving your book untouched. Do not run two test suites at the same time. Tests cover opening the book, buttons/click/drag navigation, text editing and refresh persistence, adding/deleting text, uploading/dragging/resizing/replacing/deleting photos and their files, page and cover management, rapid edits, stale-tab conflicts, mobile access, and invalid/oversized/cross-origin requests. Screenshots and failure traces go to `test-results/`; `playwright-report/` contains the report.

Optional: `npm run test:e2e:ui`, `npm run format`, and `npm run format:check`.

## MVP boundaries

One book, one local server process, and a writable local filesystem. Run a single app instance per storage folder; revision handling is for browser tabs, not coordinated server processes. The schema allows 2–100 pages and 60 elements per page. Text uses a fixed-size box; resize it when longer copy needs more room. Uploaded photos are normalized rather than preserved as untouched originals. No undo/history, export/import UI, crop tool, stickers, or cloud sync is included yet.

The dependency audit currently reports five high-severity entries in the **development-only Next ESLint → fast-glob → micromatch → braces chain**. The registry offers no patched braces release; the audit's suggested forced downgrade of the Next ESLint configuration is incompatible with the chosen Next.js version. The production dependency audit is checked separately. Recheck the development chain as a compatible patch becomes available.
