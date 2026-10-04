import {
  test,
  expect,
  type APIRequestContext,
  type Page,
  type Locator,
} from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import yauzl from "yauzl";
import { createSampleBook } from "../src/lib/storage/sample";
import { DECORATIONS } from "../src/lib/decorations";
import type {
  Book,
  BookElement,
  ImageElement,
  StickerAsset,
  BookTheme,
} from "../src/types/book";

test.beforeEach(async ({ request }) => {
  const current = await readBook(request);
  expect(
    (
      await request.put("/api/book", {
        data: { ...createSampleBook(), revision: current.revision },
      })
    ).ok(),
  ).toBeTruthy();
});

async function readBook(request: APIRequestContext): Promise<Book> {
  const response = await request.get("/api/book");
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function saved(page: Page) {
  await expect(
    page.getByRole("status").filter({ hasText: "Saved on this device" }),
  ).toHaveCount(1);
}
async function firstSpread(page: Page) {
  await expect(page.getByTestId("page-indicator")).toContainText("1 – 2");
  await expect(page.locator(".book-spread")).toHaveCSS("transform", "none");
}
async function open(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open scrapbook", exact: true })
    .click();
  await firstSpread(page);
}
async function edit(page: Page) {
  await open(page);
  await page
    .getByRole("button", { name: "Edit scrapbook", exact: true })
    .click();
}
async function freshPage(page: Page, request: APIRequestContext) {
  await edit(page);
  await page.getByRole("button", { name: "Add page", exact: true }).click();
  await saved(page);
  const created = (await readBook(request)).pages.at(-1)!;
  await expect(page.getByTestId("page-5")).toBeVisible();
  return created;
}
async function returnToPage(
  page: Page,
  request: APIRequestContext,
  id: string,
) {
  await edit(page);
  const data = await readBook(request);
  const index = data.pages.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("Fresh test page missing");
  await page
    .getByRole("button", {
      name: `${data.pages[index].title} Page ${String(index + 1).padStart(2, "0")}`,
      exact: true,
    })
    .click();
}
function element(data: Book, id: string): BookElement {
  const result = [
    ...(data.cover?.elements ?? []),
    ...data.pages.flatMap((item) => item.elements),
  ].find((item) => item.id === id);
  if (!result) throw new Error(`Element ${id} missing`);
  return result;
}
function image(data: Book, id: string): ImageElement {
  const item = element(data, id);
  if (item.type !== "image") throw new Error("Expected an image");
  return item;
}
function geometry(item: BookElement) {
  return { x: item.x, y: item.y, width: item.width, height: item.height };
}
async function select(page: Page, id: string) {
  await page.getByTestId(`layer-${id}`).click();
  await expect(page.getByTestId(`element-${id}`)).toHaveClass(
    /selected-element/,
  );
}
async function setTheme(page: Page, theme: BookTheme) {
  const details = page.locator(".theme-settings");
  if ((await details.getAttribute("open")) === null)
    await details.locator("summary").click();
  await page.getByLabel("Scrapbook theme", { exact: true }).selectOption(theme);
}
async function manipulate(page: Page, target: Locator, resize = false) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error("Editable item missing");
  const x = box.x + (resize ? box.width - 1 : box.width / 2);
  const y = box.y + (resize ? box.height - 1 : box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 23, y + 17, { steps: 15 });
  await page.mouse.up();
}
async function front(page: Page) {
  const button = page.getByRole("button", {
    name: "Bring forward",
    exact: true,
  });
  for (let count = 0; count < 60 && !(await button.isDisabled()); count++)
    await button.click();
}
async function alphaAsset(webp = false) {
  const width = 240,
    height = 180;
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const distance = ((x - 120) / 70) ** 2 + ((y - 90) / 55) ** 2;
      if (distance > 1.06) continue;
      const offset = (y * width + x) * 4;
      pixels[offset] = 91;
      pixels[offset + 1] = 117;
      pixels[offset + 2] = 80;
      pixels[offset + 3] = distance > 1 ? 140 : 255;
    }
  const source = sharp(pixels, { raw: { width, height, channels: 4 } });
  return webp
    ? source.webp({ lossless: true }).toBuffer()
    : source.png().toBuffer();
}
async function opaqueJpeg() {
  return sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#bca384"/><path d="M0 380L640 180V480H0" fill="#907354"/><circle cx="350" cy="230" r="110" fill="#eee3ca"/><circle cx="350" cy="230" r="77" fill="#73533e"/><path d="M321 226Q350 196 379 226Q370 251 350 266Q330 251 321 226" fill="#ead5b4"/></svg>',
    ),
  )
    .jpeg()
    .toBuffer();
}
function wav() {
  const rate = 16000,
    seconds = 4,
    size = rate * seconds * 2;
  const bytes = Buffer.alloc(44 + size);
  bytes.write("RIFF");
  bytes.writeUInt32LE(36 + size, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(size, 40);
  for (let i = 0; i < rate * seconds; i++)
    bytes.writeInt16LE(
      Math.round(Math.sin((i / rate) * Math.PI * 360) * 1800),
      44 + i * 2,
    );
  return bytes;
}
async function addImage(
  page: Page,
  request: APIRequestContext,
  pageId: string,
  decoration = false,
  webp = false,
) {
  if (decoration)
    await page
      .getByRole("button", { name: "Decorations", exact: true })
      .click();
  await page
    .getByLabel(decoration ? "Upload decoration" : "Upload image", {
      exact: true,
    })
    .setInputFiles({
      name: decoration
        ? `genuine-alpha.${webp ? "webp" : "png"}`
        : "opaque-coffee.jpg",
      mimeType: decoration ? `image/${webp ? "webp" : "png"}` : "image/jpeg",
      buffer: decoration ? await alphaAsset(webp) : await opaqueJpeg(),
    });
  await saved(page);
  const data = await readBook(request);
  const elements =
    pageId === "cover"
      ? data.cover!.elements
      : data.pages.find((item) => item.id === pageId)!.elements;
  const item = elements.filter((item) => item.type === "image").at(-1)!;
  if (item.type !== "image") throw new Error("Fresh uploaded image missing");
  await expect(
    page.getByTestId(`element-${item.id}`).getByRole("img"),
  ).toHaveJSProperty("naturalWidth", decoration ? 240 : 640);
  return item;
}
async function addSticker(
  page: Page,
  request: APIRequestContext,
  asset: StickerAsset,
  pageId: string,
) {
  await page.getByRole("button", { name: "Decorations", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Add a decoration", exact: true })
    .getByRole("button", {
      name: `Add ${DECORATIONS[asset].label.toLowerCase()}`,
      exact: true,
    })
    .click();
  await saved(page);
  const data = await readBook(request);
  return (
    pageId === "cover"
      ? data.cover!.elements
      : data.pages.find((item) => item.id === pageId)!.elements
  ).at(-1)!;
}
async function assertAlpha(request: APIRequestContext, filename: string) {
  const response = await request.get(`/api/images/${filename}`);
  expect(response.ok()).toBeTruthy();
  const bytes = await response.body();
  expect((await sharp(bytes).metadata()).hasAlpha).toBeTruthy();
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alpha = Array.from(
    { length: info.width * info.height },
    (_, index) => data[index * 4 + 3],
  );
  expect(Math.min(...alpha)).toBe(0);
  expect(Math.max(...alpha)).toBe(255);
  expect(alpha).toContain(140);
  return bytes;
}
async function crop(page: Page, decoration = false) {
  await page
    .getByRole("button", {
      name: decoration ? "Crop decoration" : "Crop photo",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: decoration ? "Crop your decoration" : "Frame your photograph",
    exact: true,
  });
  await dialog
    .getByRole("slider", { name: "Crop zoom", exact: true })
    .fill("1.3");
  await dialog.getByRole("button", { name: "Apply crop", exact: true }).click();
  await saved(page);
}
async function unzip(bytes: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) =>
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error ?? new Error("ZIP missing"));
      const entries = new Map<string, Buffer>();
      zip.on("error", reject);
      zip.on("end", () => resolve(entries));
      zip.on("entry", (entry: yauzl.Entry) =>
        zip.openReadStream(entry, (failure, stream) => {
          if (failure || !stream)
            return reject(failure ?? new Error("Entry missing"));
          const chunks: Buffer[] = [];
          stream.on("error", reject);
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => {
            entries.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        }),
      );
      zip.readEntry();
    }),
  );
}
function content(data: Book) {
  const withoutFile = (elements: BookElement[]) =>
    elements.map((item) =>
      item.type === "image" ? { ...item, filename: undefined } : item,
    );
  return {
    title: data.title,
    subtitle: data.subtitle,
    theme: data.theme,
    audio: data.audio && { ...data.audio, filename: undefined },
    cover: data.cover && {
      ...data.cover,
      elements: withoutFile(data.cover.elements),
    },
    pages: data.pages.map((item) => ({
      ...item,
      elements: withoutFile(item.elements),
    })),
  };
}
async function nativeClosed(page: Page) {
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open scrapbook", exact: true }),
  ).toHaveClass(/--simple/);
  await expect(page.getByTestId("page-indicator")).toHaveCount(0);
  await expect(page.locator(".book-spread")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, -220, 0)",
  );
}
async function drag(page: Page, forward: boolean, opening = false) {
  await page.mouse.move(20, 30);
  if (!opening)
    await expect(page.locator(".book-spread")).toHaveCSS("transform", "none");
  const box = await (
    opening ? page.locator(".native-cover") : page.locator(".book-spread")
  ).boundingBox();
  if (!box) throw new Error("Native book surface missing");
  await page.mouse.move(
    box.x + (forward ? box.width - 8 : 8),
    box.y + box.height - 8,
  );
  await page.mouse.down();
  await page.mouse.move(
    box.x + (forward ? (opening ? -180 : 100) : box.width - 100),
    box.y + box.height - 130,
    { steps: 35 },
  );
  await page.mouse.up();
}

test("a fresh mixed page preserves real transparency, transforms, layers, theme and audio through export/reset/import/refresh", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const fresh = await freshPage(page, request);
  const photo = await addImage(page, request, fresh.id);
  expect(
    (
      await sharp(
        await (await request.get(`/api/images/${photo.filename}`)).body(),
      ).metadata()
    ).hasAlpha,
  ).toBeFalsy();
  await page.getByLabel("Photo frame", { exact: true }).selectOption("taped");
  await crop(page);
  await page.getByLabel("Rotation (degrees)", { exact: true }).fill("-8");
  const decoration = await addImage(page, request, fresh.id, true);
  const target = page.getByTestId(`element-${decoration.id}`);
  await expect(target.locator("figure")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(target.locator("figure")).toHaveCSS("box-shadow", "none");
  const source = await assertAlpha(request, decoration.filename!);
  // Compare against clear paper, away from the separately composited, rotated
  // JPEG. Hiding an overlapping GPU layer can resample that photo's edge pixels.
  const initial = await target.boundingBox();
  if (!initial) throw new Error("Decoration absent");
  await page.mouse.move(
    initial.x + initial.width / 2,
    initial.y + initial.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    initial.x + initial.width / 2 + 240 - decoration.x,
    initial.y + initial.height / 2 + 400 - decoration.y,
    { steps: 35 },
  );
  await page.mouse.up();
  await saved(page);
  const positioned = image(await readBook(request), decoration.id);
  expect(positioned).toMatchObject({ x: 240, y: 400 });
  // Compare a real transparent corner against the paper underneath it.
  const box = await target.boundingBox();
  if (!box) throw new Error("Decoration absent");
  await page.mouse.move(20, 30);
  const clip = {
    x: Math.round(box.x + 10),
    y: Math.round(box.y + 10),
    width: 3,
    height: 3,
  };
  const visible = await sharp(await page.screenshot({ clip }))
    .raw()
    .toBuffer();
  await target.evaluate((node) => {
    node.style.visibility = "hidden";
  });
  const underneath = await sharp(await page.screenshot({ clip }))
    .raw()
    .toBuffer();
  await target.evaluate((node) => {
    node.style.visibility = "";
  });
  // GPU compositing can round an 8-bit channel differently when the transparent
  // layer is present. A white/opaque background would exceed this tolerance.
  expect(visible.length).toBe(underneath.length);
  expect(
    Math.max(
      ...visible.map((channel, index) => Math.abs(channel - underneath[index])),
    ),
  ).toBeLessThanOrEqual(2);
  await manipulate(page, target);
  await saved(page);
  const moved = image(await readBook(request), decoration.id);
  expect(moved.x).toBeGreaterThan(positioned.x);
  await manipulate(page, target, true);
  await saved(page);
  expect(image(await readBook(request), decoration.id).width).toBeGreaterThan(
    moved.width,
  );
  await crop(page, true);
  await page.getByLabel("Rotation (degrees)", { exact: true }).fill("17");
  await page
    .getByRole("button", { name: "Duplicate image", exact: true })
    .click();
  await saved(page);
  const copy = (await readBook(request)).pages.at(-1)!.elements.at(-1)!;
  await page
    .getByRole("button", { name: "Send backward", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Lock position", exact: true })
    .click();
  await saved(page);
  const locked = element(await readBook(request), copy.id);
  await front(page);
  await manipulate(page, page.getByTestId(`element-${copy.id}`));
  expect(geometry(element(await readBook(request), copy.id))).toEqual(
    geometry(locked),
  );
  await page
    .getByRole("button", { name: "Unlock position", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Send backward", exact: true })
    .click();
  await addSticker(page, request, "masking-tape", fresh.id);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByLabel("Text content", { exact: true })
    .fill("A fresh page, with little things worth keeping.");
  await page
    .getByLabel("Font family", { exact: true })
    .selectOption("handwritten");
  await page.getByLabel("Text color", { exact: true }).fill("#5b684f");
  await setTheme(page, "vintage");
  await page
    .getByRole("button", { name: "Music settings", exact: true })
    .click();
  await page.getByLabel("Upload audio", { exact: true }).setInputFiles({
    name: "soft-local-tone.wav",
    mimeType: "audio/wav",
    buffer: wav(),
  });
  await expect(page.getByTestId("ambience-audio")).toHaveCount(1);
  await saved(page);
  await page.getByLabel("Ambience volume", { exact: true }).fill("23");
  await page
    .getByRole("button", { name: "Close ambience", exact: true })
    .click();
  await saved(page);
  const expected = await readBook(request);
  await page.screenshot({
    path: testInfo.outputPath("desktop-mixed-decorated-editor.png"),
  });
  await page.getByRole("button", { name: "Done editing", exact: true }).click();
  await page.reload();
  expect(content(await readBook(request))).toEqual(content(expected));
  await page.getByRole("button", { name: "Book options", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Book", exact: true }).click();
  const download = await pending;
  const file = await download.path();
  if (!file) throw new Error("Export absent");
  const archive = await readFile(file);
  const entries = await unzip(archive);
  expect(
    JSON.parse(entries.get("manifest.json")!.toString()).formatVersion,
  ).toBe(3);
  expect(JSON.parse(entries.get("book.json")!.toString())).toEqual(expected);
  expect(entries.get(`images/${decoration.filename}`)).toEqual(source);
  expect(entries.get(`audio/${expected.audio!.filename}`)).toEqual(wav());
  let backupFilename = "";
  await page.route("**/api/book/reset", async (route) => {
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    backupFilename = (await response.json()).backupFilename;
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Reset Book", exact: true }).click();
  await page
    .getByRole("button", { name: "Reset to sample book", exact: true })
    .click();
  await nativeClosed(page);
  const reset = await readBook(request);
  expect(reset.theme ?? "cafe").toBe("cafe");
  expect(reset.audio).toBeUndefined();
  const backup = await unzip(
    await readFile(path.join(".test-storage", "backups", backupFilename)),
  );
  expect(backup.get(`images/${decoration.filename}`)).toEqual(source);
  expect(backup.get(`audio/${expected.audio!.filename}`)).toEqual(wav());
  await page.getByRole("button", { name: "Book options", exact: true }).click();
  await page.getByRole("button", { name: "Import Book", exact: true }).click();
  await page.getByLabel("Import archive", { exact: true }).setInputFiles({
    name: "expressive-book.zip",
    mimeType: "application/zip",
    buffer: archive,
  });
  await page
    .getByRole("button", { name: "Import and replace", exact: true })
    .click();
  await nativeClosed(page);
  const restored = await readBook(request);
  expect(content(restored)).toEqual(content(expected));
  expect(
    createHash("sha256")
      .update(
        await assertAlpha(request, image(restored, decoration.id).filename!),
      )
      .digest("hex"),
  ).toBe(createHash("sha256").update(source).digest("hex"));
  expect(
    await (await request.get(`/api/audio/${restored.audio!.filename}`)).body(),
  ).toEqual(wav());
  await expect(page.getByTestId("ambience-audio")).toHaveJSProperty(
    "paused",
    true,
  );
  await page.reload();
  expect(content(await readBook(request))).toEqual(content(expected));
  await returnToPage(page, request, fresh.id);
  await select(page, decoration.id);
  await expect(
    page.getByLabel("Rotation (degrees)", { exact: true }),
  ).toHaveValue("17");
  await expect(
    page.getByTestId(`element-${decoration.id}`).locator(".photo-image"),
  ).toHaveAttribute("data-cropped", "true");
  await page
    .getByLabel("Decoration name", { exact: true })
    .fill("Still editable after import");
  await saved(page);
});

test("built-in stickers share transforms, layers, locks, history and cover support with uploaded alpha WebP", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(100_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const fresh = await freshPage(page, request);
  await page.getByRole("button", { name: "Decorations", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Add a decoration", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("desktop-decoration-picker.png"),
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Decorations", exact: true }),
  ).toBeFocused();
  for (const asset of Object.keys(DECORATIONS) as StickerAsset[]) {
    const sticker = await addSticker(page, request, asset, fresh.id);
    expect(sticker).toMatchObject({ type: "sticker", asset });
    await expect(
      page.getByTestId(`element-${sticker.id}`).locator("svg"),
    ).toBeVisible();
  }
  const leaf = (await readBook(request)).pages
    .at(-1)!
    .elements.find((item) => item.type === "sticker" && item.asset === "leaf")!;
  await select(page, leaf.id);
  await front(page);
  await manipulate(page, page.getByTestId(`element-${leaf.id}`));
  await saved(page);
  await manipulate(page, page.getByTestId(`element-${leaf.id}`), true);
  await saved(page);
  expect(element(await readBook(request), leaf.id).width).toBeGreaterThan(
    leaf.width,
  );
  await page.getByLabel("Rotation (degrees)", { exact: true }).fill("-21");
  await page.getByLabel("Sticker color", { exact: true }).fill("#64765a");
  await page
    .getByRole("button", { name: "Duplicate sticker", exact: true })
    .click();
  await saved(page);
  const copy = (await readBook(request)).pages.at(-1)!.elements.at(-1)!;
  await page
    .getByRole("button", { name: "Send backward", exact: true })
    .click();
  await saved(page);
  expect((await readBook(request)).pages.at(-1)!.elements.at(-2)?.id).toBe(
    copy.id,
  );
  await page
    .getByRole("button", { name: "Lock position", exact: true })
    .click();
  await saved(page);
  const locked = element(await readBook(request), copy.id);
  await front(page);
  await manipulate(page, page.getByTestId(`element-${copy.id}`));
  await manipulate(page, page.getByTestId(`element-${copy.id}`), true);
  expect(geometry(element(await readBook(request), copy.id))).toEqual(
    geometry(locked),
  );
  await page
    .getByRole("button", { name: "Unlock position", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete sticker", exact: true })
    .click();
  await saved(page);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await saved(page);
  expect(element(await readBook(request), copy.id)).toMatchObject({
    type: "sticker",
    asset: "leaf",
    rotation: -21,
  });
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await saved(page);
  expect(
    (await readBook(request)).pages
      .at(-1)!
      .elements.some((item) => item.id === copy.id),
  ).toBeFalsy();
  const date = (await readBook(request)).pages
    .at(-1)!
    .elements.find(
      (item) => item.type === "sticker" && item.asset === "date-label",
    )!;
  await select(page, date.id);
  await page.getByLabel("Sticker label", { exact: true }).fill("W".repeat(40));
  expect(
    await page
      .getByTestId(`element-${date.id}`)
      .locator("svg text")
      .evaluate((node) => (node as SVGTextElement).getBBox().width),
  ).toBeLessThanOrEqual(150);
  await page
    .getByLabel("Sticker label", { exact: true })
    .fill("October, kept close");
  await saved(page);
  const expected = (await readBook(request)).pages.at(-1)!;
  await page.reload();
  await returnToPage(page, request, fresh.id);
  expect((await readBook(request)).pages.at(-1)).toEqual(expected);
  await page.getByRole("button", { name: "Edit cover", exact: true }).click();
  await addSticker(page, request, "heart", "cover");
  const uploaded = await addImage(page, request, "cover", true, true);
  await assertAlpha(request, uploaded.filename!);
  await page.screenshot({
    path: testInfo.outputPath("desktop-sticker-cover-editor.png"),
  });
  await page
    .getByRole("button", { name: "Preview cover", exact: true })
    .click();
  await nativeClosed(page);
  await expect(page.getByTestId(`element-${uploaded.id}`)).toHaveCSS(
    "pointer-events",
    "none",
  );
  await drag(page, true, true);
  await firstSpread(page);
  await drag(page, false);
  await nativeClosed(page);
});

test("built-in sticker autosaves, persists its editing fields, and restores beside a transparent PNG after export/reset/import", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const fresh = await freshPage(page, request);
  const decoration = await addImage(page, request, fresh.id, true);
  const alpha = await assertAlpha(request, decoration.filename!);
  const successfulSave = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/book") &&
      response.request().method() === "PUT" &&
      response
        .request()
        .postDataJSON()
        .pages.some((item: Book["pages"][number]) =>
          item.elements.some(
            (item) => item.type === "sticker" && item.asset === "coffee",
          ),
        ),
  );
  const sticker = await addSticker(page, request, "coffee", fresh.id);
  const response = await successfulSave;
  expect(response.status()).toBe(200);
  const payload = response.request().postDataJSON() as Book;
  expect(element(payload, sticker.id)).toMatchObject({
    type: "sticker",
    asset: "coffee",
  });
  expect(element(payload, sticker.id)).not.toHaveProperty("filename");
  expect(element(payload, decoration.id)).toMatchObject({
    type: "image",
    kind: "decoration",
    frame: "borderless",
    filename: decoration.filename,
  });
  await page.reload();
  await returnToPage(page, request, fresh.id);
  await expect(
    page.getByTestId(`element-${sticker.id}`).locator("svg"),
  ).toBeVisible();
  await select(page, sticker.id);
  const target = page.getByTestId(`element-${sticker.id}`);
  await manipulate(page, target);
  await saved(page);
  expect(element(await readBook(request), sticker.id).x).toBeGreaterThan(
    sticker.x,
  );
  await manipulate(page, target, true);
  await saved(page);
  expect(element(await readBook(request), sticker.id).width).toBeGreaterThan(
    sticker.width,
  );
  await page.getByLabel("Rotation (degrees)", { exact: true }).fill("23");
  await page.getByLabel("Sticker color", { exact: true }).fill("#684b34");
  await page
    .getByRole("button", { name: "Duplicate sticker", exact: true })
    .click();
  await saved(page);
  const copy = (await readBook(request)).pages.at(-1)!.elements.at(-1)!;
  expect(copy).toMatchObject({
    type: "sticker",
    asset: "coffee",
    rotation: 23,
    color: "#684b34",
  });
  expect(copy.id).not.toBe(sticker.id);
  await page
    .getByRole("button", { name: "Send backward", exact: true })
    .click();
  await saved(page);
  expect((await readBook(request)).pages.at(-1)!.elements.at(-2)?.id).toBe(
    copy.id,
  );
  await page
    .getByRole("button", { name: "Lock position", exact: true })
    .click();
  await saved(page);
  await front(page);
  await saved(page);
  const locked = element(await readBook(request), copy.id);
  expect(locked.locked).toBe(true);
  await manipulate(page, page.getByTestId(`element-${copy.id}`));
  await manipulate(page, page.getByTestId(`element-${copy.id}`), true);
  expect(geometry(element(await readBook(request), copy.id))).toEqual(
    geometry(locked),
  );
  await page
    .getByRole("button", { name: "Unlock position", exact: true })
    .click();
  await saved(page);
  expect(element(await readBook(request), copy.id).locked).toBe(false);
  await page
    .getByRole("button", { name: "Send backward", exact: true })
    .click();
  await select(page, sticker.id);
  await page
    .getByRole("button", { name: "Lock position", exact: true })
    .click();
  await saved(page);
  const expected = await readBook(request);
  await page.screenshot({
    path: testInfo.outputPath("sticker-persistence-desktop.png"),
  });
  await page.reload();
  await returnToPage(page, request, fresh.id);
  expect((await readBook(request)).pages.at(-1)).toEqual(expected.pages.at(-1));
  await select(page, sticker.id);
  await expect(
    page.getByLabel("Rotation (degrees)", { exact: true }),
  ).toHaveValue("23");
  await expect(
    page.getByRole("button", { name: "Unlock position", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({
    path: testInfo.outputPath("sticker-persistence-laptop.png"),
  });
  await page.getByRole("button", { name: "Done editing", exact: true }).click();
  await page.getByRole("button", { name: "Book options", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Book", exact: true }).click();
  const file = await (await pending).path();
  if (!file) throw new Error("Sticker export missing");
  const archive = await readFile(file);
  const entries = await unzip(archive);
  expect(JSON.parse(entries.get("book.json")!.toString())).toEqual(expected);
  expect(entries.get(`images/${decoration.filename}`)).toEqual(alpha);
  await page.getByRole("button", { name: "Reset Book", exact: true }).click();
  await page
    .getByRole("button", { name: "Reset to sample book", exact: true })
    .click();
  await nativeClosed(page);
  expect(
    (await readBook(request)).pages.some((item) => item.id === fresh.id),
  ).toBeFalsy();
  await page.getByRole("button", { name: "Book options", exact: true }).click();
  await page.getByRole("button", { name: "Import Book", exact: true }).click();
  await page.getByLabel("Import archive", { exact: true }).setInputFiles({
    name: "persisted-stickers.zip",
    mimeType: "application/zip",
    buffer: archive,
  });
  await page
    .getByRole("button", { name: "Import and replace", exact: true })
    .click();
  await nativeClosed(page);
  await page.reload();
  const restored = await readBook(request);
  expect(content(restored)).toEqual(content(expected));
  expect(
    await assertAlpha(request, image(restored, decoration.id).filename!),
  ).toEqual(alpha);
  await returnToPage(page, request, fresh.id);
  await select(page, copy.id);
  await expect(
    page.getByTestId(`element-${copy.id}`).locator("svg"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Lock position", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Sticker color", { exact: true }).fill("#617452");
  await saved(page);
  expect(element(await readBook(request), copy.id)).toMatchObject({
    type: "sticker",
    asset: "coffee",
    rotation: 23,
    color: "#617452",
    locked: false,
  });
  await page.screenshot({
    path: testInfo.outputPath("sticker-persistence-imported.png"),
  });
});

test("each photo style is reversible, keeps crop and rotation, and survives refresh", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(100_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const fresh = await freshPage(page, request);
  const photo = await addImage(page, request, fresh.id);
  await page.getByLabel("Rotation (degrees)", { exact: true }).fill("9");
  await crop(page);
  const transformed = image(await readBook(request), photo.id);
  for (const frame of [
    "plain",
    "polaroid",
    "soft-shadow",
    "paper",
    "taped",
    "borderless",
  ] as const) {
    await page.getByLabel("Photo frame", { exact: true }).selectOption(frame);
    await saved(page);
    expect(image(await readBook(request), photo.id)).toMatchObject({
      frame,
      rotation: 9,
      crop: transformed.crop,
    });
    await expect(
      page.getByTestId(`element-${photo.id}`).locator("figure"),
    ).toHaveClass(new RegExp(`frame-${frame}`));
    await page.screenshot({
      path: testInfo.outputPath(`photo-style-${frame}.png`),
    });
  }
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await saved(page);
  expect(image(await readBook(request), photo.id).frame).toBe("taped");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await saved(page);
  await page
    .getByLabel("Image use", { exact: true })
    .selectOption("decoration");
  await saved(page);
  await expect(
    page.getByTestId(`element-${photo.id}`).locator("figure"),
  ).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await saved(page);
  expect(image(await readBook(request), photo.id).kind ?? "photo").toBe(
    "photo",
  );
  await page.getByLabel("Photo frame", { exact: true }).selectOption("paper");
  await crop(page);
  const cropped = image(await readBook(request), photo.id);
  await page.reload();
  await returnToPage(page, request, fresh.id);
  expect(image(await readBook(request), photo.id)).toEqual(cropped);
  await select(page, photo.id);
  await expect(page.getByLabel("Photo frame", { exact: true })).toHaveValue(
    "paper",
  );
});

test("all themes preserve fresh content and custom styling, with coherent desktop/laptop/tablet presentation", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(100_000);
  const fresh = await freshPage(page, request);
  await select(page, fresh.elements[0].id);
  await page
    .getByLabel("Text content", { exact: true })
    .fill("The colors of a quiet day");
  await page.getByLabel("Text color", { exact: true }).fill("#584334");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await saved(page);
  const before = await readBook(request);
  for (const theme of [
    "cafe",
    "vintage",
    "ivory",
    "wedding",
    "campus",
  ] as const) {
    await setTheme(page, theme);
    await saved(page);
    expect((await readBook(request)).pages).toEqual(before.pages);
    await expect(page.locator(".app-shell")).toHaveClass(
      new RegExp(`theme-${theme}`),
    );
    await expect(
      page
        .getByTestId(`element-${fresh.elements[0].id}`)
        .locator(".scrap-text"),
    ).toHaveCSS("color", "rgb(88, 67, 52)");
    await page
      .getByRole("button", { name: "Done editing", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Present book", exact: true })
      .click();
    await page.screenshot({
      path: testInfo.outputPath(`theme-${theme}-presentation.png`),
    });
    await page
      .getByRole("button", { name: "Exit presentation", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Edit scrapbook", exact: true })
      .click();
  }
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await saved(page);
  expect((await readBook(request)).theme).toBe("wedding");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await saved(page);
  expect((await readBook(request)).theme).toBe("campus");
  await page.reload();
  expect((await readBook(request)).theme).toBe("campus");
  expect((await readBook(request)).pages).toEqual(before.pages);
  await page.getByRole("button", { name: "Present book", exact: true }).click();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 900, height: 760 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(
      page.getByRole("button", { name: "Exit presentation", exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      path: testInfo.outputPath(
        `presentation-cover-${viewport.width}x${viewport.height}.png`,
      ),
    });
    await page
      .getByRole("button", { name: "Open scrapbook", exact: true })
      .click();
    await firstSpread(page);
    const toolbar = await page.locator(".presentation-controls").boundingBox();
    const spread = await page.locator(".book-spread").boundingBox();
    if (!toolbar || !spread)
      throw new Error("Presentation controls or book absent");
    expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(spread.y);
    await page.screenshot({
      path: testInfo.outputPath(
        `presentation-spread-${viewport.width}x${viewport.height}.png`,
      ),
    });
    await page
      .getByRole("button", { name: "Close scrapbook", exact: true })
      .click();
    await nativeClosed(page);
  }
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Present book", exact: true }),
  ).toBeVisible();
});

test("presentation retains native cover and repeated page gestures, fullscreen and keyboard exit without reader replacement", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(100_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const fresh = await freshPage(page, request);
  await addSticker(page, request, "sparkles", fresh.id);
  await addImage(page, request, fresh.id, true);
  await page.getByRole("button", { name: "Done editing", exact: true }).click();
  await page.reload();
  await nativeClosed(page);
  const original = await page.locator(".flipbook").elementHandle();
  if (!original) throw new Error("Reader missing");
  await page.getByRole("button", { name: "Present book", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit scrapbook", exact: true }),
  ).not.toBeVisible();
  await expect(page.locator(".contents-sidebar")).not.toBeVisible();
  await expect(page.locator(".inspector, .editable-element")).toHaveCount(0);
  expect(
    await original.evaluate(
      (node) => node === document.querySelector(".flipbook"),
    ),
  ).toBeTruthy();
  await drag(page, true, true);
  await firstSpread(page);
  for (let turn = 0; turn < 3; turn++) {
    await drag(page, true);
    await expect(page.getByTestId("page-indicator")).toContainText("3 – 4");
    await drag(page, false);
    await firstSpread(page);
  }
  await page.getByRole("button", { name: "Next pages", exact: true }).click();
  await expect(page.getByTestId("page-indicator")).toContainText("3 – 4");
  await drag(page, true);
  await expect(page.getByTestId("page-indicator")).toContainText("5 – 5");
  await expect(page.getByTestId("page-5").locator(".scrap-sticker")).toHaveCSS(
    "pointer-events",
    "none",
  );
  await page.screenshot({
    path: testInfo.outputPath("desktop-gift-fresh-page.png"),
  });
  await drag(page, false);
  await expect(page.getByTestId("page-indicator")).toContainText("3 – 4");
  await drag(page, false);
  await firstSpread(page);
  await drag(page, false);
  await nativeClosed(page);
  await page
    .getByRole("button", { name: "Open scrapbook", exact: true })
    .press("Enter");
  await firstSpread(page);
  await page
    .getByRole("button", { name: "Enter fullscreen", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBeTruthy();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Present book", exact: true }),
  ).toBeVisible();
  expect(
    await original.evaluate(
      (node) => node === document.querySelector(".flipbook"),
    ),
  ).toBeTruthy();
  expect((await readBook(request)).pages.at(-1)?.id).toBe(fresh.id);
});

test("local audio never autoplays, plays and pauses explicitly, persists settings, and leaves page dragging stable", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(100_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await freshPage(page, request);
  await page
    .getByRole("button", { name: "Music settings", exact: true })
    .click();
  const settings = page.getByRole("dialog", {
    name: "Music and ambience",
    exact: true,
  });
  await page.getByLabel("Upload audio", { exact: true }).setInputFiles({
    name: "a-small-local-track.wav",
    mimeType: "audio/wav",
    buffer: wav(),
  });
  const audio = page.getByTestId("ambience-audio");
  await expect(audio).toHaveCount(1);
  await saved(page);
  await expect(audio).toHaveJSProperty("paused", true);
  await expect(audio).toHaveJSProperty("currentTime", 0);
  await settings
    .getByRole("button", { name: "Play ambience", exact: true })
    .click();
  await expect(audio).toHaveJSProperty("paused", false);
  await expect
    .poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime))
    .toBeGreaterThan(0);
  await settings.getByLabel("Ambience volume", { exact: true }).fill("18");
  await saved(page);
  await expect(audio).toHaveJSProperty("volume", 0.18);
  expect((await readBook(request)).audio?.volume).toBe(0.18);
  await page.screenshot({
    path: testInfo.outputPath("desktop-ambience-controls.png"),
  });
  await settings
    .getByRole("button", { name: "Pause ambience", exact: true })
    .click();
  await expect(audio).toHaveJSProperty("paused", true);
  await settings
    .getByRole("button", { name: "Play ambience", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close ambience", exact: true })
    .click();
  await page.getByRole("button", { name: "Done editing", exact: true }).click();
  await page.reload();
  await expect(audio).toHaveJSProperty("paused", true);
  await expect(audio).toHaveJSProperty("volume", 0.18);
  await page
    .getByRole("button", { name: "Music settings", exact: true })
    .click();
  await settings
    .getByRole("button", { name: "Play ambience", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close ambience", exact: true })
    .click();
  await page.getByRole("button", { name: "Present book", exact: true }).click();
  await drag(page, true, true);
  await firstSpread(page);
  const original = await page.locator(".flipbook").elementHandle();
  if (!original) throw new Error("Native reader absent");
  for (let turn = 0; turn < 2; turn++) {
    await drag(page, true);
    await expect(page.getByTestId("page-indicator")).toContainText("3 – 4");
    await drag(page, false);
    await firstSpread(page);
  }
  await expect(audio).toHaveJSProperty("paused", false);
  expect(
    await original.evaluate(
      (node) => node === document.querySelector(".flipbook"),
    ),
  ).toBeTruthy();
  await page
    .getByRole("button", { name: "Music settings", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(settings).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Exit presentation", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Present book", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit scrapbook", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Music settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Remove audio", exact: true }).click();
  await saved(page);
  expect((await readBook(request)).audio).toBeUndefined();
  await page
    .getByRole("button", { name: "Close ambience", exact: true })
    .click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await saved(page);
  expect((await readBook(request)).audio?.volume).toBe(0.18);
  await expect(audio).toHaveJSProperty("paused", true);
});
