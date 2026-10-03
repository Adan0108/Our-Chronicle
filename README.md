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
- **Edit:** Choose **Edit scrapbook**; **Done editing** returns to reading. Page-turn gestures pause while editing.
- **Text:** Click a text block and change **Text content** or **Text style** in the editor. Use **Text** to add a block and **Delete text** to remove the selected block.
- **Photos:** Select a page, then choose **Photo** to upload a JPEG, PNG, or WebP (up to 10 MB / 24 megapixels). Select a photo to edit its caption/frame, **Replace photo**, or **Delete image**. Drag the selected photo to move it; drag a corner to resize it.
- **Pages and cover:** Use **Add page** or the delete-page button in the editor. Deletion asks for confirmation, and at least two pages must remain. Expand **Book cover details** to edit the title and subtitle.
- **Autosave:** Changes save after a short pause. Wait for **Saved on this device** before refreshing or closing. Failed saves offer a retry; a stale-tab conflict requires reloading that tab to get the latest book.
- **Smaller screens:** View full-size pages by scrolling sideways or using **Show left page** / **Show right page**. Use navigation arrows to turn pages. The editor appears below the book; **Edit selected item** and **Back to the page** help you move between them.

## Local data and backups

Personal content is written by the local Next.js server to files on the machine running the app:

- `storage/book.json` — book title, pages, text, image references, and element positions.
- `storage/images/` — sample photographs and uploaded images.

Content is stored in this folder, **not in a database, browser storage, or cloud service**. Uploads are served through the API and do not enter `public/` or source folders.

**Back up the entire `storage/` folder while the app is stopped.** It contains both the book state and its images; copying only the JSON will not preserve the photographs. To restore, stop the app, replace `storage/` with your backup, and restart.

Sample-photo attribution and license details are in [storage/images/README.md](storage/images/README.md).

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
- Books support 2–100 pages and up to 60 elements per page.
- Desktop/laptop is the primary experience. Narrow screens use horizontal page viewing and an editor below the book.
- Text boxes have fixed dimensions; resize them when longer text needs more space.
- Uploaded images are converted to WebP and limited to 2400 pixels on the longest edge. Original uploaded files are not retained. Interrupted uploads can leave unused image files.
- No undo/history, photo crop tool, import/export UI, stickers, or cloud sync.

## Project Structure

```text
Our-Chronicle/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── book/route.ts          # Read and save book data
│   │   │   └── images/               # Upload, serve, and delete images
│   │   ├── page.tsx                  # Load the book and render the app
│   │   ├── layout.tsx                # Root layout and metadata
│   │   └── globals.css               # Theme and responsive styles
│   ├── components/
│   │   ├── book/
│   │   │   ├── cover.tsx             # Front cover in the native page-flip surface
│   │   │   ├── reader.tsx            # Page-flip library integration
│   │   │   └── page-renderer.tsx     # Data-driven page rendering
│   │   ├── editor/                   # Inspector and deletion dialog
│   │   └── scrapbook.tsx             # Reading/editing UI and interactions
│   ├── hooks/
│   │   └── use-book.ts               # Autosave, save status, and revisions
│   ├── lib/
│   │   ├── api.ts                    # Request checks and API errors
│   │   └── storage/
│   │       ├── index.ts              # Storage interface and instance
│   │       ├── local.ts              # Filesystem storage and safe writes
│   │       └── sample.ts             # Default book and fallback artwork
│   └── types/
│       └── book.ts                   # Zod schemas and TypeScript types
├── storage/
│   ├── book.json                     # Local book state
│   └── images/                       # Local images and sample attribution
├── tests/
│   └── scrapbook.spec.ts             # Browser flows and API checks
├── playwright.config.ts             # Isolated E2E server configuration
└── package.json                      # Dependencies and scripts
```

Pages contain arrays of text and image elements rather than hard-coded page components. The reader uses `react-pageflip` / StPageFlip; the editor uses `react-rnd`. API routes validate data and call the storage interface, keeping filesystem persistence separate from the UI.

### Where to change things

```text
Page flip:
src/components/book/reader.tsx

Front cover:
src/components/book/cover.tsx

Page rendering:
src/components/book/page-renderer.tsx

Editor UI:
src/components/editor/

Reading/editing controls:
src/components/scrapbook.tsx

Theme/styles:
src/app/globals.css

Autosave:
src/hooks/use-book.ts

Persistence:
src/lib/storage/

Default sample book:
src/lib/storage/sample.ts

Book data model:
src/types/book.ts

API:
src/app/api/

E2E tests:
tests/
```
