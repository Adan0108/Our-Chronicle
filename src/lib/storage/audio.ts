import { audioNameSchema } from "@/types/book";
import { StorageError } from "./errors";

export const AUDIO_MAX_BYTES = 20 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, "mp3" | "wav" | "ogg"> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "application/ogg": "ogg",
};

export function audioExtension(mime: string) {
  const extension = MIME_EXTENSIONS[mime.toLowerCase()];
  if (!extension)
    throw new StorageError("Choose an MP3, WAV, or Ogg audio file.", 415);
  return extension;
}

export function audioMime(filename: string) {
  if (!audioNameSchema.safeParse(filename).success)
    throw new StorageError("Invalid audio name");
  return filename.endsWith(".wav")
    ? "audio/wav"
    : filename.endsWith(".ogg")
      ? "audio/ogg"
      : "audio/mpeg";
}

function completeContainer(bytes: Buffer, wav: boolean, ogg: boolean) {
  if (wav) {
    const end = bytes.readUInt32LE(4) + 8;
    let offset = 12;
    let hasSamples = false;
    while (offset + 8 <= end) {
      const size = bytes.readUInt32LE(offset + 4);
      if (size > end - offset - 8) return false;
      if (bytes.toString("ascii", offset, offset + 4) === "data" && size)
        hasSamples = true;
      offset += 8 + size + (size % 2);
    }
    return offset === end && hasSamples;
  }
  if (ogg) {
    let offset = 0;
    while (offset < bytes.length) {
      if (
        offset + 27 > bytes.length ||
        bytes.toString("ascii", offset, offset + 4) !== "OggS" ||
        bytes[offset + 4] !== 0
      )
        return false;
      const segments = bytes[offset + 26];
      if (offset + 27 + segments > bytes.length) return false;
      let size = 27 + segments;
      for (let index = 0; index < segments; index++)
        size += bytes[offset + 27 + index];
      if (size > bytes.length - offset) return false;
      offset += size;
    }
    return offset === bytes.length;
  }
  return true;
}

const ZERO_PADDING_WARNING = /^Invalid ID3v2\.4 frame-header-ID: \x00{4}$/;

function id3v24ZeroPaddingWarnings(bytes: Buffer) {
  if (
    bytes.length < 10 ||
    bytes.toString("ascii", 0, 3) !== "ID3" ||
    bytes[3] !== 4 ||
    (bytes[5] & 0x10) !== 0
  )
    return 0;

  function syncsafe(offset: number, end: number) {
    if (offset + 4 > end) return undefined;
    let size = 0;
    for (let index = offset; index < offset + 4; index++) {
      if (bytes[index] & 0x80) return undefined;
      size = size * 128 + bytes[index];
    }
    return size;
  }

  const tagSize = syncsafe(6, bytes.length);
  if (tagSize === undefined || tagSize > bytes.length - 10) return 0;
  const end = 10 + tagSize;
  let offset = 10;
  if (bytes[5] & 0x40) {
    const extendedSize = syncsafe(offset, end);
    if (
      extendedSize === undefined ||
      extendedSize < 6 ||
      extendedSize > end - offset
    )
      return 0;
    offset += extendedSize;
  }
  // Skip frame contents; inspect only bounded headers and the padding bytes.
  while (offset + 10 <= end) {
    if (bytes.readUInt32BE(offset) === 0)
      return bytes.subarray(offset, end).every((byte) => byte === 0)
        ? Math.floor((end - offset) / 10)
        : 0;
    const frameSize = syncsafe(offset + 4, end);
    if (frameSize === undefined || frameSize > end - offset - 10) return 0;
    offset += 10 + frameSize;
  }
  return 0;
}

export async function validateAudio(filename: string, bytes: Buffer) {
  const mimeType = audioMime(filename);
  if (!bytes.length || bytes.length > AUDIO_MAX_BYTES)
    throw new StorageError("Audio files must be smaller than 20 MB.", 413);
  const wav = mimeType === "audio/wav";
  const ogg = mimeType === "audio/ogg";
  const signature = wav
    ? bytes.length >= 44 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WAVE" &&
      bytes.readUInt32LE(4) + 8 <= bytes.length
    : ogg
      ? bytes.length >= 28 && bytes.toString("ascii", 0, 4) === "OggS"
      : bytes.length >= 4 &&
        (bytes.toString("ascii", 0, 3) === "ID3" ||
          (bytes[0] === 0xff && (bytes[1] & 0xe6) === 0xe2));
  if (!signature || !completeContainer(bytes, wav, ogg))
    throw new StorageError("The audio contents do not match its file type.");
  try {
    const { parseBuffer } = await import("music-metadata");
    const metadata = await parseBuffer(
      bytes,
      { mimeType, size: bytes.length },
      { duration: true, skipCovers: true },
    );
    const { format } = metadata;
    const container = wav ? "WAVE" : ogg ? "Ogg" : "MPEG";
    const codec = format.codec ?? "";
    const paddingWarnings = metadata.quality.warnings.filter((warning) =>
      ZERO_PADDING_WARNING.test(warning.message),
    ).length;
    const zeroPadding =
      paddingWarnings > 0 &&
      paddingWarnings === id3v24ZeroPaddingWarnings(bytes);
    if (
      format.container !== container ||
      !format.sampleRate ||
      !format.numberOfChannels ||
      !format.duration ||
      !Number.isFinite(format.duration) ||
      format.duration <= 0 ||
      (!wav && !ogg && !/Layer 3/i.test(codec)) ||
      (ogg && !/Vorbis|Opus/i.test(codec)) ||
      metadata.quality.warnings.some((warning) => {
        // Exempt the parser's empty-frame warning only for verified zero
        // padding, never a malformed NUL ID with nonzero size/flags/payload.
        const padding =
          zeroPadding && ZERO_PADDING_WARNING.test(warning.message);
        return (
          !padding &&
          /truncat|corrupt|invalid|end.of.file/i.test(warning.message)
        );
      })
    )
      throw new Error("Unreadable audio stream");
    return { duration: format.duration };
  } catch {
    throw new StorageError(
      "This audio cannot be read. Use a valid MP3, WAV, or Ogg (Vorbis/Opus) file under 20 MB.",
    );
  }
}
