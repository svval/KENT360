import { HttpStatus } from '@nestjs/common';
import sharp, { type Metadata } from 'sharp';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { declaredTypeMatches, detectImageKind, type ImageKind } from './image-signature';

/**
 * Upload image policy (SECURITY.md §5).
 *
 * Bytes from users are never stored as received. Every image is:
 *   1. identified by its file signature (declared Content-Type must agree);
 *   2. checked from its header only – dimensions and frame count – BEFORE any pixel is
 *      decoded (decompression-bomb guard);
 *   3. fully decoded (corrupt / truncated data is rejected);
 *   4. auto-oriented from EXIF, then downscaled to OUTPUT_MAX_EDGE (never enlarged);
 *   5. re-encoded in its own format with NO metadata: EXIF (incl. GPS), XMP, IPTC,
 *      comments and ICC profiles are not copied (pixels are converted to sRGB).
 *
 * The output format equals the input format (JPEG→JPEG, PNG→PNG, WebP→WebP): PNG/WebP
 * transparency survives and the declared type never changes behind the user's back.
 * All three are safe to render in browsers once re-encoded.
 */
export const IMAGE_LIMITS = {
  /** Header-reported width × height above this is refused without decoding. */
  maxInputPixels: 40_000_000,
  /** Either side above this is refused (e.g. 40 000 × 1 strips). */
  maxInputEdge: 12_000,
  /** Longest edge of the stored image. */
  outputMaxEdge: 4096,
} as const;

export interface NormalizedImage {
  buffer: Buffer;
  kind: ImageKind;
  width: number;
  height: number;
}

const SHARP_FORMAT: Record<ImageKind['mimeType'], string> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const unsupported = (index: number) =>
  new AppException(
    ErrorCode.UNSUPPORTED_MEDIA_TYPE,
    'Yalnızca JPEG, PNG veya WEBP fotoğraf yüklenebilir.',
    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    { index },
  );

const invalid = (index: number) =>
  new AppException(
    ErrorCode.INVALID_IMAGE,
    'Fotoğraf okunamadı; dosya bozuk veya eksik olabilir.',
    HttpStatus.BAD_REQUEST,
    { index },
  );

/**
 * Validates and normalises one uploaded image. `index` is echoed in error details so
 * the client can tell which file failed.
 */
export async function normalizeImage(
  input: Buffer,
  declaredType: string,
  index = 0,
): Promise<NormalizedImage> {
  const kind = detectImageKind(input.subarray(0, 16));
  if (!kind || !declaredTypeMatches(declaredType, kind)) throw unsupported(index);

  // Header only – no pixel decoding yet.
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: false }).metadata();
  } catch {
    throw invalid(index);
  }
  if (meta.format !== SHARP_FORMAT[kind.mimeType]) throw unsupported(index);
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 1 || height < 1) throw invalid(index);
  if (
    width * height > IMAGE_LIMITS.maxInputPixels ||
    width > IMAGE_LIMITS.maxInputEdge ||
    height > IMAGE_LIMITS.maxInputEdge
  ) {
    throw new AppException(
      ErrorCode.IMAGE_DIMENSIONS_TOO_LARGE,
      `Fotoğraf çözünürlüğü çok yüksek (en fazla ${IMAGE_LIMITS.maxInputPixels / 1_000_000} megapiksel, kenar başına ${IMAGE_LIMITS.maxInputEdge} piksel).`,
      HttpStatus.PAYLOAD_TOO_LARGE,
      { index, width, height },
    );
  }
  if ((meta.pages ?? 1) > 1) {
    throw new AppException(
      ErrorCode.UNSUPPORTED_MEDIA_TYPE,
      'Hareketli görüntüler (animasyonlu WEBP/PNG) desteklenmiyor. Tek kare bir fotoğraf yükleyin.',
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      { index },
    );
  }

  try {
    const pipeline = sharp(input, {
      limitInputPixels: IMAGE_LIMITS.maxInputPixels,
      failOn: 'error',
      sequentialRead: true,
      animated: false,
    })
      .rotate() // apply EXIF orientation to the pixels; the tag itself is not written back
      .resize({
        width: IMAGE_LIMITS.outputMaxEdge,
        height: IMAGE_LIMITS.outputMaxEdge,
        fit: 'inside',
        withoutEnlargement: true,
      });
    // No withMetadata()/keepExif()/keepIccProfile(): sharp writes no metadata by default.
    const encoded =
      kind.mimeType === 'image/jpeg'
        ? pipeline.jpeg({ quality: 85, mozjpeg: true })
        : kind.mimeType === 'image/png'
          ? pipeline.png({ compressionLevel: 9, adaptiveFiltering: true })
          : pipeline.webp({ quality: 85 });
    const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
    return { buffer: data, kind, width: info.width, height: info.height };
  } catch {
    throw invalid(index);
  }
}
