// Template routes. 13 § Templates and forms, 36, 37.
import { Router } from 'express';
import { tenantChain } from '../../middleware/chains.js';
import {
  CloneTemplateDto,
  CreateTemplateDto,
  LibraryDto,
  PutQuestionsDto,
  TemplateIdDto,
  TemplateListDto,
  UpdateTemplateDto,
} from '@endur/shared';
import type {
  CreateTemplateBody,
  PutQuestionsBody,
  UpdateTemplateBody,
} from '@endur/shared';
import { validate } from '../../middleware/validate.js';
import { requireCapability } from '../../middleware/requireCapability.js';
import { idempotent } from '../../middleware/idempotency.js';
import { authenticate } from '../../middleware/authenticate.js';
import {
  cloneTemplate,
  createTemplate,
  deleteTemplate,
  listLibrary,
  listTemplates,
  putQuestions,
  readTemplate,
  updateTemplate,
} from './service.js';

export const templatesRouter: Router = Router();

// Links 6-8, router-level (12 §2). tenantResolver → authenticate → csrfProtection,
// applied to every route below without any of them having to ask.
templatesRouter.use(tenantChain);

// Registered before /:id so "library" is never read as a template id.
//
// Guarded by `template.read` rather than added to the route-enumeration allowlist
// (DEC-018). 13 §3 lists it as auth-optional, but no M0 screen reaches it without a
// session — the wizard and the library browser are both inside the console — and every
// allowlist entry is a route no guard protects forever.
templatesRouter.get(
  '/library',
  authenticate,
  validate(LibraryDto),
  requireCapability('template.read'),
  (req, res, next) => {
    const { query } = req.data as { query: { industry?: string; category?: string } };
    void listLibrary(query)
      .then((templates) => res.json({ data: templates }))
      .catch(next);
  },
);

templatesRouter.get(
  '/',
  authenticate,
  validate(TemplateListDto),
  requireCapability('template.read'),
  (req, res, next) => {
    const { query } = req.data as { query: { cursor?: string; limit: number; q?: string } };
    void listTemplates(req.ctx.orgId as string, query)
      .then((page) => res.json(page))
      .catch(next);
  },
);

templatesRouter.get(
  '/:id',
  authenticate,
  validate(TemplateIdDto),
  requireCapability('template.read'),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void readTemplate(req.ctx.orgId as string, params.id)
      .then((template) => res.json({ data: template }))
      .catch(next);
  },
);

templatesRouter.post(
  '/',
  authenticate,
  validate(CreateTemplateDto),
  requireCapability('template.create'),
  (req, res, next) => {
    const { body } = req.data as { body: CreateTemplateBody };
    void createTemplate(req, req.ctx.orgId as string, body)
      .then((template) => res.status(201).json({ data: template }))
      .catch(next);
  },
);

templatesRouter.post(
  '/:id/clone',
  authenticate,
  validate(CloneTemplateDto),
  requireCapability('template.clone'),
  // A double-clicked clone must produce ONE template (36 § Acceptance). Clone lands the
  // user straight in the builder, so a second copy appearing behind them is invisible
  // until it is confusing.
  idempotent('template.clone'),
  (req, res, next) => {
    const { body, params } = req.data as { body: { name?: string }; params: { id: string } };
    void cloneTemplate(req, req.ctx.orgId as string, params.id, body.name)
      .then((template) => res.status(201).json({ data: template }))
      .catch(next);
  },
);

templatesRouter.patch(
  '/:id',
  authenticate,
  validate(UpdateTemplateDto),
  requireCapability('template.update'),
  (req, res, next) => {
    const { body, params } = req.data as { body: UpdateTemplateBody; params: { id: string } };
    void updateTemplate(req, req.ctx.orgId as string, params.id, body)
      .then((template) => res.json({ data: template }))
      .catch(next);
  },
);

// Bulk, and the whole set. The builder autosaves a document, not a stream of field edits,
// and reordering is one operation on an array rather than N position updates (37).
templatesRouter.put(
  '/:id/questions',
  authenticate,
  validate(PutQuestionsDto),
  requireCapability('template.update'),
  (req, res, next) => {
    const { body, params } = req.data as { body: PutQuestionsBody; params: { id: string } };
    void putQuestions(req, req.ctx.orgId as string, params.id, body)
      .then((template) => res.json({ data: template }))
      .catch(next);
  },
);

templatesRouter.delete(
  '/:id',
  authenticate,
  validate(TemplateIdDto),
  requireCapability('template.delete'),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void deleteTemplate(req, req.ctx.orgId as string, params.id)
      .then((result) => res.json({ data: result }))
      .catch(next);
  },
);
