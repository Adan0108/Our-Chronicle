import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { decodeArchive } from "../src/lib/storage/archive";
import { LocalBookStorage } from "../src/lib/storage/local";
import { createSampleBook } from "../src/lib/storage/sample";
import type {
  Book,
  BookElement,
  BookPage,
  BookTheme,
  ImageElement,
} from "../src/types/book";

const preferenceKey = "our-chronicle:reduce-motion";
const themes: BookTheme[] = ["cafe", "vintage", "ivory", "wedding", "campus"];
const particleCounts: Record<BookTheme, number> = {
  cafe: 10,
  vintage: 7,
  ivory: 0,
  wedding: 10,
  campus: 8,
};
const signatures: Record<BookTheme, { kind: string; artwork: string }> = {
  cafe: { kind: "steam", artwork: "cafe-lamp" },
  vintage: { kind: "postcard", artwork: "vintage-collage" },
  ivory: { kind: "serif", artwork: "ivory-emboss" },
  wedding: { kind: "floral", artwork: "wedding-floral" },
  campus: { kind: "notebook", artwork: "sakura-branch" },
};
const viewports = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
];

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

async function saved(page: Page) {
  await expect(
    page.getByRole("status", { name: "Book save status", exact: true }),
  ).toHaveText("Saved on this device");
}

async function spread(page: Page, first: number) {
  await expect(page.getByTestId("page-indicator")).toContainText(
    `${first} – ${first + 1}`,
  );
  await expect(page.locator(".book-spread")).toHaveCSS("transform", "none");
}

async function closed(page: Page) {
  await expect(page.getByTestId("page-indicator")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open scrapbook", exact: true }),
  ).toHaveClass(/--simple/);
  await expect(page.locator(".book-spread")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, -220, 0)",
  );
}

async function open(page: Page) {
  await page
    .getByRole("button", { name: "Open scrapbook", exact: true })
    .click();
  await spread(page, 1);
}

async function select(page: Page, id: string, additive = false) {
  await page.getByTestId(`layer-${id}`).click({
    modifiers: additive ? ["Shift"] : [],
  });
  await expect(page.getByTestId(`element-${id}`)).toHaveAttribute(
    "data-selected",
    "true",
  );
}

function freshPage(book: Book, id: string): BookPage {
  const result = book.pages.find((candidate) => candidate.id === id);
  if (!result) throw new Error("New atmosphere regression page is missing");
  return result;
}

async function jpeg() {
  return sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#ad9476"/><path d="M0 370L640 220V480H0" fill="#7f654d"/><circle cx="330" cy="210" r="115" fill="#efe2c7"/><circle cx="330" cy="210" r="80" fill="#72513d"/><path d="M300 205Q330 175 360 205Q350 233 330 248Q308 233 300 205" fill="#ebd7b5"/></svg>',
    ),
  )
    .jpeg()
    .toBuffer();
}

async function alpha() {
  const width = 120,
    height = 100;
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const radius = ((x - 60) / 38) ** 2 + ((y - 50) / 33) ** 2;
      if (radius > 1.08) continue;
      const offset = (y * width + x) * 4;
      pixels[offset] = 134;
      pixels[offset + 1] = 84;
      pixels[offset + 2] = 99;
      pixels[offset + 3] = radius > 1 ? 128 : 255;
    }
  return sharp(pixels, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

async function dropDecoration(
  page: Page,
  request: APIRequestContext,
  pageId: string,
  number: number,
) {
  const source = await alpha();
  const canvas = page.getByTestId(`page-${number}`);
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("New editable page is missing");
  const before = freshPage(await readBook(request), pageId).elements.length;
  const transfer = await page.evaluateHandle(
    ({ base64 }) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(
        new File([bytes], "real-alpha-atmosphere.png", { type: "image/png" }),
      );
      return data;
    },
    { base64: source.toString("base64") },
  );
  const event = {
    dataTransfer: transfer,
    clientX: box.x + box.width * 0.76,
    clientY: box.y + box.height * 0.62,
  };
  await canvas.dispatchEvent("dragenter", event);
  await canvas.dispatchEvent("dragover", event);
  await expect(page.getByTestId("canvas-drop-highlight")).toBeVisible();
  await canvas.dispatchEvent("drop", event);
  await transfer.dispose();
  const dialog = page.getByRole("dialog", { name: "Add images", exact: true });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Add as decorations", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(
      async () => freshPage(await readBook(request), pageId).elements.length,
    )
    .toBe(before + 1);
  await saved(page);
  const result = freshPage(await readBook(request), pageId).elements.at(-1)!;
  if (result.type !== "image" || !result.filename)
    throw new Error("Dropped alpha image is missing");
  expect(result.kind).toBe("decoration");
  const response = await request.get(`/api/images/${result.filename}`);
  expect(response.ok()).toBeTruthy();
  expect((await sharp(await response.body()).metadata()).hasAlpha).toBe(true);
  return result;
}

function wav() {
  const rate = 8000,
    frames = rate * 8;
  const bytes = Buffer.alloc(44 + frames * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(frames * 2, 40);
  for (let index = 0; index < frames; index++)
    bytes.writeInt16LE(
      Math.round(Math.sin((index / rate) * Math.PI * 2 * 220) * 1000),
      44 + index * 2,
    );
  return bytes;
}

async function addAudio(page: Page, request: APIRequestContext) {
  await page
    .getByRole("button", { name: "Music settings", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Music and ambience",
    exact: true,
  });
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith("/api/audio") &&
      candidate.request().method() === "POST",
  );
  await dialog.getByLabel("Upload audio", { exact: true }).setInputFiles({
    name: "quiet-theme-tone.wav",
    mimeType: "audio/wav",
    buffer: wav(),
  });
  expect((await response).status()).toBe(201);
  await expect.poll(async () => (await readBook(request)).audio).toBeTruthy();
  await saved(page);
  await expect(page.getByTestId("ambience-audio")).toHaveJSProperty(
    "paused",
    true,
  );
  await dialog
    .getByRole("button", { name: "Close ambience", exact: true })
    .click();
  await page.getByRole("button", { name: "Play music", exact: true }).click();
  await playing(page);
}

async function playing(page: Page) {
  const audio = page.getByTestId("ambience-audio");
  await expect(audio).toHaveJSProperty("paused", false);
  await expect(page.getByTestId("music-playback-status")).toHaveText("Playing");
  await expect
    .poll(() =>
      audio.evaluate((node) => (node as HTMLAudioElement).currentTime),
    )
    .toBeGreaterThan(0);
}

async function densePage(page: Page, request: APIRequestContext) {
  await page.goto("/");
  await open(page);
  await page
    .getByRole("button", { name: "Edit scrapbook", exact: true })
    .click();
  const before = (await readBook(request)).pages.length;
  await page.getByRole("button", { name: "Add page", exact: true }).click();
  await expect
    .poll(async () => (await readBook(request)).pages.length)
    .toBe(before + 1);
  await saved(page);
  const created = (await readBook(request)).pages.at(-1)!;
  const number = before + 1;
  await expect(page.getByTestId(`page-${number}`)).toBeVisible();
  await page.getByLabel("Upload image", { exact: true }).setInputFiles({
    name: "fresh-theme-coffee.jpg",
    mimeType: "image/jpeg",
    buffer: await jpeg(),
  });
  await expect
    .poll(
      async () =>
        freshPage(await readBook(request), created.id).elements.filter(
          (item) => item.type === "image",
        ).length,
    )
    .toBe(1);
  await saved(page);
  const photo = freshPage(await readBook(request), created.id).elements.at(-1)!;
  await select(page, photo.id);
  await page.getByRole("button", { name: "Crop photo", exact: true }).click();
  const crop = page.getByRole("dialog", {
    name: "Frame your photograph",
    exact: true,
  });
  await crop.getByLabel("Crop zoom", { exact: true }).fill("1.6");
  await crop.getByRole("button", { name: "Apply crop", exact: true }).click();
  await page.getByLabel("Rotation (degrees)", { exact: true }).fill("-12");
  await page.getByLabel("Rotation (degrees)", { exact: true }).press("Tab");
  await saved(page);
  const decoration = await dropDecoration(page, request, created.id, number);
  for (const name of [
    "Add pressed flower",
    "Add masking tape",
    "Add coffee doodle",
  ]) {
    await page
      .getByRole("button", { name: "Decorations", exact: true })
      .click();
    await page.getByRole("button", { name, exact: true }).click();
    await saved(page);
  }
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByLabel("Text content", { exact: true })
    .fill("Golden light, a quiet table, and all our little memories.");
  await page
    .getByLabel("Font family", { exact: true })
    .selectOption("handwritten");
  await page.getByLabel("Font size", { exact: true }).fill("22");
  await page.getByLabel("Text color", { exact: true }).fill("#765546");
  await page
    .getByLabel("Text alignment", { exact: true })
    .selectOption("center");
  await saved(page);
  const text = freshPage(await readBook(request), created.id).elements.at(-1)!;
  await select(page, photo.id);
  await select(page, decoration.id, true);
  await select(page, text.id, true);
  const initialCount = freshPage(await readBook(request), created.id).elements
    .length;
  for (let batch = 1; batch <= 3; batch++) {
    await page
      .getByRole("button", { name: "Quick duplicate", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          freshPage(await readBook(request), created.id).elements.length,
      )
      .toBe(initialCount + batch * 3);
    await saved(page);
  }
  const elements = freshPage(await readBook(request), created.id).elements;
  expect(elements.length).toBeGreaterThanOrEqual(16);
  expect(
    (elements.find((item) => item.id === photo.id) as ImageElement).crop!.width,
  ).toBeLessThan(100);
  expect(elements.find((item) => item.id === photo.id)!.rotation).toBe(-12);
  return {
    id: created.id,
    number,
    photoId: photo.id,
    decorationId: decoration.id,
    textId: text.id,
  };
}

async function setTheme(page: Page, theme: BookTheme) {
  const settings = page.locator(".theme-settings");
  if ((await settings.getAttribute("open")) === null)
    await settings.locator("summary").click();
  await page.getByLabel("Scrapbook theme", { exact: true }).selectOption(theme);
  await expect(page.getByTestId("theme-atmosphere")).toHaveAttribute(
    "data-theme",
    theme,
  );
  await saved(page);
}

async function manipulateDecoration(
  page: Page,
  request: APIRequestContext,
  pageId: string,
  decoration: ImageElement,
) {
  await select(page, decoration.id);
  const target = page.getByTestId(`element-${decoration.id}`);
  for (const resize of [false, true]) {
    const previous = freshPage(await readBook(request), pageId).elements.find(
      (element) => element.id === decoration.id,
    )!;
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error("New theme-active decoration is missing");
    const x = box.x + (resize ? box.width - 1 : box.width / 2);
    const y = box.y + (resize ? box.height - 1 : box.height / 2);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 12, y + 17, { steps: 20 });
    await page.mouse.up();
    await expect
      .poll(async () => {
        const changed = freshPage(
          await readBook(request),
          pageId,
        ).elements.find((element) => element.id === decoration.id)!;
        return resize
          ? changed.width > previous.width && changed.height > previous.height
          : changed.x > previous.x && changed.y > previous.y;
      })
      .toBe(true);
    await saved(page);
  }
}

async function atmosphereSafety(page: Page, theme: BookTheme) {
  const layer = page.getByTestId("theme-atmosphere");
  await expect(layer).toHaveCount(1);
  await expect(layer).toHaveAttribute("data-theme", theme);
  await expect(layer).toHaveAttribute("aria-hidden", "true");
  await expect(layer).toHaveCSS("position", "fixed");
  await expect(layer).toHaveCSS("pointer-events", "none");
  await expect(layer).toHaveCSS("contain", "layout paint");
  await expect(layer.locator(".atmosphere-accent")).toHaveCount(2);
  await signatureSafety(page, theme);
  const mode = await layer.getAttribute("data-mode");
  const count =
    mode === "editing"
      ? Math.ceil(particleCounts[theme] / 2)
      : particleCounts[theme];
  await expect(layer.getByTestId("ambient-particle")).toHaveCount(count);
  expect(count + 2).toBeLessThanOrEqual(20);
  expect(
    await layer.evaluate((node) => {
      const styles = getComputedStyle(node);
      return {
        clipped: ["hidden", "clip"].includes(styles.overflow),
        pointers: [...node.querySelectorAll("*")].every(
          (child) =>
            getComputedStyle(child).pointerEvents === "none" &&
            getComputedStyle(child, "::before").pointerEvents === "none" &&
            getComputedStyle(child, "::after").pointerEvents === "none",
        ),
        outsideReader: !node.closest(".book-spread, .flipbook, .spread-scroll"),
        firstSibling: node.parentElement?.firstElementChild === node,
      };
    }),
  ).toEqual({
    clipped: true,
    pointers: true,
    outsideReader: true,
    firstSibling: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

async function signatureSafety(page: Page, theme: BookTheme) {
  const artwork = page.getByTestId("theme-signature");
  await expect(artwork).toHaveCount(2);
  for (const variant of ["primary", "secondary"]) {
    const wrapper = page.locator(
      `[data-testid="theme-signature"][data-variant="${variant}"]`,
    );
    await expect(wrapper).toHaveCount(1);
    await expect(wrapper).toHaveAttribute(
      "data-signature",
      signatures[theme].kind,
    );
    await expect(wrapper).toHaveCSS("pointer-events", "none");
    await expect(wrapper.locator("svg.signature-art")).toHaveCount(1);
    await expect(wrapper.locator("svg.signature-art")).toHaveCSS(
      "pointer-events",
      "none",
    );
  }
  const primary = page.locator(
    '[data-testid="theme-signature"][data-variant="primary"]',
  );
  await expect(primary.locator("svg.signature-art")).toHaveAttribute(
    "data-artwork",
    signatures[theme].artwork,
  );
  await expect(primary).toBeVisible();
  expect(
    await primary.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return (
        Number(style.opacity) > 0 &&
        box.width > 0 &&
        box.height > 0 &&
        box.right > 0 &&
        box.bottom > 0 &&
        box.left < innerWidth &&
        box.top < innerHeight
      );
    }),
  ).toBe(true);
}

async function signatureMetrics(page: Page) {
  const signature = page.getByTestId("theme-signature");
  // Wait for the actual opacity transition to finish rather than adding a
  // timer or comparing a transient intermediate animation frame.
  await expect
    .poll(() =>
      signature.evaluateAll((nodes) =>
        nodes.every(
          (node) =>
            !node
              .getAnimations()
              .some(
                (animation) =>
                  animation instanceof CSSTransition &&
                  animation.playState === "running",
              ),
        ),
      ),
    )
    .toBe(true);
  return signature.evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return {
        variant: (node as HTMLElement).dataset.variant,
        opacity: Number(getComputedStyle(node).opacity),
        bounds: { x: box.x, y: box.y, width: box.width, height: box.height },
      };
    }),
  );
}

async function measurements(page: Page) {
  return page.locator(".book-spread").evaluate((node) => {
    const box = node.getBoundingClientRect();
    const native = node.querySelector<HTMLElement>(".flipbook")!;
    const scroller = node.closest(".spread-scroll")!;
    const scrollingStyle = getComputedStyle(scroller);
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      // Native curls can expand the clipped inner element's scrollWidth. The
      // actual scrolling parent must stay stable throughout the gesture.
      scrollWidth: scroller.scrollWidth,
      scrollContentWidth:
        scroller.scrollWidth -
        parseFloat(scrollingStyle.paddingLeft) -
        parseFloat(scrollingStyle.paddingRight),
      nativeWidth: native.offsetWidth,
      nativeHeight: native.offsetHeight,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
}

async function nativeDrag(page: Page, forward: boolean, opening = false) {
  await page.mouse.move(20, 30);
  if (opening) await closed(page);
  else
    await expect(page.locator(".book-spread")).toHaveCSS("transform", "none");
  const box = await (
    opening ? page.locator(".native-cover") : page.locator(".book-spread")
  ).boundingBox();
  if (!box) throw new Error("Native scrapbook is missing");
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

async function shadowsSettled(page: Page) {
  await expect
    .poll(() =>
      page
        .locator(
          ".flipbook .stf__outerShadow, .flipbook .stf__innerShadow, .flipbook .stf__hardShadow, .flipbook .stf__hardInnerShadow",
        )
        .evaluateAll(
          (nodes) =>
            nodes.length === 4 &&
            nodes.every((node) => {
              const box = node.getBoundingClientRect();
              // A freshly mounted native reader has empty shadow nodes until
              // its first gesture. They occupy no area despite display:block.
              return (
                getComputedStyle(node).display === "none" ||
                box.width === 0 ||
                box.height === 0
              );
            }),
        ),
    )
    .toBeTruthy();
}

async function cancelCoverDrag(page: Page, opening: boolean) {
  await page.mouse.move(20, 30);
  if (opening) await closed(page);
  else await spread(page, 1);
  await shadowsSettled(page);
  const box = await (
    opening ? page.locator(".native-cover") : page.locator(".book-spread")
  ).boundingBox();
  if (!box) throw new Error("Native cover is missing");
  const startX = box.x + (opening ? box.width - 8 : 8);
  const startY = box.y + box.height - 8;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Stay on the originating side of the spine, allowing the native engine
  // to return the cover to its initial state when the gesture is released.
  await page.mouse.move(startX + (opening ? -100 : 100), startY - 30, {
    steps: 12,
  });
  await page.mouse.up();
  await shadowsSettled(page);
  if (opening) await closed(page);
  else await spread(page, 1);
  await page.mouse.move(20, 30);
}

async function hoverStable(page: Page) {
  const before = await measurements(page);
  const box = await page.locator(".book-spread").boundingBox();
  if (!box) throw new Error("Reading spread is missing");
  for (const forward of [true, false]) {
    for (let step = 0; step < 10; step++) {
      await page.mouse.move(
        box.x + (forward ? box.width - 8 : 8),
        box.y + box.height - 8 - (step % 2),
      );
      expect(await measurements(page)).toEqual(before);
      await expect(page.getByTestId("page-indicator")).toContainText("1 – 2");
    }
    // Return through the interior so the native corner calculation completes
    // before entering the opposite corner or beginning a new drag gesture.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
      steps: 12,
    });
    await shadowsSettled(page);
    await spread(page, 1);
  }
}

async function cleanReading(page: Page) {
  await expect(
    page.locator(
      ".inspector, .quick-tools, .element-context-menu, .element-hit-area, .element-lock-mark, .selected-element, .canvas-snap-guide, .canvas-drop-highlight, .canvas-empty-hint",
    ),
  ).toHaveCount(0);
  expect(
    await page
      .locator(".reading-element")
      .evaluateAll((nodes) =>
        nodes.every((node) => getComputedStyle(node).pointerEvents === "none"),
      ),
  ).toBe(true);
}

async function screenshots(
  page: Page,
  info: TestInfo,
  theme: BookTheme,
  mode: string,
) {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await atmosphereSafety(page, theme);
    await page.screenshot({
      path: info.outputPath(
        `${theme}-${mode}-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });
  }
  await page.setViewportSize(viewports[0]);
}

for (const theme of themes) {
  test(`${theme} atmosphere preserves a NEW dense page, editor input, native physics and continuous music at desktop/laptop/tablet sizes`, async ({
    page,
    request,
  }, info) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize(viewports[0]);
    const fresh = await densePage(page, request);
    const elementsBefore = freshPage(
      await readBook(request),
      fresh.id,
    ).elements;
    const elementBox = await page
      .getByTestId(`element-${fresh.photoId}`)
      .boundingBox();
    await addAudio(page, request);
    const originalAudio = await page
      .getByTestId("ambience-audio")
      .elementHandle();
    if (!originalAudio) throw new Error("Theme test media element is missing");
    await originalAudio.evaluate((node) => {
      node.dataset.observedPauses = "0";
      node.addEventListener("pause", () => {
        node.dataset.observedPauses = String(
          Number(node.dataset.observedPauses) + 1,
        );
      });
    });
    const pageBeforeTheme = await page
      .getByTestId("page-indicator")
      .textContent();
    await setTheme(page, theme);
    await expect(page.getByTestId("page-indicator")).toHaveText(
      pageBeforeTheme!,
    );
    expect((await readBook(request)).theme).toBe(theme);
    expect(freshPage(await readBook(request), fresh.id).elements).toEqual(
      elementsBefore,
    );
    expect(
      await page.getByTestId(`element-${fresh.photoId}`).boundingBox(),
    ).toEqual(elementBox);
    await atmosphereSafety(page, theme);
    // Exercise real input after the selected theme's effects are active.
    const themeDecoration = await dropDecoration(
      page,
      request,
      fresh.id,
      fresh.number,
    );
    await manipulateDecoration(page, request, fresh.id, themeDecoration);
    await select(page, fresh.textId);
    const quick = page.getByRole("toolbar", {
      name: "Quick editor actions",
      exact: true,
    });
    await expect(quick).toBeVisible();
    await quick
      .getByRole("button", { name: "Quick bold", exact: true })
      .click();
    await saved(page);
    await expect(
      quick.getByRole("button", { name: "Quick bold", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const editingSignatures = await signatureMetrics(page);
    await expect(page.getByTestId("theme-atmosphere")).toHaveAttribute(
      "data-mode",
      "editing",
    );
    await screenshots(page, info, theme, "editor");
    const finalElements = freshPage(await readBook(request), fresh.id).elements;
    await page
      .getByRole("button", { name: "Done editing", exact: true })
      .click();
    await cleanReading(page);
    await signatureSafety(page, theme);
    const readingSignatures = await signatureMetrics(page);
    expect(readingSignatures.map((signature) => signature.bounds)).toEqual(
      editingSignatures.map((signature) => signature.bounds),
    );
    for (let index = 0; index < readingSignatures.length; index++)
      expect(readingSignatures[index].opacity).toBeGreaterThan(
        editingSignatures[index].opacity,
      );
    await expect(
      page.getByTestId(`page-${fresh.number}`).locator(".reading-element"),
    ).toHaveCount(finalElements.length);
    await playing(page);
    const reader = await page.locator(".flipbook").elementHandle();
    if (!reader) throw new Error("Native reader is missing");
    await screenshots(page, info, theme, "reading");
    await page
      .getByRole("button", { name: "Present book", exact: true })
      .click();
    await cleanReading(page);
    await signatureSafety(page, theme);
    await expect(page.getByTestId("theme-atmosphere")).toHaveAttribute(
      "data-mode",
      "presentation",
    );
    const presentationSignatures = await signatureMetrics(page);
    expect(presentationSignatures.map((signature) => signature.bounds)).toEqual(
      readingSignatures.map((signature) => signature.bounds),
    );
    for (let index = 0; index < presentationSignatures.length; index++)
      expect(presentationSignatures[index].opacity).toBeGreaterThan(
        readingSignatures[index].opacity,
      );
    await motionSettings(page);
    await page
      .getByRole("checkbox", { name: "Reduce motion", exact: true })
      .check();
    await reduced(page, true);
    await signatureSafety(page, theme);
    expect(
      (await signatureMetrics(page)).map((signature) => signature.bounds),
    ).toEqual(presentationSignatures.map((signature) => signature.bounds));
    await page
      .getByRole("checkbox", { name: "Reduce motion", exact: true })
      .uncheck();
    await reduced(page, false);
    await closeMotionSettings(page);
    await screenshots(page, info, theme, "presentation");
    await playing(page);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Present book", exact: true }),
    ).toBeVisible();
    for (const first of [3, 1]) {
      await nativeDrag(page, false);
      await spread(page, first);
    }
    for (let turn = 0; turn < 3; turn++) {
      await nativeDrag(page, true);
      await spread(page, 3);
      await nativeDrag(page, false);
      await spread(page, 1);
    }
    await hoverStable(page);
    await nativeDrag(page, false);
    await closed(page);
    await nativeDrag(page, true, true);
    await spread(page, 1);
    await playing(page);
    expect(
      await reader.evaluate(
        (node) => node === document.querySelector(".flipbook"),
      ),
    ).toBe(true);
    expect(
      await originalAudio.evaluate(
        (node) =>
          node === document.querySelector('[data-testid="ambience-audio"]'),
      ),
    ).toBe(true);
    expect(await originalAudio.getAttribute("data-observed-pauses")).toBe("0");
    expect(freshPage(await readBook(request), fresh.id).elements).toEqual(
      finalElements,
    );
    await page.reload();
    await expect(page.getByTestId("theme-atmosphere")).toHaveAttribute(
      "data-theme",
      theme,
    );
    await expect(page.getByTestId("ambience-audio")).toHaveJSProperty(
      "paused",
      true,
    );
    expect((await readBook(request)).theme).toBe(theme);
    expect(freshPage(await readBook(request), fresh.id).elements).toEqual(
      finalElements,
    );
  });
}

test("all five signature compositions remain visible and uncluttered in a narrow tablet layout without expanding the book scroll area", async ({
  page,
  request,
}, info) => {
  test.setTimeout(150_000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize(viewports[0]);
  const fresh = await densePage(page, request);
  const content = freshPage(await readBook(request), fresh.id).elements;
  await page.setViewportSize({ width: 820, height: 1180 });
  for (const theme of themes) {
    const currentPage = await page.getByTestId("page-indicator").textContent();
    await setTheme(page, theme);
    await expect(page.getByTestId("page-indicator")).toHaveText(currentPage!);
    await atmosphereSafety(page, theme);
    const editing = await signatureMetrics(page);
    if (theme === "campus")
      await page.screenshot({
        path: info.outputPath("campus-editor-820x1180.png"),
        fullPage: true,
      });
    await page
      .getByRole("button", { name: "Done editing", exact: true })
      .click();
    await expect(page.getByTestId("page-indicator")).toHaveText(currentPage!);
    // The narrow layout intentionally mounts a reader suited to panning. Its
    // page indicator can appear before StPageFlip has drawn the initial leaf.
    await expect(page.getByTestId("page-5")).toHaveClass(/--simple/);
    await expect(page.getByTestId("page-5")).toHaveCSS("transform", "none");
    await shadowsSettled(page);
    await atmosphereSafety(page, theme);
    await cleanReading(page);
    const reading = await signatureMetrics(page);
    expect(reading.map((signature) => signature.bounds)).toEqual(
      editing.map((signature) => signature.bounds),
    );
    const geometry = await measurements(page);
    await page.screenshot({
      path: info.outputPath(`${theme}-reading-820x1180.png`),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Present book", exact: true })
      .click();
    await expect(page.getByTestId("theme-atmosphere")).toHaveAttribute(
      "data-mode",
      "presentation",
    );
    await atmosphereSafety(page, theme);
    await cleanReading(page);
    const presentation = await signatureMetrics(page);
    expect(presentation.map((signature) => signature.bounds)).toEqual(
      reading.map((signature) => signature.bounds),
    );
    // Presentation has its own existing outer padding. Compare the scrolling
    // content after that padding and the native page dimensions themselves.
    const presented = await measurements(page);
    expect(presented.scrollContentWidth).toBe(geometry.scrollContentWidth);
    expect(presented.nativeWidth).toBe(geometry.nativeWidth);
    expect(presented.nativeHeight).toBe(geometry.nativeHeight);
    await page.screenshot({
      path: info.outputPath(`${theme}-presentation-820x1180.png`),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Edit scrapbook", exact: true })
      .click();
    expect(freshPage(await readBook(request), fresh.id).elements).toEqual(
      content,
    );
  }
  await page.getByRole("button", { name: "Done editing", exact: true }).click();
  // Narrow screens intentionally use the established pan/navigation controls.
  await page
    .getByRole("button", { name: "Previous pages", exact: true })
    .click();
  await spread(page, 3);
  await page.getByRole("button", { name: "Next pages", exact: true }).click();
  await expect(page.getByTestId("page-indicator")).toContainText("5 – 5");
});

async function motionSettings(page: Page) {
  await page
    .getByRole("button", { name: "Motion settings", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Motion settings",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function closeMotionSettings(page: Page) {
  await page
    .getByRole("button", { name: "Close motion settings", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Motion settings", exact: true }),
  ).not.toBeVisible();
}

async function reduced(page: Page, value: boolean) {
  const layer = page.getByTestId("theme-atmosphere");
  await expect(layer).toHaveAttribute("data-reduced-motion", String(value));
  await signatureSafety(
    page,
    (await layer.getAttribute("data-theme")) as BookTheme,
  );
  if (value || (await layer.getAttribute("data-theme")) === "ivory")
    expect(
      await layer.evaluate(
        (node) =>
          node
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState === "running").length,
      ),
    ).toBe(0);
  else
    await expect
      .poll(() =>
        layer.evaluate(
          (node) =>
            node
              .getAnimations({ subtree: true })
              .filter((animation) => animation.playState === "running").length,
        ),
      )
      .toBeGreaterThan(0);
}

test("user motion preference is keyboard accessible, stays local after refresh, and leaves native physics and presentation available", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await reduced(page, false);
  const prior = await readBook(request);
  const dialog = await motionSettings(page);
  const checkbox = dialog.getByRole("checkbox", {
    name: "Reduce motion",
    exact: true,
  });
  await expect(checkbox).not.toBeChecked();
  await checkbox.focus();
  await page.keyboard.press("Space");
  await expect(checkbox).toBeChecked();
  await reduced(page, true);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), preferenceKey),
  ).toBe("true");
  expect(await readBook(request)).toEqual(prior);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Motion settings", exact: true }),
  ).toBeFocused();
  await page.reload();
  await reduced(page, true);
  await cancelCoverDrag(page, true);
  await nativeDrag(page, true, true);
  await spread(page, 1);
  await cancelCoverDrag(page, false);
  const reader = await page.locator(".flipbook").elementHandle();
  if (!reader) throw new Error("Native reader is missing");
  const geometry = await measurements(page);
  await motionSettings(page);
  await page
    .getByRole("checkbox", { name: "Reduce motion", exact: true })
    .uncheck();
  await reduced(page, false);
  await closeMotionSettings(page);
  expect(await measurements(page)).toEqual(geometry);
  expect(
    await reader.evaluate(
      (node) => node === document.querySelector(".flipbook"),
    ),
  ).toBe(true);
  await nativeDrag(page, true);
  await spread(page, 3);
  await nativeDrag(page, false);
  await spread(page, 1);
  await page.getByRole("button", { name: "Present book", exact: true }).click();
  await motionSettings(page);
  await page
    .getByRole("checkbox", { name: "Reduce motion", exact: true })
    .check();
  await reduced(page, true);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Exit presentation", exact: true }),
  ).toBeVisible();
  await nativeDrag(page, false);
  await closed(page);
  await nativeDrag(page, true, true);
  await spread(page, 1);
  await page.keyboard.press("Escape");
  await cleanReading(page);
});

test("system reduced motion always wins and live OS/cross-tab updates stop effects without remounting the native reader", async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await reduced(page, true);
  const prior = await readBook(request);
  await open(page);
  const reader = await page.locator(".flipbook").elementHandle();
  if (!reader) throw new Error("Native reader is missing");
  const geometry = await measurements(page);
  let dialog = await motionSettings(page);
  await expect(dialog).toContainText(/system|device/i);
  const checkbox = dialog.getByRole("checkbox", {
    name: "Reduce motion",
    exact: true,
  });
  await checkbox.check();
  await checkbox.uncheck();
  await reduced(page, true);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), preferenceKey),
  ).toBe("false");
  await closeMotionSettings(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await reduced(page, false);
  const otherTab = await context.newPage();
  await otherTab.goto("/");
  await otherTab.bringToFront();
  const visibility = await page.evaluate(() => document.visibilityState);
  if (visibility === "hidden") {
    await expect(page.getByTestId("theme-atmosphere")).toHaveAttribute(
      "data-visibility",
      "hidden",
    );
    const animated = page.locator(".atmosphere-particle, .atmosphere-steam");
    expect(await animated.count()).toBeGreaterThan(0);
    await expect
      .poll(() =>
        animated.evaluateAll((nodes) =>
          nodes.every(
            (node) => getComputedStyle(node).animationPlayState === "paused",
          ),
        ),
      )
      .toBe(true);
  }
  await test.info().attach("actual-background-tab-visibility", {
    body: JSON.stringify({
      visibility,
      backgroundPauseChecked: visibility === "hidden",
    }),
    contentType: "application/json",
  });
  await page.bringToFront();
  await expect(page.getByTestId("theme-atmosphere")).toHaveAttribute(
    "data-visibility",
    "visible",
  );
  await reduced(page, false);
  await otherTab.evaluate(
    (key) => localStorage.setItem(key, "true"),
    preferenceKey,
  );
  await reduced(page, true);
  await otherTab.evaluate(
    (key) => localStorage.setItem(key, "false"),
    preferenceKey,
  );
  await reduced(page, false);
  await otherTab.close();
  await page.bringToFront();
  expect(await measurements(page)).toEqual(geometry);
  expect(
    await reader.evaluate(
      (node) => node === document.querySelector(".flipbook"),
    ),
  ).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await reduced(page, true);
  await nativeDrag(page, true);
  await spread(page, 3);
  await nativeDrag(page, false);
  await spread(page, 1);
  await page.reload();
  await reduced(page, true);
  dialog = await motionSettings(page);
  await expect(
    dialog.getByRole("checkbox", { name: "Reduce motion", exact: true }),
  ).not.toBeChecked();
  expect(await readBook(request)).toEqual(prior);
});

async function options(page: Page) {
  await page.getByRole("button", { name: "Book options", exact: true }).click();
  const dialog = page.getByRole("dialog").filter({
    has: page.getByRole("button", { name: "Close book options", exact: true }),
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

function normalizeImageFilenames(
  elements: BookElement[],
  originals: BookElement[],
) {
  return elements.map((element, index) =>
    element.type === "image" && originals[index].type === "image"
      ? { ...element, filename: originals[index].filename }
      : element,
  );
}

function hash(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("theme and a NEW dense page round-trip through export/reset/import while Reduce motion stays on this browser", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const fresh = await densePage(page, request);
  await setTheme(page, "campus");
  await motionSettings(page);
  await page
    .getByRole("checkbox", { name: "Reduce motion", exact: true })
    .check();
  await closeMotionSettings(page);
  await saved(page);
  const prior = await readBook(request);
  const dialog = await options(page);
  const downloadPromise = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Export Book", exact: true })
    .click();
  const download = await downloadPromise;
  const file = await download.path();
  if (!file) throw new Error("Export download is missing");
  const bytes = await readFile(file);
  const decoded = await decodeArchive(bytes);
  expect(decoded.book).toEqual(prior);
  expect(decoded.book).not.toHaveProperty("reduceMotion");
  expect(decoded.book).not.toHaveProperty(preferenceKey);
  await dialog
    .getByRole("button", { name: "Close book options", exact: true })
    .click();
  await motionSettings(page);
  await page
    .getByRole("checkbox", { name: "Reduce motion", exact: true })
    .uncheck();
  await closeMotionSettings(page);
  const resetDialog = await options(page);
  await resetDialog
    .getByRole("button", { name: "Reset Book", exact: true })
    .click();
  await resetDialog
    .getByRole("button", { name: "Reset to sample book", exact: true })
    .click();
  await expect(page.getByTestId("theme-atmosphere")).toHaveAttribute(
    "data-theme",
    "cafe",
  );
  await expect
    .poll(async () =>
      (await readBook(request)).pages.some((item) => item.id === fresh.id),
    )
    .toBe(false);
  await reduced(page, false);
  const importDialog = await options(page);
  await importDialog
    .getByRole("button", { name: "Import Book", exact: true })
    .click();
  await importDialog
    .getByLabel("Import archive", { exact: true })
    .setInputFiles({
      name: download.suggestedFilename(),
      mimeType: "application/zip",
      buffer: bytes,
    });
  await importDialog
    .getByRole("button", { name: "Import and replace", exact: true })
    .click();
  await expect(page.getByTestId("theme-atmosphere")).toHaveAttribute(
    "data-theme",
    "campus",
  );
  await reduced(page, false);
  const restored = await readBook(request);
  expect(restored.theme).toBe("campus");
  const original = freshPage(prior, fresh.id);
  const imported = freshPage(restored, fresh.id);
  expect({
    ...imported,
    elements: normalizeImageFilenames(imported.elements, original.elements),
  }).toEqual(original);
  for (let index = 0; index < imported.elements.length; index++) {
    const result = imported.elements[index];
    const source = original.elements[index];
    if (
      result.type !== "image" ||
      source.type !== "image" ||
      !result.filename ||
      !source.filename
    )
      continue;
    const image = await request.get(`/api/images/${result.filename}`);
    expect(image.ok()).toBeTruthy();
    expect(hash(await image.body())).toBe(
      hash(decoded.images.get(source.filename)!),
    );
  }
  expect(
    await page.evaluate((key) => localStorage.getItem(key), preferenceKey),
  ).toBe("false");
  await page.reload();
  await reduced(page, false);
  await open(page);
  await page
    .getByRole("button", { name: "Edit scrapbook", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: `${imported.title} Page ${String(fresh.number).padStart(2, "0")}`,
      exact: true,
    })
    .click();
  await select(page, fresh.textId);
  await page
    .getByRole("toolbar", { name: "Quick editor actions", exact: true })
    .getByRole("button", { name: "Quick italic", exact: true })
    .click();
  await saved(page);
  await expect
    .poll(async () =>
      freshPage(await readBook(request), fresh.id).elements.find(
        (item) => item.id === fresh.textId,
      ),
    )
    .toMatchObject({ italic: true });
});

test("all five themes survive a new filesystem adapter instance and portable import without adding motion preferences to book data", async () => {
  test.setTimeout(90_000);
  const parent = path.resolve(".test-storage");
  const root = path.join(parent, `.theme-${randomUUID()}`);
  function adapter() {
    const previous = process.env.SCRAPBOOK_STORAGE_DIR;
    process.env.SCRAPBOOK_STORAGE_DIR = root;
    try {
      return new LocalBookStorage();
    } finally {
      if (previous === undefined) delete process.env.SCRAPBOOK_STORAGE_DIR;
      else process.env.SCRAPBOOK_STORAGE_DIR = previous;
    }
  }
  const storage = adapter();
  try {
    let book = await storage.readBook();
    for (const theme of themes) {
      book = await storage.saveBook({ ...book, theme });
      // A new adapter reads only the on-disk snapshot, as a server restart does.
      expect(await adapter().readBook()).toEqual(book);
      const archive = await storage.exportBook(book.revision);
      expect((await decodeArchive(archive)).book.theme).toBe(theme);
      const reset = await storage.resetBook(book.revision);
      expect(reset.book.theme).toBeUndefined();
      const imported = await storage.importBook(archive, reset.book.revision);
      expect(imported.book.theme).toBe(theme);
      expect(imported.book).not.toHaveProperty("reduceMotion");
      expect(await adapter().readBook()).toEqual(imported.book);
      book = imported.book;
    }
  } finally {
    const resolved = path.resolve(root);
    if (
      path.dirname(resolved) !== parent ||
      !/^\.theme-[0-9a-f-]+$/.test(path.basename(resolved))
    )
      throw new Error(
        "Refusing to remove a directory outside theme test storage",
      );
    await rm(resolved, { recursive: true, force: true });
  }
});
