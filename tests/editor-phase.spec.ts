import {
  test,
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import sharp from "sharp";
import { createSampleBook } from "../src/lib/storage/sample";
import type {
  Book,
  BookElement,
  ImageElement,
  TextElement,
} from "../src/types/book";

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
  await expect(
    page.getByRole("status", { name: "Book save status" }),
  ).toHaveText("Saved on this device");
}

async function selectLayer(page: Page, id: string) {
  await page.getByTestId(`layer-${id}`).click();
  await expect(page.getByTestId(`element-${id}`)).toHaveClass(
    /selected-element/,
  );
}

function element(book: Book, id: string): BookElement {
  const found = book.pages
    .flatMap((bookPage) => bookPage.elements)
    .find((item) => item.id === id);
  if (!found) throw new Error(`Missing element ${id}`);
  return found;
}

function image(book: Book, id: string): ImageElement {
  const found = element(book, id);
  if (found.type !== "image") throw new Error(`${id} is not an image`);
  return found;
}

function text(book: Book, id: string): TextElement {
  const found = element(book, id);
  if (found.type !== "text") throw new Error(`${id} is not text`);
  return found;
}

function geometry(item: BookElement) {
  return { x: item.x, y: item.y, width: item.width, height: item.height };
}

async function dragElement(page: Page, target: Locator, dx = 18, dy = 12) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error("Element missing from the page");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + dx,
    box.y + box.height / 2 + dy,
    { steps: 10 },
  );
  await page.mouse.up();
}

async function resizeElement(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error("Element missing from the page");
  await page.mouse.move(box.x + box.width - 1, box.y + box.height - 1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 15, box.y + box.height + 10, {
    steps: 10,
  });
  await page.mouse.up();
}

async function uploadBytes(color = "#a4ae85") {
  return sharp({
    create: { width: 320, height: 220, channels: 3, background: color },
  })
    .png()
    .toBuffer();
}

test("image rotation and non-destructive crop survive refresh", async ({
  page,
  request,
}, testInfo) => {
  await edit(page);
  await selectLayer(page, "i1");
  const original = image(await readBook(request), "i1");
  await page.getByLabel("Rotation (degrees)", { exact: true }).fill("12");
  await page.getByRole("button", { name: "Crop photo", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Frame your photograph" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("slider", { name: "Crop zoom" }).fill("2.2");
  const preview = await dialog.locator(".crop-stage").boundingBox();
  if (!preview) throw new Error("Crop preview missing");
  await page.mouse.move(
    preview.x + preview.width / 2,
    preview.y + preview.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    preview.x + preview.width / 2 + 24,
    preview.y + preview.height / 2 + 18,
    { steps: 10 },
  );
  await page.mouse.up();
  await page.screenshot({ path: testInfo.outputPath("image-crop-dialog.png") });
  await dialog.getByRole("button", { name: "Apply crop", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await saved(page);
  const cropped = image(await readBook(request), "i1");
  expect(cropped.rotation).toBe(12);
  expect(cropped.filename).toBe(original.filename);
  expect(cropped.crop?.width).toBeLessThan(60);
  expect(cropped.crop?.height).toBeLessThan(60);
  expect(cropped.crop!.x + cropped.crop!.width).toBeLessThanOrEqual(100.001);
  expect(cropped.crop!.y + cropped.crop!.height).toBeLessThanOrEqual(100.001);

  await open(page);
  const rendered = page.getByTestId("element-i1");
  await expect(rendered.locator(".photo-image")).toHaveAttribute(
    "data-cropped",
    "true",
  );
  await expect(rendered.getByRole("img")).toHaveJSProperty("naturalWidth", 900);
  await expect(rendered.locator("figure")).toHaveCSS(
    "transform",
    /matrix\(0\.978/,
  );
  expect(image(await readBook(request), "i1")).toEqual(cropped);
  await page
    .getByRole("button", { name: "Edit scrapbook", exact: true })
    .click();
  await selectLayer(page, "i1");
  await expect(
    page.getByLabel("Rotation (degrees)", { exact: true }),
  ).toHaveValue("12");
  await page.getByRole("button", { name: "Crop photo", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Apply crop", exact: true })
    .click();
  await saved(page);
  const reapplied = image(await readBook(request), "i1").crop;
  for (const field of ["x", "y", "width", "height"] as const)
    expect(Math.abs(reapplied![field] - cropped.crop![field])).toBeLessThan(
      0.1,
    );
  await page.getByRole("button", { name: "Crop photo", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel crop", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Crop photo", exact: true }),
  ).toBeFocused();
  expect(image(await readBook(request), "i1").crop).toEqual(reapplied);
  await page.getByRole("button", { name: "Reset crop", exact: true }).click();
  await saved(page);
  expect(image(await readBook(request), "i1").crop).toBeNull();
});

test("image duplication, layer order, and locked geometry persist", async ({
  page,
  request,
}) => {
  await edit(page);
  await selectLayer(page, "i1");
  await page
    .getByRole("button", { name: "Duplicate image", exact: true })
    .click();
  await saved(page);
  let book = await readBook(request);
  const original = image(book, "i1");
  const copy = book.pages[0].elements.find(
    (item) => item.type === "image" && item.id !== "i1",
  );
  if (!copy || copy.type !== "image")
    throw new Error("Duplicate photo missing");
  expect(copy.filename).toBe(original.filename);
  expect(copy.caption).toBe(original.caption);
  expect(copy.id).not.toBe(original.id);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await saved(page);
  expect(
    (await readBook(request)).pages[0].elements.some(
      (item) => item.id === copy.id,
    ),
  ).toBeFalsy();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await saved(page);
  expect(image(await readBook(request), copy.id).filename).toBe(
    original.filename,
  );
  await selectLayer(page, copy.id);
  const beforeOrder = book.pages[0].elements.map((item) => item.id);
  const beforeIndex = beforeOrder.indexOf(copy.id);
  await page
    .getByRole("button", { name: "Send backward", exact: true })
    .click();
  await saved(page);
  book = await readBook(request);
  expect(book.pages[0].elements.findIndex((item) => item.id === copy.id)).toBe(
    beforeIndex - 1,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await saved(page);
  expect(
    (await readBook(request)).pages[0].elements.map((item) => item.id),
  ).toEqual(beforeOrder);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await saved(page);
  await page
    .getByRole("button", { name: "Bring forward", exact: true })
    .click();
  await saved(page);
  expect(
    (await readBook(request)).pages[0].elements.map((item) => item.id),
  ).toEqual(beforeOrder);
  await page
    .getByRole("button", { name: "Send backward", exact: true })
    .click();
  while (
    !(await page
      .getByRole("button", { name: "Bring forward", exact: true })
      .isDisabled())
  )
    await page
      .getByRole("button", { name: "Bring forward", exact: true })
      .click();
  await page
    .getByRole("button", { name: "Lock position", exact: true })
    .click();
  await saved(page);
  const lockedBook = await readBook(request);
  const locked = image(lockedBook, copy.id);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await saved(page);
  expect(image(await readBook(request), copy.id).locked).toBeFalsy();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await saved(page);
  await edit(page);
  await selectLayer(page, copy.id);
  const target = page.getByTestId(`element-${copy.id}`);
  await expect(target).toHaveAttribute("data-locked", "true");
  await expect(
    page.getByRole("button", { name: "Unlock position", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    (await readBook(request)).pages[0].elements.map((item) => item.id),
  ).toEqual(lockedBook.pages[0].elements.map((item) => item.id));
  await dragElement(page, target);
  await resizeElement(page, target);
  expect(geometry(image(await readBook(request), copy.id))).toEqual(
    geometry(locked),
  );
  await page
    .getByRole("button", { name: "Unlock position", exact: true })
    .click();
  // Move this photo to the front before checking that its hit area is draggable again.
  while (
    !(await page
      .getByRole("button", { name: "Bring forward", exact: true })
      .isDisabled())
  )
    await page
      .getByRole("button", { name: "Bring forward", exact: true })
      .click();
  await dragElement(page, target);
  await saved(page);
  const moved = image(await readBook(request), copy.id);
  expect(moved.x).toBeGreaterThan(locked.x);
  expect(moved.y).toBeGreaterThan(locked.y);
  await resizeElement(page, target);
  await saved(page);
  expect(image(await readBook(request), copy.id).width).toBeGreaterThan(
    moved.width,
  );
});

test("curated text typography, color, alignment and rotation survive refresh", async ({
  page,
  request,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await edit(page);
  await selectLayer(page, "t2");
  await page.getByLabel("Text style", { exact: true }).selectOption("body");
  await page
    .getByLabel("Font family", { exact: true })
    .selectOption("handwritten");
  await page.getByLabel("Font size", { exact: true }).fill("26");
  await page.getByLabel("Text color", { exact: true }).fill("#735341");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await page.getByRole("button", { name: "Italic", exact: true }).click();
  await page
    .getByLabel("Text alignment", { exact: true })
    .selectOption("center");
  await page.getByLabel("Rotation (degrees)", { exact: true }).fill("4");
  await saved(page);
  expect(text(await readBook(request), "t2")).toMatchObject({
    style: "body",
    fontFamily: "handwritten",
    fontSize: 26,
    color: "#735341",
    bold: true,
    italic: true,
    align: "center",
    rotation: 4,
  });
  await page.screenshot({
    path: testInfo.outputPath("desktop-text-editor.png"),
  });
  await open(page);
  const rendered = page.getByTestId("element-t2").locator(".scrap-text");
  await expect(rendered).toHaveCSS("font-family", /Segoe Print/);
  await expect(rendered).toHaveCSS("font-size", "26px");
  await expect(rendered).toHaveCSS("color", "rgb(115, 83, 65)");
  await expect(rendered).toHaveCSS("font-weight", "700");
  await expect(rendered).toHaveCSS("font-style", "italic");
  await expect(rendered).toHaveCSS("text-align", "center");
  await expect(page.locator(".editable-element")).toHaveCount(0);
  await expect(
    page.getByRole("complementary", { name: "Scrapbook editor" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Crop photo", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("desktop-styled-reading.png"),
  });
});

test("text duplicates retain appearance, can change layers, and respect position locks", async ({
  page,
  request,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await edit(page);
  await selectLayer(page, "t2");
  await page.getByLabel("Font family", { exact: true }).selectOption("sans");
  await page.getByLabel("Font size", { exact: true }).fill("24");
  await page
    .getByRole("button", { name: "Duplicate text", exact: true })
    .click();
  await saved(page);
  let book = await readBook(request);
  const original = text(book, "t2");
  const clone = book.pages[0].elements.find(
    (item) =>
      item.type === "text" && item.id !== "t2" && item.text === original.text,
  );
  if (!clone || clone.type !== "text")
    throw new Error("Duplicate text missing");
  expect(clone.fontFamily).toBe("sans");
  expect(clone.fontSize).toBe(24);
  await selectLayer(page, clone.id);
  const originalIndex = book.pages[0].elements.findIndex(
    (item) => item.id === clone.id,
  );
  await page
    .getByRole("button", { name: "Send backward", exact: true })
    .click();
  await saved(page);
  book = await readBook(request);
  expect(book.pages[0].elements.findIndex((item) => item.id === clone.id)).toBe(
    originalIndex - 1,
  );
  await page
    .getByRole("button", { name: "Bring forward", exact: true })
    .click();
  while (
    !(await page
      .getByRole("button", { name: "Bring forward", exact: true })
      .isDisabled())
  )
    await page
      .getByRole("button", { name: "Bring forward", exact: true })
      .click();
  await page
    .getByRole("button", { name: "Lock position", exact: true })
    .click();
  await saved(page);
  const lockedBook = await readBook(request);
  const locked = text(lockedBook, clone.id);
  await edit(page);
  await selectLayer(page, clone.id);
  expect(
    (await readBook(request)).pages[0].elements.map((item) => item.id),
  ).toEqual(lockedBook.pages[0].elements.map((item) => item.id));
  const target = page.getByTestId(`element-${clone.id}`);
  await expect(target).toHaveAttribute("data-locked", "true");
  await dragElement(page, target);
  await resizeElement(page, target);
  expect(geometry(text(await readBook(request), clone.id))).toEqual(
    geometry(locked),
  );
  await page
    .getByRole("button", { name: "Unlock position", exact: true })
    .click();
  while (
    !(await page
      .getByRole("button", { name: "Bring forward", exact: true })
      .isDisabled())
  )
    await page
      .getByRole("button", { name: "Bring forward", exact: true })
      .click();
  await dragElement(page, target);
  await saved(page);
  expect(text(await readBook(request), clone.id).y).toBeGreaterThan(locked.y);
  await page.screenshot({
    path: testInfo.outputPath("laptop-contextual-text-editor.png"),
  });
  await page.getByRole("button", { name: "Done editing", exact: true }).click();
  await expect(page.locator(".editable-element")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("laptop-reading-after-edits.png"),
  });
});

test("pages duplicate with fresh IDs, reorder persistently, and undo or redo page operations", async ({
  page,
  request,
}) => {
  await edit(page);
  const original = await readBook(request);
  await page
    .getByRole("button", { name: "Duplicate page", exact: true })
    .click();
  await saved(page);
  const duplicated = await readBook(request);
  expect(duplicated.pages).toHaveLength(5);
  const clone = duplicated.pages.find(
    (bookPage) => !original.pages.some((item) => item.id === bookPage.id),
  );
  if (!clone) throw new Error("Duplicate page missing");
  expect(clone.title).toContain("(copy)");
  expect(clone.elements).toHaveLength(original.pages[0].elements.length);
  expect(
    clone.elements
      .map((item) => item.id)
      .some((id) => original.pages[0].elements.some((item) => item.id === id)),
  ).toBeFalsy();
  expect(clone.elements.map((item) => item.type)).toEqual(
    original.pages[0].elements.map((item) => item.type),
  );
  const cloneIndex = duplicated.pages.findIndex(
    (bookPage) => bookPage.id === clone.id,
  );
  expect(cloneIndex).toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Move page earlier", exact: true })
    .click();
  await saved(page);
  const reordered = await readBook(request);
  expect(
    reordered.pages.findIndex((bookPage) => bookPage.id === clone.id),
  ).toBe(cloneIndex - 1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await saved(page);
  expect(
    (await readBook(request)).pages.map((bookPage) => bookPage.id),
  ).toEqual(duplicated.pages.map((bookPage) => bookPage.id));
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await saved(page);
  expect(
    (await readBook(request)).pages.map((bookPage) => bookPage.id),
  ).toEqual(reordered.pages.map((bookPage) => bookPage.id));
  await page
    .getByRole("button", { name: "Move page later", exact: true })
    .click();
  await saved(page);
  const later = await readBook(request);
  expect(later.pages.findIndex((bookPage) => bookPage.id === clone.id)).toBe(
    cloneIndex,
  );
  await page
    .getByRole("button", { name: "Delete selected page", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete page", exact: true })
    .click();
  await saved(page);
  expect((await readBook(request)).pages).toHaveLength(4);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await saved(page);
  expect(
    (await readBook(request)).pages.map((bookPage) => bookPage.id),
  ).toEqual(later.pages.map((bookPage) => bookPage.id));
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await saved(page);
  expect((await readBook(request)).pages).toHaveLength(4);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await saved(page);
  await edit(page);
  expect(
    (await readBook(request)).pages.map((bookPage) => bookPage.id),
  ).toEqual(later.pages.map((bookPage) => bookPage.id));
  await page
    .getByRole("navigation", { name: "Book pages" })
    .getByRole("button", {
      name: `${clone.title} Page ${String(cloneIndex + 1).padStart(2, "0")}`,
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Page name", { exact: true })).toHaveValue(
    clone.title,
  );
});

test("all four page templates create ordinary editable elements and photo slots can be filled", async ({
  page,
  request,
}, testInfo) => {
  await edit(page);
  const templates = [
    { name: "Journal template", photos: 0 },
    { name: "Single photo template", photos: 1 },
    { name: "Two photos template", photos: 2 },
    { name: "Collage template", photos: 3 },
  ];
  for (let index = 0; index < templates.length; index++) {
    await page
      .getByRole("button", { name: "New page from template", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Start a new page" });
    await dialog
      .getByRole("button", { name: templates[index].name, exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await saved(page);
    const book = await readBook(request);
    expect(book.pages).toHaveLength(5 + index);
    const added = book.pages[book.pages.length - 1];
    expect(added.elements.length).toBeGreaterThan(0);
    expect(
      added.elements.every(
        (item) => item.type === "image" || item.type === "text",
      ),
    ).toBeTruthy();
    expect(added.elements.filter((item) => item.type === "image")).toHaveLength(
      templates[index].photos,
    );
    expect(
      added.elements
        .filter((item) => item.type === "image")
        .every((item) => !item.filename),
    ).toBeTruthy();
  }
  const book = await readBook(request);
  const collage = book.pages[book.pages.length - 1];
  const slot = collage.elements.find((item) => item.type === "image");
  if (!slot || slot.type !== "image")
    throw new Error("Template photo slot missing");
  await selectLayer(page, slot.id);
  await expect(
    page.getByRole("button", { name: "Crop photo", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Replace image", { exact: true }).setInputFiles({
    name: "template-photo.png",
    mimeType: "image/png",
    buffer: await uploadBytes(),
  });
  await saved(page);
  const filled = image(await readBook(request), slot.id);
  expect(filled.filename).toMatch(/^[a-f0-9-]{36}\.webp$/);
  expect(geometry(filled)).toEqual(geometry(slot));
  await expect(
    page.getByTestId(`element-${slot.id}`).getByRole("img"),
  ).toHaveJSProperty("naturalWidth", 320);
  await page.screenshot({
    path: testInfo.outputPath("editable-collage-template.png"),
  });
  await page.getByRole("button", { name: "Done editing", exact: true }).click();
  await expect(page.locator(".editable-element")).toHaveCount(0);
  await expect(
    page.getByRole("complementary", { name: "Scrapbook editor" }),
  ).toHaveCount(0);
  await expect(
    page.getByTestId(`element-${slot.id}`).getByRole("img"),
  ).toHaveJSProperty("naturalWidth", 320);
});

test("undo and redo recover replaced and deleted image files after autosave", async ({
  page,
  request,
}) => {
  await edit(page);
  await page.getByLabel("Upload image", { exact: true }).setInputFiles({
    name: "before.png",
    mimeType: "image/png",
    buffer: await uploadBytes(),
  });
  await saved(page);
  const uploaded = (await readBook(request)).pages[0].elements.filter(
    (item): item is ImageElement => item.type === "image" && item.id !== "i1",
  )[0];
  if (!uploaded?.filename) throw new Error("Uploaded image missing");
  await selectLayer(page, uploaded.id);
  await page.getByLabel("Replace image", { exact: true }).setInputFiles({
    name: "after.png",
    mimeType: "image/png",
    buffer: await uploadBytes("#a87654"),
  });
  await saved(page);
  const replaced = image(await readBook(request), uploaded.id);
  expect(replaced.filename).not.toBe(uploaded.filename);
  expect((await request.get(`/api/images/${uploaded.filename}`)).status()).toBe(
    404,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await saved(page);
  expect(image(await readBook(request), uploaded.id).filename).toBe(
    uploaded.filename,
  );
  expect((await request.get(`/api/images/${uploaded.filename}`)).status()).toBe(
    200,
  );
  expect((await request.get(`/api/images/${replaced.filename}`)).status()).toBe(
    404,
  );
  await expect(
    page.getByTestId(`element-${uploaded.id}`).getByRole("img"),
  ).toHaveJSProperty("naturalWidth", 320);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await saved(page);
  expect(image(await readBook(request), uploaded.id).filename).toBe(
    replaced.filename,
  );
  expect((await request.get(`/api/images/${uploaded.filename}`)).status()).toBe(
    404,
  );
  await expect(
    page.getByTestId(`element-${uploaded.id}`).getByRole("img"),
  ).toHaveJSProperty("naturalWidth", 320);
  await selectLayer(page, uploaded.id);
  await page.getByRole("button", { name: "Delete image", exact: true }).click();
  await saved(page);
  expect((await request.get(`/api/images/${replaced.filename}`)).status()).toBe(
    404,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await saved(page);
  expect(image(await readBook(request), uploaded.id).filename).toBe(
    replaced.filename,
  );
  expect((await request.get(`/api/images/${replaced.filename}`)).status()).toBe(
    200,
  );
  await expect(
    page.getByTestId(`element-${uploaded.id}`).getByRole("img"),
  ).toHaveJSProperty("naturalWidth", 320);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await saved(page);
  expect(
    (await readBook(request)).pages[0].elements.some(
      (item) => item.id === uploaded.id,
    ),
  ).toBeFalsy();
  expect((await request.get(`/api/images/${replaced.filename}`)).status()).toBe(
    404,
  );
});

test("text input is grouped for undo, keyboard history works, and new edits clear redo", async ({
  page,
  request,
}) => {
  await edit(page);
  await selectLayer(page, "t2");
  const input = page.getByRole("textbox", {
    name: "Text content",
    exact: true,
  });
  for (const value of [
    "First thought",
    "Another draft",
    "A memory worth keeping",
  ])
    await input.fill(value);
  await saved(page);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(input).toHaveValue("The little things");
  await saved(page);
  expect(text(await readBook(request), "t2").text).toBe("The little things");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(input).toHaveValue("A memory worth keeping");
  await saved(page);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await saved(page);
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Redo", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Control+z");
  await expect(
    page.getByRole("button", { name: "Bold", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Control+Shift+z");
  await expect(
    page.getByRole("button", { name: "Bold", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await saved(page);
  expect(text(await readBook(request), "t2")).toMatchObject({
    text: "The little things",
    bold: true,
  });
});

test("editor history is bounded to fifty discrete operations", async ({
  page,
  request,
}) => {
  await edit(page);
  await selectLayer(page, "i1");
  for (let index = 0; index < 55; index++)
    await page
      .getByRole("button", {
        name: index % 2 ? "Unlock position" : "Lock position",
        exact: true,
      })
      .click();
  await saved(page);
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  for (let index = 0; index < 50; index++) {
    await expect(undo).toBeEnabled();
    await undo.click();
  }
  await expect(undo).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Redo", exact: true }),
  ).toBeEnabled();
  await saved(page);
  // The oldest retained snapshot is after the fifth toggle, not the original book.
  expect(image(await readBook(request), "i1").locked).toBe(true);
});

test("new image and text transformations are validated without changing the stored book", async ({
  request,
}) => {
  const original = await readBook(request);
  for (const [id, changes] of [
    ["i1", { crop: { x: 95, y: 0, width: 20, height: 100 } }],
    ["i1", { rotation: 181 }],
    ["i1", { locked: "yes" }],
    ["t2", { fontFamily: "unlisted-font" }],
    ["t2", { fontSize: 200 }],
    ["t2", { color: "javascript:alert(1)" }],
  ] as const) {
    const response = await request.put("/api/book", {
      data: {
        ...original,
        pages: original.pages.map((bookPage) => ({
          ...bookPage,
          elements: bookPage.elements.map((item) =>
            item.id === id ? { ...item, ...changes } : item,
          ),
        })),
      },
    });
    expect(response.status()).toBe(400);
  }
  expect(await readBook(request)).toEqual(original);
});
