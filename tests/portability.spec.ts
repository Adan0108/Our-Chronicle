import {
  test,
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import yauzl from "yauzl";
import yazl from "yazl";
import { createSampleBook } from "../src/lib/storage/sample";
import {
  imageNameSchema,
  type Book,
  type BookElement,
} from "../src/types/book";

const storageRoot = path.resolve(".test-storage");
const manifest = {
  format: "our-chronicle",
  formatVersion: 1,
  exportedAt: new Date().toISOString(),
};

test.beforeEach(async ({ request }) => {
  const current = await readBook(request);
  const response = await request.put("/api/book", {
    data: { ...createSampleBook(), revision: current.revision },
  });
  expect(response.ok()).toBeTruthy();
});

async function readBook(request: APIRequestContext): Promise<Book> {
  const response = await request.get("/api/book");
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function open(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open scrapbook", exact: true })
    .click();
  await expect(page.getByTestId("page-indicator")).toContainText("1 – 2");
  await expect(page.locator(".book-spread")).toHaveCSS("transform", "none");
}

async function edit(page: Page) {
  await open(page);
  await page
    .getByRole("button", { name: "Edit scrapbook", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Scrapbook editor" }),
  ).toBeVisible();
}

async function saved(page: Page) {
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
}

async function selectLayer(page: Page, id: string) {
  await page.getByTestId(`layer-${id}`).click();
  await expect(page.getByTestId(`element-${id}`)).toHaveClass(
    /selected-element/,
  );
}

function getElement(book: Book, id: string): BookElement {
  const element = book.pages
    .flatMap((bookPage) => bookPage.elements)
    .find((item) => item.id === id);
  if (!element) throw new Error(`Missing element ${id}`);
  return element;
}

async function dragElement(page: Page, element: Locator, resize = false) {
  await element.scrollIntoViewIfNeeded();
  const box = await element.boundingBox();
  if (!box) throw new Error("Editable element missing");
  const x = box.x + (resize ? box.width - 1 : box.width / 2);
  const y = box.y + (resize ? box.height - 1 : box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 18, y + 12, { steps: 12 });
  await page.mouse.up();
}

async function dragSpread(page: Page, forward: boolean) {
  await page.mouse.move(20, 30);
  const box = await page.locator(".book-spread").boundingBox();
  if (!box) throw new Error("Book spread missing");
  await page.mouse.move(
    box.x + (forward ? box.width - 8 : 8),
    box.y + box.height - 8,
  );
  await page.mouse.down();
  await page.mouse.move(
    box.x + (forward ? 100 : box.width - 100),
    box.y + box.height - 130,
    { steps: 35 },
  );
  await page.mouse.up();
}

async function options(page: Page) {
  await page.getByRole("button", { name: "Book options", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Keep your memories safe" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function imageBytes(color: string, width = 640, height = 480) {
  return sharp({ create: { width, height, channels: 3, background: color } })
    .png()
    .toBuffer();
}

function digest(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function unpack(bytes: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error || !zip)
        return reject(error ?? new Error("Archive did not open"));
      const entries = new Map<string, Buffer>();
      zip.on("error", reject);
      zip.on("end", () => resolve(entries));
      zip.on("entry", (entry: yauzl.Entry) => {
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream)
            return reject(streamError ?? new Error("Archive stream missing"));
          const chunks: Buffer[] = [];
          stream.on("error", reject);
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => {
            if (entries.has(entry.fileName))
              return reject(new Error("Duplicate archive entry"));
            entries.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

function pack(entries: Iterable<[string, Buffer]>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    const chunks: Buffer[] = [];
    zip.outputStream.on("error", reject);
    zip.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    for (const [name, bytes] of entries) zip.addBuffer(bytes, name);
    zip.end();
  });
}

async function exportCurrent(request: APIRequestContext) {
  const current = await readBook(request);
  const response = await request.get(
    `/api/book/export?revision=${current.revision}`,
  );
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["content-type"]).toContain("application/zip");
  expect(response.headers()["content-disposition"]).toMatch(
    /attachment;.*our-chronicle-\d{4}-\d{2}-\d{2}\.zip/,
  );
  return { book: current, bytes: await response.body() };
}

async function importArchive(
  request: APIRequestContext,
  bytes: Buffer,
  revision?: number,
  confirm = true,
) {
  return request.post("/api/book/import", {
    data: bytes,
    headers: {
      "Content-Type": "application/zip",
      "X-Book-Revision": String(revision ?? (await readBook(request)).revision),
      ...(confirm ? { "X-Confirm-Replacement": "true" } : {}),
    },
  });
}

function archiveBook(entries: Map<string, Buffer>): Book {
  const bytes = entries.get("book.json");
  if (!bytes) throw new Error("Archive book.json missing");
  return JSON.parse(bytes.toString());
}

function referencedImages(book: Book) {
  return new Set(
    book.pages.flatMap((bookPage) =>
      bookPage.elements.flatMap((element) =>
        element.type === "image" && element.filename ? [element.filename] : [],
      ),
    ),
  );
}

function portableContent(book: Book) {
  return {
    schemaVersion: book.schemaVersion,
    title: book.title,
    subtitle: book.subtitle,
    pages: book.pages.map((bookPage) => ({
      ...bookPage,
      elements: bookPage.elements.map((element) =>
        element.type === "image"
          ? { ...element, filename: undefined }
          : element,
      ),
    })),
  };
}

async function assertArchiveSnapshot(
  bytes: Buffer,
  expected: Book,
  request: APIRequestContext,
) {
  const entries = await unpack(bytes);
  expect(archiveBook(entries)).toEqual(expected);
  expect(JSON.parse(entries.get("manifest.json")!.toString())).toMatchObject({
    format: "our-chronicle",
    formatVersion: 1,
  });
  expect([...entries.keys()].sort()).toEqual(
    [
      "book.json",
      "manifest.json",
      ...[...referencedImages(expected)].map(
        (filename) => `images/${filename}`,
      ),
    ].sort(),
  );
  for (const filename of referencedImages(expected)) {
    const response = await request.get(`/api/images/${filename}`);
    expect(response.ok()).toBeTruthy();
    expect(digest(entries.get(`images/${filename}`)!)).toBe(
      digest(await response.body()),
    );
  }
  return entries;
}

async function filenames(directory: string) {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function storageSnapshot(request: APIRequestContext) {
  const imageFiles = await filenames(path.join(storageRoot, "images"));
  return {
    book: await readBook(request),
    bookFile: await readFile(path.join(storageRoot, "book.json"), "utf8"),
    images: await Promise.all(
      imageFiles.map(async (filename) => [
        filename,
        digest(await readFile(path.join(storageRoot, "images", filename))),
      ]),
    ),
    backups: await filenames(path.join(storageRoot, "backups")),
  };
}

test("a new edited page exports, resets safely, imports, and retains every transformation", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await edit(page);
  await page.getByRole("button", { name: "Add page", exact: true }).click();
  await page
    .getByLabel("Page name", { exact: true })
    .fill("A portable afternoon");
  await page.getByLabel("Paper", { exact: true }).selectOption("sage");
  await saved(page);
  const createdPage = (await readBook(request)).pages.at(-1)!;
  expect(createdPage.id).not.toMatch(/^page-[1-4]$/);
  expect(createdPage.title).toBe("A portable afternoon");

  await page.getByLabel("Upload image", { exact: true }).setInputFiles({
    name: "green-memory.png",
    mimeType: "image/png",
    buffer: await imageBytes("#778c67"),
  });
  await saved(page);
  const firstImage = (await readBook(request)).pages
    .find((item) => item.id === createdPage.id)!
    .elements.find((item) => item.type === "image")!;
  await page
    .getByLabel("Photo caption", { exact: true })
    .fill("Our green afternoon");
  await page.getByLabel("Rotation (degrees)", { exact: true }).fill("13");
  await page.getByRole("button", { name: "Crop photo", exact: true }).click();
  const crop = page.getByRole("dialog", { name: "Frame your photograph" });
  await crop.getByRole("slider", { name: "Crop zoom" }).fill("1.8");
  await crop.getByRole("button", { name: "Apply crop", exact: true }).click();
  const firstTarget = page.getByTestId(`element-${firstImage.id}`);
  await dragElement(page, firstTarget);
  await saved(page);
  const moved = getElement(await readBook(request), firstImage.id);
  expect(moved.x).toBeGreaterThan(firstImage.x);
  expect(moved.y).toBeGreaterThan(firstImage.y);
  await dragElement(page, firstTarget, true);
  await saved(page);
  expect(
    getElement(await readBook(request), firstImage.id).width,
  ).toBeGreaterThan(moved.width);
  await page
    .getByRole("button", { name: "Lock position", exact: true })
    .click();

  await page.getByLabel("Upload image", { exact: true }).setInputFiles({
    name: "amber-memory.png",
    mimeType: "image/png",
    buffer: await imageBytes("#b18658", 500, 300),
  });
  await saved(page);
  await page
    .getByLabel("Photo caption", { exact: true })
    .fill("Our amber afternoon");
  await page.getByLabel("Photo frame", { exact: true }).selectOption("plain");
  await page.getByLabel("Rotation (degrees)", { exact: true }).fill("-7");
  await selectLayer(page, firstImage.id);
  await page
    .getByRole("button", { name: "Bring forward", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Duplicate image", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Send backward", exact: true })
    .click();
  await saved(page);

  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByLabel("Text content", { exact: true })
    .fill("A memory that travels with us");
  await page
    .getByLabel("Font family", { exact: true })
    .selectOption("handwritten");
  await page.getByLabel("Font size", { exact: true }).fill("24");
  await page.getByLabel("Text color", { exact: true }).fill("#704930");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await page.getByRole("button", { name: "Italic", exact: true }).click();
  await page
    .getByLabel("Text alignment", { exact: true })
    .selectOption("center");
  await page.getByLabel("Rotation (degrees)", { exact: true }).fill("-4");
  await page
    .getByRole("button", { name: "Duplicate text", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Send backward", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Lock position", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move page earlier", exact: true })
    .click();
  await saved(page);
  const expected = await readBook(request);
  const editedPage = expected.pages.find((item) => item.id === createdPage.id)!;
  const photos = editedPage.elements.filter((item) => item.type === "image");
  expect(photos).toHaveLength(3);
  expect(new Set(photos.map((item) => item.filename)).size).toBe(2);
  const originalPhoto = getElement(expected, firstImage.id);
  if (originalPhoto.type !== "image") throw new Error("Original photo missing");
  expect(
    photos.filter((item) => item.filename === originalPhoto.filename),
  ).toHaveLength(2);
  expect(
    editedPage.elements.filter(
      (item) => item.type === "text" && item.fontFamily === "handwritten",
    ),
  ).toHaveLength(2);
  expect(getElement(expected, firstImage.id)).toMatchObject({
    rotation: 13,
    locked: true,
    crop: { width: expect.any(Number), height: expect.any(Number) },
  });
  await page.screenshot({
    path: testInfo.outputPath("desktop-portable-page-editor.png"),
  });

  const tools = await options(page);
  const downloadPromise = page.waitForEvent("download");
  await tools.getByRole("button", { name: "Export Book", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^our-chronicle-\d{4}-\d{2}-\d{2}\.zip$/,
  );
  const downloadPath = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(downloadPath);
  const exportedBytes = await readFile(downloadPath);
  const exported = await assertArchiveSnapshot(
    exportedBytes,
    expected,
    request,
  );
  await page.getByRole("button", { name: "Reset Book", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reset to sample book", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("reset-confirmation.png"),
  });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await readBook(request)).toEqual(expected);
  await page.getByRole("button", { name: "Reset Book", exact: true }).click();
  const resetResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/book/reset") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Reset to sample book", exact: true })
    .click();
  const resetResponse = await resetResponsePromise;
  expect(resetResponse.ok()).toBeTruthy();
  await page.waitForURL((url) => url.searchParams.get("restored") === "reset");
  const resetBackupFilename = new URL(page.url()).searchParams.get("backup");
  expect(resetBackupFilename).toMatch(
    /^our-chronicle-.*-before-reset-.*\.zip$/,
  );
  await expect(
    page.getByRole("button", { name: "Open scrapbook", exact: true }),
  ).toBeVisible();
  const resetBook = await readBook(request);
  expect(resetBook.pages.map((item) => item.title)).toEqual(
    createSampleBook().pages.map((item) => item.title),
  );
  expect(
    resetBook.pages.some((item) => item.id === createdPage.id),
  ).toBeFalsy();
  const resetBackup = await unpack(
    await readFile(path.join(storageRoot, "backups", resetBackupFilename!)),
  );
  expect(archiveBook(resetBackup)).toEqual(expected);
  for (const filename of referencedImages(expected))
    expect(resetBackup.get(`images/${filename}`)).toEqual(
      exported.get(`images/${filename}`),
    );

  const resetImages = new Map<string, Buffer>();
  for (const filename of referencedImages(resetBook)) {
    const response = await request.get(`/api/images/${filename}`);
    expect(response.ok()).toBeTruthy();
    resetImages.set(filename, await response.body());
  }
  await options(page);
  await page.getByRole("button", { name: "Import Book", exact: true }).click();
  await page
    .getByLabel("Import archive", { exact: true })
    .setInputFiles(downloadPath);
  await expect(
    page.getByRole("button", { name: "Import and replace", exact: true }),
  ).toBeVisible();
  const importResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/book/import") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Import and replace", exact: true })
    .click();
  const importResponse = await importResponsePromise;
  expect(importResponse.ok()).toBeTruthy();
  await page.waitForURL((url) => url.searchParams.get("restored") === "import");
  const importBackupFilename = new URL(page.url()).searchParams.get("backup");
  expect(importBackupFilename).toMatch(
    /^our-chronicle-.*-before-import-.*\.zip$/,
  );
  await expect(
    page.getByRole("button", { name: "Open scrapbook", exact: true }),
  ).toBeVisible();
  const restored = await readBook(request);
  expect(restored.revision).toBeGreaterThan(resetBook.revision);
  expect(portableContent(restored)).toEqual(portableContent(expected));
  const importBackup = await unpack(
    await readFile(path.join(storageRoot, "backups", importBackupFilename!)),
  );
  expect(archiveBook(importBackup)).toEqual(resetBook);
  for (const [filename, bytes] of resetImages)
    expect(importBackup.get(`images/${filename}`)).toEqual(bytes);
  for (const originalPage of expected.pages) {
    for (const originalElement of originalPage.elements) {
      if (originalElement.type !== "image" || !originalElement.filename)
        continue;
      const importedElement = getElement(restored, originalElement.id);
      if (importedElement.type !== "image" || !importedElement.filename)
        throw new Error("Imported photo reference missing");
      expect(
        imageNameSchema.safeParse(importedElement.filename).success,
      ).toBeTruthy();
      expect(importedElement.filename).not.toBe(originalElement.filename);
      const imageResponse = await request.get(
        `/api/images/${importedElement.filename}`,
      );
      expect(imageResponse.ok()).toBeTruthy();
      expect(digest(await imageResponse.body())).toBe(
        digest(exported.get(`images/${originalElement.filename}`)!),
      );
    }
  }

  await open(page);
  await dragSpread(page, true);
  await expect(page.getByTestId("page-indicator")).toContainText("3 – 4");
  const importedPhoto = page.getByTestId(`element-${firstImage.id}`);
  await expect(importedPhoto.getByRole("img")).toHaveJSProperty(
    "naturalWidth",
    640,
  );
  await expect(importedPhoto.locator(".photo-image")).toHaveAttribute(
    "data-cropped",
    "true",
  );
  await expect(page.locator(".editable-element")).toHaveCount(0);
  await expect(
    page.getByRole("complementary", { name: "Scrapbook editor" }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({
    path: testInfo.outputPath("laptop-imported-reading.png"),
  });
  await dragSpread(page, false);
  await expect(page.getByTestId("page-indicator")).toContainText("1 – 2");
  await dragSpread(page, false);
  await expect(
    page.getByRole("button", { name: "Open scrapbook", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open scrapbook", exact: true })
    .click();
  await expect(page.getByTestId("page-indicator")).toContainText("1 – 2");
  await page.reload();
  expect(portableContent(await readBook(request))).toEqual(
    portableContent(expected),
  );

  await edit(page);
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "A portable afternoon Page 04", exact: true })
    .click();
  const styled = editedPage.elements.find(
    (item) =>
      item.type === "text" && item.fontFamily === "handwritten" && !item.locked,
  )!;
  await selectLayer(page, styled.id);
  await page
    .getByLabel("Text content", { exact: true })
    .fill("Still editable after travelling");
  await saved(page);
  expect(getElement(await readBook(request), styled.id)).toMatchObject({
    text: "Still editable after travelling",
  });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await saved(page);
  expect(getElement(await readBook(request), styled.id)).toEqual(
    getElement(restored, styled.id),
  );
  expect(pageErrors).toEqual([]);
});

test("export contains only the snapshot and referenced images, never orphan or recovery files", async ({
  request,
}) => {
  const upload = await request.post("/api/images", {
    multipart: {
      image: {
        name: "unused.png",
        mimeType: "image/png",
        buffer: await imageBytes("#967452", 200, 160),
      },
    },
  });
  expect(upload.ok()).toBeTruthy();
  const orphan: { filename: string } = await upload.json();
  const snapshot = await exportCurrent(request);
  const entries = await assertArchiveSnapshot(
    snapshot.bytes,
    snapshot.book,
    request,
  );
  expect(entries.has(`images/${orphan.filename}`)).toBeFalsy();
  expect(
    [...entries.keys()].some((name) => /trash|backups|test|\.next/.test(name)),
  ).toBeFalsy();
});

test("malformed, invalid, unsupported, and incomplete archives leave all local data untouched", async ({
  request,
}) => {
  const { book, bytes } = await exportCurrent(request);
  const valid = await unpack(bytes);
  const baseline = await storageSnapshot(request);
  const missingImage = new Map(valid);
  missingImage.delete(`images/${[...referencedImages(book)][0]}`);
  const invalidBook = new Map(valid);
  invalidBook.set(
    "book.json",
    Buffer.from(JSON.stringify({ ...book, pages: [] })),
  );
  const invalidCrop = structuredClone(book);
  const image = invalidCrop.pages
    .flatMap((bookPage) => bookPage.elements)
    .find((item) => item.type === "image")!;
  if (image.type !== "image") throw new Error("Sample photo missing");
  image.crop = { x: 90, y: 0, width: 30, height: 100 };
  const invalidFields = new Map(valid);
  invalidFields.set("book.json", Buffer.from(JSON.stringify(invalidCrop)));
  const invalidFilename = structuredClone(book);
  const badImage = invalidFilename.pages
    .flatMap((bookPage) => bookPage.elements)
    .find((item) => item.type === "image")!;
  if (badImage.type !== "image") throw new Error("Sample photo missing");
  badImage.filename = "../personal.png";
  const invalidReferences = new Map(valid);
  invalidReferences.set(
    "book.json",
    Buffer.from(JSON.stringify(invalidFilename)),
  );
  const future = new Map(valid);
  future.set(
    "manifest.json",
    Buffer.from(JSON.stringify({ ...manifest, formatVersion: 3 })),
  );
  const wrongFormat = new Map(valid);
  wrongFormat.set(
    "manifest.json",
    Buffer.from(JSON.stringify({ ...manifest, format: "some-other-book" })),
  );
  const noManifest = new Map(valid);
  noManifest.delete("manifest.json");
  const corruptImage = new Map(valid);
  corruptImage.set(
    `images/${[...referencedImages(book)][0]}`,
    Buffer.from("This is not an image"),
  );
  const unexpected = new Map(valid);
  unexpected.set("README.md", Buffer.from("Unrelated content"));
  const cases = [
    ["not a ZIP", Buffer.from("A memory, not a ZIP archive")],
    ["truncated ZIP", bytes.subarray(0, 50)],
    ["invalid book", await pack(invalidBook)],
    ["invalid editor fields", await pack(invalidFields)],
    ["unsafe image reference", await pack(invalidReferences)],
    ["missing photo", await pack(missingImage)],
    ["corrupt photo", await pack(corruptImage)],
    ["unsupported version", await pack(future)],
    ["wrong archive format", await pack(wrongFormat)],
    ["missing manifest", await pack(noManifest)],
    ["unexpected file", await pack(unexpected)],
  ] as const;
  for (const [label, invalid] of cases) {
    const response = await importArchive(request, invalid, book.revision);
    expect(response.status(), label).toBe(400);
    expect((await response.json()).error, label).toEqual(expect.any(String));
    expect(await storageSnapshot(request), label).toEqual(baseline);
  }
});

function rewriteName(bytes: Buffer, from: string, to: string) {
  const original = Buffer.from(from);
  const replacement = Buffer.from(to);
  expect(replacement.length).toBe(original.length);
  const changed = Buffer.from(bytes);
  let offset = changed.indexOf(original);
  let replacements = 0;
  while (offset !== -1) {
    replacement.copy(changed, offset);
    replacements++;
    offset = changed.indexOf(original, offset + original.length);
  }
  expect(replacements).toBe(2);
  return changed;
}

test("ZIP traversal, absolute paths, backslashes, duplicates, links, and encryption are rejected", async ({
  request,
}) => {
  const { book, bytes } = await exportCurrent(request);
  const valid = await unpack(bytes);
  const baseline = await storageSnapshot(request);
  const ordinaryName = "images/unsafe.jpg";
  const withExtra = await pack([
    ...valid,
    [ordinaryName, await imageBytes("#886b51", 100, 100)],
  ]);
  const dangerousPaths = [
    "../escape/file.js",
    "images\\unsafe.jpg",
    "/mages/unsafe.jpg",
    "C:/ges/unsafe.jpg",
  ];
  for (const unsafe of dangerousPaths) {
    const response = await importArchive(
      request,
      rewriteName(withExtra, ordinaryName, unsafe),
      book.revision,
    );
    expect(response.status(), unsafe).toBe(400);
    expect(await storageSnapshot(request), unsafe).toEqual(baseline);
  }

  const duplicate = await pack([
    ...valid,
    ["book.json", valid.get("book.json")!],
  ]);
  expect(
    (await importArchive(request, duplicate, book.revision)).status(),
  ).toBe(400);
  expect(await storageSnapshot(request)).toEqual(baseline);

  const symlink = Buffer.from(bytes);
  const linkedImage = `images/${[...referencedImages(book)][0]}`;
  let central = symlink.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  let patched = false;
  while (central !== -1) {
    const length = symlink.readUInt16LE(central + 28);
    if (
      symlink.subarray(central + 46, central + 46 + length).toString() ===
      linkedImage
    ) {
      symlink[central + 5] = 3;
      symlink.writeUInt32LE((0xa1ff << 16) >>> 0, central + 38);
      patched = true;
      break;
    }
    central = symlink.indexOf(
      Buffer.from([0x50, 0x4b, 0x01, 0x02]),
      central + 4,
    );
  }
  expect(patched).toBeTruthy();
  expect((await importArchive(request, symlink, book.revision)).status()).toBe(
    400,
  );
  expect(await storageSnapshot(request)).toEqual(baseline);

  const encrypted = Buffer.from(bytes);
  const local = encrypted.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const directory = encrypted.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  encrypted.writeUInt16LE(encrypted.readUInt16LE(local + 6) | 1, local + 6);
  encrypted.writeUInt16LE(
    encrypted.readUInt16LE(directory + 8) | 1,
    directory + 8,
  );
  expect(
    (await importArchive(request, encrypted, book.revision)).status(),
  ).toBe(400);
  expect(await storageSnapshot(request)).toEqual(baseline);
});

test("replacement requires explicit confirmation and a current revision", async ({
  request,
}) => {
  const { book, bytes } = await exportCurrent(request);
  const baseline = await storageSnapshot(request);
  expect(
    (await importArchive(request, bytes, book.revision, false)).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/book/reset", {
        data: { revision: book.revision },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/book/reset", {
        data: { revision: book.revision, confirm: false },
      })
    ).status(),
  ).toBe(400);
  expect(await storageSnapshot(request)).toEqual(baseline);

  const changed = await request.put("/api/book", {
    data: { ...book, title: "A newer local memory" },
  });
  expect(changed.ok()).toBeTruthy();
  const updated = await storageSnapshot(request);
  expect((await importArchive(request, bytes, book.revision)).status()).toBe(
    409,
  );
  expect(
    (
      await request.post("/api/book/reset", {
        data: { revision: book.revision, confirm: true },
      })
    ).status(),
  ).toBe(409);
  expect(
    (await request.get(`/api/book/export?revision=${book.revision}`)).status(),
  ).toBe(409);
  expect(await storageSnapshot(request)).toEqual(updated);
});

test("reset preserves a complete restorable safety backup and recreates sample images", async ({
  request,
}) => {
  const original = await readBook(request);
  const edited = await request.put("/api/book", {
    data: {
      ...original,
      title: "Before resetting",
      subtitle: "Keep this memory safe",
    },
  });
  expect(edited.ok()).toBeTruthy();
  const previous = await readBook(request);
  const exported = await exportCurrent(request);
  const response = await request.post("/api/book/reset", {
    data: { revision: previous.revision, confirm: true },
  });
  expect(response.ok()).toBeTruthy();
  const result: { book: Book; backupFilename: string } = await response.json();
  expect(result.backupFilename).toMatch(
    /^our-chronicle-.*-before-reset-.*\.zip$/,
  );
  const backupBytes = await readFile(
    path.join(storageRoot, "backups", result.backupFilename),
  );
  const backup = await unpack(backupBytes);
  expect(archiveBook(backup)).toEqual(previous);
  const oldExport = await unpack(exported.bytes);
  for (const filename of referencedImages(previous))
    expect(backup.get(`images/${filename}`)).toEqual(
      oldExport.get(`images/${filename}`),
    );
  expect(result.book.title).toBe("Our Chronicle");
  expect(result.book.pages.map((item) => item.title)).toEqual(
    createSampleBook().pages.map((item) => item.title),
  );
  for (const filename of referencedImages(result.book)) {
    const photo = await request.get(`/api/images/${filename}`);
    expect(photo.ok()).toBeTruthy();
    expect((await sharp(await photo.body()).metadata()).width).toBeGreaterThan(
      0,
    );
  }
  const restore = await importArchive(request, backupBytes);
  expect(restore.ok()).toBeTruthy();
  expect(portableContent(await readBook(request))).toEqual(
    portableContent(previous),
  );
});

async function optionalFile(filename: string) {
  try {
    return await readFile(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function restoreFixtureFile(filename: string, original?: Buffer) {
  if (original) await writeFile(filename, original);
  else {
    try {
      await unlink(filename);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

test("reset ignores a corrupt leftover sample file and backs up the valid current book", async ({
  request,
}) => {
  const initial = await exportCurrent(request);
  const imported = await importArchive(request, initial.bytes);
  expect(imported.ok()).toBeTruthy();
  const previous = await readBook(request);
  expect(referencedImages(previous).has("sample-coffee.jpg")).toBeFalsy();
  const previousArchive = await exportCurrent(request);
  const previousEntries = await unpack(previousArchive.bytes);
  const canonical = path.join(storageRoot, "images", "sample-coffee.jpg");
  const archived = path.join(
    storageRoot,
    "images",
    ".trash",
    "sample-coffee.jpg",
  );
  const originalCanonical = await optionalFile(canonical);
  const originalArchived = await optionalFile(archived);
  try {
    // This file is deliberately not referenced by the currently imported book.
    await writeFile(
      canonical,
      Buffer.from("A corrupt, unreferenced old sample"),
    );
    const response = await request.post("/api/book/reset", {
      data: { revision: previous.revision, confirm: true },
    });
    expect(response.ok()).toBeTruthy();
    const result: { book: Book; backupFilename: string } =
      await response.json();
    expect(result.book.pages.map((item) => item.title)).toEqual(
      createSampleBook().pages.map((item) => item.title),
    );
    const backup = await unpack(
      await readFile(path.join(storageRoot, "backups", result.backupFilename)),
    );
    expect(archiveBook(backup)).toEqual(previous);
    for (const filename of referencedImages(previous))
      expect(backup.get(`images/${filename}`)).toEqual(
        previousEntries.get(`images/${filename}`),
      );
    for (const filename of referencedImages(result.book)) {
      const image = await request.get(`/api/images/${filename}`);
      expect(image.ok()).toBeTruthy();
      const decoded = await sharp(await image.body())
        .raw()
        .toBuffer();
      expect(decoded.length).toBeGreaterThan(0);
    }
  } finally {
    // Reset may archive the corrupt fixture; restore both places so later tests
    // continue to use the original sample artwork rather than this fixture.
    await restoreFixtureFile(canonical, originalCanonical);
    await restoreFixtureFile(archived, originalArchived);
  }
});

test("cancelled import and malformed upload keep the open book usable", async ({
  page,
  request,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page);
  const previous = await storageSnapshot(request);
  const exported = await exportCurrent(request);
  await options(page);
  await page.getByRole("button", { name: "Import Book", exact: true }).click();
  await page.getByLabel("Import archive", { exact: true }).setInputFiles({
    name: "memory.zip",
    mimeType: "application/zip",
    buffer: exported.bytes,
  });
  await expect(
    page.getByRole("button", { name: "Import and replace", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await storageSnapshot(request)).toEqual(previous);
  await page.getByRole("button", { name: "Import Book", exact: true }).click();
  await page.getByLabel("Import archive", { exact: true }).setInputFiles({
    name: "broken.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("Not a ZIP"),
  });
  await page
    .getByRole("button", { name: "Import and replace", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Import your book" }).getByRole("alert"),
  ).toContainText(/archive|zip/i);
  expect(await storageSnapshot(request)).toEqual(previous);
  await page.screenshot({
    path: testInfo.outputPath("laptop-rejected-import.png"),
  });
  await page
    .getByRole("button", { name: "Close book options", exact: true })
    .click();
  await page.getByRole("button", { name: "Next pages", exact: true }).click();
  await expect(page.getByTestId("page-indicator")).toContainText("3 – 4");
  await page
    .getByRole("button", { name: "Previous pages", exact: true })
    .click();
  await expect(page.getByTestId("page-indicator")).toContainText("1 – 2");
});

test("export flushes pending edits on a new page without clearing editor history", async ({
  page,
  request,
}, testInfo) => {
  await edit(page);
  await page.getByRole("button", { name: "Add page", exact: true }).click();
  await saved(page);
  const previous = await readBook(request);
  const createdPage = previous.pages.at(-1)!;
  const heading = createdPage.elements.find(
    (element) => element.type === "text",
  )!;
  await selectLayer(page, heading.id);

  // Freeze only the browser's timer progression so the autosave debounce cannot
  // run first. Export must explicitly flush the pending edit before snapshotting.
  await page.clock.install({ time: new Date("2026-10-03T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-03T00:00:01Z"));
  await page
    .getByLabel("Text content", { exact: true })
    .fill("The latest thought travels too");
  const dialog = await options(page);
  const downloadPromise = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Export Book", exact: true })
    .click();
  const download = await downloadPromise;
  const downloadPath = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(downloadPath);
  const persisted = await readBook(request);
  expect(persisted.revision).toBeGreaterThan(previous.revision);
  expect(getElement(persisted, heading.id)).toMatchObject({
    text: "The latest thought travels too",
  });
  await assertArchiveSnapshot(await readFile(downloadPath), persisted, request);
  await dialog
    .getByRole("button", { name: "Close book options", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Scrapbook editor" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Done editing", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Text content", { exact: true })).toHaveValue(
    "A new memory",
  );
  await page.clock.resume();
  await saved(page);
  expect(getElement(await readBook(request), heading.id)).toEqual(heading);
});
