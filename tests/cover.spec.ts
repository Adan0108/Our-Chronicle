import {
  test,
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import yauzl from "yauzl";
import { COVER_STYLES, resolveCover } from "../src/lib/cover";
import { createSampleBook } from "../src/lib/storage/sample";
import type { Book, BookElement, ImageElement } from "../src/types/book";

const storageRoot = path.resolve(".test-storage");

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

async function saved(page: Page) {
  await expect(
    page.getByRole("status", { name: "Book save status" }),
  ).toHaveText("Saved on this device");
}

async function editCover(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Open scrapbook", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit scrapbook", exact: true })
    .click();
  await expect(page.getByTestId("cover-editor-surface")).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Cover editor" }),
  ).toBeVisible();
}

async function selectLayer(page: Page, id: string) {
  await page.getByTestId(`layer-${id}`).click();
  await expect(page.getByTestId(`element-${id}`)).toHaveClass(
    /selected-element/,
  );
}

function coverElement(book: Book, id: string) {
  const item = resolveCover(book).elements.find((element) => element.id === id);
  if (!item) throw new Error(`Cover element ${id} missing`);
  return item;
}

function coverImage(book: Book, id: string): ImageElement {
  const item = coverElement(book, id);
  if (item.type !== "image") throw new Error(`${id} is not a cover image`);
  return item;
}

function geometry(item: BookElement) {
  return { x: item.x, y: item.y, width: item.width, height: item.height };
}

async function manipulate(page: Page, target: Locator, resize = false) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error("Cover element is not rendered");
  const x = box.x + (resize ? box.width - 1 : box.width / 2);
  const y = box.y + (resize ? box.height - 1 : box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 18, y + 12, { steps: 12 });
  await page.mouse.up();
}

async function bringToFront(page: Page) {
  const button = page.getByRole("button", {
    name: "Bring forward",
    exact: true,
  });
  for (let index = 0; index < 60 && !(await button.isDisabled()); index++)
    await button.click();
  await expect(button).toBeDisabled();
}

async function photograph(color = "#a8b28e") {
  return sharp({
    create: { width: 640, height: 480, channels: 3, background: color },
  })
    .png()
    .toBuffer();
}

async function uploadCover(page: Page, request: APIRequestContext) {
  await page.getByLabel("Upload image", { exact: true }).setInputFiles({
    name: "cover-photo.png",
    mimeType: "image/png",
    buffer: await photograph(),
  });
  await saved(page);
  const images = resolveCover(await readBook(request)).elements.filter(
    (item) => item.type === "image",
  );
  const item = images.at(-1);
  if (!item) throw new Error("Uploaded cover photograph missing");
  return item;
}

function unpack(bytes: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error || !zip)
        return reject(error ?? new Error("ZIP archive did not open"));
      const entries = new Map<string, Buffer>();
      zip.on("error", reject);
      zip.on("end", () => resolve(entries));
      zip.on("entry", (entry: yauzl.Entry) => {
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream)
            return reject(streamError ?? new Error("ZIP stream missing"));
          const chunks: Buffer[] = [];
          stream.on("error", reject);
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => {
            entries.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

function content(book: Book) {
  const withoutFilenames = (elements: BookElement[]) =>
    elements.map((item) =>
      item.type === "image" ? { ...item, filename: undefined } : item,
    );
  return {
    title: book.title,
    subtitle: book.subtitle,
    pages: book.pages.map((item) => ({
      ...item,
      elements: withoutFilenames(item.elements),
    })),
    cover: book.cover && {
      ...book.cover,
      elements: withoutFilenames(book.cover.elements),
    },
  };
}

async function nativeClosed(page: Page) {
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const cover = page.getByRole("button", {
    name: "Open scrapbook",
    exact: true,
  });
  await expect(cover).toBeVisible();
  await expect(cover).toHaveClass(/--simple/);
  await expect(cover).toHaveCSS("width", "440px");
  await expect(cover).toHaveCSS("height", "580px");
  await expect(page.locator(".book-spread")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, -220, 0)",
  );
  await expect(page.getByTestId("page-indicator")).toHaveCount(0);
}

async function readingCoverColor(page: Page, color: string) {
  const channels = [1, 3, 5].map((offset) =>
    parseInt(color.slice(offset, offset + 2), 16),
  );
  await expect(page.locator(".native-cover .cover-face")).toHaveCSS(
    "background-color",
    `rgb(${channels.join(", ")})`,
  );
}

async function dragSpread(page: Page, forward: boolean) {
  await page.mouse.move(20, 30);
  const box = await page.locator(".book-spread").boundingBox();
  if (!box) throw new Error("Native spread missing");
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

test("legacy cover is editable, styled, layered, locked, and persisted without changing interior pages", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const original = await readBook(request);
  expect(original.cover).toBeUndefined();
  await editCover(page);
  const defaults = resolveCover(original);
  const title = defaults.elements.find(
    (item) => item.type === "text" && item.text === original.title,
  );
  if (!title) throw new Error("Default cover title missing");
  await selectLayer(page, title.id);
  await page.getByLabel("Text content", { exact: true }).fill("Our quiet days");
  await page.getByLabel("Text style", { exact: true }).selectOption("body");
  await saved(page);
  expect(coverElement(await readBook(request), title.id)).toMatchObject({
    style: "body",
    color: COVER_STYLES.leather.textColor,
  });
  await page.getByLabel("Text color", { exact: true }).fill("#634932");
  await page.getByLabel("Text style", { exact: true }).selectOption("heading");
  await saved(page);
  expect(coverElement(await readBook(request), title.id)).toMatchObject({
    style: "heading",
    color: "#634932",
  });
  await page.getByLabel("Font family", { exact: true }).selectOption("serif");
  await page.getByLabel("Font size", { exact: true }).fill("34");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await page.getByRole("button", { name: "Italic", exact: true }).click();
  await page
    .getByLabel("Text alignment", { exact: true })
    .selectOption("center");
  await page.getByLabel("Rotation (degrees)", { exact: true }).fill("3");
  await saved(page);
  expect(coverElement(await readBook(request), title.id)).toMatchObject({
    text: "Our quiet days",
    fontFamily: "serif",
    fontSize: 34,
    color: "#634932",
    bold: true,
    italic: true,
    align: "center",
    rotation: 3,
  });
  await page
    .getByRole("button", { name: "Duplicate text", exact: true })
    .click();
  await saved(page);
  let current = await readBook(request);
  const copy = resolveCover(current).elements.at(-1)!;
  expect(copy.id).not.toBe(title.id);
  expect(copy).toMatchObject({
    type: "text",
    text: "Our quiet days",
    fontSize: 34,
    fontFamily: "serif",
    color: "#634932",
    bold: true,
    italic: true,
    align: "center",
    rotation: 3,
  });
  await page
    .getByRole("button", { name: "Send backward", exact: true })
    .click();
  await saved(page);
  current = await readBook(request);
  expect(resolveCover(current).elements.at(-2)?.id).toBe(copy.id);
  await page
    .getByRole("button", { name: "Lock position", exact: true })
    .click();
  await saved(page);
  const locked = coverElement(await readBook(request), copy.id);
  await manipulate(page, page.getByTestId(`element-${copy.id}`));
  await manipulate(page, page.getByTestId(`element-${copy.id}`), true);
  expect(geometry(coverElement(await readBook(request), copy.id))).toEqual(
    geometry(locked),
  );
  await page
    .getByRole("button", { name: "Unlock position", exact: true })
    .click();
  await bringToFront(page);
  await manipulate(page, page.getByTestId(`element-${copy.id}`));
  await saved(page);
  expect(coverElement(await readBook(request), copy.id).x).toBeGreaterThan(
    locked.x,
  );
  await page.getByLabel("Cover style", { exact: true }).selectOption("linen");
  await saved(page);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await saved(page);
  expect(resolveCover(await readBook(request)).style).toBe(defaults.style);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByLabel("Cover color", { exact: true }).fill("#ddd2b8");
  await page
    .getByRole("button", { name: "Send backward", exact: true })
    .click();
  await saved(page);
  const expected = await readBook(request);
  expect(resolveCover(expected).elements.at(-2)?.id).toBe(copy.id);
  expect(expected.cover).toMatchObject({
    style: "linen",
    backgroundColor: "#ddd2b8",
  });
  expect(expected.pages).toEqual(original.pages);
  await page.screenshot({
    path: testInfo.outputPath("desktop-cover-editor.png"),
  });
  await page
    .getByRole("button", { name: "Preview cover", exact: true })
    .click();
  await nativeClosed(page);
  await readingCoverColor(page, "#ddd2b8");
  await expect(page.locator(".editable-element")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId(`element-${title.id}`)).toContainText(
    "Our quiet days",
  );
  await page.screenshot({
    path: testInfo.outputPath("desktop-personal-cover.png"),
  });
  await page.reload();
  await nativeClosed(page);
  await readingCoverColor(page, "#ddd2b8");
  expect((await readBook(request)).cover).toEqual(expected.cover);
});

test("fresh cover photos move, resize, crop, rotate, duplicate, layer, lock, replace, and undo deletion", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(100_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await editCover(page);
  const uploaded = await uploadCover(page, request);
  const target = page.getByTestId(`element-${uploaded.id}`);
  await manipulate(page, target);
  await saved(page);
  let current = coverImage(await readBook(request), uploaded.id);
  expect(current.x).toBeGreaterThan(uploaded.x);
  expect(current.y).toBeGreaterThan(uploaded.y);
  const moved = current;
  await manipulate(page, target, true);
  await saved(page);
  current = coverImage(await readBook(request), uploaded.id);
  expect(current.width).toBeGreaterThan(moved.width);
  expect(current.height).toBeGreaterThan(moved.height);
  await page.getByLabel("Rotation (degrees)", { exact: true }).fill("11");
  await page
    .getByLabel("Photo caption", { exact: true })
    .fill("Coffee, slowly");
  await page.getByRole("button", { name: "Crop photo", exact: true }).click();
  const crop = page.getByRole("dialog", { name: "Frame your photograph" });
  await crop.getByRole("slider", { name: "Crop zoom" }).fill("1.8");
  await crop.getByRole("button", { name: "Apply crop", exact: true }).click();
  await saved(page);
  const transformed = coverImage(await readBook(request), uploaded.id);
  expect(transformed.rotation).toBe(11);
  expect(transformed.crop?.width).toBeLessThan(100);
  expect(transformed.filename).toBe(uploaded.filename);
  await page
    .getByRole("button", { name: "Duplicate image", exact: true })
    .click();
  await saved(page);
  const copy = resolveCover(await readBook(request)).elements.at(-1)!;
  expect(copy).toMatchObject({
    type: "image",
    filename: uploaded.filename,
    crop: transformed.crop,
    rotation: 11,
  });
  await page
    .getByRole("button", { name: "Send backward", exact: true })
    .click();
  await saved(page);
  expect(resolveCover(await readBook(request)).elements.at(-2)?.id).toBe(
    copy.id,
  );
  await bringToFront(page);
  await page
    .getByRole("button", { name: "Lock position", exact: true })
    .click();
  await saved(page);
  const locked = coverImage(await readBook(request), copy.id);
  const copyTarget = page.getByTestId(`element-${copy.id}`);
  await manipulate(page, copyTarget);
  await manipulate(page, copyTarget, true);
  expect(geometry(coverImage(await readBook(request), copy.id))).toEqual(
    geometry(locked),
  );
  await page
    .getByRole("button", { name: "Unlock position", exact: true })
    .click();
  await bringToFront(page);
  await manipulate(page, copyTarget);
  await saved(page);
  expect(coverImage(await readBook(request), copy.id).x).toBeGreaterThan(
    locked.x,
  );
  await page
    .getByRole("button", { name: "Send backward", exact: true })
    .click();
  await page.getByLabel("Replace image", { exact: true }).setInputFiles({
    name: "replacement.png",
    mimeType: "image/png",
    buffer: await photograph("#b09276"),
  });
  await saved(page);
  const replacement = coverImage(await readBook(request), copy.id);
  expect(replacement.filename).not.toBe(uploaded.filename);
  expect(replacement.crop).toBeNull();
  await page.getByRole("button", { name: "Delete image", exact: true }).click();
  await saved(page);
  expect(
    resolveCover(await readBook(request)).elements.some(
      (item) => item.id === copy.id,
    ),
  ).toBeFalsy();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await saved(page);
  expect(coverImage(await readBook(request), copy.id)).toEqual(replacement);
  await expect(copyTarget.getByRole("img")).toHaveJSProperty(
    "naturalWidth",
    640,
  );
  const expected = await readBook(request);
  await page.screenshot({
    path: testInfo.outputPath("laptop-cover-photo-editor.png"),
  });
  await page
    .getByRole("button", { name: "Preview cover", exact: true })
    .click();
  await page.reload();
  await nativeClosed(page);
  expect((await readBook(request)).cover).toEqual(expected.cover);
  await expect(
    page.getByTestId(`element-${uploaded.id}`).locator(".photo-image"),
  ).toHaveAttribute("data-cropped", "true");
  await expect(
    page.getByTestId(`element-${copy.id}`).getByRole("img"),
  ).toHaveJSProperty("naturalWidth", 640);
});

test("custom cover survives portable export, reset safety backup, import, refresh, and subsequent editing", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  await editCover(page);
  await page.getByLabel("Cover style", { exact: true }).selectOption("sage");
  await page.getByLabel("Cover color", { exact: true }).fill("#8c967a");
  const photo = await uploadCover(page, request);
  const photoTarget = page.getByTestId(`element-${photo.id}`);
  await manipulate(page, photoTarget);
  await saved(page);
  const moved = coverImage(await readBook(request), photo.id);
  expect(moved.x).toBeGreaterThan(photo.x);
  expect(moved.y).toBeGreaterThan(photo.y);
  await manipulate(page, photoTarget, true);
  await saved(page);
  expect(coverImage(await readBook(request), photo.id).width).toBeGreaterThan(
    moved.width,
  );
  await page.getByLabel("Rotation (degrees)", { exact: true }).fill("-7");
  await page.getByRole("button", { name: "Crop photo", exact: true }).click();
  const crop = page.getByRole("dialog", { name: "Frame your photograph" });
  await crop.getByRole("slider", { name: "Crop zoom" }).fill("1.5");
  await crop.getByRole("button", { name: "Apply crop", exact: true }).click();
  await page
    .getByRole("button", { name: "Duplicate image", exact: true })
    .click();
  await saved(page);
  const copy = resolveCover(await readBook(request)).elements.at(-1)!;
  await page
    .getByRole("button", { name: "Send backward", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Lock position", exact: true })
    .click();
  await saved(page);
  expect(resolveCover(await readBook(request)).elements.at(-2)?.id).toBe(
    copy.id,
  );
  expect(coverImage(await readBook(request), copy.id)).toMatchObject({
    crop: coverImage(await readBook(request), photo.id).crop,
    rotation: -7,
    filename: photo.filename,
    locked: true,
  });
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByLabel("Text content", { exact: true })
    .fill("A chapter worth keeping");
  await page
    .getByLabel("Font family", { exact: true })
    .selectOption("handwritten");
  await page.getByLabel("Text color", { exact: true }).fill("#fbf3df");
  await page.getByLabel("Font size", { exact: true }).fill("23");
  await page
    .getByRole("button", { name: "Lock position", exact: true })
    .click();
  await saved(page);
  const expected = await readBook(request);
  await page.getByRole("button", { name: "Book options", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Book", exact: true }).click();
  const exported = await download;
  const downloadPath = await exported.path();
  if (!downloadPath) throw new Error("Cover archive download missing");
  const bytes = await readFile(downloadPath);
  const entries = await unpack(bytes);
  expect(JSON.parse(entries.get("book.json")!.toString())).toEqual(expected);
  expect(
    JSON.parse(entries.get("manifest.json")!.toString()).formatVersion,
  ).toBe(2);
  const originalImage = await request.get(`/api/images/${photo.filename}`);
  expect(entries.get(`images/${photo.filename}`)).toEqual(
    await originalImage.body(),
  );
  await page.getByRole("button", { name: "Reset Book", exact: true }).click();
  // Read the body before releasing the response: the app reloads immediately
  // after reset, which can otherwise evict Chromium's response body.
  let resetResult: { backupFilename: string } | undefined;
  await page.route("**/api/book/reset", async (route) => {
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    resetResult = await response.json();
    await route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: "Reset to sample book", exact: true })
    .click();
  await nativeClosed(page);
  if (!resetResult) throw new Error("Reset safety backup result missing");
  expect((await readBook(request)).cover).toBeUndefined();
  const backup = await unpack(
    await readFile(
      path.join(storageRoot, "backups", resetResult.backupFilename),
    ),
  );
  expect(JSON.parse(backup.get("book.json")!.toString())).toEqual(expected);
  expect(backup.get(`images/${photo.filename}`)).toEqual(
    entries.get(`images/${photo.filename}`),
  );
  await page.getByRole("button", { name: "Book options", exact: true }).click();
  await page.getByRole("button", { name: "Import Book", exact: true }).click();
  await page.getByLabel("Import archive", { exact: true }).setInputFiles({
    name: "our-cover.zip",
    mimeType: "application/zip",
    buffer: bytes,
  });
  const importResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/book/import") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Import and replace", exact: true })
    .click();
  expect((await importResponse).ok()).toBeTruthy();
  await nativeClosed(page);
  const imported = await readBook(request);
  await readingCoverColor(page, "#8c967a");
  expect(content(imported)).toEqual(content(expected));
  const importedPhoto = coverImage(imported, photo.id);
  const importedImage = await request.get(
    `/api/images/${importedPhoto.filename}`,
  );
  expect(
    createHash("sha256")
      .update(await importedImage.body())
      .digest("hex"),
  ).toBe(
    createHash("sha256")
      .update(await originalImage.body())
      .digest("hex"),
  );
  await expect(
    page.getByTestId(`element-${photo.id}`).getByRole("img"),
  ).toHaveJSProperty("naturalWidth", 640);
  await page.reload();
  await nativeClosed(page);
  await readingCoverColor(page, "#8c967a");
  expect((await readBook(request)).cover).toEqual(imported.cover);
  await page
    .getByRole("button", { name: "Edit scrapbook", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await selectLayer(page, photo.id);
  await page
    .getByLabel("Photo caption", { exact: true })
    .fill("Still editable after import");
  await saved(page);
  expect(coverImage(await readBook(request), photo.id).caption).toBe(
    "Still editable after import",
  );
});

test("custom cover retains native opening, repeated page drags, closing, and cover/interior editor transitions", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(80_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await editCover(page);
  for (const style of ["linen", "sage", "rose", "ivory", "leather"] as const) {
    await page.getByLabel("Cover style", { exact: true }).selectOption(style);
    await saved(page);
    expect(resolveCover(await readBook(request)).style).toBe(style);
    await page
      .getByRole("button", { name: "Preview cover", exact: true })
      .click();
    await nativeClosed(page);
    await readingCoverColor(page, COVER_STYLES[style].backgroundColor);
    await page.reload();
    await nativeClosed(page);
    await readingCoverColor(page, COVER_STYLES[style].backgroundColor);
    await page
      .getByRole("button", { name: "Edit scrapbook", exact: true })
      .click();
    await expect(page.getByTestId("cover-editor-surface")).toBeVisible();
  }
  await page.getByLabel("Cover style", { exact: true }).selectOption("linen");
  await page.getByLabel("Cover color", { exact: true }).fill("#ddd2b8");
  const photo = await uploadCover(page, request);
  await expect(
    page.getByRole("button", { name: "Open scrapbook", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId("page-indicator")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Preview cover", exact: true })
    .click();
  await nativeClosed(page);
  await readingCoverColor(page, "#ddd2b8");
  const readingPhoto = page
    .locator(".native-cover")
    .getByTestId(`element-${photo.id}`);
  await expect(readingPhoto.getByRole("img")).toHaveJSProperty(
    "naturalWidth",
    640,
  );
  await expect(readingPhoto).toHaveCSS("pointer-events", "none");
  await expect(readingPhoto.getByRole("img")).toHaveCSS(
    "pointer-events",
    "none",
  );
  const before = await readBook(request);
  const originalReader = await page.locator(".flipbook").elementHandle();
  if (!originalReader) throw new Error("Reader missing");
  const cover = await page
    .getByRole("button", { name: "Open scrapbook", exact: true })
    .boundingBox();
  if (!cover) throw new Error("Customized cover missing");
  await page.mouse.move(cover.x + cover.width - 8, cover.y + cover.height - 8);
  await page.mouse.down();
  await page.mouse.move(cover.x - 180, cover.y + cover.height - 130, {
    steps: 35,
  });
  await page.mouse.up();
  await expect(page.getByTestId("page-indicator")).toContainText("1 – 2");
  await expect(page.locator(".book-spread")).toHaveCSS("transform", "none");
  for (let cycle = 0; cycle < 2; cycle++) {
    await dragSpread(page, true);
    await expect(page.getByTestId("page-indicator")).toContainText("3 – 4");
    await dragSpread(page, false);
    await expect(page.getByTestId("page-indicator")).toContainText("1 – 2");
  }
  await page.screenshot({
    path: testInfo.outputPath("desktop-custom-cover-open-book.png"),
  });
  await dragSpread(page, false);
  await nativeClosed(page);
  await readingCoverColor(page, "#ddd2b8");
  await expect(readingPhoto.getByRole("img")).toHaveCSS(
    "pointer-events",
    "none",
  );
  expect(
    await originalReader.evaluate(
      (node) => node === document.querySelector(".flipbook"),
    ),
  ).toBeTruthy();
  await page
    .getByRole("button", { name: "Open scrapbook", exact: true })
    .press("Enter");
  await expect(page.getByTestId("page-indicator")).toContainText("1 – 2");
  await page
    .getByRole("button", { name: "Edit scrapbook", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit cover", exact: true }).click();
  await expect(page.getByTestId("cover-editor-surface")).toBeVisible();
  await page.getByRole("button", { name: "Edit pages", exact: true }).click();
  await expect(page.getByTestId("cover-editor-surface")).toHaveCount(0);
  await expect(page.getByTestId("page-1")).toBeVisible();
  await selectLayer(page, "t1");
  await page
    .getByLabel("Text content", { exact: true })
    .fill("Interior editing still works");
  await saved(page);
  expect((await readBook(request)).cover).toEqual(before.cover);
  await page.getByRole("button", { name: "Edit cover", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByTestId("cover-editor-surface")).toBeInViewport();
  await page.screenshot({
    path: testInfo.outputPath("laptop-cover-editor.png"),
  });
  await page
    .getByRole("button", { name: "Preview cover", exact: true })
    .click();
  await nativeClosed(page);
  await readingCoverColor(page, "#ddd2b8");
  await page.screenshot({
    path: testInfo.outputPath("laptop-cover-reading.png"),
  });
  expect(errors).toEqual([]);
});

test("cover text edits made during a photo upload remain alongside the new image", async ({
  page,
  request,
}) => {
  await editCover(page);
  const initial = await readBook(request);
  const title = resolveCover(initial).elements.find(
    (item) => item.type === "text" && item.text === initial.title,
  );
  if (!title) throw new Error("Editable cover title missing");
  let signalInterception!: () => void;
  const intercepted = new Promise<void>((resolve) => {
    signalInterception = resolve;
  });
  let releaseUpload!: () => void;
  const holdUpload = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  await page.route("**/api/images", async (route) => {
    if (route.request().method() === "POST") {
      signalInterception();
      await holdUpload;
    }
    await route.continue();
  });
  try {
    const uploadResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/images") &&
        response.request().method() === "POST",
    );
    await page.getByLabel("Upload image", { exact: true }).setInputFiles({
      name: "unhurried-cover-photo.png",
      mimeType: "image/png",
      buffer: await photograph("#bca687"),
    });
    await intercepted;
    await selectLayer(page, title.id);
    const words = "Words kept while the photograph arrives";
    await page.getByLabel("Text content", { exact: true }).fill(words);
    await expect(page.getByLabel("Text content", { exact: true })).toHaveValue(
      words,
    );
    releaseUpload();
    const response = await uploadResponse;
    expect(response.ok()).toBeTruthy();
    const uploaded: { filename: string } = await response.json();
    await saved(page);
    const expected = await readBook(request);
    expect(coverElement(expected, title.id)).toMatchObject({ text: words });
    const photo = resolveCover(expected).elements.find(
      (item) => item.type === "image" && item.filename === uploaded.filename,
    );
    expect(photo).toBeDefined();
    expect(expected.pages).toEqual(initial.pages);
    await page.reload();
    await nativeClosed(page);
    expect((await readBook(request)).cover).toEqual(expected.cover);
    await expect(page.getByTestId(`element-${title.id}`)).toContainText(words);
    await expect(
      page.getByTestId(`element-${photo!.id}`).getByRole("img"),
    ).toHaveJSProperty("naturalWidth", 640);
  } finally {
    releaseUpload();
    await page.unroute("**/api/images");
  }
});
