// Serving uploaded images. 13 § Uploads, 48.
import { Router } from 'express';
import { z } from 'zod';
import { dto } from '@endur/shared';
import { validate } from '../../middleware/validate.js';
import { assetChain } from '../../middleware/chains.js';
import { readFile } from './service.js';

export const filesRouter: Router = Router();

// Links 6-8, router-level (12 §2) — and the SHORTEST chain in the application. No tenant,
// no principal, no CSRF: a logo has to render on a respondent's phone, which has none of
// the three. See middleware/chains.ts for why that is a decision rather than an omission.
filesRouter.use(assetChain);

const FileIdDto = dto({ params: z.object({ id: z.string().uuid() }) });

filesRouter.get('/:id', validate(FileIdDto), (req, res, next) => {
  const { params } = req.data as { params: { id: string } };
  void readFile(params.id)
    .then(({ bytes, mime }) => {
      // Immutable: the id changes whenever the image does, so a stored file is never a
      // different image tomorrow and there is nothing to revalidate.
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Type', mime);
      // Belt and braces on top of helmet: this route is the only one that answers with
      // bytes a stranger supplied, so it says explicitly that they are not to be sniffed
      // into something executable.
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'inline');
      res.send(bytes);
    })
    .catch(next);
});
