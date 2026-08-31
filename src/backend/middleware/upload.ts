// Multipart file upload: the one place that skips the JSON body parser.
// Hand-written and deliberately small - one file, one field, images only, and the size is checked as bytes arrive.
import type { Request, RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';
import { sniff, stripMetadata, type ImageFacts } from '../lib/imageBytes.js';

export type UploadedFile = {
  // The client's filename. Recorded for messages and never used to build a path on disk.
  clientName: string;
  // The type the client claimed. Kept only so a mismatch can be reported.
  declaredType: string;
  facts: ImageFacts;
  // The image bytes, with metadata already stripped.
  bytes: Buffer;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      file?: UploadedFile;
    }
  }
}

export type ImageUploadOptions = {
  // The multipart field name to look for. Anything else in the body is ignored.
  field: string;
  maxBytes?: number;
  maxDimension?: number;
};

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_DIMENSION = 4000;

export function imageUpload(opts: ImageUploadOptions): RequestHandler {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxDimension = opts.maxDimension ?? DEFAULT_MAX_DIMENSION;

  return (req, _res, next) => {
    const boundary = boundaryOf(req);
    if (!boundary) {
      return next(
        new AppError('BAD_REQUEST', 'Send the file as multipart/form-data.'),
      );
    }

    void collect(req, maxBytes)
      .then((body) => {
        const part = findFilePart(body, boundary, opts.field);
        if (!part) {
          throw new AppError('VALIDATION_FAILED', 'No file was attached.', {
            fields: [{ path: `body.${opts.field}`, message: 'Attach a file.' }],
          });
        }

        // The claim is checked against the bytes and the bytes win, so a renamed .exe fails here.
        const facts = sniff(part.bytes);
        if (!facts) {
          throw new AppError(
            'VALIDATION_FAILED',
            'That file is not a PNG, JPEG or WebP image.',
            { fields: [{ path: `body.${opts.field}`, message: 'Use a PNG, JPEG or WebP image.' }] },
          );
        }

        // Checked before anything decodes it: a huge image is small on disk and gigabytes in memory.
        if (facts.width > maxDimension || facts.height > maxDimension) {
          throw new AppError(
            'VALIDATION_FAILED',
            `That image is ${facts.width}×${facts.height}. The limit is ${maxDimension}×${maxDimension}.`,
            { fields: [{ path: `body.${opts.field}`, message: 'Use a smaller image.' }] },
          );
        }

        req.file = {
          clientName: part.filename,
          declaredType: part.contentType,
          facts,
          bytes: stripMetadata(part.bytes, facts.kind),
        };
        next();
      })
      .catch(next);
  };
}

function boundaryOf(req: Request): string | null {
  const header = req.get('content-type') ?? '';
  if (!header.toLowerCase().startsWith('multipart/form-data')) return null;
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(header);
  const boundary = (match?.[1] ?? match?.[2] ?? '').trim();
  return boundary.length > 0 ? boundary : null;
}

// Reads the whole body, but stops AT the size limit rather than after it, so memory stays bounded.
function collect(req: Request, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    // Stop reading without destroying the socket: a destroyed request could not carry the 413 back,
    // so the caller would see a network error instead of "that file is too big".
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      req.unpipe?.();
      req.resume();
      reject(err);
    };

    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        return fail(
          new AppError(
            'PAYLOAD_TOO_LARGE',
            `That file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`,
          ),
        );
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });
    req.on('error', fail);
  });
}

type FilePart = { filename: string; contentType: string; bytes: Buffer };

// Finds the one file part we want. Not a general multipart parser on purpose - a narrower grammar is easier to get right.
function findFilePart(body: Buffer, boundary: string, field: string): FilePart | null {
  const delimiter = Buffer.from(`--${boundary}`, 'latin1');
  const separator = Buffer.from('\r\n\r\n', 'latin1');

  let cursor = body.indexOf(delimiter);
  while (cursor !== -1) {
    const headerStart = cursor + delimiter.length;
    // Two dashes after the delimiter mean the end of the body, not another part.
    if (body.toString('latin1', headerStart, headerStart + 2) === '--') return null;

    const headerEnd = body.indexOf(separator, headerStart);
    if (headerEnd === -1) return null;

    const next = body.indexOf(delimiter, headerEnd);
    const bodyEnd = next === -1 ? body.length : next - 2; // strip the CRLF before the delimiter
    const headers = body.toString('latin1', headerStart, headerEnd);

    const disposition = /content-disposition:\s*form-data;([^\r\n]*)/i.exec(headers)?.[1] ?? '';
    const name = /\bname="([^"]*)"/i.exec(disposition)?.[1];
    const filename = /\bfilename="([^"]*)"/i.exec(disposition)?.[1];

    if (name === field && filename !== undefined) {
      return {
        // Recorded, never used to build a path: "../../etc/passwd" is a legal filename.
        filename,
        contentType: /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() ?? '',
        bytes: body.subarray(headerEnd + separator.length, Math.max(bodyEnd, headerEnd)),
      };
    }
    cursor = next;
  }
  return null;
}
