// Serving uploaded images.
import { Router } from 'express';
import { z } from 'zod';
import { dto } from '@endur/shared';
import { validate } from '../../middleware/validate.js';
import { assetChain } from '../../middleware/chains.js';
import { readFile } from './service.js';

export const filesRouter: Router = Router();

// The shortest chain in the application: no organisation, no principal, no CSRF, because a logo has to
// render on a respondent's phone, which has none of the three.
filesRouter.use(assetChain);

const FileIdDto = dto({ params: z.object({ id: z.string().uuid() }) });

filesRouter.get('/:id', validate(FileIdDto), (req, res, next) => {
  const { params } = req.data as { params: { id: string } };
  void readFile(params.id)
    .then(({ bytes, mime }) => {
      // Immutable: the id changes whenever the image does, so a cached file is never a different image tomorrow.
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Type', mime);
      // This is the only route that answers with bytes a stranger supplied, so it says explicitly
      // that they must not be sniffed into something executable.
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'inline');
      res.send(bytes);
    })
    .catch(next);
});
