// Auth routes. 13 § Auth, 15 §5.
import { Router } from 'express';
import { LoginDto, RegisterDto, resolveLabels } from '@endur/shared';
import type { LoginBody, MeResponse, RegisterBody } from '@endur/shared';
import { prisma } from '../../db/client.js';
import { verifyPassword } from '../../auth/password.js';
import { destroy, regenerate, save } from '../../auth/session.js';
import { issueCsrfToken } from '../../middleware/csrfProtection.js';
import { validate } from '../../middleware/validate.js';
import { scopedRateLimits } from '../../middleware/rateLimit.js';
import { authenticate } from '../../middleware/authenticate.js';
import { AppError, ConflictError, UnauthenticatedError } from '../../lib/errors.js';
import { heldCapabilities } from '../../authz/held.js';
import { register } from './service.js';

export const authRouter: Router = Router();

authRouter.get('/csrf', (_req, res) => {
  res.json({ token: issueCsrfToken(res) });
});

authRouter.post('/register', validate(RegisterDto), (req, res, next) => {
  const { body } = req.data as { body: RegisterBody };
  void (async () => {
    const existing = await prisma.user.findFirst({
      where: { email: body.email }, select: { id: true },
    });
    // Registration CAN say the address is taken — you are choosing an identity, and
    // refusing to say why would make the form unusable. Login cannot. See below.
    if (existing) throw new ConflictError('That email address is already registered.');

    const { org, user } = await register(body);
    await regenerate(req);
    req.session.userId = user.id;
    req.session.orgId = org.id;
    await save(req);
    issueCsrfToken(res);
    res.status(201).json({ organization: { id: org.id, slug: org.slug } });
  })().catch(next);
});

authRouter.post('/login', scopedRateLimits.login, validate(LoginDto), (req, res, next) => {
  const { body } = req.data as { body: LoginBody };
  void (async () => {
    const user = await prisma.user.findFirst({
      where: { email: body.email },
      select: { id: true, orgId: true, passwordHash: true, status: true },
    });

    // ONE failure message and one code path, whatever went wrong — unknown address, wrong
    // password, disabled account. Any difference in wording or timing is a free tool for
    // working out which addresses are real (15).
    const ok = await verifyPassword(user?.passwordHash ?? null, body.password);
    if (!user || !ok || user.status === 'disabled') {
      throw new UnauthenticatedError('That email or password is not right.');
    }

    // Regenerate BEFORE storing anything: session fixation prevention (15 §2).
    await regenerate(req);
    req.session.userId = user.id;
    req.session.orgId = user.orgId;
    await save(req);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    issueCsrfToken(res);
    res.json({ ok: true });
  })().catch(next);
});

authRouter.post('/logout', (req, res, next) => {
  // Destroy the record server-side. Clearing the cookie alone would leave a valid session
  // id alive for anyone who captured it.
  void destroy(req)
    .then(() => {
      res.clearCookie('endur.sid', { path: '/' });
      res.clearCookie('endur.csrf', { path: '/' });
      res.json({ ok: true });
    })
    .catch(next);
});

authRouter.get('/me', authenticate, (req, res, next) => {
  const principal = req.ctx.principal;
  void (async () => {
    if (principal?.kind !== 'user') throw new UnauthenticatedError();
    const user = await prisma.user.findUnique({
      where: { id: principal.id },
      select: { id: true, name: true, email: true,
                org: { select: { id: true, name: true, slug: true, industry: true, labels: true } } },
    });
    if (!user) throw new AppError('UNAUTHENTICATED', 'Your account no longer exists.');

    // The vocabulary rides along with the session, so the SPA can render domain nouns on
    // its first paint rather than flashing generic words (22 §3).
    const body: MeResponse = {
      user: { id: user.id, name: user.name, email: user.email },
      organization: {
        id: user.org.id, name: user.org.name, slug: user.org.slug, industry: user.org.industry,
      },
      labels: resolveLabels(user.org.labels as never),
      capabilities: await heldCapabilities(user.org.id, user.id),
    };
    res.json(body);
  })().catch(next);
});
