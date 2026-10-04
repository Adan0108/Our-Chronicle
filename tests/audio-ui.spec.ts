import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import yauzl from "yauzl";
import { createSampleBook } from "../src/lib/storage/sample";
import type { Book } from "../src/types/book";

const fixtureRoot = path.resolve("tests/fixtures/audio");

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

function wav() {
  const sampleRate = 16_000;
  const frames = sampleRate * 4;
  const bytes = Buffer.alloc(44 + frames * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(frames * 2, 40);
  for (let index = 0; index < frames; index++)
    bytes.writeInt16LE(
      Math.round(Math.sin((index / sampleRate) * Math.PI * 2 * 220) * 1200),
      44 + index * 2,
    );
  return bytes;
}

function syncSafe(value: number) {
  return Buffer.from([
    (value >>> 21) & 0x7f,
    (value >>> 14) & 0x7f,
    (value >>> 7) & 0x7f,
    value & 0x7f,
  ]);
}

async function paddedMp3() {
  const original = await readFile(path.join(fixtureRoot, "sfx.mp3"));
  expect(original.subarray(0, 3).toString()).toBe("ID3");
  const oldTagSize = original
    .subarray(6, 10)
    .reduce((size, byte) => (size << 7) | (byte & 0x7f), 0);
  const audio = original.subarray(10 + oldTagSize);
  const text = Buffer.concat([Buffer.from([0]), Buffer.from("Lavf58.20.100")]);
  const frame = Buffer.concat([
    Buffer.from("TSSE"),
    syncSafe(text.length),
    Buffer.alloc(2),
    text,
  ]);
  const metadata = Buffer.concat([frame, Buffer.alloc(10)]);
  return Buffer.concat([
    Buffer.from([0x49, 0x44, 0x33, 4, 0, 0]),
    syncSafe(metadata.length),
    metadata,
    audio,
  ]);
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

async function freshPage(page: Page, request: APIRequestContext) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open scrapbook", exact: true })
    .click();
  await firstSpread(page);
  await page
    .getByRole("button", { name: "Edit scrapbook", exact: true })
    .click();
  const count = (await readBook(request)).pages.length;
  await page.getByRole("button", { name: "Add page", exact: true }).click();
  await expect
    .poll(async () => (await readBook(request)).pages.length)
    .toBe(count + 1);
  await saved(page);
  return (await readBook(request)).pages.at(-1)!;
}

async function settings(page: Page) {
  await page
    .getByRole("button", { name: "Music settings", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Music and ambience",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function closeSettings(page: Page) {
  await page
    .getByRole("button", { name: "Close ambience", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Music and ambience", exact: true }),
  ).not.toBeVisible();
}

async function upload(
  page: Page,
  request: APIRequestContext,
  name: string,
  mimeType: string,
  buffer: Buffer,
  replace = false,
) {
  const prior = (await readBook(request)).audio?.filename;
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/audio") &&
      response.request().method() === "POST",
  );
  await page
    .getByLabel(replace ? "Replace audio" : "Upload audio", { exact: true })
    .setInputFiles({ name, mimeType, buffer });
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  await expect
    .poll(async () => (await readBook(request)).audio?.filename)
    .not.toBe(prior);
  await saved(page);
  const track = (await readBook(request)).audio!;
  const audio = page.getByTestId("ambience-audio");
  await expect(audio).toHaveCount(1);
  await expect(audio).toHaveJSProperty("paused", true);
  await expect(audio).toHaveJSProperty("currentTime", 0);
  await expect(page.getByTestId("music-playback-status")).toHaveText("Paused");
  expect(track.volume).toBe(0.4);
  await expect(audio).toHaveJSProperty("volume", 0.4);
  await expect(page.getByLabel("Ambience volume", { exact: true })).toHaveValue(
    "40",
  );
  return track;
}

async function playing(page: Page) {
  const audio = page.getByTestId("ambience-audio");
  await expect(audio).toHaveJSProperty("paused", false);
  await expect(page.getByTestId("music-playback-status")).toHaveText("Playing");
  await expect
    .poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime))
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      audio.evaluate((node: HTMLAudioElement) =>
        Number.isFinite(node.duration),
      ),
    )
    .toBeTruthy();
  expect(
    await audio.evaluate((node: HTMLAudioElement) => ({
      readyState: node.readyState,
      duration: node.duration,
      error: node.error?.code ?? null,
    })),
  ).toMatchObject({ error: null });
  await expect(page.locator(".ambience-error")).toHaveCount(0);
}

const formats = [
  { name: "real LAME MP3", filename: "sfx.mp3", mime: "audio/mpeg" },
  { name: "real Vorbis Ogg", filename: "sfx.ogg", mime: "audio/ogg" },
  { name: "generated PCM WAV", filename: "tone.wav", mime: "audio/wav" },
  {
    name: "real MP3 with ID3v2.4 zero padding",
    filename: "padded-real-track.mp3",
    mime: "audio/mpeg",
  },
];

for (const format of formats) {
  test(`${format.name} uploads, decodes, never autoplays and supports explicit play/pause/resume`, async ({
    page,
    request,
  }) => {
    await freshPage(page, request);
    await expect(page.getByTestId("music-playback-status")).toHaveText(
      "Not configured",
    );
    await expect(
      page.getByRole("button", { name: "Play music", exact: true }),
    ).toBeDisabled();
    const dialog = await settings(page);
    const bytes = format.filename.endsWith(".wav")
      ? wav()
      : format.filename.startsWith("padded-")
        ? await paddedMp3()
        : await readFile(path.join(fixtureRoot, format.filename));
    const track = await upload(
      page,
      request,
      format.filename,
      format.mime,
      bytes,
    );
    const stored = await request.get(`/api/audio/${track.filename}`);
    expect(stored.ok()).toBeTruthy();
    expect(await stored.body()).toEqual(bytes);
    await dialog
      .getByRole("button", { name: "Play ambience", exact: true })
      .click();
    await playing(page);
    await dialog
      .getByRole("button", { name: "Pause ambience", exact: true })
      .click();
    await expect(page.getByTestId("ambience-audio")).toHaveJSProperty(
      "paused",
      true,
    );
    await expect(page.getByTestId("music-playback-status")).toHaveText(
      "Paused",
    );
    await closeSettings(page);
    await page.getByRole("button", { name: "Play music", exact: true }).click();
    await playing(page);
    await page
      .getByRole("button", { name: "Pause music", exact: true })
      .click();
    await page.reload();
    await expect(page.getByTestId("ambience-audio")).toHaveJSProperty(
      "paused",
      true,
    );
    await expect(page.getByTestId("ambience-audio")).toHaveJSProperty(
      "volume",
      0.4,
    );
    expect((await readBook(request)).audio).toEqual(track);
  });
}

test("renamed non-audio is rejected without replacing the playing track or its saved volume", async ({
  page,
  request,
}) => {
  await freshPage(page, request);
  const dialog = await settings(page);
  await upload(page, request, "valid-track.wav", "audio/wav", wav());
  await dialog.getByLabel("Ambience volume", { exact: true }).fill("18");
  await expect
    .poll(async () => (await readBook(request)).audio?.volume)
    .toBe(0.18);
  await saved(page);
  const before = await readBook(request);
  const audio = page.getByTestId("ambience-audio");
  const original = await audio.elementHandle();
  if (!original) throw new Error("Original media is missing");
  await dialog
    .getByRole("button", { name: "Play ambience", exact: true })
    .click();
  await playing(page);
  const rejected = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/audio") &&
      response.request().method() === "POST",
  );
  await dialog.getByLabel("Replace audio", { exact: true }).setInputFiles({
    name: "renamed.mp3",
    mimeType: "audio/mpeg",
    buffer: Buffer.from("This is text rather than encoded audio."),
  });
  expect((await rejected).status()).toBe(400);
  await expect(dialog.getByRole("alert")).toContainText(/audio|MP3|read/i);
  await saved(page);
  expect(await readBook(request)).toEqual(before);
  await expect(audio).toHaveJSProperty("volume", 0.18);
  await expect(audio).toHaveJSProperty("paused", false);
  await expect(page.getByTestId("music-playback-status")).toHaveText("Playing");
  expect(
    await original.evaluate(
      (node) =>
        node === document.querySelector('[data-testid="ambience-audio"]'),
    ),
  ).toBeTruthy();
  await closeSettings(page);
  await page.getByRole("button", { name: "Pause music", exact: true }).click();
});

test("percentage volume handles mute and full volume without disturbing the fresh page selection; new track selections start at 40%", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const fresh = await freshPage(page, request);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByLabel("Text content", { exact: true })
    .fill("A new musical memory");
  await saved(page);
  const textId = (await readBook(request)).pages
    .find((item) => item.id === fresh.id)!
    .elements.at(-1)!.id;
  const selected = page.getByTestId(`element-${textId}`);
  await expect(selected).toHaveClass(/selected-element/);
  const dialog = await settings(page);
  await upload(page, request, "first-tone.wav", "audio/wav", wav());
  const audio = page.getByTestId("ambience-audio");
  const original = await audio.elementHandle();
  if (!original) throw new Error("Uploaded media is missing");
  const slider = dialog.getByLabel("Ambience volume", { exact: true });
  await expect(slider).toHaveAttribute("min", "0");
  await expect(slider).toHaveAttribute("max", "100");
  await expect(slider).toHaveAttribute("step", "1");
  for (const percent of [0, 10, 40, 75, 100]) {
    await slider.fill(String(percent));
    await expect(slider).toHaveValue(String(percent));
    await expect(slider).toHaveAttribute("aria-valuetext", `${percent}%`);
    await expect(dialog.locator("output")).toHaveText(`${percent}%`);
    await expect(audio).toHaveJSProperty("volume", percent / 100);
    await expect
      .poll(async () => (await readBook(request)).audio?.volume)
      .toBe(percent / 100);
    await saved(page);
    await expect(selected).toHaveClass(/selected-element/);
    expect(
      await original.evaluate(
        (node) =>
          node === document.querySelector('[data-testid="ambience-audio"]'),
      ),
    ).toBeTruthy();
  }
  await slider.fill("0");
  await expect
    .poll(async () => (await readBook(request)).audio?.volume)
    .toBe(0);
  await upload(
    page,
    request,
    "new-selection.mp3",
    "audio/mpeg",
    await paddedMp3(),
    true,
  );
  await expect(selected).toHaveClass(/selected-element/);
  expect(await original.evaluate((node: HTMLAudioElement) => node.paused)).toBe(
    true,
  );
  await slider.fill("18");
  await expect
    .poll(async () => (await readBook(request)).audio?.volume)
    .toBe(0.18);
  await upload(
    page,
    request,
    "another-selection.ogg",
    "audio/ogg",
    await readFile(path.join(fixtureRoot, "sfx.ogg")),
    true,
  );
  await expect(selected).toHaveClass(/selected-element/);
  await closeSettings(page);
});

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
            entries.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

async function options(page: Page) {
  await page.getByRole("button", { name: "Book options", exact: true }).click();
  const dialog = page.getByRole("dialog").filter({
    has: page.getByRole("button", { name: "Close book options", exact: true }),
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName("Keep your memories safe");
  return dialog;
}

async function drag(page: Page, forward: boolean, opening = false) {
  await page.mouse.move(20, 30);
  if (opening) {
    await expect(
      page.getByRole("button", { name: "Open scrapbook", exact: true }),
    ).toHaveClass(/--simple/);
    await expect(page.locator(".book-spread")).toHaveCSS(
      "transform",
      "matrix(1, 0, 0, 1, -220, 0)",
    );
  } else {
    await expect(page.locator(".book-spread")).toHaveCSS("transform", "none");
  }
  const box = await (
    opening ? page.locator(".native-cover") : page.locator(".book-spread")
  ).boundingBox();
  if (!box) throw new Error("Native book is missing");
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

for (const persistedVolume of [0, 0.18]) {
  test(`saved volume ${persistedVolume} survives load, refresh and portable import with exact real MP3 bytes; native cover and presentation retain playback`, async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const fresh = await freshPage(page, request);
    await page.getByRole("button", { name: "Text", exact: true }).click();
    await page
      .getByLabel("Text content", { exact: true })
      .fill(`A fresh page at volume ${persistedVolume}`);
    await saved(page);
    await settings(page);
    const bytes = await paddedMp3();
    const track = await upload(
      page,
      request,
      "padded-import-track.mp3",
      "audio/mpeg",
      bytes,
    );
    await page
      .getByLabel("Ambience volume", { exact: true })
      .fill(String(persistedVolume * 100));
    await expect
      .poll(async () => (await readBook(request)).audio?.volume)
      .toBe(persistedVolume);
    await saved(page);
    await closeSettings(page);
    await page
      .getByRole("button", { name: "Done editing", exact: true })
      .click();
    await page.reload();
    const audio = page.getByTestId("ambience-audio");
    await expect(audio).toHaveJSProperty("paused", true);
    await expect(audio).toHaveJSProperty("currentTime", 0);
    await expect(audio).toHaveJSProperty("volume", persistedVolume);
    const dialog = await settings(page);
    await expect(
      dialog.getByLabel("Ambience volume", { exact: true }),
    ).toHaveValue(String(persistedVolume * 100));
    await closeSettings(page);
    const prior = await readBook(request);
    const menu = await options(page);
    const downloadPromise = page.waitForEvent("download");
    await menu
      .getByRole("button", { name: "Export Book", exact: true })
      .click();
    const download = await downloadPromise;
    const downloadedPath = await download.path();
    if (!downloadedPath) throw new Error("Export download is missing");
    const archive = await readFile(downloadedPath);
    const entries = await unpack(archive);
    expect(JSON.parse(entries.get("book.json")!.toString())).toEqual(prior);
    expect(digest(entries.get(`audio/${track.filename}`)!)).toBe(digest(bytes));
    await menu.getByRole("button", { name: "Reset Book", exact: true }).click();
    await menu
      .getByRole("button", { name: "Reset to sample book", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Open scrapbook", exact: true }),
    ).toBeVisible();
    await expect(audio).toHaveCount(0);
    expect((await readBook(request)).audio).toBeUndefined();
    const restore = await options(page);
    await restore
      .getByRole("button", { name: "Import Book", exact: true })
      .click();
    await restore.getByLabel("Import archive", { exact: true }).setInputFiles({
      name: download.suggestedFilename(),
      mimeType: "application/zip",
      buffer: archive,
    });
    await restore
      .getByRole("button", { name: "Import and replace", exact: true })
      .click();
    await expect(audio).toHaveCount(1);
    await expect(audio).toHaveJSProperty("paused", true);
    await expect(audio).toHaveJSProperty("currentTime", 0);
    await expect(audio).toHaveJSProperty("volume", persistedVolume);
    const restored = await readBook(request);
    expect({ ...restored.audio, filename: track.filename }).toEqual({
      ...track,
      volume: persistedVolume,
    });
    expect(restored.audio!.filename).not.toBe(track.filename);
    expect(restored.pages.find((item) => item.id === fresh.id)).toEqual(
      prior.pages.find((item) => item.id === fresh.id),
    );
    const response = await request.get(
      `/api/audio/${restored.audio!.filename}`,
    );
    expect(response.ok()).toBeTruthy();
    expect(digest(await response.body())).toBe(digest(bytes));
    await page.reload();
    await expect(audio).toHaveJSProperty("paused", true);
    await expect(audio).toHaveJSProperty("volume", persistedVolume);
    const originalAudio = await audio.elementHandle();
    if (!originalAudio) throw new Error("Imported media is missing");
    await page.getByRole("button", { name: "Play music", exact: true }).click();
    await playing(page);
    await page
      .getByRole("button", { name: "Present book", exact: true })
      .click();
    await drag(page, true, true);
    await firstSpread(page);
    for (let turn = 0; turn < 2; turn++) {
      await drag(page, true);
      await expect(page.getByTestId("page-indicator")).toContainText("3 – 4");
      await drag(page, false);
      await firstSpread(page);
    }
    await drag(page, false);
    await expect(page.getByTestId("page-indicator")).toHaveCount(0);
    await expect(page.locator(".book-spread")).toHaveCSS(
      "transform",
      "matrix(1, 0, 0, 1, -220, 0)",
    );
    await playing(page);
    await page
      .getByRole("button", { name: "Open scrapbook", exact: true })
      .click();
    await firstSpread(page);
    await playing(page);
    expect(
      await originalAudio.evaluate(
        (node) =>
          node === document.querySelector('[data-testid="ambience-audio"]'),
      ),
    ).toBeTruthy();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Present book", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Pause music", exact: true })
      .click();
    await expect(audio).toHaveJSProperty("paused", true);
    const importedSettings = await settings(page);
    await expect(
      importedSettings.getByLabel("Ambience volume", { exact: true }),
    ).toHaveValue(String(persistedVolume * 100));
  });
}
