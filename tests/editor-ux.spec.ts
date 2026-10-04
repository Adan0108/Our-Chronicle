import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import sharp from "sharp";
import { createSampleBook } from "../src/lib/storage/sample";
import {
  PAGE_HEIGHT,
  PAGE_WIDTH,
  type Book,
  type BookElement,
  type BookPage,
  type ImageElement,
  type TextElement,
} from "../src/types/book";

type Surface = { id: string; number: number };
type DropFile = { name: string; type: string; bytes: Buffer };

async function readBook(request: APIRequestContext): Promise<Book> {
  const response = await request.get("/api/book");
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test.beforeEach(async ({ request }) => {
  const current = await readBook(request);
  const response = await request.put("/api/book", {
    data: { ...createSampleBook(), revision: current.revision },
  });
  expect(response.ok()).toBeTruthy();
});

function pageData(book: Book, id: string): BookPage {
  const result = book.pages.find((item) => item.id === id);
  if (!result) throw new Error(`Fresh editor page ${id} is missing`);
  return result;
}

async function elements(request: APIRequestContext, surface: Surface) {
  return pageData(await readBook(request), surface.id).elements;
}

function item(items: BookElement[], id: string): BookElement {
  const result = items.find((candidate) => candidate.id === id);
  if (!result) throw new Error(`Fresh element ${id} is missing`);
  return result;
}

function geometry(element: BookElement) {
  return {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  };
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

async function openAndEdit(page: Page) {
  await page
    .getByRole("button", { name: "Open scrapbook", exact: true })
    .click();
  await firstSpread(page);
  await page
    .getByRole("button", { name: "Edit scrapbook", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Scrapbook editor" }),
  ).toBeVisible();
}

async function freshBlankPage(page: Page, request: APIRequestContext) {
  await page.goto("/");
  await openAndEdit(page);
  const before = (await readBook(request)).pages.length;
  await page.getByRole("button", { name: "Add page", exact: true }).click();
  await expect
    .poll(async () => (await readBook(request)).pages.length)
    .toBe(before + 1);
  await saved(page);
  const created = (await readBook(request)).pages.at(-1)!;
  const surface = { id: created.id, number: before + 1 };
  await expect(page.getByTestId(`page-${surface.number}`)).toBeVisible();
  for (const seeded of created.elements) {
    await selectLayer(page, seeded.id);
    await page
      .getByRole("button", {
        name: `Delete ${seeded.type === "text" ? "text" : seeded.type === "image" ? "image" : "sticker"}`,
        exact: true,
      })
      .click();
    await expect
      .poll(async () => (await elements(request, surface)).length)
      .toBe(created.elements.length - 1);
  }
  await saved(page);
  expect(await elements(request, surface)).toEqual([]);
  return surface;
}

async function returnToPage(
  page: Page,
  request: APIRequestContext,
  surface: Surface,
) {
  await page.reload();
  await openAndEdit(page);
  const target = pageData(await readBook(request), surface.id);
  await page
    .getByRole("button", {
      name: `${target.title} Page ${String(surface.number).padStart(2, "0")}`,
      exact: true,
    })
    .click();
  await expect(page.getByTestId(`page-${surface.number}`)).toBeVisible();
}

async function selectLayer(page: Page, id: string, shift = false) {
  await page.getByTestId(`layer-${id}`).click({
    modifiers: shift ? ["Shift"] : [],
  });
  await expect(page.getByTestId(`element-${id}`)).toHaveClass(
    /selected-element/,
  );
}

async function selectCanvas(
  page: Page,
  id: string,
  shift = false,
  selected = true,
) {
  await page
    .getByTestId(`element-${id}`)
    .locator(".element-hit-area")
    .click({ modifiers: shift ? ["Shift"] : [] });
  await expect(page.getByTestId(`element-${id}`)).toHaveAttribute(
    "data-selected",
    String(selected),
  );
}

async function addText(
  page: Page,
  request: APIRequestContext,
  surface: Surface,
  text: string,
) {
  const count = (await elements(request, surface)).length;
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByLabel("Text content", { exact: true }).fill(text);
  await expect
    .poll(async () => (await elements(request, surface)).length)
    .toBe(count + 1);
  await saved(page);
  const result = (await elements(request, surface)).at(-1)!;
  expect(result.type).toBe("text");
  return result as TextElement;
}

async function addSticker(
  page: Page,
  request: APIRequestContext,
  surface: Surface,
) {
  const count = (await elements(request, surface)).length;
  await page.getByRole("button", { name: "Decorations", exact: true }).click();
  await page
    .getByRole("button", { name: "Add pressed flower", exact: true })
    .click();
  await expect
    .poll(async () => (await elements(request, surface)).length)
    .toBe(count + 1);
  await saved(page);
  return (await elements(request, surface)).at(-1)!;
}

async function photo(name = "a-cafe-photograph.jpg"): Promise<DropFile> {
  return {
    name,
    type: "image/jpeg",
    bytes: await sharp({
      create: { width: 360, height: 240, channels: 3, background: "#ad9271" },
    })
      .jpeg()
      .toBuffer(),
  };
}

async function transparent(webp = false): Promise<DropFile> {
  const width = 96;
  const height = 72;
  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    rgba[index * 4] = 134;
    rgba[index * 4 + 1] = 72;
    rgba[index * 4 + 2] = 94;
    rgba[index * 4 + 3] = index % 3 === 0 ? 0 : index % 3 === 1 ? 128 : 255;
  }
  const image = sharp(rgba, { raw: { width, height, channels: 4 } });
  return {
    name: `real-transparent-decoration.${webp ? "webp" : "png"}`,
    type: webp ? "image/webp" : "image/png",
    bytes: webp
      ? await image.webp({ lossless: true }).toBuffer()
      : await image.png().toBuffer(),
  };
}

async function expectAlpha(
  request: APIRequestContext,
  image: BookElement,
  source: DropFile,
) {
  if (image.type !== "image" || !image.filename)
    throw new Error("Imported image reference is missing");
  const response = await request.get(`/api/images/${image.filename}`);
  expect(response.ok()).toBeTruthy();
  const bytes = await response.body();
  expect((await sharp(bytes).metadata()).hasAlpha).toBe(true);
  const expected = await sharp(source.bytes).ensureAlpha().raw().toBuffer();
  const actual = await sharp(bytes).ensureAlpha().raw().toBuffer();
  expect(actual.filter((_, index) => index % 4 === 3)).toEqual(
    expected.filter((_, index) => index % 4 === 3),
  );
}

async function dragFiles(
  page: Page,
  surface: Surface,
  files: DropFile[],
  point: { x: number; y: number },
  phase: "hover" | "drop" = "drop",
) {
  const canvas = page.getByTestId(`page-${surface.number}`);
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Editable page is missing");
  await page.evaluate(
    ({ number, point, files, phase }) => {
      const target = document.querySelector(`[data-testid="page-${number}"]`);
      if (!target) throw new Error("Drop target is missing");
      const transfer = new DataTransfer();
      for (const file of files) {
        const bytes = Uint8Array.from(atob(file.base64), (char) =>
          char.charCodeAt(0),
        );
        transfer.items.add(new File([bytes], file.name, { type: file.type }));
      }
      for (const name of phase === "hover"
        ? ["dragenter", "dragover"]
        : ["dragenter", "dragover", "drop"])
        target.dispatchEvent(
          new DragEvent(name, {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
            clientX: point.x,
            clientY: point.y,
          }),
        );
    },
    {
      number: surface.number,
      point: {
        x: box.x + (point.x / PAGE_WIDTH) * box.width,
        y: box.y + (point.y / PAGE_HEIGHT) * box.height,
      },
      files: files.map((file) => ({
        name: file.name,
        type: file.type,
        base64: file.bytes.toString("base64"),
      })),
      phase,
    },
  );
}

async function importChoice(
  page: Page,
  request: APIRequestContext,
  surface: Surface,
  count: number,
  kind: "photo" | "decoration",
) {
  const before = (await elements(request, surface)).length;
  const dialog = page.getByRole("dialog", { name: "Add images", exact: true });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", {
      name: kind === "photo" ? "Add as photos" : "Add as decorations",
      exact: true,
    })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(async () => (await elements(request, surface)).length)
    .toBe(before + count);
  await saved(page);
  return (await elements(request, surface)).slice(before);
}

async function drop(
  page: Page,
  request: APIRequestContext,
  surface: Surface,
  files: DropFile[],
  point: { x: number; y: number },
  kind: "photo" | "decoration",
) {
  await dragFiles(page, surface, files, point);
  return importChoice(page, request, surface, files.length, kind);
}

async function configureGeometry(
  page: Page,
  request: APIRequestContext,
  surface: Surface,
  positions: Record<string, Partial<BookElement>>,
) {
  // Only arrange newly created test elements. The editor actions under test
  // still use real pointers, keyboard input, and the normal save/history path.
  await saved(page);
  const current = await readBook(request);
  const response = await request.put("/api/book", {
    data: {
      ...current,
      pages: current.pages.map((candidate) =>
        candidate.id === surface.id
          ? {
              ...candidate,
              elements: candidate.elements.map((element) => ({
                ...element,
                ...positions[element.id],
              })),
            }
          : candidate,
      ),
    },
  });
  expect(response.ok()).toBeTruthy();
  await returnToPage(page, request, surface);
}

async function dragElement(
  page: Page,
  target: Locator,
  dx: number,
  dy: number,
  alt = false,
  steps = 20,
  release = true,
) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error("Editable element is missing");
  if (alt) await page.keyboard.down("Alt");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + dx,
    box.y + box.height / 2 + dy,
    { steps },
  );
  if (release) {
    await page.mouse.up();
    if (alt) await page.keyboard.up("Alt");
  }
  return {
    x: box.x + box.width / 2 + dx,
    y: box.y + box.height / 2 + dy,
  };
}

async function keyUndo(page: Page) {
  await page.keyboard.press("Control+z");
  await saved(page);
}

async function keyRedo(page: Page) {
  await page.keyboard.press("Control+Shift+z");
  await saved(page);
}

test("a truly empty fresh page accepts pointer-positioned photos and alpha decorations, cascades batches and persists their history", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(100_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const surface = await freshBlankPage(page, request);
  const canvas = page.getByTestId(`page-${surface.number}`);
  await expect(
    canvas.getByRole("button", { name: "Add text to empty page", exact: true }),
  ).toBeVisible();
  await expect(
    canvas.getByRole("button", {
      name: "Add decoration to empty page",
      exact: true,
    }),
  ).toBeVisible();
  const jpeg = await photo();
  await dragFiles(page, surface, [jpeg], { x: 35, y: 45 }, "hover");
  await expect(canvas.getByTestId("canvas-drop-highlight")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("desktop-drop-highlight-empty-page.png"),
  });
  await dragFiles(page, surface, [jpeg], { x: 35, y: 45 });
  const [topLeft] = await importChoice(page, request, surface, 1, "photo");
  await expect(canvas.getByTestId("canvas-drop-highlight")).toHaveCount(0);
  await expect(
    canvas.getByRole("button", { name: "Add text to empty page", exact: true }),
  ).toHaveCount(0);
  const png = await transparent();
  const [center] = await drop(
    page,
    request,
    surface,
    [png],
    { x: 220, y: 290 },
    "decoration",
  );
  const webp = await transparent(true);
  const [bottomRight] = await drop(
    page,
    request,
    surface,
    [webp],
    { x: 410, y: 545 },
    "decoration",
  );
  expect(topLeft.x).toBeLessThan(center.x);
  expect(topLeft.y).toBeLessThan(center.y);
  expect(center.x).toBeLessThan(bottomRight.x);
  expect(center.y).toBeLessThan(bottomRight.y);
  for (const [element, point] of [
    [topLeft, { x: 35, y: 45 }],
    [center, { x: 220, y: 290 }],
    [bottomRight, { x: 410, y: 545 }],
  ] as const) {
    expect(
      Math.abs(element.x + element.width / 2 - point.x),
    ).toBeLessThanOrEqual(element.width / 2 + 8);
    expect(
      Math.abs(element.y + element.height / 2 - point.y),
    ).toBeLessThanOrEqual(element.height / 2 + 8);
    expect(element.x + element.width).toBeLessThanOrEqual(PAGE_WIDTH);
    expect(element.y + element.height).toBeLessThanOrEqual(PAGE_HEIGHT);
  }
  expect((topLeft as ImageElement).kind ?? "photo").toBe("photo");
  expect((center as ImageElement).kind).toBe("decoration");
  expect((bottomRight as ImageElement).kind).toBe("decoration");
  await expectAlpha(request, center, png);
  await expectAlpha(request, bottomRight, webp);
  const batch = await drop(
    page,
    request,
    surface,
    [await photo("first-batch.jpg"), await photo("second-batch.jpg")],
    { x: 160, y: 180 },
    "photo",
  );
  expect(batch).toHaveLength(2);
  expect(batch[0].x === batch[1].x && batch[0].y === batch[1].y).toBe(false);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => (await elements(request, surface)).length)
    .toBe(3);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect
    .poll(async () => (await elements(request, surface)).length)
    .toBe(5);
  await saved(page);
  const final = await elements(request, surface);
  await returnToPage(page, request, surface);
  expect(await elements(request, surface)).toEqual(final);
  for (const entry of final)
    await expect(page.getByTestId(`element-${entry.id}`)).toBeVisible();
});

test("unsupported and renamed files never overwrite the fresh page or enter the safe upload pipeline", async ({
  page,
  request,
}) => {
  const surface = await freshBlankPage(page, request);
  const before = await elements(request, surface);
  let uploads = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/images") && request.method() === "POST")
      uploads++;
  });
  await dragFiles(
    page,
    surface,
    [
      {
        name: "not-a-photo.txt",
        type: "text/plain",
        bytes: Buffer.from("A note rather than a photograph"),
      },
    ],
    { x: 70, y: 90 },
  );
  await expect(
    page.getByRole("dialog", { name: "Add images", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/JPEG, PNG|PNG, WebP|supported image/i).first(),
  ).toBeVisible();
  expect(uploads).toBe(0);
  expect(await elements(request, surface)).toEqual(before);
  const rejected = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/images") &&
      response.request().method() === "POST",
  );
  await dragFiles(
    page,
    surface,
    [
      {
        name: "renamed.png",
        type: "image/png",
        bytes: Buffer.from("Not encoded image data"),
      },
    ],
    { x: 100, y: 110 },
  );
  await page
    .getByRole("dialog", { name: "Add images", exact: true })
    .getByRole("button", { name: "Add as decorations", exact: true })
    .click();
  expect((await rejected).status()).toBe(400);
  await expect(
    page.getByRole("alert").filter({ hasText: /image|read|unsupported/i }),
  ).toBeVisible();
  expect(await elements(request, surface)).toEqual(before);
});

test("clipboard image paste preserves alpha and supports native Chromium clipboard; typing keeps the clipboard and shortcuts in the field", async ({
  page,
  request,
  context,
}) => {
  test.setTimeout(100_000);
  const surface = await freshBlankPage(page, request);
  const source = await transparent();
  await page.evaluate(
    ({ number, base64 }) => {
      const canvas = document.querySelector(`[data-testid="page-${number}"]`);
      if (!canvas) throw new Error("Clipboard canvas is missing");
      const transfer = new DataTransfer();
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      transfer.items.add(
        new File([bytes], "clipboard-decoration.png", { type: "image/png" }),
      );
      canvas.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: transfer,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { number: surface.number, base64: source.bytes.toString("base64") },
  );
  const [pasted] = await importChoice(page, request, surface, 1, "decoration");
  await expectAlpha(request, pasted, source);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => (await elements(request, surface)).length)
    .toBe(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect
    .poll(async () => (await elements(request, surface)).length)
    .toBe(1);
  await saved(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page
    .getByTestId(`page-${surface.number}`)
    .click({ position: { x: 15, y: 15 } });
  await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": new Blob([bytes], { type: "image/png" }),
      }),
    ]);
  }, source.bytes.toString("base64"));
  await page.keyboard.press("Control+v");
  const [nativePaste] = await importChoice(
    page,
    request,
    surface,
    1,
    "decoration",
  );
  await expectAlpha(request, nativePaste, source);
  const text = await addText(
    page,
    request,
    surface,
    "A new clipboard journal entry",
  );
  const input = page.getByLabel("Text content", { exact: true });
  await input.focus();
  const count = (await elements(request, surface)).length;
  await page.evaluate((base64) => {
    const input = document.activeElement;
    if (!input) throw new Error("Text input is not focused");
    const transfer = new DataTransfer();
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    transfer.items.add(
      new File([bytes], "typing-image.png", { type: "image/png" }),
    );
    input.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: transfer,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, source.bytes.toString("base64"));
  await expect(
    page.getByRole("dialog", { name: "Add images", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Control+d");
  await page.keyboard.press("Delete");
  await page.keyboard.press("Backspace");
  await saved(page);
  expect((await elements(request, surface)).length).toBe(count);
  expect(
    (await elements(request, surface)).some((entry) => entry.id === text.id),
  ).toBe(true);
  await page.evaluate(
    ({ number }) => {
      const canvas = document.querySelector(`[data-testid="page-${number}"]`);
      const transfer = new DataTransfer();
      transfer.setData("text/plain", "Ordinary copied prose");
      canvas?.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: transfer,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { number: surface.number },
  );
  await expect(
    page.getByRole("dialog", { name: "Add images", exact: true }),
  ).toHaveCount(0);
  expect((await elements(request, surface)).length).toBe(count);
});

test("Shift selection moves a group as one history action, duplicates and deletes together, and respects mixed position locks", async ({
  page,
  request,
}) => {
  test.setTimeout(100_000);
  const surface = await freshBlankPage(page, request);
  const first = await addText(page, request, surface, "The first new memory");
  const second = await addText(page, request, surface, "The second new memory");
  await configureGeometry(page, request, surface, {
    [first.id]: { x: 50, y: 160, width: 120, height: 70 },
    [second.id]: { x: 260, y: 160, width: 120, height: 70 },
  });
  const before = await elements(request, surface);
  await selectCanvas(page, first.id);
  await selectCanvas(page, second.id, true);
  await expect(page.locator('[data-selected="true"]')).toHaveCount(2);
  await selectCanvas(page, second.id, true, false);
  await expect(page.getByTestId(`element-${second.id}`)).toHaveAttribute(
    "data-selected",
    "false",
  );
  await selectCanvas(page, second.id, true);
  await dragElement(
    page,
    page.getByTestId(`element-${first.id}`),
    30,
    42,
    true,
  );
  await expect
    .poll(async () => item(await elements(request, surface), first.id).x)
    .toBe(80);
  await saved(page);
  const moved = await elements(request, surface);
  for (const id of [first.id, second.id]) {
    const original = item(before, id);
    expect(geometry(item(moved, id))).toEqual({
      ...geometry(original),
      x: original.x + 30,
      y: original.y + 42,
    });
  }
  await keyUndo(page);
  await expect
    .poll(async () => (await elements(request, surface)).map(geometry))
    .toEqual(before.map(geometry));
  await keyRedo(page);
  await expect
    .poll(async () => (await elements(request, surface)).map(geometry))
    .toEqual(moved.map(geometry));
  await selectLayer(page, first.id);
  await page
    .getByRole("button", { name: "Lock position", exact: true })
    .click();
  await expect
    .poll(async () => item(await elements(request, surface), first.id).locked)
    .toBe(true);
  await saved(page);
  const lockedGeometry = geometry(
    item(await elements(request, surface), first.id),
  );
  await selectLayer(page, first.id);
  await expect(
    page.getByTestId(`element-${first.id}`).locator(".element-lock-mark"),
  ).toBeVisible();
  await selectCanvas(page, second.id, true);
  const unlocked = item(await elements(request, surface), second.id);
  await dragElement(
    page,
    page.getByTestId(`element-${second.id}`),
    -20,
    35,
    true,
  );
  await expect
    .poll(async () => item(await elements(request, surface), second.id).y)
    .toBe(unlocked.y + 35);
  await saved(page);
  expect(geometry(item(await elements(request, surface), first.id))).toEqual(
    lockedGeometry,
  );
  await page.keyboard.press("Control+d");
  await expect
    .poll(async () => (await elements(request, surface)).length)
    .toBe(4);
  await saved(page);
  const copied = (await elements(request, surface)).slice(2);
  expect(copied.map((entry) => entry.id)).not.toContain(first.id);
  expect(copied.map((entry) => entry.id)).not.toContain(second.id);
  expect(copied.every((entry) => entry.locked === false)).toBe(true);
  await expect(page.locator('[data-selected="true"]')).toHaveCount(2);
  await page.keyboard.press("Delete");
  await expect
    .poll(async () => (await elements(request, surface)).length)
    .toBe(2);
  await saved(page);
  await keyUndo(page);
  await expect
    .poll(async () => (await elements(request, surface)).length)
    .toBe(4);
  expect((await elements(request, surface)).slice(2)).toEqual(copied);
  await keyRedo(page);
  await expect
    .poll(async () => (await elements(request, surface)).length)
    .toBe(2);
  await selectLayer(page, first.id);
  await page
    .getByRole("button", { name: "Unlock position", exact: true })
    .click();
  await expect
    .poll(async () => item(await elements(request, surface), first.id).locked)
    .toBe(false);
  await saved(page);
  await dragElement(
    page,
    page.getByTestId(`element-${first.id}`),
    17,
    19,
    true,
  );
  await expect
    .poll(async () => item(await elements(request, surface), first.id).x)
    .toBe(lockedGeometry.x + 17);
  await saved(page);
  const final = await elements(request, surface);
  await returnToPage(page, request, surface);
  expect(await elements(request, surface)).toEqual(final);
  await expect(page.locator('[data-selected="true"]')).toHaveCount(0);
});

async function layerOrder(page: Page) {
  return page
    .getByRole("list", { name: "Scrapbook layers", exact: true })
    .getByRole("listitem")
    .evaluateAll((nodes) =>
      nodes.map((node) =>
        node.getAttribute("data-testid")!.replace("layer-row-", ""),
      ),
    );
}

async function reorderByPointer(page: Page, from: string, to: string) {
  const list = page.getByRole("list", {
    name: "Scrapbook layers",
    exact: true,
  });
  await list.scrollIntoViewIfNeeded();
  const handle = page.getByTestId(`layer-drag-${from}`);
  await handle.scrollIntoViewIfNeeded();
  const source = await handle.boundingBox();
  const target = await page.getByTestId(`layer-row-${to}`).boundingBox();
  if (!source || !target) throw new Error("Sortable layer is missing");
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    source.x + source.width / 2 + 7,
    source.y + source.height / 2,
    { steps: 2 },
  );
  await page.mouse.move(target.x + 15, target.y + target.height / 2, {
    steps: 30,
  });
  await page.mouse.up();
}

test("frontmost-first layers reorder first-to-last and last-to-first with pointers, support locked keyboard reordering and retain undo/redo/render order", async ({
  page,
  request,
}) => {
  test.setTimeout(100_000);
  const surface = await freshBlankPage(page, request);
  const [photograph] = await drop(
    page,
    request,
    surface,
    [await photo()],
    { x: 100, y: 110 },
    "photo",
  );
  const firstText = await addText(
    page,
    request,
    surface,
    "A useful short layer preview",
  );
  const sticker = await addSticker(page, request, surface);
  const [decoration] = await drop(
    page,
    request,
    surface,
    [await transparent()],
    { x: 240, y: 340 },
    "decoration",
  );
  const lastText = await addText(
    page,
    request,
    surface,
    "Frontmost final words",
  );
  const original = (await elements(request, surface)).map((entry) => entry.id);
  await expect.poll(() => layerOrder(page)).toEqual([...original].reverse());
  await expect(page.getByTestId(`layer-${firstText.id}`)).toContainText(
    "A useful short layer preview",
  );
  await expect(page.getByTestId(`layer-${sticker.id}`)).toContainText(
    "Pressed flower",
  );
  await expect(page.getByTestId(`layer-${photograph.id}`)).toContainText(
    "a-cafe-photograph",
  );
  await expect(page.getByTestId(`layer-${decoration.id}`)).toContainText(
    "real-transparent-decoration",
  );
  await reorderByPointer(page, lastText.id, photograph.id);
  const sentBack = [lastText.id, ...original.slice(0, -1)];
  await expect
    .poll(async () =>
      (await elements(request, surface)).map((entry) => entry.id),
    )
    .toEqual(sentBack);
  await saved(page);
  await expect.poll(() => layerOrder(page)).toEqual([...sentBack].reverse());
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () =>
      (await elements(request, surface)).map((entry) => entry.id),
    )
    .toEqual(original);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect
    .poll(async () =>
      (await elements(request, surface)).map((entry) => entry.id),
    )
    .toEqual(sentBack);
  await saved(page);
  await reorderByPointer(page, lastText.id, decoration.id);
  await expect
    .poll(async () =>
      (await elements(request, surface)).map((entry) => entry.id),
    )
    .toEqual(original);
  await saved(page);
  await selectLayer(page, photograph.id);
  await page
    .getByRole("button", { name: "Lock position", exact: true })
    .click();
  await expect
    .poll(
      async () => item(await elements(request, surface), photograph.id).locked,
    )
    .toBe(true);
  await saved(page);
  const handle = page.getByTestId(`layer-drag-${photograph.id}`);
  await handle.focus();
  await page.keyboard.press("Space");
  const announcement = page.locator('[id^="DndLiveRegion"]');
  await expect(announcement).toHaveText(
    `Position ${original.length} of ${original.length}, frontmost first.`,
  );
  for (let step = 0; step < original.length - 1; step++) {
    await page.keyboard.press("ArrowUp");
    // Keyboard coordinates use the collision rectangle committed by dnd-kit.
    // The announcement proves that move has committed before the next key.
    await expect(announcement).toHaveText(
      `Position ${original.length - step - 1} of ${original.length}, frontmost first.`,
    );
  }
  await page.keyboard.press("Space");
  const lockedFront = [
    ...original.filter((id) => id !== photograph.id),
    photograph.id,
  ];
  await expect
    .poll(async () =>
      (await elements(request, surface)).map((entry) => entry.id),
    )
    .toEqual(lockedFront);
  await saved(page);
  await selectLayer(page, photograph.id);
  await expect(page.getByTestId(`layer-${photograph.id}`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const arranged = Object.fromEntries(
    original.map((id) => [
      id,
      { x: 100, y: 160, width: 130, height: 90, rotation: 0 },
    ]),
  );
  await configureGeometry(page, request, surface, arranged);
  await expect.poll(() => layerOrder(page)).toEqual([...lockedFront].reverse());
  await expect(page.getByTestId(`element-${photograph.id}`)).toHaveCSS(
    "z-index",
    String(original.length),
  );
  const top = await page
    .getByTestId(`element-${photograph.id}`)
    .evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return document
        .elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        )
        ?.closest("[data-element-id]")
        ?.getAttribute("data-element-id");
    });
  expect(top).toBe(photograph.id);
});

test("center, margin and neighboring guides assist movement while Alt bypass preserves precise free positioning", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(100_000);
  const surface = await freshBlankPage(page, request);
  const moving = await addText(page, request, surface, "A note for alignment");
  await configureGeometry(page, request, surface, {
    [moving.id]: { x: 50, y: 50, width: 100, height: 80, rotation: 0 },
  });
  await selectCanvas(page, moving.id);
  const target = page.getByTestId(`element-${moving.id}`);
  const endpoint = await dragElement(page, target, 118, 199, false, 40, false);
  await expect(page.getByTestId("snap-guide-x")).toHaveAttribute(
    "data-position",
    "220",
  );
  await expect(page.getByTestId("snap-guide-y")).toHaveAttribute(
    "data-position",
    "290",
  );
  await page.screenshot({
    path: testInfo.outputPath("desktop-center-alignment-guides.png"),
  });
  await page.mouse.move(endpoint.x, endpoint.y);
  await page.mouse.up();
  await expect
    .poll(async () =>
      geometry(item(await elements(request, surface), moving.id)),
    )
    .toEqual({ x: 170, y: 250, width: 100, height: 80 });
  await saved(page);
  await expect(page.getByTestId("snap-guide-x")).toHaveCount(0);
  await expect(page.getByTestId("snap-guide-y")).toHaveCount(0);
  await dragElement(page, target, -2, -1, true);
  await expect
    .poll(async () =>
      geometry(item(await elements(request, surface), moving.id)),
    )
    .toEqual({ x: 168, y: 249, width: 100, height: 80 });
  await saved(page);
  await keyUndo(page);
  await expect
    .poll(async () => item(await elements(request, surface), moving.id).x)
    .toBe(170);
  await keyRedo(page);
  await expect
    .poll(async () => item(await elements(request, surface), moving.id).x)
    .toBe(168);
  await dragElement(page, target, -146, -223, false, 3);
  await expect
    .poll(async () =>
      geometry(item(await elements(request, surface), moving.id)),
    )
    .toEqual({ x: 24, y: 24, width: 100, height: 80 });
  await saved(page);
  const reference = await addText(page, request, surface, "A nearby reference");
  await configureGeometry(page, request, surface, {
    [moving.id]: { x: 50, y: 60 },
    [reference.id]: { x: 280, y: 350, width: 100, height: 80, locked: true },
  });
  await selectCanvas(page, moving.id);
  const aligned = await dragElement(page, target, 127, 212, false, 30, false);
  await expect(page.getByTestId("snap-guide-x")).toHaveAttribute(
    "data-position",
    "280",
  );
  await expect(page.getByTestId("snap-guide-y")).toHaveAttribute(
    "data-position",
    "350",
  );
  await page.mouse.move(aligned.x, aligned.y);
  await page.mouse.up();
  await expect
    .poll(async () =>
      geometry(item(await elements(request, surface), moving.id)),
    )
    .toEqual({ x: 180, y: 270, width: 100, height: 80 });
  await saved(page);
  await returnToPage(page, request, surface);
  expect(geometry(item(await elements(request, surface), moving.id))).toEqual({
    x: 180,
    y: 270,
    width: 100,
    height: 80,
  });
});

test("floating tools edit text, photos, stickers and decorations; context actions and keyboard navigation share bounded history", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const surface = await freshBlankPage(page, request);
  const [photograph] = await drop(
    page,
    request,
    surface,
    [await photo()],
    { x: 110, y: 140 },
    "photo",
  );
  const toolbar = page.getByRole("toolbar", {
    name: "Quick editor actions",
    exact: true,
  });
  await expect(toolbar).toBeVisible();
  await expect(
    page.getByLabel("Quick replacement file", { exact: true }),
  ).toHaveAttribute("tabindex", "-1");
  await toolbar
    .getByRole("button", { name: "Quick crop photo", exact: true })
    .click();
  const crop = page.getByRole("dialog", {
    name: "Frame your photograph",
    exact: true,
  });
  await expect(crop).toBeVisible();
  await crop.getByRole("slider", { name: "Crop zoom", exact: true }).fill("2");
  await crop.getByRole("button", { name: "Apply crop", exact: true }).click();
  await expect
    .poll(
      async () =>
        (item(await elements(request, surface), photograph.id) as ImageElement)
          .crop?.width ?? 100,
    )
    .toBeLessThan(100);
  await saved(page);
  await toolbar
    .getByLabel("Quick photo style", { exact: true })
    .selectOption("taped");
  await expect
    .poll(
      async () =>
        (item(await elements(request, surface), photograph.id) as ImageElement)
          .frame,
    )
    .toBe("taped");
  await saved(page);
  await page
    .getByTestId(`element-${photograph.id}`)
    .locator(".element-hit-area")
    .click({ button: "right" });
  const photoMenu = page.getByRole("menu", {
    name: "Element actions",
    exact: true,
  });
  await expect(photoMenu).toBeVisible();
  await photoMenu.getByLabel("Context photo style", { exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(photoMenu).toHaveCount(0);
  await expect(page.getByTestId(`element-${photograph.id}`)).toHaveAttribute(
    "data-selected",
    "true",
  );
  const originalFile = (
    item(await elements(request, surface), photograph.id) as ImageElement
  ).filename;
  const replacement = await photo("replacement.jpg");
  await expect(
    toolbar.getByRole("button", { name: "Quick replace image", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Quick replacement file", { exact: true })
    .setInputFiles({
      name: replacement.name,
      mimeType: replacement.type,
      buffer: replacement.bytes,
    });
  await expect
    .poll(
      async () =>
        (item(await elements(request, surface), photograph.id) as ImageElement)
          .filename,
    )
    .not.toBe(originalFile);
  await saved(page);
  const text = await addText(
    page,
    request,
    surface,
    "Quickly styled fresh words",
  );
  await toolbar
    .getByLabel("Quick font family", { exact: true })
    .selectOption("handwritten");
  await toolbar.getByLabel("Quick font size", { exact: true }).fill("24");
  await toolbar
    .getByRole("button", { name: "Quick bold", exact: true })
    .click();
  await toolbar
    .getByRole("button", { name: "Quick italic", exact: true })
    .click();
  await toolbar.getByLabel("Quick text color", { exact: true }).fill("#8d5f74");
  await expect
    .poll(async () => item(await elements(request, surface), text.id))
    .toMatchObject({
      fontFamily: "handwritten",
      fontSize: 24,
      bold: true,
      italic: true,
      color: "#8d5f74",
    });
  await saved(page);
  const sticker = await addSticker(page, request, surface);
  await expect(
    toolbar.getByRole("button", { name: "Quick crop photo", exact: true }),
  ).toHaveCount(0);
  await expect(
    toolbar.getByLabel("Quick font size", { exact: true }),
  ).toHaveCount(0);
  const count = (await elements(request, surface)).length;
  await toolbar
    .getByRole("button", { name: "Quick duplicate", exact: true })
    .click();
  await expect
    .poll(async () => (await elements(request, surface)).length)
    .toBe(count + 1);
  await saved(page);
  await toolbar
    .getByRole("button", { name: "Quick delete", exact: true })
    .click();
  await expect
    .poll(async () => (await elements(request, surface)).length)
    .toBe(count);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => (await elements(request, surface)).length)
    .toBe(count + 1);
  await saved(page);
  await selectLayer(page, sticker.id);
  // Delete the restored duplicate again so the locked original is the top
  // hit target; an overlapping copy must not make this lock check vacuous.
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect
    .poll(async () => (await elements(request, surface)).length)
    .toBe(count);
  await saved(page);
  await selectLayer(page, sticker.id);
  await toolbar
    .getByRole("button", { name: "Quick lock position", exact: true })
    .click();
  await expect
    .poll(async () => item(await elements(request, surface), sticker.id).locked)
    .toBe(true);
  await saved(page);
  await expect(
    toolbar.getByRole("button", { name: "Quick unlock position", exact: true }),
  ).toBeVisible();
  const locked = geometry(item(await elements(request, surface), sticker.id));
  await dragElement(
    page,
    page.getByTestId(`element-${sticker.id}`),
    35,
    30,
    true,
  );
  expect(geometry(item(await elements(request, surface), sticker.id))).toEqual(
    locked,
  );
  const lockedBox = await page
    .getByTestId(`element-${sticker.id}`)
    .boundingBox();
  if (!lockedBox) throw new Error("Locked sticker is missing");
  await page.mouse.move(
    lockedBox.x + lockedBox.width - 1,
    lockedBox.y + lockedBox.height - 1,
  );
  await page.mouse.down();
  await page.mouse.move(
    lockedBox.x + lockedBox.width + 20,
    lockedBox.y + lockedBox.height + 15,
    { steps: 10 },
  );
  await page.mouse.up();
  expect(geometry(item(await elements(request, surface), sticker.id))).toEqual(
    locked,
  );
  const source = await transparent();
  const [decoration] = await drop(
    page,
    request,
    surface,
    [source],
    { x: 330, y: 460 },
    "decoration",
  );
  await expect(
    toolbar.getByRole("button", { name: "Quick crop decoration", exact: true }),
  ).toBeVisible();
  await expect(
    toolbar.getByLabel("Quick photo style", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByTestId(`element-${decoration.id}`)
    .locator(".element-hit-area")
    .click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Element actions", exact: true });
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Crop decoration", exact: true }),
  ).toBeVisible();
  await menu
    .getByRole("menuitem", { name: "Send to back", exact: true })
    .click();
  await expect
    .poll(async () => (await elements(request, surface))[0].id)
    .toBe(decoration.id);
  await saved(page);
  await toolbar
    .getByRole("button", { name: "Quick more options", exact: true })
    .click();
  await menu
    .getByRole("menuitem", { name: "Bring to front", exact: true })
    .click();
  await expect
    .poll(async () => (await elements(request, surface)).at(-1)?.id)
    .toBe(decoration.id);
  await saved(page);
  await page
    .getByTestId(`element-${decoration.id}`)
    .locator(".element-hit-area")
    .focus();
  await page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Duplicate", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    menu.getByRole("menuitem", { name: "Lock position", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect
    .poll(
      async () => item(await elements(request, surface), decoration.id).locked,
    )
    .toBe(true);
  await saved(page);
  await page.screenshot({
    path: testInfo.outputPath("desktop-locked-decoration-quick-toolbar.png"),
  });
  await page.keyboard.press("Escape");
  await expect(toolbar).toHaveCount(0);
  await expect(page.locator('[data-selected="true"]')).toHaveCount(0);
  const final = await elements(request, surface);
  await returnToPage(page, request, surface);
  expect(await elements(request, surface)).toEqual(final);
});

test("keyboard duplicate, delete, undo, redo and Escape act on the canvas and remain harmless inside fields and dialogs", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const surface = await freshBlankPage(page, request);
  const text = await addText(page, request, surface, "Keyboard canvas memory");
  await selectCanvas(page, text.id);
  await page.keyboard.press("Control+d");
  await expect
    .poll(async () => (await elements(request, surface)).length)
    .toBe(2);
  await saved(page);
  await keyUndo(page);
  await expect
    .poll(async () => (await elements(request, surface)).length)
    .toBe(1);
  await page.keyboard.press("Control+y");
  await expect
    .poll(async () => (await elements(request, surface)).length)
    .toBe(2);
  await saved(page);
  await page.keyboard.press("Backspace");
  await expect
    .poll(async () => (await elements(request, surface)).length)
    .toBe(1);
  await keyUndo(page);
  await expect
    .poll(async () => (await elements(request, surface)).length)
    .toBe(2);
  await page.keyboard.press("Delete");
  await expect
    .poll(async () => (await elements(request, surface)).length)
    .toBe(1);
  await saved(page);
  await selectLayer(page, text.id);
  const input = page.getByLabel("Text content", { exact: true });
  await input.fill("Typing does not delete scrapbook elements");
  await saved(page);
  await input.focus();
  await page.keyboard.press("Control+d");
  await page.keyboard.press("Delete");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+Shift+z");
  await saved(page);
  expect((await elements(request, surface)).map((entry) => entry.id)).toEqual([
    text.id,
  ]);
  await page.getByLabel("Font size", { exact: true }).focus();
  await page.keyboard.press("Delete");
  await page.keyboard.press("Control+d");
  await page.keyboard.press("Tab");
  await saved(page);
  expect((await elements(request, surface)).map((entry) => entry.id)).toEqual([
    text.id,
  ]);
  await page.getByRole("button", { name: "Book options", exact: true }).click();
  const dialog = page.getByRole("dialog").filter({
    has: page.getByRole("button", {
      name: "Close book options",
      exact: true,
    }),
  });
  await dialog.getByRole("button", { name: "Reset Book", exact: true }).click();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).focus();
  const before = await elements(request, surface);
  for (const key of [
    "Delete",
    "Backspace",
    "Control+d",
    "Control+z",
    "Control+Shift+z",
  ])
    await page.keyboard.press(key);
  expect(await elements(request, surface)).toEqual(before);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Close book options", exact: true })
    .click();
  await selectCanvas(page, text.id);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("toolbar", { name: "Quick editor actions", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('[data-selected="true"]')).toHaveCount(0);
});

test("floating tools stay within desktop, laptop and tablet viewports at page edges and selection remains clear", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const surface = await freshBlankPage(page, request);
  const text = await addText(page, request, surface, "An edge-positioned note");
  const toolbar = page.getByRole("toolbar", {
    name: "Quick editor actions",
    exact: true,
  });
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    for (const position of [
      { x: 0, y: 0 },
      { x: 0, y: 480 },
      { x: 300, y: 0 },
      { x: 300, y: 480 },
    ]) {
      await configureGeometry(page, request, surface, {
        [text.id]: { ...position, width: 120, height: 80, rotation: 12 },
      });
      await selectCanvas(page, text.id);
      await expect(toolbar).toBeVisible();
      await expect
        .poll(async () => {
          const box = await toolbar.boundingBox();
          return (
            box &&
            box.x >= 7 &&
            box.y >= 7 &&
            box.x + box.width <= viewport.width - 7 &&
            box.y + box.height <= viewport.height - 7
          );
        })
        .toBeTruthy();
      await page.screenshot({
        path: testInfo.outputPath(
          `quick-toolbar-${viewport.width}-${position.x}-${position.y}.png`,
        ),
      });
      await page.keyboard.press("Escape");
      await expect(toolbar).toHaveCount(0);
    }
  }
});

async function nativeDrag(page: Page, forward: boolean, opening = false) {
  await page.mouse.move(20, 30);
  if (opening)
    await expect(page.locator(".book-spread")).toHaveCSS(
      "transform",
      "matrix(1, 0, 0, 1, -220, 0)",
    );
  else
    await expect(page.locator(".book-spread")).toHaveCSS("transform", "none");
  const box = await (
    opening ? page.locator(".native-cover") : page.locator(".book-spread")
  ).boundingBox();
  if (!box) throw new Error("Native reader is missing");
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

test("a dense newly created page reads without editor overlays and repeated native cover/page gestures remain stable", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const surface = await freshBlankPage(page, request);
  const [photograph] = await drop(
    page,
    request,
    surface,
    [await photo()],
    { x: 220, y: 320 },
    "photo",
  );
  const text = await addText(
    page,
    request,
    surface,
    "A dense page of small memories",
  );
  const sticker = await addSticker(page, request, surface);
  await selectLayer(page, photograph.id);
  await selectLayer(page, text.id, true);
  await selectLayer(page, sticker.id, true);
  for (let count = 6; count <= 30; count += 3) {
    await page.keyboard.press("Control+d");
    await expect
      .poll(async () => (await elements(request, surface)).length)
      .toBe(count);
    await saved(page);
  }
  const dense = await elements(request, surface);
  await expect(page.locator('[data-selected="true"]')).toHaveCount(3);
  await expect(
    page.getByRole("toolbar", { name: "Quick editor actions", exact: true }),
  ).toContainText("3 items");
  await page.screenshot({
    path: testInfo.outputPath("desktop-dense-editor-selection.png"),
  });
  await page.getByRole("button", { name: "Done editing", exact: true }).click();
  await expect(page.locator(".book-spread")).toHaveCSS("transform", "none");
  for (const selector of [
    ".quick-tools",
    ".element-context-menu",
    ".element-hit-area",
    ".element-lock-mark",
    ".selected-element",
    ".canvas-snap-guide",
    ".canvas-drop-highlight",
    ".canvas-empty-hint",
  ])
    await expect(page.locator(selector)).toHaveCount(0);
  const surfaceNode = page.getByTestId(`page-${surface.number}`);
  await expect(surfaceNode.locator(".reading-element")).toHaveCount(30);
  for (const reading of await surfaceNode.locator(".reading-element").all())
    await expect(reading).toHaveCSS("pointer-events", "none");
  await page.screenshot({
    path: testInfo.outputPath("desktop-dense-reading-clean.png"),
  });
  await dragFiles(page, surface, [await photo("reading-drop.jpg")], {
    x: 220,
    y: 290,
  });
  await expect(
    page.getByRole("dialog", { name: "Add images", exact: true }),
  ).toHaveCount(0);
  expect(await elements(request, surface)).toEqual(dense);
  await page
    .getByRole("button", { name: "Previous pages", exact: true })
    .click();
  await expect(page.getByTestId("page-indicator")).toContainText("3 – 4");
  await page
    .getByRole("button", { name: "Previous pages", exact: true })
    .click();
  await firstSpread(page);
  const original = await page.locator(".flipbook").elementHandle();
  if (!original) throw new Error("Native page-flip reader is missing");
  for (let turn = 0; turn < 3; turn++) {
    await nativeDrag(page, true);
    await expect(page.getByTestId("page-indicator")).toContainText("3 – 4");
    await nativeDrag(page, false);
    await firstSpread(page);
  }
  const box = await page.locator(".book-spread").boundingBox();
  if (!box) throw new Error("Native spread is missing");
  for (const side of ["right", "left"] as const) {
    for (let step = 0; step < 12; step++)
      await page.mouse.move(
        box.x + (side === "right" ? box.width - 8 : 8),
        box.y + box.height - 8 + (step % 2 ? -2 : 0),
      );
    await expect(page.getByTestId("page-indicator")).toContainText("1 – 2");
    await expect(page.locator(".book-spread")).toHaveCSS("transform", "none");
    // Traverse the interior like a real pointer. Teleporting between opposite
    // corners leaves StPageFlip's first hover calculation pointing forward.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
      steps: 12,
    });
    // clearShadow runs when the native corner-return animation has finished.
    await expect
      .poll(() =>
        page
          .locator(
            ".flipbook .stf__outerShadow, .flipbook .stf__innerShadow, .flipbook .stf__hardShadow, .flipbook .stf__hardInnerShadow",
          )
          .evaluateAll(
            (nodes) =>
              nodes.length === 4 &&
              nodes.every((node) => getComputedStyle(node).display === "none"),
          ),
      )
      .toBeTruthy();
    await firstSpread(page);
  }
  expect(
    await original.evaluate(
      (node) => node === document.querySelector(".flipbook"),
    ),
  ).toBeTruthy();
  await nativeDrag(page, false);
  await expect(page.getByTestId("page-indicator")).toHaveCount(0);
  await expect(page.locator(".book-spread")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, -220, 0)",
  );
  await nativeDrag(page, true, true);
  await firstSpread(page);
  await page.getByRole("button", { name: "Present book", exact: true }).click();
  await expect(
    page.locator(".quick-tools, .canvas-empty-hint, .element-lock-mark"),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Edit scrapbook", exact: true })
    .click();
  await page
    .getByRole("button", { name: "A new memory Page 05", exact: true })
    .click();
  await selectLayer(page, photograph.id);
  await expect(
    page.getByRole("toolbar", { name: "Quick editor actions", exact: true }),
  ).toBeVisible();
});
