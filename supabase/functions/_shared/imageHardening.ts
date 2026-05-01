// Image hardening helpers — strip metadata + assert pixel budget without
// re-encoding pixels. Pure JS, runs on Deno Edge Runtime without external
// dependencies.
//
// Why no re-encoding ? Re-encoding 10 MB images via WASM (imagescript, sharp)
// costs CPU/memory and can timeout on Edge Runtime free tier. Instead, we
// rewrite the container : keep pixel chunks, drop metadata segments. This is
// fast (a few ms) and lossless on the image data itself.

import { Phase2HttpError } from './phase2Errors.ts';

const DEFAULT_MAX_PIXELS = 16_000_000; // 16 Mpx = ~4096x4096

const JPEG_SOI = 0xff_d8;
const JPEG_EOI = 0xff_d9;
const JPEG_SOS = 0xda;
// Markers we strip : APP1 (EXIF/XMP), APP13 (Photoshop IRB), APP14 (Adobe), COM
const JPEG_STRIPPED_MARKERS = new Set([0xe1, 0xed, 0xee, 0xfe]);
// SOF markers carry width/height (excluding DHT 0xC4, JPG 0xC8, DAC 0xCC)
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf,
]);

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_STRIPPED_CHUNKS = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf']);

const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP_FOURCC = [0x57, 0x45, 0x42, 0x50]; // "WEBP"
const WEBP_STRIPPED_CHUNKS = new Set(['EXIF', 'XMP ']);

function readUint16BE(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32BE(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] * 0x1_00_00_00) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function readUint32LE(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] +
    (bytes[offset + 1] << 8) +
    (bytes[offset + 2] << 16) +
    (bytes[offset + 3] * 0x1_00_00_00)
  );
}

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += String.fromCharCode(bytes[offset + i]);
  }
  return result;
}

function isJpeg(mime: string) {
  return mime === 'image/jpeg' || mime === 'image/jpg';
}

function isPng(mime: string) {
  return mime === 'image/png';
}

function isWebp(mime: string) {
  return mime === 'image/webp';
}

function throwInvalid(detail?: string): never {
  throw new Phase2HttpError(
    400,
    'image_invalid',
    detail ? `Invalid image: ${detail}` : 'Invalid image',
  );
}

function throwUnsupported(mime: string): never {
  throw new Phase2HttpError(
    415,
    'image_format_unsupported',
    `Unsupported image format: ${mime}`,
  );
}

function readJpegDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 4 || readUint16BE(bytes, 0) !== JPEG_SOI) {
    throwInvalid('not a JPEG');
  }
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      throwInvalid('JPEG marker misaligned');
    }
    // Skip fill bytes (0xFF 0xFF...)
    while (bytes[offset + 1] === 0xff) {
      offset += 1;
    }
    const marker = bytes[offset + 1];
    if (marker === JPEG_SOS || marker === (JPEG_EOI & 0xff)) {
      throwInvalid('SOF segment not found before SOS/EOI');
    }
    const segmentLength = readUint16BE(bytes, offset + 2);
    if (JPEG_SOF_MARKERS.has(marker)) {
      const height = readUint16BE(bytes, offset + 5);
      const width = readUint16BE(bytes, offset + 7);
      return { width, height };
    }
    offset += 2 + segmentLength;
  }
  throwInvalid('reached end of stream before SOF');
}

function readPngDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 24) {
    throwInvalid('PNG too short');
  }
  for (let i = 0; i < PNG_MAGIC.length; i += 1) {
    if (bytes[i] !== PNG_MAGIC[i]) {
      throwInvalid('not a PNG');
    }
  }
  // First chunk after magic must be IHDR (8-byte magic + 4-byte length + 4-byte type = 16, then data)
  const chunkType = readAscii(bytes, 12, 4);
  if (chunkType !== 'IHDR') {
    throwInvalid('first chunk is not IHDR');
  }
  const width = readUint32BE(bytes, 16);
  const height = readUint32BE(bytes, 20);
  return { width, height };
}

function readWebpDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 30) {
    throwInvalid('WebP too short');
  }
  for (let i = 0; i < WEBP_RIFF.length; i += 1) {
    if (bytes[i] !== WEBP_RIFF[i]) {
      throwInvalid('not a RIFF container');
    }
  }
  for (let i = 0; i < WEBP_FOURCC.length; i += 1) {
    if (bytes[8 + i] !== WEBP_FOURCC[i]) {
      throwInvalid('not a WEBP container');
    }
  }
  const fourCC = readAscii(bytes, 12, 4);
  if (fourCC === 'VP8 ') {
    // Lossy : after 4-byte size, 3-byte frame tag, 3-byte start code (9D 01 2A),
    // then width and height (14 bits each, little-endian, unsigned)
    const wRaw = bytes[26] | (bytes[27] << 8);
    const hRaw = bytes[28] | (bytes[29] << 8);
    return { width: wRaw & 0x3f_ff, height: hRaw & 0x3f_ff };
  }
  if (fourCC === 'VP8L') {
    // Lossless : after 4-byte size, 1-byte signature 0x2F, then 14+14 bits LE
    if (bytes[20] !== 0x2f) {
      throwInvalid('VP8L bad signature');
    }
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    const width = ((b0 | (b1 << 8)) & 0x3f_ff) + 1;
    const height =
      (((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)) & 0x3f_ff) + 1;
    return { width, height };
  }
  if (fourCC === 'VP8X') {
    // Extended : flags (4 bytes) then canvas_width-1 (3 bytes LE) and canvas_height-1 (3 bytes LE)
    const widthMinusOne =
      bytes[24] | (bytes[25] << 8) | (bytes[26] << 16);
    const heightMinusOne =
      bytes[27] | (bytes[28] << 8) | (bytes[29] << 16);
    return { width: widthMinusOne + 1, height: heightMinusOne + 1 };
  }
  throwInvalid(`unsupported WebP variant ${fourCC}`);
}

export function readImageDimensions(
  bytes: Uint8Array,
  mimeType: string,
): { width: number; height: number } {
  if (isJpeg(mimeType)) {
    return readJpegDimensions(bytes);
  }
  if (isPng(mimeType)) {
    return readPngDimensions(bytes);
  }
  if (isWebp(mimeType)) {
    return readWebpDimensions(bytes);
  }
  throwUnsupported(mimeType);
}

export function assertImageWithinPixelBudget(
  bytes: Uint8Array,
  mimeType: string,
  maxPixels: number = DEFAULT_MAX_PIXELS,
): void {
  const { width, height } = readImageDimensions(bytes, mimeType);
  if (width <= 0 || height <= 0) {
    throwInvalid('non-positive dimensions');
  }
  if (width * height > maxPixels) {
    throw new Phase2HttpError(
      413,
      'image_pixel_budget_exceeded',
      `Image exceeds pixel budget (${width}x${height} > ${maxPixels})`,
    );
  }
}

function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || readUint16BE(bytes, 0) !== JPEG_SOI) {
    throwInvalid('not a JPEG');
  }
  const out: number[] = [0xff, 0xd8];
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      throwInvalid('JPEG marker misaligned');
    }
    while (bytes[offset + 1] === 0xff) {
      offset += 1;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd9) {
      out.push(0xff, 0xd9);
      offset += 2;
      break;
    }
    if (marker === JPEG_SOS) {
      // SOS : copy header + scan data until next non-fill marker (or EOI)
      const segmentLength = readUint16BE(bytes, offset + 2);
      for (let i = 0; i < 2 + segmentLength; i += 1) {
        out.push(bytes[offset + i]);
      }
      let scanCursor = offset + 2 + segmentLength;
      while (scanCursor < bytes.length) {
        const byte = bytes[scanCursor];
        if (
          byte === 0xff &&
          scanCursor + 1 < bytes.length &&
          bytes[scanCursor + 1] !== 0x00 &&
          (bytes[scanCursor + 1] < 0xd0 || bytes[scanCursor + 1] > 0xd7)
        ) {
          // Real marker boundary
          break;
        }
        out.push(byte);
        scanCursor += 1;
      }
      offset = scanCursor;
      continue;
    }
    const segmentLength = readUint16BE(bytes, offset + 2);
    if (JPEG_STRIPPED_MARKERS.has(marker)) {
      offset += 2 + segmentLength;
      continue;
    }
    for (let i = 0; i < 2 + segmentLength; i += 1) {
      out.push(bytes[offset + i]);
    }
    offset += 2 + segmentLength;
  }
  return Uint8Array.from(out);
}

function stripPngMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 8) {
    throwInvalid('PNG too short');
  }
  for (let i = 0; i < PNG_MAGIC.length; i += 1) {
    if (bytes[i] !== PNG_MAGIC[i]) {
      throwInvalid('not a PNG');
    }
  }
  const out: number[] = [];
  for (let i = 0; i < PNG_MAGIC.length; i += 1) {
    out.push(PNG_MAGIC[i]);
  }
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const chunkLength = readUint32BE(bytes, offset);
    const chunkType = readAscii(bytes, offset + 4, 4);
    const chunkTotalSize = 12 + chunkLength; // length(4) + type(4) + data + crc(4)
    if (offset + chunkTotalSize > bytes.length) {
      throwInvalid('PNG chunk overflows stream');
    }
    if (!PNG_STRIPPED_CHUNKS.has(chunkType)) {
      for (let i = 0; i < chunkTotalSize; i += 1) {
        out.push(bytes[offset + i]);
      }
    }
    offset += chunkTotalSize;
    if (chunkType === 'IEND') {
      break;
    }
  }
  return Uint8Array.from(out);
}

function stripWebpMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 12) {
    throwInvalid('WebP too short');
  }
  for (let i = 0; i < WEBP_RIFF.length; i += 1) {
    if (bytes[i] !== WEBP_RIFF[i]) {
      throwInvalid('not a RIFF container');
    }
  }
  for (let i = 0; i < WEBP_FOURCC.length; i += 1) {
    if (bytes[8 + i] !== WEBP_FOURCC[i]) {
      throwInvalid('not a WEBP container');
    }
  }
  const out: number[] = [];
  // Header : RIFF + size placeholder + WEBP. We'll fix size at the end.
  out.push(...WEBP_RIFF);
  out.push(0, 0, 0, 0);
  out.push(...WEBP_FOURCC);

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = readAscii(bytes, offset, 4);
    const chunkSize = readUint32LE(bytes, offset + 4);
    const padded = chunkSize + (chunkSize % 2);
    if (offset + 8 + padded > bytes.length) {
      throwInvalid('WebP chunk overflows stream');
    }
    if (chunkType === 'VP8X') {
      // Copy VP8X but clear EXIF (bit 3) and XMP (bit 2) flags in byte 0 of payload
      for (let i = 0; i < 8; i += 1) {
        out.push(bytes[offset + i]);
      }
      out.push(bytes[offset + 8] & ~0b0_000_1100);
      for (let i = 1; i < padded; i += 1) {
        out.push(bytes[offset + 8 + i]);
      }
      offset += 8 + padded;
      continue;
    }
    if (WEBP_STRIPPED_CHUNKS.has(chunkType)) {
      offset += 8 + padded;
      continue;
    }
    for (let i = 0; i < 8 + padded; i += 1) {
      out.push(bytes[offset + i]);
    }
    offset += 8 + padded;
  }
  // Patch RIFF size = total - 8 (RIFF header + size field excluded from size)
  const newSize = out.length - 8;
  out[4] = newSize & 0xff;
  out[5] = (newSize >> 8) & 0xff;
  out[6] = (newSize >> 16) & 0xff;
  out[7] = (newSize >>> 24) & 0xff;
  return Uint8Array.from(out);
}

export function stripImageMetadata(
  bytes: Uint8Array,
  mimeType: string,
): Uint8Array {
  if (isJpeg(mimeType)) {
    return stripJpegMetadata(bytes);
  }
  if (isPng(mimeType)) {
    return stripPngMetadata(bytes);
  }
  if (isWebp(mimeType)) {
    return stripWebpMetadata(bytes);
  }
  throwUnsupported(mimeType);
}
