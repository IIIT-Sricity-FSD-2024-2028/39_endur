// Template routes: the reusable question sets a campaign is built from.
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

// Links 6 to 8 for every route below: resolve the org, attach the principal, check CSRF.
templatesRouter.use(tenantChain);

// Registered before /:id, so "library" is never read as a template id.
// Guarded by template.read rather than left open: every unguarded route is one no permission protects.
// The shared library of starter templates.
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

// This organisation's own templates.
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

// One template, with its questions.
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

// Creates an empty template.
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

// Copies a template into this organisation so it can be edited.
templatesRouter.post(
  '/:id/clone',
  authenticate,
  validate(CloneTemplateDto),
  requireCapability('template.clone'),
  // A double-clicked clone must produce ONE template: cloning drops the user into the builder,
  // so a second copy behind them is invisible until it becomes confusing.
  idempotent('template.clone'),
  (req, res, next) => {
    const { body, params } = req.data as { body: { name?: string }; params: { id: string } };
    void cloneTemplate(req, req.ctx.orgId as string, params.id, body.name)
      .then((template) => res.status(201).json({ data: template }))
      .catch(next);
  },
);

// Renames a template or edits its description.
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

// Saves the whole question set at once: the builder autosaves a document, and reordering is one array, not N updates.
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

// Deletes a template.
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
