import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { createSampleBook } from "../src/lib/storage/sample";
import type { Book } from "../src/types/book";

test.beforeEach(async ({ request }) => {
  const current: Book = await (await request.get("/api/book")).json();
  const response = await request.put("/api/book", {
    data: { ...createSampleBook(), revision: current.revision },
  });
  expect(response.ok()).toBeTruthy();
});
async function open(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open scrapbook", exact: true })
    .click();
  await expect(page.getByTestId("page-indicator")).toContainText("1 – 2");
}
async function saved(page: Page) {
  await expect(page.getByRole("status")).toHaveText("Saved on this device");
}

test("opens the cover, turns pages with buttons, click, and mouse drag", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Open scrapbook", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("cover.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Open scrapbook", exact: true })
    .click();
  await expect(page.getByTestId("page-1")).toBeVisible();
  await expect(page.getByTestId("page-2")).toBeVisible();
  await expect(page.getByTestId("page-1").getByRole("img")).toHaveJSProperty(
    "complete",
    true,
  );
  await expect(page.getByTestId("page-1").getByRole("img")).toHaveJSProperty(
    "naturalWidth",
    900,
  );
  await page.screenshot({
    path: testInfo.outputPath("spread.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Next pages" }).click();
  await expect(page.getByTestId("page-indicator")).toContainText("3 – 4");
  await page.getByRole("button", { name: "Previous pages" }).click();
  await expect(page.getByTestId("page-indicator")).toContainText("1 – 2");
  await page.waitForTimeout(700); // Wait for page-flip physics to settle before a direct page click.
  await page.getByTestId("page-2").click({ position: { x: 425, y: 285 } });
  await expect(page.getByTestId("page-indicator")).toContainText("3 – 4");
  await page.getByRole("button", { name: "Previous pages" }).click();
  await expect(page.getByTestId("page-indicator")).toContainText("1 – 2");
  await page.waitForTimeout(700);
  const rect = await page.getByTestId("page-2").boundingBox();
  if (!rect) throw new Error("Page is missing");
  await page.mouse.move(rect.x + 433, rect.y + 570);
  await page.mouse.down();
  await page.mouse.move(rect.x - 160, rect.y + 420, { steps: 30 });
  await page.mouse.up();
  await expect(page.getByTestId("page-indicator")).toContainText("3 – 4");
  expect(errors).toEqual([]);
});

test("edits text, persists after refresh, adds and deletes text", async ({
  page,
  request,
}, testInfo) => {
  await open(page);
  await page
    .getByRole("button", { name: "Edit scrapbook", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit text: The little things", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Text content" })
    .fill("Our favorite slow mornings");
  await saved(page);
  await page.screenshot({
    path: testInfo.outputPath("editor.png"),
    fullPage: true,
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Open scrapbook", exact: true })
    .click();
  await expect(page.getByTestId("page-1")).toContainText(
    "Our favorite slow mornings",
  );
  await page
    .getByRole("button", { name: "Edit scrapbook", exact: true })
    .click();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Text content" })
    .fill("Keep this little note");
  await saved(page);
  expect(
    (await (await request.get("/api/book")).json()).pages[0].elements.some(
      (e: { text?: string }) => e.text === "Keep this little note",
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Delete text", exact: true }).click();
  await saved(page);
  await expect(page.getByTestId("page-1")).not.toContainText(
    "Keep this little note",
  );
});

test("corner hover stays stable through repeated forward and backward drags", async ({
  page,
}, testInfo) => {
  await open(page);
  // Exercise classic, space-consuming scrollbars even in headless Chromium.
  await page.addStyleTag({
    content: `.spread-scroll { scrollbar-width: auto; } .spread-scroll::-webkit-scrollbar { height: 14px; }`,
  });
  const originalReader = await page.locator(".flipbook").elementHandle();
  if (!originalReader) throw new Error("Reader missing");
  for (let cycle = 0; cycle < 5; cycle++) {
    for (const direction of ["forward", "backward"] as const) {
      await page.mouse.move(400, 200);
      const rect = await page.locator(".book-spread").boundingBox();
      if (!rect) throw new Error("Book spread missing");
      const forward = direction === "forward";
      const bottom = cycle % 2 === 0;
      const x = rect.x + (forward ? rect.width - 8 : 8);
      const y = rect.y + (bottom ? rect.height - 8 : 8);
      await page.mouse.move(x, y, { steps: 10 });
      const hover = await page.evaluate(async () => {
        const viewport = document.querySelector<HTMLElement>(".spread-scroll")!;
        const reader = document.querySelector(".flipbook");
        const start = {
          width: viewport.clientWidth,
          height: viewport.clientHeight,
        };
        let readerReplacements = 0;
        let overflowFrames = 0;
        let resizedFrames = 0;
        // Sample the actual corner animation, including intermediate scrollbar/layout changes.
        await new Promise<void>((resolve) => {
          let frames = 0;
          const sample = () => {
            if (reader !== document.querySelector(".flipbook"))
              readerReplacements++;
            if (viewport.scrollWidth > viewport.clientWidth + 1)
              overflowFrames++;
            if (
              viewport.clientWidth !== start.width ||
              viewport.clientHeight !== start.height
            )
              resizedFrames++;
            if (++frames === 24) resolve();
            else requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        });
        return { readerReplacements, overflowFrames, resizedFrames };
      });
      expect(hover).toEqual({
        readerReplacements: 0,
        overflowFrames: 0,
        resizedFrames: 0,
      });
      expect(
        await originalReader.evaluate((node) => node.isConnected),
      ).toBeTruthy();
      await expect(
        page.getByRole("button", { name: "Show right page", exact: true }),
      ).toHaveCount(0);
      if (cycle === 0)
        await page.screenshot({
          path: testInfo.outputPath(`${direction}-corner.png`),
        });
      // Release on the opposite side of the spine, committing the turn.
      await page.mouse.down();
      await page.mouse.move(
        rect.x + (forward ? 230 : rect.width - 230),
        rect.y + (bottom ? rect.height - 140 : 140),
        { steps: 35 },
      );
      await page.mouse.up();
      await expect(page.getByTestId("page-indicator")).toContainText(
        forward ? "3 – 4" : "1 – 2",
      );
      expect(
        await originalReader.evaluate((node) => node.isConnected),
      ).toBeTruthy();
    }
  }
});

test("uploads, drags, resizes, replaces, refreshes, and deletes an image", async ({
  page,
  request,
}) => {
  const bytes = await sharp({
    create: { width: 300, height: 200, channels: 3, background: "#a4ae85" },
  })
    .png()
    .toBuffer();
  await open(page);
  await page
    .getByRole("button", { name: "Edit scrapbook", exact: true })
    .click();
  await page.getByLabel("Upload image", { exact: true }).setInputFiles({
    name: "../../untrusted-name.png",
    mimeType: "image/png",
    buffer: bytes,
  });
  await page
    .getByRole("textbox", { name: "Photo caption" })
    .fill("A photograph from our test");
  await saved(page);
  let book: Book = await (await request.get("/api/book")).json();
  const uploaded = book.pages[0].elements.find(
    (el) => el.type === "image" && el.caption === "A photograph from our test",
  );
  expect(uploaded?.type).toBe("image");
  if (!uploaded || uploaded.type !== "image")
    throw new Error("Uploaded image missing");
  expect(uploaded.filename).toMatch(/^[a-f0-9-]{36}\.webp$/);
  const selected = page.getByTestId("page-1").locator(".selected-element");
  const rect = await selected.boundingBox();
  if (!rect) throw new Error("Selected photo missing");
  await page.mouse.move(rect.x + 100, rect.y + 90);
  await page.mouse.down();
  await page.mouse.move(rect.x + 122, rect.y + 118, { steps: 8 });
  await page.mouse.up();
  await saved(page);
  book = await (await request.get("/api/book")).json();
  const dragged = book.pages[0].elements.find((el) => el.id === uploaded.id)!;
  expect(dragged.x).toBeGreaterThan(uploaded.x);
  expect(dragged.y).toBeGreaterThan(uploaded.y);
  const moved = await selected.boundingBox();
  if (!moved) throw new Error("Moved photo missing");
  await page.mouse.move(moved.x + moved.width - 1, moved.y + moved.height - 1);
  await page.mouse.down();
  await page.mouse.move(
    moved.x + moved.width + 24,
    moved.y + moved.height + 20,
    { steps: 8 },
  );
  await page.mouse.up();
  await saved(page);
  book = await (await request.get("/api/book")).json();
  expect(
    book.pages[0].elements.find((el) => el.id === uploaded.id)!.width,
  ).toBeGreaterThan(dragged.width);
  await page.reload();
  await page
    .getByRole("button", { name: "Open scrapbook", exact: true })
    .click();
  await expect(
    page
      .getByTestId("page-1")
      .getByRole("img", { name: "A photograph from our test" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit scrapbook", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Select image: A photograph from our test",
      exact: true,
    })
    .click();
  await page.getByLabel("Replace image", { exact: true }).setInputFiles({
    name: "replacement.png",
    mimeType: "image/png",
    buffer: bytes,
  });
  await saved(page);
  book = await (await request.get("/api/book")).json();
  const replaced = book.pages[0].elements.find((el) => el.id === uploaded.id);
  expect(
    replaced?.type === "image" && replaced.filename !== uploaded.filename,
  ).toBeTruthy();
  expect((await request.get(`/api/images/${uploaded.filename}`)).status()).toBe(
    404,
  );
  await page.getByRole("button", { name: "Delete image", exact: true }).click();
  await saved(page);
  await page.reload();
  await page
    .getByRole("button", { name: "Open scrapbook", exact: true })
    .click();
  await expect(
    page
      .getByTestId("page-1")
      .getByRole("img", { name: "A photograph from our test" }),
  ).toHaveCount(0);
  if (replaced?.type === "image")
    expect(
      (await request.get(`/api/images/${replaced.filename}`)).status(),
    ).toBe(404);
});

test("adds and deletes a page and changes cover details", async ({ page }) => {
  await open(page);
  await page
    .getByRole("button", { name: "Edit scrapbook", exact: true })
    .click();
  await page.getByRole("button", { name: "Add page", exact: true }).click();
  await expect(page.getByTestId("page-indicator")).toHaveText("5 – 5 of 5");
  await page
    .getByRole("textbox", { name: "Page name", exact: true })
    .fill("Our autumn adventures");
  await saved(page);
  await page.reload();
  await page
    .getByRole("button", { name: "Edit scrapbook", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Our autumn adventures Page 05" })
    .click();
  await page.getByRole("button", { name: "Delete selected page" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete page", exact: true })
    .click();
  await saved(page);
  await expect(
    page.getByRole("navigation", { name: "Book pages" }).getByRole("button"),
  ).toHaveCount(4);
  await page.getByText("Book cover details", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Book title", exact: true })
    .fill("Our little world");
  await page
    .getByRole("textbox", { name: "Subtitle", exact: true })
    .fill("Memories from a beautiful ordinary life");
  await saved(page);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Open scrapbook", exact: true }),
  ).toContainText("Our little world");
});

test("rejects malformed books, stale edits, forged images, oversized files and cross-origin writes", async ({
  request,
}) => {
  const book: Book = await (await request.get("/api/book")).json();
  expect(
    (await request.put("/api/book", { data: { ...book, pages: [] } })).status(),
  ).toBe(400);
  const response = await request.put("/api/book", {
    data: { ...book, title: "New revision" },
  });
  expect(response.ok()).toBeTruthy();
  expect((await request.put("/api/book", { data: book })).status()).toBe(409);
  expect(
    (
      await request.put("/api/book", {
        data: book,
        headers: { Origin: "https://untrusted.example" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/images", {
        multipart: {
          image: {
            name: "bad.svg",
            mimeType: "image/svg+xml",
            buffer: Buffer.from("<svg></svg>"),
          },
        },
      })
    ).status(),
  ).toBe(415);
  expect(
    (
      await request.post("/api/images", {
        multipart: {
          image: {
            name: "fake.png",
            mimeType: "image/png",
            buffer: Buffer.from("not an image"),
          },
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/images", {
        multipart: {
          image: {
            name: "large.png",
            mimeType: "image/png",
            buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
          },
        },
      })
    ).status(),
  ).toBe(413);
  expect((await request.delete("/api/images/sample-coffee.jpg")).status()).toBe(
    409,
  );
});

test("rapid edits stay saved and stale tabs show an explicit conflict", async ({
  page,
  context,
  request,
}) => {
  await open(page);
  await page
    .getByRole("button", { name: "Edit scrapbook", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit text: The little things", exact: true })
    .click();
  for (const text of ["First draft", "Second draft", "The final memory"])
    await page.getByRole("textbox", { name: "Text content" }).fill(text);
  await saved(page);
  const second = await context.newPage();
  await open(second);
  await second
    .getByRole("button", { name: "Edit scrapbook", exact: true })
    .click();
  await second
    .getByRole("button", { name: "Edit text: The final memory", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Text content" })
    .fill("A newer memory");
  await saved(page);
  await second
    .getByRole("textbox", { name: "Text content" })
    .fill("An outdated memory");
  await expect(
    second.getByRole("alert", { name: "Scrapbook message" }),
  ).toContainText("changed in another tab");
  expect(
    (await (await request.get("/api/book")).json()).pages[0].elements.find(
      (e: { id: string }) => e.id === "t2",
    ).text,
  ).toBe("A newer memory");
  second.on("dialog", (dialog) => dialog.accept());
  await second.close();
});

test("mobile can view both pages, edit the right page, and verify its save", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expect(page.getByRole("status")).toBeVisible();
  await page
    .getByRole("button", { name: "Show right page", exact: true })
    .click();
  const region = page.getByRole("region", { name: "Book spread" });
  await expect
    .poll(() => region.evaluate((node) => node.scrollLeft))
    .toBeGreaterThan(400);
  await page.screenshot({
    path: testInfo.outputPath("mobile-right-page.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Edit scrapbook", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Edit text: A Sunday kind of love",
      exact: true,
    })
    .click();
  await page
    .getByRole("textbox", { name: "Text content" })
    .fill("Sunday, kept close");
  await saved(page);
  await page.screenshot({
    path: testInfo.outputPath("mobile-editor.png"),
    fullPage: true,
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Open scrapbook", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Show right page", exact: true })
    .click();
  await expect(page.getByTestId("page-2")).toContainText("Sunday, kept close");
  await page
    .getByRole("button", { name: "Show left page", exact: true })
    .click();
  await expect.poll(() => region.evaluate((node) => node.scrollLeft)).toBe(0);
  await page.getByRole("button", { name: "Next pages" }).click();
  await expect(page.getByTestId("page-indicator")).toContainText("3 – 4");
  await page
    .getByRole("button", { name: "Edit scrapbook", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Scrapbook editor" }),
  ).toBeVisible();
});

test("laptop editor displays the complete spread without horizontal clipping", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await open(page);
  await page
    .getByRole("button", { name: "Edit scrapbook", exact: true })
    .click();
  const region = page.getByRole("region", { name: "Book spread" });
  await expect
    .poll(() => region.evaluate((node) => node.scrollWidth - node.clientWidth))
    .toBeLessThanOrEqual(1);
  await page
    .getByRole("button", { name: "Edit text: The little things", exact: true })
    .click();
  await page.screenshot({
    path: testInfo.outputPath("laptop-editor.png"),
    fullPage: true,
  });
  const pageBox = await page.getByTestId("page-2").boundingBox();
  const regionBox = await region.boundingBox();
  expect(
    pageBox &&
      regionBox &&
      pageBox.x + pageBox.width <= regionBox.x + regionBox.width,
  ).toBeTruthy();
});
