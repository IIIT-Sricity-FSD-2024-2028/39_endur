// T-061 — file upload. 48, 12 §4.4.
//
// This is the mandatory evaluation criterion that had no implementation at all, so the
// tests are about the things that make an upload endpoint safe rather than about the happy
// path: what the bytes REALLY are, how big they are allowed to get, what metadata comes off
// them, and where they land on disk.
import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { app, addStaff, setUpOrg, withCsrf, type Session } from './helpers.js';
import { storageRoot } from '../lib/storage.js';
import { prisma } from '../db/client.js';

// ---------------------------------------------------------------------------------------
// Synthetic images. Building them here rather than committing binary fixtures keeps what
// each test is about visible in the test: a PNG that CLAIMS 20000x20000 is four bytes of
// header, and that is exactly the point of the dimension check.
// ---------------------------------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** CRCs are zeroed: nothing in the pipeline verifies them, and a real CRC would hide
 *  which parts of the file the code actually reads. */
function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
}

function makePng(width: number, height: number, extra: Buffer[] = []): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    ...extra,
    pngChunk('IDAT', Buffer.from([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01])),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A JPEG with an APP1 EXIF block carrying something that looks like a GPS tag. */
function makeJpeg(opts: { exif?: boolean } = {}): Buffer {
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])];

  if (opts.exif) {
    const payload = Buffer.concat([
      Buffer.from('Exif\0\0', 'latin1'),
      Buffer.from('GPSLatitude 51.5074 GPSLongitude -0.1278 Make ACME-PHONE', 'latin1'),
    ]);
    const header = Buffer.alloc(4);
    header[0] = 0xff;
    header[1] = 0xe1;
    header.writeUInt16BE(payload.length + 2, 2);
    parts.push(header, payload);
  }

  const sof = Buffer.alloc(13);
  sof[0] = 0xff;
  sof[1] = 0xc0;
  sof.writeUInt16BE(11, 2); // segment length
  sof[4] = 8; // precision
  sof.writeUInt16BE(64, 5); // height
  sof.writeUInt16BE(48, 7); // width
  sof[9] = 1; // one component
  parts.push(sof);

  parts.push(Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]));
  parts.push(Buffer.from([0x00, 0x11, 0x22, 0xff, 0xd9]));
  return Buffer.concat(parts);
}

const LOGO = '/api/v1/org/logo';
const created: string[] = [];

async function uploadLogo(session: Session, bytes: Buffer, filename = 'logo.png') {
  const res = await withCsrf(session, 'post', LOGO).attach('file', bytes, filename);
  if (res.status === 201) created.push(res.body.data.fileId as string);
  return res;
}

afterAll(async () => {
  // The bytes live outside the database, so the database reset does not reach them.
  await Promise.all(
    created.map(async (id) => {
      const row = await prisma.file.findUnique({ where: { id }, select: { orgId: true } });
      if (row) fs.rmSync(path.join(storageRoot, row.orgId), { recursive: true, force: true });
    }),
  );
});

describe('POST /org/logo — the happy path', () => {
  it('stores a PNG and serves it back byte for byte', async () => {
    const founder = await setUpOrg();
    const res = await uploadLogo(founder, makePng(120, 80));

    expect(res.status).toBe(201);
    expect(res.body.data.width).toBe(120);
    expect(res.body.data.height).toBe(80);
    expect(res.body.data.mime).toBe('image/png');
    expect(res.body.data.url).toBe(`/api/v1/files/${res.body.data.fileId}`);

    // Serving needs no session, no tenant and no CSRF — a respondent's phone has none.
    const served = await request(app).get(res.body.data.url as string);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toContain('image/png');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(served.body.length).toBe(res.body.data.bytes);
  });

  it("writes into the ORGANISATION's own directory, named by our id", async () => {
    const founder = await setUpOrg();
    const res = await uploadLogo(founder, makePng(64, 64));
    expect(res.status).toBe(201);

    const onDisk = path.join(storageRoot, founder.orgId, `${res.body.data.fileId}.png`);
    expect(fs.existsSync(onDisk)).toBe(true);
  });

  it('replaces the previous logo and deletes the file it replaced', async () => {
    const founder = await setUpOrg();
    const first = await uploadLogo(founder, makePng(64, 64));
    const second = await uploadLogo(founder, makePng(32, 32));
    expect(second.status).toBe(201);

    const gone = path.join(storageRoot, founder.orgId, `${first.body.data.fileId}.png`);
    expect(fs.existsSync(gone)).toBe(false);
    expect(await prisma.file.findUnique({ where: { id: first.body.data.fileId as string } })).toBeNull();
  });
});

describe('what the bytes actually are', () => {
  it('refuses an executable renamed .png — magic bytes, not the extension', async () => {
    const founder = await setUpOrg();
    // 'MZ' is a Windows executable. It arrives claiming image/png and named logo.png.
    const res = await uploadLogo(founder, Buffer.from('MZ\x90\x00 this is not an image'), 'logo.png');

    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain('PNG, JPEG or WebP');
  });

  it('refuses an image that claims impossible dimensions, before decoding it', async () => {
    const founder = await setUpOrg();
    // A few dozen bytes on the wire; gigabytes if anything decoded it.
    const res = await uploadLogo(founder, makePng(20000, 20000));

    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain('20000×20000');
  });

  it('refuses a body that is not multipart at all', async () => {
    const founder = await setUpOrg();
    const res = await withCsrf(founder, 'post', LOGO).send({ file: 'nope' });
    expect(res.status).toBe(400);
  });

  it('refuses a multipart body with no file part', async () => {
    const founder = await setUpOrg();
    const res = await withCsrf(founder, 'post', LOGO).field('somethingElse', 'x');
    expect(res.status).toBe(422);
    expect(res.body.error.details.fields[0].path).toBe('body.file');
  });
});

describe('size', () => {
  it('rejects a file over the cap with 413, and still answers rather than hanging up', async () => {
    const founder = await setUpOrg();
    // 3 MB of PNG against a 2 MB cap. The rejection happens while the bytes are arriving.
    const huge = makePng(64, 64, [pngChunk('iTXt', Buffer.alloc(3 * 1024 * 1024, 0x61))]);
    const res = await uploadLogo(founder, huge);

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('metadata', () => {
  it('strips EXIF, including anything that looks like GPS, from a JPEG', async () => {
    const founder = await setUpOrg();
    const withExif = makeJpeg({ exif: true });
    expect(withExif.toString('latin1')).toContain('GPSLatitude');

    const res = await uploadLogo(founder, withExif, 'photo.jpg');
    expect(res.status).toBe(201);

    const stored = fs.readFileSync(
      path.join(storageRoot, founder.orgId, `${res.body.data.fileId}.jpg`),
    );
    expect(stored.toString('latin1')).not.toContain('GPSLatitude');
    expect(stored.toString('latin1')).not.toContain('ACME-PHONE');
    // The image itself survived: dimensions still read, and the scan data is still there.
    expect(res.body.data.width).toBe(48);
    expect(stored.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  });

  it('strips text chunks from a PNG and keeps the ones a decoder needs', async () => {
    const founder = await setUpOrg();
    const tagged = makePng(40, 40, [
      pngChunk('tEXt', Buffer.from('Author\0Someone Identifiable', 'latin1')),
    ]);

    const res = await uploadLogo(founder, tagged);
    expect(res.status).toBe(201);

    const stored = fs.readFileSync(
      path.join(storageRoot, founder.orgId, `${res.body.data.fileId}.png`),
    );
    expect(stored.toString('latin1')).not.toContain('Someone Identifiable');
    expect(stored.toString('latin1')).toContain('IHDR');
    expect(stored.toString('latin1')).toContain('IDAT');
    expect(stored.toString('latin1')).toContain('IEND');
  });
});

describe('the filename is never trusted', () => {
  it('cannot escape the organisation directory with ../', async () => {
    const founder = await setUpOrg();
    const res = await uploadLogo(founder, makePng(20, 20), '../../../../tmp/endur-escape.png');
    expect(res.status).toBe(201);

    // The stored name is OUR id. The client's name is not used to build a path at all.
    expect(fs.existsSync(path.join(storageRoot, founder.orgId, `${res.body.data.fileId}.png`))).toBe(true);
    expect(fs.existsSync('/tmp/endur-escape.png')).toBe(false);
  });
});

describe('authorisation is still decided in middleware', () => {
  it('refuses an upload from someone without the capability', async () => {
    const founder = await setUpOrg();
    // A junior member of one unit. org.update is an administrator's power (11 §8).
    const junior = await addStaff(founder.orgId, {
      name: 'Junior',
      level: 4,
      unitName: 'Section A',
    });
    const res = await withCsrf(junior, 'post', LOGO).attach('file', makePng(10, 10), 'logo.png');
    expect(res.status).toBe(403);
  });

  it('refuses an upload with no session at all', async () => {
    const res = await request(app).post(LOGO).attach('file', makePng(10, 10), 'logo.png');
    expect(res.status).toBe(401);
  });
});

describe('serving', () => {
  it('404s an id that does not exist', async () => {
    const res = await request(app).get('/api/v1/files/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
  });

  it('422s an id that is not a uuid, rather than touching the disk', async () => {
    const res = await request(app).get('/api/v1/files/..%2F..%2Fetc%2Fpasswd');
    expect(res.status).toBe(422);
  });
});
