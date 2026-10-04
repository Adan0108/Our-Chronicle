import { expect, test } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import yazl from "yazl";
import {
  archiveVersion,
  decodeArchive,
  referencedImages,
} from "../src/lib/storage/archive";
import { LocalBookStorage } from "../src/lib/storage/local";
import { resolveCover } from "../src/lib/cover";
import {
  bookSchema,
  type Book,
  type BookPage,
  type ImageElement,
} from "../src/types/book";

const testStorageRoot = path.resolve(".test-storage");

function atRoot(root: string) {
  const previous = process.env.SCRAPBOOK_STORAGE_DIR;
  process.env.SCRAPBOOK_STORAGE_DIR = root;
  try {
    return new LocalBookStorage();
  } finally {
    if (previous === undefined) delete process.env.SCRAPBOOK_STORAGE_DIR;
    else process.env.SCRAPBOOK_STORAGE_DIR = previous;
  }
}

function isolatedStorage() {
  const root = path.join(testStorageRoot, `.experience-${randomUUID()}`);
  return { root, storage: atRoot(root) };
}

async function cleanup(root: string) {
  const resolved = path.resolve(root);
  if (
    path.dirname(resolved) !== testStorageRoot ||
    !/^\.experience-[0-9a-f-]+$/.test(path.basename(resolved))
  )
    throw new Error(
      "Refusing to remove a directory outside experience test storage",
    );
  await rm(resolved, { recursive: true, force: true });
}

function hash(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function wav() {
  // A genuine one-second, 8 kHz mono PCM tone, generated locally without assets.
  const frames = 8_000;
  const bytes = Buffer.alloc(44 + frames * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(frames, 24);
  bytes.writeUInt32LE(frames * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(frames * 2, 40);
  for (let index = 0; index < frames; index++)
    bytes.writeInt16LE(
      Math.round(Math.sin((index / frames) * Math.PI * 2 * 220) * 1200),
      44 + index * 2,
    );
  return bytes;
}

function mp3() {
  // Half a second of MPEG-1 Layer III frames with zero side/main data is silence.
  const bytes = Buffer.alloc(417 * 20);
  for (let frame = 0; frame < 20; frame++)
    Buffer.from([0xff, 0xfb, 0x90, 0x64]).copy(bytes, frame * 417);
  return bytes;
}

function ogg() {
  const head = Buffer.alloc(19);
  head.write("OpusHead");
  head[8] = 1;
  head[9] = 1;
  head.writeUInt32LE(48_000, 12);
  const tags = Buffer.alloc(16);
  tags.write("OpusTags");
  const packets = [head, tags, Buffer.from([0xf8, 0xff, 0xfe])];
  return Buffer.concat(
    packets.map((packet, index) => {
      const bytes = Buffer.alloc(28 + packet.length);
      bytes.write("OggS");
      bytes[5] = index === 0 ? 2 : index === 2 ? 4 : 0;
      bytes.writeBigUInt64LE(BigInt(index === 2 ? 960 : 0), 6);
      bytes.writeUInt32LE(42, 14);
      bytes.writeUInt32LE(index, 18);
      bytes[26] = 1;
      bytes[27] = packet.length;
      packet.copy(bytes, 28);
      let crc = 0;
      for (const byte of bytes) {
        crc ^= byte << 24;
        for (let bit = 0; bit < 8; bit++)
          crc = (crc << 1) ^ (crc & 0x80000000 ? 0x04c11db7 : 0);
      }
      bytes.writeUInt32LE(crc >>> 0, 22);
      return bytes;
    }),
  );
}

async function transparent(format: "png" | "webp") {
  const width = 64;
  const height = 48;
  const pixels = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    pixels[index * 4] = 160;
    pixels[index * 4 + 1] = 78;
    pixels[index * 4 + 2] = 99;
    pixels[index * 4 + 3] = index % 3 === 0 ? 0 : index % 3 === 1 ? 128 : 255;
  }
  const image = sharp(pixels, { raw: { width, height, channels: 4 } });
  return {
    bytes:
      format === "png"
        ? await image.png().toBuffer()
        : await image.webp({ lossless: true }).toBuffer(),
    alpha: Buffer.from(pixels.filter((_, index) => index % 4 === 3)),
  };
}

async function expectAlpha(bytes: Buffer, alpha: Buffer) {
  expect((await sharp(bytes).metadata()).hasAlpha).toBe(true);
  const pixels = await sharp(bytes).ensureAlpha().raw().toBuffer();
  expect(Buffer.from(pixels.filter((_, index) => index % 4 === 3))).toEqual(
    alpha,
  );
  expect(alpha.includes(0)).toBe(true);
  expect(alpha.includes(128)).toBe(true);
  expect(alpha.includes(255)).toBe(true);
}

function photo(id: string, filename: string, decoration = false): ImageElement {
  return {
    id,
    type: "image",
    filename,
    kind: decoration ? "decoration" : "photo",
    caption: decoration ? "" : "A fresh framed photo",
    frame: decoration ? "borderless" : "paper",
    x: 60,
    y: 140,
    width: 160,
    height: 130,
    rotation: -12,
    crop: { x: 10, y: 5, width: 80, height: 85 },
    locked: true,
  };
}

async function makeArchive(
  book: unknown,
  images: Map<string, Buffer>,
  audio: Map<string, Buffer>,
  version: number,
) {
  const zip = new yazl.ZipFile();
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    zip.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on("error", reject);
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
  });
  zip.addBuffer(Buffer.from(JSON.stringify(book)), "book.json");
  zip.addBuffer(
    Buffer.from(
      JSON.stringify({
        format: "our-chronicle",
        formatVersion: version,
        exportedAt: new Date().toISOString(),
      }),
    ),
    "manifest.json",
  );
  for (const [filename, bytes] of images)
    zip.addBuffer(bytes, `images/${filename}`);
  for (const [filename, bytes] of audio)
    zip.addBuffer(bytes, `audio/${filename}`);
  zip.end();
  return output;
}

test("fresh page transparency, transforms, stickers, theme and audio survive restart, backup, reset and import", async () => {
  const { root, storage } = isolatedStorage();
  try {
    const initial = await storage.readBook();
    const png = await transparent("png");
    const webp = await transparent("webp");
    const pngFile = await storage.saveImage(png.bytes, "image/png");
    const webpFile = await storage.saveImage(webp.bytes, "image/webp");
    const jpeg = await sharp({
      create: { width: 100, height: 80, channels: 3, background: "#a2805b" },
    })
      .jpeg()
      .toBuffer();
    const jpegFile = await storage.saveImage(jpeg, "image/jpeg");
    await expectAlpha(await storage.readImage(pngFile.filename), png.alpha);
    await expectAlpha(await storage.readImage(webpFile.filename), webp.alpha);
    expect(
      (await sharp(await storage.readImage(jpegFile.filename)).metadata())
        .hasAlpha,
    ).toBe(false);
    const audioFile = await storage.saveAudio(wav(), "audio/wav");
    const fresh: BookPage = {
      id: `experience-page-${randomUUID()}`,
      title: "A new memory in layers",
      paper: "cream",
      elements: [
        photo("fresh-opaque-photo", jpegFile.filename),
        photo("fresh-transparent-decoration", pngFile.filename, true),
        {
          id: "fresh-sticker",
          type: "sticker",
          asset: "coffee",
          color: "#805b45",
          label: "our café",
          x: 240,
          y: 80,
          width: 100,
          height: 80,
          rotation: 14,
          locked: true,
        },
        {
          ...photo("fresh-duplicate-decoration", pngFile.filename, true),
          x: 230,
          y: 350,
          rotation: 8,
        },
        {
          ...photo("fresh-transparent-webp", webpFile.filename, true),
          x: 250,
          y: 180,
        },
        {
          id: "fresh-styled-text",
          type: "text",
          text: "Keep the little things",
          style: "handwritten",
          fontFamily: "handwritten",
          fontSize: 22,
          color: "#5c4937",
          bold: true,
          italic: true,
          align: "center",
          x: 40,
          y: 40,
          width: 300,
          height: 40,
          rotation: -3,
        },
      ],
    };
    const cover = resolveCover(initial);
    const book = await storage.saveBook({
      ...initial,
      theme: "wedding",
      audio: {
        filename: audioFile.filename,
        title: "Our local ambience",
        volume: 0.3,
        loop: true,
      },
      cover: {
        ...cover,
        elements: [
          ...cover.elements,
          { ...fresh.elements[2], id: "fresh-cover-sticker" },
        ],
      },
      pages: [...initial.pages, fresh],
    });
    expect(await atRoot(root).readBook()).toEqual(book);
    expect(archiveVersion(book)).toBe(3);
    const archive = await storage.exportBook(book.revision);
    const exported = await decodeArchive(archive);
    expect(exported.book).toEqual(book);
    expect(hash(exported.audio.get(audioFile.filename)!)).toBe(hash(wav()));
    await expectAlpha(exported.images.get(pngFile.filename)!, png.alpha);
    await expectAlpha(exported.images.get(webpFile.filename)!, webp.alpha);
    const reset = await storage.resetBook(book.revision);
    expect(reset.book.theme).toBeUndefined();
    expect(reset.book.audio).toBeUndefined();
    expect(reset.book.cover).toBeUndefined();
    expect(reset.book.pages.some((page) => page.id === fresh.id)).toBe(false);
    const backup = await decodeArchive(
      await readFile(path.join(root, "backups", reset.backupFilename)),
    );
    expect(backup.book).toEqual(book);
    expect(hash(backup.audio.get(audioFile.filename)!)).toBe(hash(wav()));
    await expectAlpha(backup.images.get(pngFile.filename)!, png.alpha);
    const imported = await storage.importBook(archive, reset.book.revision);
    const restored = imported.book.pages.at(-1)!;
    expect(restored.id).toBe(fresh.id);
    expect(imported.book.theme).toBe("wedding");
    expect(imported.book.cover).toEqual(book.cover);
    expect({ ...imported.book.audio, filename: audioFile.filename }).toEqual(
      book.audio,
    );
    expect(imported.book.audio!.filename).not.toBe(audioFile.filename);
    expect(hash(await storage.readAudio(imported.book.audio!.filename))).toBe(
      hash(wav()),
    );
    for (let index = 0; index < fresh.elements.length; index++) {
      const original = fresh.elements[index];
      const result = restored.elements[index];
      expect(
        result.type === "image" && original.type === "image"
          ? { ...result, filename: original.filename }
          : result,
      ).toEqual(original);
    }
    const pngRestored = restored.elements[1] as ImageElement;
    const duplicated = restored.elements[3] as ImageElement;
    const webpRestored = restored.elements[4] as ImageElement;
    expect(duplicated.filename).toBe(pngRestored.filename);
    expect(pngRestored.filename).not.toBe(pngFile.filename);
    await expectAlpha(
      await storage.readImage(pngRestored.filename!),
      png.alpha,
    );
    await expectAlpha(
      await storage.readImage(webpRestored.filename!),
      webp.alpha,
    );
    expect(await atRoot(root).readBook()).toEqual(imported.book);
    const activeImages = (
      await readdir(path.join(root, "images"), { withFileTypes: true })
    )
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
    expect(activeImages).toEqual([...referencedImages(imported.book)].sort());
    expect(
      (await readdir(path.join(root, "audio"), { withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name),
    ).toEqual([imported.book.audio!.filename]);
  } finally {
    await cleanup(root);
  }
});

test("audio validates real containers, prevents unsafe operations and recovers removal through history", async () => {
  const { root, storage } = isolatedStorage();
  try {
    const initial = await storage.readBook();
    for (const [bytes, mime, extension] of [
      [wav(), "audio/wav", ".wav"],
      [mp3(), "audio/mpeg", ".mp3"],
      [ogg(), "audio/ogg", ".ogg"],
    ] as const) {
      const uploaded = await storage.saveAudio(bytes, mime);
      expect(uploaded.filename).toMatch(
        new RegExp(`^[0-9a-f-]{36}\\${extension}$`),
      );
      expect(uploaded.duration).toBeGreaterThan(0);
      expect(hash(await storage.readAudio(uploaded.filename))).toBe(
        hash(bytes),
      );
      await storage.deleteAudio(uploaded.filename);
    }
    const before = await readdir(path.join(root, "audio"));
    const truncated = wav().subarray(0, 100);
    for (const [bytes, mime] of [
      [Buffer.from("not audio"), "audio/mpeg"],
      [wav(), "audio/mpeg"],
      [truncated, "audio/wav"],
      [Buffer.from("OggS"), "audio/ogg"],
      [Buffer.alloc(20 * 1024 * 1024 + 1), "audio/wav"],
      [wav(), "application/octet-stream"],
    ] as const)
      await expect(storage.saveAudio(bytes, mime)).rejects.toThrow();
    expect(await readdir(path.join(root, "audio"))).toEqual(before);
    await expect(storage.readAudio("../book.json")).rejects.toThrow(
      "Invalid audio name",
    );
    await expect(storage.deleteAudio("../book.json")).rejects.toThrow(
      "Invalid audio name",
    );
    const uploaded = await storage.saveAudio(wav(), "audio/wav");
    const configured = await storage.saveBook({
      ...initial,
      audio: {
        filename: uploaded.filename,
        title: "A local tone",
        volume: 0.4,
        loop: false,
      },
    });
    await expect(storage.deleteAudio(uploaded.filename)).rejects.toMatchObject({
      status: 409,
    });
    const removed = await storage.saveBook({ ...configured, audio: undefined });
    await expect(storage.readAudio(uploaded.filename)).rejects.toMatchObject({
      status: 404,
    });
    expect(
      hash(
        await readFile(path.join(root, "audio", ".trash", uploaded.filename)),
      ),
    ).toBe(hash(wav()));
    const recovered = await storage.saveBook({
      ...removed,
      audio: configured.audio,
    });
    expect(recovered.audio).toEqual(configured.audio);
    expect(hash(await storage.readAudio(uploaded.filename))).toBe(hash(wav()));
    expect(await atRoot(root).readBook()).toEqual(recovered);
  } finally {
    await cleanup(root);
  }
});

test("audio trash is bounded and never exported", async () => {
  const { root, storage } = isolatedStorage();
  try {
    const initial = await storage.readBook();
    const uploaded = await storage.saveAudio(wav(), "audio/wav");
    const configured = await storage.saveBook({
      ...initial,
      audio: {
        filename: uploaded.filename,
        title: "Local audio",
        volume: 0.2,
        loop: true,
      },
    });
    const removed = await storage.saveBook({ ...configured, audio: undefined });
    const directory = path.join(root, "audio", ".trash");
    for (let index = 0; index < 103; index++)
      await writeFile(path.join(directory, `retained-${index}.wav`), wav(), {
        flag: "wx",
      });
    const expired = path.join(directory, "expired.wav");
    await writeFile(expired, wav(), { flag: "wx" });
    const old = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);
    await utimes(expired, old, old);
    const saved = await storage.saveBook(removed);
    const files = await readdir(directory);
    expect(files).toHaveLength(100);
    expect(files).not.toContain("expired.wav");
    expect(
      (await decodeArchive(await storage.exportBook(saved.revision))).audio
        .size,
    ).toBe(0);
  } finally {
    await cleanup(root);
  }
});

test("failed final import commit rolls back staged audio and retains an exact playable safety backup", async () => {
  const { root, storage } = isolatedStorage();
  try {
    const initial = await storage.readBook();
    const uploaded = await storage.saveAudio(wav(), "audio/wav");
    const book = await storage.saveBook({
      ...initial,
      audio: {
        filename: uploaded.filename,
        title: "Safe ambience",
        volume: 0.2,
        loop: false,
      },
    });
    const archive = await storage.exportBook(book.revision);
    const before = await readFile(path.join(root, "book.json"));
    const beforeImages = (await readdir(path.join(root, "images"))).sort();
    const boundary = storage as unknown as {
      atomicWrite: (incoming: Book) => Promise<void>;
    };
    const originalWrite = boundary.atomicWrite;
    let stagedAudio: string[] = [];
    boundary.atomicWrite = async () => {
      stagedAudio = (await readdir(path.join(root, "audio"))).filter(
        (filename) =>
          filename.endsWith(".wav") && filename !== uploaded.filename,
      );
      throw new Error("Injected audio commit failure");
    };
    try {
      await expect(storage.importBook(archive, book.revision)).rejects.toThrow(
        "Injected audio commit failure",
      );
    } finally {
      boundary.atomicWrite = originalWrite;
    }
    expect(stagedAudio).toHaveLength(1);
    expect(await readFile(path.join(root, "book.json"))).toEqual(before);
    expect((await readdir(path.join(root, "images"))).sort()).toEqual(
      beforeImages,
    );
    expect(await readdir(path.join(root, "audio"))).toEqual([
      uploaded.filename,
    ]);
    expect(
      (await readdir(root)).some((name) => name.startsWith(".incoming-")),
    ).toBe(false);
    expect(hash(await storage.readAudio(uploaded.filename))).toBe(hash(wav()));
    const backups = await readdir(path.join(root, "backups"));
    expect(backups).toHaveLength(1);
    const backup = await decodeArchive(
      await readFile(path.join(root, "backups", backups[0])),
    );
    expect(backup.book).toEqual(book);
    expect(hash(backup.audio.get(uploaded.filename)!)).toBe(hash(wav()));
  } finally {
    await cleanup(root);
  }
});

test("archive versions and invalid audio payloads are rejected before any replacement", async () => {
  const { root, storage } = isolatedStorage();
  try {
    const initial = await storage.readBook();
    const legacy = await decodeArchive(
      await storage.exportBook(initial.revision),
    );
    expect(archiveVersion(initial)).toBe(1);
    const withCover = { ...initial, cover: resolveCover(initial) };
    expect(archiveVersion(withCover)).toBe(2);
    const configured: Book = {
      ...withCover,
      theme: "cafe",
      audio: {
        filename: "local-audio.wav",
        title: "Local audio",
        volume: 0.5,
        loop: true,
      },
    };
    expect(bookSchema.safeParse(configured).success).toBe(true);
    expect(
      bookSchema.safeParse({
        ...configured,
        audio: { ...configured.audio, volume: 2 },
      }).success,
    ).toBe(false);
    expect(
      bookSchema.safeParse({
        ...configured,
        audio: { ...configured.audio, filename: "../outside.wav" },
      }).success,
    ).toBe(false);
    expect(archiveVersion(configured)).toBe(3);
    const audio = new Map([["local-audio.wav", wav()]]);
    const invalid = [
      await makeArchive(configured, legacy.images, audio, 1),
      await makeArchive(configured, legacy.images, audio, 2),
      await makeArchive(configured, legacy.images, audio, 4),
      await makeArchive(configured, legacy.images, new Map(), 3),
      await makeArchive(
        configured,
        legacy.images,
        new Map([["local-audio.wav", Buffer.from("invalid WAV")]]),
        3,
      ),
      await makeArchive(
        {
          ...configured,
          audio: { ...configured.audio, filename: "local-audio.mp3" },
        },
        legacy.images,
        new Map([["local-audio.mp3", wav()]]),
        3,
      ),
      await makeArchive(initial, legacy.images, audio, 1),
      await makeArchive(
        configured,
        legacy.images,
        new Map([
          ["local-audio.wav", wav()],
          ["unused.wav", wav()],
        ]),
        3,
      ),
    ];
    const before = await readFile(path.join(root, "book.json"));
    const beforeImages = (await readdir(path.join(root, "images"))).sort();
    for (const archive of invalid) {
      await expect(
        storage.importBook(archive, initial.revision),
      ).rejects.toThrow();
      expect(await readFile(path.join(root, "book.json"))).toEqual(before);
      expect((await readdir(path.join(root, "images"))).sort()).toEqual(
        beforeImages,
      );
      expect(await readdir(path.join(root, "audio"))).toEqual([]);
      expect(
        (await readdir(root)).filter(
          (name) => name === "backups" || name.startsWith(".incoming-"),
        ),
      ).toEqual([]);
    }
  } finally {
    await cleanup(root);
  }
});
