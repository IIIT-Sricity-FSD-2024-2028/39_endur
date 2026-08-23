// What an uploaded image ACTUALLY is, and what it stops carrying before it is stored. 48.
//
// Two jobs, both done on the bytes themselves and neither trusting the client:
//
//   sniff()          the real format and its dimensions, from magic bytes and headers.
//                    Content-Type and a filename extension are claims; these are facts.
//
//   stripMetadata()  removes the segments that carry EXIF GPS, device identifiers, XMP and
//                    IPTC, without decoding the image.
//
// > **This is NOT the re-encode `48` § Validation specifies, and the difference is
// > deliberate — see `OPEN-008`.** Re-encoding means decoding to a bitmap and writing a new
// > file, which needs an image library, which is a dependency nobody has approved. Stripping
// > removes the metadata that re-encoding was there to remove (GPS, device, author, embedded
// > thumbnails) and leaves the pixel data untouched.
// >
// > What stripping does NOT give us, stated so it is not forgotten: it does not neutralise a
// > polyglot file whose payload hides inside the image data itself. What makes that
// > survivable here is that stored files are only ever SERVED as bytes with a fixed
// > Content-Type and never executed, parsed as anything else, or handed to a shell — and
// > respondent uploads, the case where a hostile file is likely, are out of scope entirely.
export type ImageKind = 'png' | 'jpeg' | 'webp';

export type ImageFacts = { kind: ImageKind; mime: string; ext: string; width: number; height: number };

const MIME: Record<ImageKind, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The format, from the bytes. `null` means "not one of the three we accept". */
export function sniff(buf: Buffer): ImageFacts | null {
  const kind = detect(buf);
  if (!kind) return null;
  const size =
    kind === 'png' ? pngSize(buf) : kind === 'jpeg' ? jpegSize(buf) : webpSize(buf);
  // A file we can identify but cannot measure is a file we do not understand well enough
  // to store. Refusing is the safe direction; the alternative is skipping the dimension
  // check, which is the decompression-bomb defence (48).
  if (!size) return null;
  return { kind, mime: MIME[kind], ext: kind === 'jpeg' ? 'jpg' : kind, ...size };
}

function detect(buf: Buffer): ImageKind | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (
    buf.length >= 12 &&
    buf.toString('latin1', 0, 4) === 'RIFF' &&
    buf.toString('latin1', 8, 12) === 'WEBP'
  )
    return 'webp';
  return null;
}

/** IHDR is always the first chunk, so width and height are at fixed offsets. */
function pngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || buf.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * Walk the segment list to the first SOF marker. Dimensions are NOT at a fixed offset in a
 * JPEG — anything before SOF can be any length, which is also why an EXIF block can be
 * megabytes and why reading it blind would be a mistake.
 */
function jpegSize(buf: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1] ?? 0;
    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = buf.readUInt16BE(i + 2);
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    if (marker === 0xda) return null; // scan data: no SOF was found before the image itself
    i += 2 + length;
  }
  return null;
}

/** Three container flavours, and a logo could be any of them. */
function webpSize(buf: Buffer): { width: number; height: number } | null {
  for (const chunk of riffChunks(buf)) {
    const body = buf.subarray(chunk.start, chunk.start + chunk.length);
    if (chunk.id === 'VP8X' && body.length >= 10) {
      return { width: read24(body, 4) + 1, height: read24(body, 7) + 1 };
    }
    if (chunk.id === 'VP8 ' && body.length >= 10) {
      // Lossy: a 3-byte start code, then 14-bit width and height.
      if (body[3] !== 0x9d || body[4] !== 0x01 || body[5] !== 0x2a) return null;
      return { width: body.readUInt16LE(6) & 0x3fff, height: body.readUInt16LE(8) & 0x3fff };
    }
    if (chunk.id === 'VP8L' && body.length >= 5) {
      // Lossless: 14-bit width-1 and height-1 packed across bytes 1..4.
      const bits = body.readUInt32LE(1);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}

const read24 = (buf: Buffer, at: number) =>
  (buf[at] ?? 0) | ((buf[at + 1] ?? 0) << 8) | ((buf[at + 2] ?? 0) << 16);

type RiffChunk = { id: string; start: number; length: number; headerAt: number };

function* riffChunks(buf: Buffer): Generator<RiffChunk> {
  let i = 12; // past 'RIFF' + size + 'WEBP'
  while (i + 8 <= buf.length) {
    const id = buf.toString('latin1', i, i + 4);
    const length = buf.readUInt32LE(i + 4);
    if (length > buf.length) return; // corrupt: stop rather than read past the end
    yield { id, start: i + 8, length, headerAt: i };
    i += 8 + length + (length % 2); // chunks are padded to even lengths
  }
}

/**
 * Remove the metadata segments. The pixel data is byte-identical afterwards; only the
 * blocks that describe WHERE and WITH WHAT the image was made are gone.
 */
export function stripMetadata(buf: Buffer, kind: ImageKind): Buffer {
  if (kind === 'jpeg') return stripJpeg(buf);
  if (kind === 'png') return stripPng(buf);
  return stripWebp(buf);
}

/**
 * Drops APP1 (EXIF and XMP — this is the GPS one), APP13 (IPTC/Photoshop, which carries
 * author and location) and COM comments.
 *
 * APP0 (JFIF density), APP2 (ICC colour profile) and APP14 (Adobe colour transform) are
 * KEPT on purpose: none of them identifies a person or a place, and dropping ICC or Adobe
 * silently shifts the colours of the image we were asked to store.
 */
function stripJpeg(buf: Buffer): Buffer {
  const out: Buffer[] = [buf.subarray(0, 2)]; // SOI
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1] ?? 0;
    if (marker === 0xda) {
      out.push(buf.subarray(i)); // scan data to the end, untouched
      return Buffer.concat(out);
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const length = buf.readUInt16BE(i + 2);
    const drop = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!drop) out.push(buf.subarray(i, i + 2 + length));
    i += 2 + length;
  }
  out.push(buf.subarray(i));
  return Buffer.concat(out);
}

/** Ancillary text and EXIF chunks go; everything the decoder needs stays. */
function stripPng(buf: Buffer): Buffer {
  const DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);
  const out: Buffer[] = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= buf.length) {
    const length = buf.readUInt32BE(i);
    const type = buf.toString('latin1', i + 4, i + 8);
    const end = i + 12 + length;
    if (end > buf.length) break;
    if (!DROP.has(type)) out.push(buf.subarray(i, end));
    if (type === 'IEND') return Buffer.concat(out);
    i = end;
  }
  return Buffer.concat(out);
}

/** RIFF is a flat chunk list, so EXIF and XMP lift straight out — and the VP8X flags that
 *  advertise them have to be cleared too, or a reader goes looking for chunks that are no
 *  longer there. */
function stripWebp(buf: Buffer): Buffer {
  const kept: Buffer[] = [];
  let changed = false;
  for (const chunk of riffChunks(buf)) {
    const end = chunk.start + chunk.length + (chunk.length % 2);
    if (chunk.id === 'EXIF' || chunk.id === 'XMP ') {
      changed = true;
      continue;
    }
    const slice = Buffer.from(buf.subarray(chunk.headerAt, Math.min(end, buf.length)));
    if (chunk.id === 'VP8X' && slice.length >= 9) {
      const flags = slice[8] ?? 0;
      if (flags & 0x0c) changed = true;
      slice[8] = flags & ~0x0c; // clear the EXIF and XMP bits
    }
    kept.push(slice);
  }
  if (!changed && kept.length === 0) return buf;

  const body = Buffer.concat(kept);
  const out = Buffer.alloc(12 + body.length);
  out.write('RIFF', 0, 'latin1');
  out.writeUInt32LE(4 + body.length, 4); // 'WEBP' plus the chunks
  out.write('WEBP', 8, 'latin1');
  body.copy(out, 12);
  return out;
}
