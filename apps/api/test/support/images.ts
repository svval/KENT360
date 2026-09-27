import { crc32 } from 'node:zlib';
import sharp from 'sharp';

/**
 * Real image fixtures for the upload pipeline tests – decodable files carrying real
 * metadata, so tests prove that metadata is removed, not just that a flag was set.
 */

/** Strings planted in the metadata; none may survive normalisation. */
export const PLANTED = {
  make: 'KENT360-TEST-CAM',
  model: 'SECRET-DEVICE-SERIAL',
  xmpAuthor: 'SECRET-XMP-AUTHOR',
} as const;

const XMP = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>${PLANTED.xmpAuthor}</dc:creator></rdf:Description></rdf:RDF></x:xmpmeta>`;

const EXIF = {
  IFD0: { Make: PLANTED.make, Model: PLANTED.model },
  // IFD3 = GPS: 37°03'30"N 37°22'15"E (Şahinbey)
  IFD3: {
    GPSLatitudeRef: 'N',
    GPSLatitude: '37/1 3/1 30/1',
    GPSLongitudeRef: 'E',
    GPSLongitude: '37/1 22/1 15/1',
  },
};

/** 40×20: left half red, right half blue – lets tests check orientation by pixels. */
async function twoTone(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 20, channels: 3, background: '#ff0000' } })
    .composite([
      {
        input: { create: { width: 20, height: 20, channels: 3, background: '#0000ff' } },
        left: 20,
        top: 0,
      },
    ])
    .png()
    .toBuffer();
}

/**
 * JPEG with EXIF (camera make/model), GPS, XMP and Orientation = 6 ("rotate 90° CW to
 * display"): stored 40×20, displayed 20×40 with the red half on top.
 */
export async function jpegWithMetadata(): Promise<Buffer> {
  return sharp(await twoTone())
    .withExif(EXIF)
    .withMetadata({ orientation: 6 })
    .withXmp(XMP)
    .jpeg({ quality: 90 })
    .toBuffer();
}

export async function pngWithMetadata(): Promise<Buffer> {
  return sharp(await twoTone())
    .withExif(EXIF)
    .withXmp(XMP)
    .png()
    .toBuffer();
}

export async function webpWithMetadata(): Promise<Buffer> {
  return sharp(await twoTone())
    .withExif(EXIF)
    .withXmp(XMP)
    .webp()
    .toBuffer();
}

export async function plainImage(
  format: 'jpeg' | 'png' | 'webp',
  width = 64,
  height = 48,
): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#2563eb' } })
    .toFormat(format)
    .toBuffer();
}

/** A JPEG whose data stops half-way and continues with garbage. */
export async function corruptJpeg(): Promise<Buffer> {
  const jpeg = await plainImage('jpeg', 256, 256);
  return Buffer.concat([jpeg.subarray(0, Math.floor(jpeg.length / 2)), Buffer.alloc(64, 0x42)]);
}

/**
 * A tiny PNG whose header claims 20 000 × 20 000 pixels (400 MP): a decompression
 * bomb stand-in that must be refused from the header alone.
 */
export function hugeDimensionPng(width = 20_000, height = 20_000): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(2, 9); // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', Buffer.from([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01])),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Two-frame animated WebP, assembled from sharp-encoded lossless frames. */
export async function animatedWebp(): Promise<Buffer> {
  const u24 = (n: number) => Buffer.from([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff]);
  const chunk = (fourcc: string, data: Buffer) => {
    const size = Buffer.alloc(4);
    size.writeUInt32LE(data.length);
    return Buffer.concat([
      Buffer.from(fourcc),
      size,
      data,
      data.length % 2 ? Buffer.from([0]) : Buffer.alloc(0),
    ]);
  };
  const frame = async (color: string) =>
    (
      await sharp({ create: { width: 16, height: 16, channels: 3, background: color } })
        .webp({ lossless: true })
        .toBuffer()
    ).subarray(12);
  const frames = [await frame('#ff0000'), await frame('#0000ff')];
  const body = Buffer.concat([
    Buffer.from('WEBP'),
    chunk('VP8X', Buffer.concat([Buffer.from([0x02, 0, 0, 0]), u24(15), u24(15)])),
    chunk('ANIM', Buffer.from([0, 0, 0, 0, 0, 0])),
    ...frames.map((f) =>
      chunk(
        'ANMF',
        Buffer.concat([u24(0), u24(0), u24(15), u24(15), u24(100), Buffer.from([0]), f]),
      ),
    ),
  ]);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(body.length);
  return Buffer.concat([Buffer.from('RIFF'), size, body]);
}

/** Every trace of metadata a normalised image must NOT contain. */
export async function metadataTraces(image: Buffer): Promise<string[]> {
  const meta = await sharp(image).metadata();
  const traces: string[] = [];
  if (meta.exif) traces.push('exif');
  if (meta.xmp) traces.push('xmp');
  if (meta.iptc) traces.push('iptc');
  if (meta.icc) traces.push('icc');
  if (meta.orientation !== undefined && meta.orientation !== 1)
    traces.push(`orientation=${meta.orientation}`);
  for (const text of [...Object.values(PLANTED), 'Exif\0\0', 'GPS']) {
    if (image.includes(Buffer.from(text, 'latin1')))
      traces.push(`bytes:${text.replace('\0\0', '')}`);
  }
  return traces;
}
