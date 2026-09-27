/**
 * Upload type detection from the file's first bytes ("magic numbers"). The client's
 * Content-Type and filename are claims; only the signature decides what a file is.
 */
export type ImageKind = {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'jpg' | 'png' | 'webp';
};

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(buffer: Uint8Array, bytes: number[], offset = 0): boolean {
  return buffer.length >= offset + bytes.length && bytes.every((b, i) => buffer[offset + i] === b);
}

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

export function detectImageKind(buffer: Uint8Array): ImageKind | null {
  if (startsWith(buffer, JPEG)) return { mimeType: 'image/jpeg', extension: 'jpg' };
  if (startsWith(buffer, PNG)) return { mimeType: 'image/png', extension: 'png' };
  // RIFF <size> WEBP
  if (startsWith(buffer, ascii('RIFF')) && startsWith(buffer, ascii('WEBP'), 8)) {
    return { mimeType: 'image/webp', extension: 'webp' };
  }
  return null;
}

/** Accept the declared type only if it matches the signature (image/jpg is a common alias). */
export function declaredTypeMatches(declared: string, kind: ImageKind): boolean {
  const normalised =
    declared.toLowerCase().trim() === 'image/jpg' ? 'image/jpeg' : declared.toLowerCase().trim();
  return normalised === kind.mimeType;
}
