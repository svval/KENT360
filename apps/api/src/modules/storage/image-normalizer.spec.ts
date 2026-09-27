import sharp from 'sharp';
import { AppException } from '../../common/errors/app.exception';
import {
  animatedWebp,
  corruptJpeg,
  hugeDimensionPng,
  jpegWithMetadata,
  metadataTraces,
  plainImage,
  pngWithMetadata,
  webpWithMetadata,
} from '../../../test/support/images';
import { IMAGE_LIMITS, normalizeImage } from './image-normalizer';

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return 'resolved';
  } catch (error) {
    return error instanceof AppException ? `${error.getStatus()} ${error.code}` : String(error);
  }
};

describe('normalizeImage', () => {
  it('fixtures really carry metadata (the test would be meaningless otherwise)', async () => {
    expect(await metadataTraces(await jpegWithMetadata())).toEqual(
      expect.arrayContaining([
        'exif',
        'xmp',
        'orientation=6',
        'bytes:KENT360-TEST-CAM',
        'bytes:Exif',
      ]),
    );
    expect(await metadataTraces(await pngWithMetadata())).toEqual(
      expect.arrayContaining(['exif', 'xmp']),
    );
    expect(await metadataTraces(await webpWithMetadata())).toEqual(
      expect.arrayContaining(['exif', 'xmp']),
    );
  });

  it('strips EXIF, GPS and XMP from a JPEG and applies its orientation to the pixels', async () => {
    const out = await normalizeImage(await jpegWithMetadata(), 'image/jpeg');
    expect(out.kind.mimeType).toBe('image/jpeg');
    expect(await metadataTraces(out.buffer)).toEqual([]);

    // Stored 40×20 with Orientation 6 → upright 20×40, red (former left half) on top.
    expect([out.width, out.height]).toEqual([20, 40]);
    const { data, info } = await sharp(out.buffer).raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) =>
      Array.from(data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3));
    const [r1, , b1] = pixel(10, 5);
    const [r2, , b2] = pixel(10, 35);
    expect(r1).toBeGreaterThan(200);
    expect(b1).toBeLessThan(60);
    expect(b2).toBeGreaterThan(200);
    expect(r2).toBeLessThan(60);
  });

  it.each([
    ['image/png', pngWithMetadata],
    ['image/webp', webpWithMetadata],
  ] as const)('re-encodes %s without metadata, keeping the format', async (type, make) => {
    const out = await normalizeImage(await make(), type);
    expect(out.kind.mimeType).toBe(type);
    expect(await metadataTraces(out.buffer)).toEqual([]);
    expect((await sharp(out.buffer).metadata()).format).toBe(type.split('/')[1]);
  });

  it.each(['jpeg', 'png', 'webp'] as const)('accepts a plain %s', async (format) => {
    const out = await normalizeImage(await plainImage(format), `image/${format}`);
    expect([out.width, out.height]).toEqual([64, 48]);
  });

  it('downscales very large photos to the output edge, never enlarging', async () => {
    const out = await normalizeImage(await plainImage('jpeg', 6000, 3000), 'image/jpeg');
    expect([out.width, out.height]).toEqual([IMAGE_LIMITS.outputMaxEdge, 2048]);
  });

  it('refuses dimensions above the limits from the header alone', async () => {
    const started = Date.now();
    expect(await codeOf(normalizeImage(hugeDimensionPng(), 'image/png'))).toBe(
      '413 IMAGE_DIMENSIONS_TOO_LARGE',
    );
    expect(Date.now() - started).toBeLessThan(2000); // nothing was decoded
    expect(await codeOf(normalizeImage(hugeDimensionPng(13_000, 100), 'image/png'))).toBe(
      '413 IMAGE_DIMENSIONS_TOO_LARGE',
    );
  });

  it('refuses corrupt, spoofed, mismatched and animated files', async () => {
    expect(await codeOf(normalizeImage(await corruptJpeg(), 'image/jpeg'))).toBe(
      '400 INVALID_IMAGE',
    );
    expect(await codeOf(normalizeImage(Buffer.from('GIF89a......'), 'image/jpeg'))).toBe(
      '415 UNSUPPORTED_MEDIA_TYPE',
    );
    expect(await codeOf(normalizeImage(await plainImage('png'), 'image/jpeg'))).toBe(
      '415 UNSUPPORTED_MEDIA_TYPE',
    );
    expect(
      await codeOf(normalizeImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), 'image/jpeg')),
    ).toBe('400 INVALID_IMAGE');
    expect(await codeOf(normalizeImage(await animatedWebp(), 'image/webp'))).toBe(
      '415 UNSUPPORTED_MEDIA_TYPE',
    );
  });
});
