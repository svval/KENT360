import { declaredTypeMatches, detectImageKind } from './image-signature';

const bytes = (...values: number[]) => Uint8Array.from(values);
const text = (value: string) => Uint8Array.from(Buffer.from(value, 'latin1'));

describe('detectImageKind', () => {
  it('recognises JPEG, PNG and WEBP signatures', () => {
    expect(detectImageKind(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toEqual({
      mimeType: 'image/jpeg',
      extension: 'jpg',
    });
    expect(detectImageKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toEqual({
      mimeType: 'image/png',
      extension: 'png',
    });
    expect(detectImageKind(text('RIFF\x10\x00\x00\x00WEBPVP8 '))).toEqual({
      mimeType: 'image/webp',
      extension: 'webp',
    });
  });

  it.each([
    ['GIF', text('GIF89a....')],
    ['PDF', text('%PDF-1.7')],
    ['HTML', text('<html><script>')],
    ['RIFF but WAV', text('RIFF\x10\x00\x00\x00WAVEfmt ')],
    ['truncated JPEG', bytes(0xff, 0xd8)],
    ['empty', bytes()],
  ])('rejects %s', (_label, buffer) => {
    expect(detectImageKind(buffer)).toBeNull();
  });
});

describe('declaredTypeMatches', () => {
  const jpeg = { mimeType: 'image/jpeg', extension: 'jpg' } as const;
  it('compares the declared type with the detected one', () => {
    expect(declaredTypeMatches('image/jpeg', jpeg)).toBe(true);
    expect(declaredTypeMatches('IMAGE/JPG', jpeg)).toBe(true);
    expect(declaredTypeMatches('image/png', jpeg)).toBe(false);
  });
});
