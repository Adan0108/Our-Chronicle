import { expect, test } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { LocalBookStorage } from "../src/lib/storage/local";
import { decodeArchive } from "../src/lib/storage/archive";
import { AUDIO_MAX_BYTES, validateAudio } from "../src/lib/storage/audio";

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

async function cleanup(root: string) {
  const resolved = path.resolve(root);
  if (
    path.dirname(resolved) !== testStorageRoot ||
    !/^\.audio-validation-[0-9a-f-]+$/.test(path.basename(resolved))
  )
    throw new Error(
      "Refusing to remove a directory outside audio test storage",
    );
  await rm(resolved, { recursive: true, force: true });
}

function hash(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function syncsafe(size: number) {
  return Buffer.from([
    (size >>> 21) & 0x7f,
    (size >>> 14) & 0x7f,
    (size >>> 7) & 0x7f,
    size & 0x7f,
  ]);
}

function taggedMp3(
  paddingKind:
    "zero" | "invalid-id" | "payload" | "flags" | "trailing-data" = "zero",
) {
  // Locally generated MPEG-1 Layer III silence, not commercial audio.
  const audio = Buffer.alloc(417 * 20);
  for (let frame = 0; frame < 20; frame++)
    Buffer.from([0xff, 0xfb, 0x90, 0x64]).copy(audio, frame * 417);

  const text = Buffer.concat([
    Buffer.from([3]),
    Buffer.from("Chronicle fixture encoder"),
  ]);
  const frameHeader = Buffer.alloc(10);
  frameHeader.write("TSSE");
  syncsafe(text.length).copy(frameHeader, 4);
  const padding = Buffer.alloc(
    paddingKind === "payload" || paddingKind === "trailing-data" ? 11 : 10,
  );
  if (paddingKind === "invalid-id") padding.write("BAD!");
  if (paddingKind === "payload") syncsafe(1).copy(padding, 4);
  if (paddingKind === "flags") padding[8] = 0x10;
  if (padding.length > 10) padding[10] = 0x41;
  const tag = Buffer.concat([frameHeader, text, padding]);
  const header = Buffer.alloc(10);
  header.write("ID3");
  header[3] = 4;
  syncsafe(tag.length).copy(header, 6);
  return {
    bytes: Buffer.concat([header, tag, audio]),
    tagLength: header.length + tag.length,
  };
}

async function metadata(bytes: Buffer) {
  const { parseBuffer } = await import("music-metadata");
  return parseBuffer(
    bytes,
    { mimeType: "audio/mpeg", size: bytes.length },
    { duration: true, skipCovers: true },
  );
}

test("MP3 with standard ID3v2.4 zero padding uploads and survives persistence, backup and ZIP restoration byte-for-byte", async () => {
  const root = path.join(testStorageRoot, `.audio-validation-${randomUUID()}`);
  const storage = atRoot(root);
  try {
    const initial = await storage.readBook();
    const fixture = taggedMp3();
    const parsed = await metadata(fixture.bytes);
    expect(parsed.format).toMatchObject({
      container: "MPEG",
      codec: "MPEG 1 Layer 3",
      sampleRate: 44_100,
      numberOfChannels: 2,
    });
    expect(parsed.quality.warnings).toContainEqual({
      message: "Invalid ID3v2.4 frame-header-ID: \x00\x00\x00\x00",
    });
    expect(
      (await validateAudio("padded.mp3", fixture.bytes)).duration,
    ).toBeGreaterThan(0);
    const uploaded = await storage.saveAudio(fixture.bytes, "audio/mpeg");
    expect(uploaded.filename).toMatch(/^[0-9a-f-]{36}\.mp3$/);
    const book = await storage.saveBook({
      ...initial,
      audio: {
        filename: uploaded.filename,
        title: "A padded-tag memory",
        volume: 0.25,
        loop: true,
      },
    });
    expect((await atRoot(root).readBook()).audio).toEqual(book.audio);
    expect(hash(await atRoot(root).readAudio(uploaded.filename))).toBe(
      hash(fixture.bytes),
    );

    const archive = await storage.exportBook(book.revision);
    const exported = await decodeArchive(archive);
    expect(hash(exported.audio.get(uploaded.filename)!)).toBe(
      hash(fixture.bytes),
    );
    const reset = await storage.resetBook(book.revision);
    const backup = await decodeArchive(
      await readFile(path.join(root, "backups", reset.backupFilename)),
    );
    expect(backup.book.audio).toEqual(book.audio);
    expect(hash(backup.audio.get(uploaded.filename)!)).toBe(
      hash(fixture.bytes),
    );
    const imported = await storage.importBook(archive, reset.book.revision);
    expect(imported.book.audio!.filename).not.toBe(uploaded.filename);
    expect({ ...imported.book.audio, filename: uploaded.filename }).toEqual(
      book.audio,
    );
    expect(hash(await storage.readAudio(imported.book.audio!.filename))).toBe(
      hash(fixture.bytes),
    );
    expect((await atRoot(root).readBook()).audio).toEqual(imported.book.audio);
    expect(
      hash(await atRoot(root).readAudio(imported.book.audio!.filename)),
    ).toBe(hash(fixture.bytes));
  } finally {
    await cleanup(root);
  }
});

test("padding exemption does not accept spoofed, tag-only, truncated or non-padding invalid ID3 uploads", async () => {
  const root = path.join(testStorageRoot, `.audio-validation-${randomUUID()}`);
  const storage = atRoot(root);
  try {
    await storage.readBook();
    const fixture = taggedMp3();
    const truncated = Buffer.from(fixture.bytes);
    syncsafe(1024 * 1024).copy(truncated, 6);
    const nonPadding = taggedMp3("invalid-id").bytes;
    const parsed = await metadata(nonPadding);
    expect(parsed.format.codec).toBe("MPEG 1 Layer 3");
    expect(parsed.format.duration).toBeGreaterThan(0);
    expect(parsed.quality.warnings).toContainEqual({
      message: "Invalid ID3v2.4 frame-header-ID: BAD!",
    });
    const malformedNulIds = ["payload", "flags", "trailing-data"] as const;
    const malformedPadding = [];
    for (const kind of malformedNulIds) {
      const bytes = taggedMp3(kind).bytes;
      const parsed = await metadata(bytes);
      // These retain real MPEG audio and reproduce the exact exempted warning;
      // the remaining tag bytes prove they are not zero padding.
      expect(parsed.format.codec).toBe("MPEG 1 Layer 3");
      expect(parsed.format.duration).toBeGreaterThan(0);
      expect(parsed.quality.warnings).toContainEqual({
        message: "Invalid ID3v2.4 frame-header-ID: \x00\x00\x00\x00",
      });
      expect(
        parsed.quality.warnings.filter(
          (warning) =>
            /truncat|corrupt|invalid|end.of.file/i.test(warning.message) &&
            warning.message !==
              "Invalid ID3v2.4 frame-header-ID: \x00\x00\x00\x00",
        ),
      ).toEqual([]);
      malformedPadding.push(bytes);
    }
    const secondMalformedTag = Buffer.concat([
      fixture.bytes.subarray(0, fixture.tagLength),
      taggedMp3("payload").bytes,
    ]);
    const secondTagMetadata = await metadata(secondMalformedTag);
    expect(secondTagMetadata.format.codec).toBe("MPEG 1 Layer 3");
    expect(secondTagMetadata.format.duration).toBeGreaterThan(0);
    expect(
      secondTagMetadata.quality.warnings.filter(
        (warning) =>
          warning.message ===
          "Invalid ID3v2.4 frame-header-ID: \x00\x00\x00\x00",
      ),
    ).toHaveLength(2);
    malformedPadding.push(secondMalformedTag);
    const before = await readFile(path.join(root, "book.json"));
    const invalid: [Buffer, string][] = [
      [Buffer.from("not an MP3"), "audio/mpeg"],
      [fixture.bytes, "audio/wav"],
      [fixture.bytes.subarray(0, fixture.tagLength), "audio/mpeg"],
      [truncated, "audio/mpeg"],
      [nonPadding, "audio/mpeg"],
      ...malformedPadding.map((bytes): [Buffer, string] => [
        bytes,
        "audio/mpeg",
      ]),
      [Buffer.alloc(AUDIO_MAX_BYTES + 1), "audio/mpeg"],
    ];
    for (const [bytes, mime] of invalid) {
      await expect(storage.saveAudio(bytes, mime)).rejects.toThrow();
      expect(await readFile(path.join(root, "book.json"))).toEqual(before);
      expect(await readdir(path.join(root, "audio"))).toEqual([]);
    }
  } finally {
    await cleanup(root);
  }
});
