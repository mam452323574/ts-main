import {
  assertImageWithinPixelBudget,
  readImageDimensions,
  stripImageMetadata,
} from '@/supabase/functions/_shared/imageHardening';
import { Phase2HttpError } from '@/supabase/functions/_shared/phase2Errors';

function buildJpegWithExif(width: number, height: number): Uint8Array {
  // Minimal JPEG : SOI + APP1(EXIF marker) + SOF0(width,height) + SOS(empty scan) + EOI
  const exifPayload = [
    // "Exif\0\0"
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    // TIFF header (little-endian) + IFD0 offset
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    // 0 IFD entries
    0x00, 0x00,
    // next IFD offset = 0
    0x00, 0x00, 0x00, 0x00,
  ];
  const app1Length = 2 + exifPayload.length; // length includes the length bytes themselves
  const sofPayload = [
    // SOF0 segment : length(2) + precision(1) + height(2) + width(2) + components(1)
    0x08, // precision
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x01, // 1 component
    0x01, 0x11, 0x00, // component spec
  ];
  const sofLength = 2 + sofPayload.length;
  return Uint8Array.from([
    0xff, 0xd8, // SOI
    0xff, 0xe1, // APP1
    (app1Length >> 8) & 0xff,
    app1Length & 0xff,
    ...exifPayload,
    0xff, 0xc0, // SOF0
    (sofLength >> 8) & 0xff,
    sofLength & 0xff,
    ...sofPayload,
    0xff, 0xda, // SOS
    0x00, 0x08, // length
    0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, // minimal SOS payload
    // No actual scan data — go straight to EOI
    0xff, 0xd9, // EOI
  ]);
}

function buildPngWithText(width: number, height: number): Uint8Array {
  const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  function chunk(type: string, data: number[]) {
    const length = data.length;
    const typeBytes = [
      type.charCodeAt(0),
      type.charCodeAt(1),
      type.charCodeAt(2),
      type.charCodeAt(3),
    ];
    return [
      (length >>> 24) & 0xff,
      (length >>> 16) & 0xff,
      (length >>> 8) & 0xff,
      length & 0xff,
      ...typeBytes,
      ...data,
      0, 0, 0, 0, // CRC stub (not validated by parser)
    ];
  }
  const ihdr = chunk('IHDR', [
    (width >>> 24) & 0xff,
    (width >>> 16) & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    (height >>> 24) & 0xff,
    (height >>> 16) & 0xff,
    (height >>> 8) & 0xff,
    height & 0xff,
    0x08, // bit depth
    0x02, // color type (RGB)
    0x00, 0x00, 0x00,
  ]);
  const text = chunk('tEXt', [
    // "GPS\0Lat 48.85"
    0x47, 0x50, 0x53, 0x00,
    0x4c, 0x61, 0x74, 0x20, 0x34, 0x38, 0x2e, 0x38, 0x35,
  ]);
  const idat = chunk('IDAT', [0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01]);
  const iend = chunk('IEND', []);
  return Uint8Array.from([...magic, ...ihdr, ...text, ...idat, ...iend]);
}

function findApp1ExifMarker(bytes: Uint8Array) {
  for (let i = 0; i + 1 < bytes.length; i += 1) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xe1) {
      return i;
    }
  }
  return -1;
}

function findPngChunkType(bytes: Uint8Array, type: string) {
  for (let i = 8; i + 8 <= bytes.length; ) {
    const length =
      (bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3];
    const t = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
    if (t === type) return i;
    i += 12 + length;
  }
  return -1;
}

describe('readImageDimensions', () => {
  it('reads JPEG dimensions from SOF0 segment', () => {
    const img = buildJpegWithExif(320, 240);
    expect(readImageDimensions(img, 'image/jpeg')).toEqual({ width: 320, height: 240 });
  });

  it('reads PNG dimensions from IHDR chunk', () => {
    const img = buildPngWithText(640, 480);
    expect(readImageDimensions(img, 'image/png')).toEqual({ width: 640, height: 480 });
  });

  it('throws image_invalid for malformed JPEG', () => {
    const garbage = Uint8Array.from([0x00, 0x01, 0x02, 0x03]);
    expect(() => readImageDimensions(garbage, 'image/jpeg')).toThrow(Phase2HttpError);
  });

  it('throws image_format_unsupported for unknown mime', () => {
    const img = buildJpegWithExif(10, 10);
    try {
      readImageDimensions(img, 'image/bmp');
      throw new Error('expected throw');
    } catch (error: any) {
      expect(error).toBeInstanceOf(Phase2HttpError);
      expect(error.code).toBe('image_format_unsupported');
    }
  });
});

describe('assertImageWithinPixelBudget', () => {
  it('accepts image within budget', () => {
    const img = buildJpegWithExif(1000, 1000);
    expect(() => assertImageWithinPixelBudget(img, 'image/jpeg', 16_000_000)).not.toThrow();
  });

  it('rejects image exceeding pixel budget', () => {
    const img = buildJpegWithExif(5000, 5000); // 25 Mpx
    try {
      assertImageWithinPixelBudget(img, 'image/jpeg', 16_000_000);
      throw new Error('expected throw');
    } catch (error: any) {
      expect(error).toBeInstanceOf(Phase2HttpError);
      expect(error.code).toBe('image_pixel_budget_exceeded');
    }
  });
});

describe('stripImageMetadata — JPEG', () => {
  it('removes the APP1/EXIF segment', () => {
    const original = buildJpegWithExif(100, 100);
    expect(findApp1ExifMarker(original)).toBeGreaterThanOrEqual(0);

    const sanitized = stripImageMetadata(original, 'image/jpeg');
    expect(findApp1ExifMarker(sanitized)).toBe(-1);
  });

  it('preserves SOI and EOI markers and image dimensions', () => {
    const original = buildJpegWithExif(640, 480);
    const sanitized = stripImageMetadata(original, 'image/jpeg');

    expect(sanitized[0]).toBe(0xff);
    expect(sanitized[1]).toBe(0xd8);
    expect(sanitized[sanitized.length - 2]).toBe(0xff);
    expect(sanitized[sanitized.length - 1]).toBe(0xd9);
    expect(readImageDimensions(sanitized, 'image/jpeg')).toEqual({ width: 640, height: 480 });
  });
});

describe('stripImageMetadata — PNG', () => {
  it('removes tEXt chunks while keeping IHDR/IDAT/IEND', () => {
    const original = buildPngWithText(128, 128);
    expect(findPngChunkType(original, 'tEXt')).toBeGreaterThan(0);

    const sanitized = stripImageMetadata(original, 'image/png');
    expect(findPngChunkType(sanitized, 'tEXt')).toBe(-1);
    expect(findPngChunkType(sanitized, 'IHDR')).toBeGreaterThan(0);
    expect(findPngChunkType(sanitized, 'IDAT')).toBeGreaterThan(0);
    expect(findPngChunkType(sanitized, 'IEND')).toBeGreaterThan(0);
    expect(readImageDimensions(sanitized, 'image/png')).toEqual({ width: 128, height: 128 });
  });
});

describe('stripImageMetadata — error handling', () => {
  it('throws image_format_unsupported for unknown mime', () => {
    const img = buildJpegWithExif(10, 10);
    try {
      stripImageMetadata(img, 'image/gif');
      throw new Error('expected throw');
    } catch (error: any) {
      expect(error).toBeInstanceOf(Phase2HttpError);
      expect(error.code).toBe('image_format_unsupported');
    }
  });

  it('throws image_invalid for non-JPEG bytes claimed as JPEG', () => {
    const fake = Uint8Array.from([0x00, 0x00, 0x00, 0x00]);
    expect(() => stripImageMetadata(fake, 'image/jpeg')).toThrow(Phase2HttpError);
  });
});
