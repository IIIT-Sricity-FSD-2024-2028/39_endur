// THE API DOCUMENTATION SURFACE. `DEC-115`, `13` §12.
//
// Two routes: the OpenAPI document, and a page that renders it.
//
// UNAUTHENTICATED, AND THAT IS A DECISION RATHER THAN AN OVERSIGHT. The document describes the
// SHAPE of the API — paths, schemas, which capability each route needs — and contains no
// customer data, no organisation names and no secrets. Every fact in it is already derivable by
// reading the client bundle. Putting it behind a session would mean the one audience who most
// needs it (somebody integrating, somebody evaluating, somebody new to the codebase) cannot
// reach it, in exchange for hiding nothing.
//
// It is NOT mounted in production, and that is the balance: an internet-facing deployment has no
// reason to publish its own route table, even a harmless one. `config.NODE_ENV` decides, in
// `app.ts`, at the mount rather than inside a handler — so in production the route does not
// exist and answers the same 404 as any other unknown URL, rather than a 403 that confirms it
// would have been there.
import { Router, type Express } from 'express';
import { buildOpenApiDocument } from '../../openapi/spec.js';

/**
 * A FACTORY TAKING THE APP, and the shape is forced by a circularity worth naming.
 *
 * This router is mounted BY `createApp()`, so at the moment `app.ts` constructs it there is no
 * finished app to walk — and importing `createApp` here to build a throwaway one would make
 * `app.ts` and this file import each other. Taking the app as an argument and reading it
 * LAZILY, on the first request, sidesteps both: by the time anybody opens `/docs`, every
 * router below is mounted and `mountedRouters()` knows all of them.
 *
 * BUILT ONCE AND CACHED. The walk is cheap but not free, and the document cannot change while
 * the process runs — the routes it describes were fixed at boot.
 *
 * ONE ROUTER PER PROCESS, however many times this is called, and that is not micro-optimisation
 * — it closes a real leak. `mount()` records routers in a module-level Map so the walker can
 * recover their prefixes without touching Express internals; every OTHER router in the app is a
 * module-level singleton, so calling `createApp()` twice re-registers the same objects and the
 * Map does not grow. A fresh Router here would be a new key each time, and a test process that
 * builds several apps would accumulate one docs router per app — each contributing its two
 * routes to every later walk. Found by `openapi.test.ts` counting 154 routes for 152 operations.
 */
let singleton: Router | undefined;

export function docsRouter(app: Express): Router {
  if (singleton) return singleton;
  const router: Router = Router();
  singleton = router;
  let cached: Record<string, unknown> | undefined;
  const document = (): Record<string, unknown> => (cached ??= buildOpenApiDocument(app));

  /**
   * The document itself. THIS IS THE DELIVERABLE — the page below is one way to read it, and any
   * OpenAPI 3.1 tool (Swagger UI, Redoc, Postman, an SDK generator) consumes this same URL.
   */
  router.get('/openapi.json', (_req, res) => {
    res.json(document());
  });

  router.get('/', (_req, res) => {
    res.type('html').send(PAGE);
  });

  return router;
}

/**
 * Swagger UI, from a CDN, pinned.
 *
 * NOT VENDORED, and the reason is worth stating because it is the one weak point here.
 * `package-lock.json` carries the Windows esbuild binary for the other machine on this project,
 * so `npm install swagger-ui-dist` cannot reconcile the tree on Linux without rewriting the lock
 * in a way that breaks the other developer. A documentation viewer is not worth that trade.
 *
 * The cost is honest: **this page needs the internet; the document above never does.** If the
 * CDN is unreachable the page says so and points at `/api/v1/docs/openapi.json`, which is the
 * actual contract and is served locally. Vendoring the ~3 MB of `swagger-ui-dist` is the fix the
 * day the lockfile is untangled.
 *
 * The API otherwise serves JSON and uploaded bytes and never HTML (`security.ts` turns CSP off
 * on that basis). This is the exception, and it is a static string with no interpolation — there
 * is no value from a request anywhere in it, so there is nothing to escape.
 */
const SWAGGER_VERSION = '5.17.14';

const PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Endur API</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui.css" />
  <style>
    body { margin: 0; background: #fafafa; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
    .swagger-ui .topbar { display: none; }
    #offline { display: none; margin: 4rem auto; max-width: 40rem; padding: 1.5rem 2rem;
               border: 1px solid #d9dde3; border-radius: 8px; background: #fff; line-height: 1.6; }
    #offline code { background: #f2f4f7; padding: 0.1em 0.35em; border-radius: 4px; }
  </style>
</head>
<body>
  <div id="swagger"></div>
  <div id="offline">
    <h2>The viewer could not load</h2>
    <p>
      Swagger UI is loaded from a CDN, so this page needs a network connection. The document
      itself does not — it is served from this API and is the actual contract:
    </p>
    <p><a href="/api/v1/docs/openapi.json"><code>/api/v1/docs/openapi.json</code></a></p>
    <p>Open that file in any OpenAPI 3.1 tool — Swagger UI, Redoc, Postman, or an SDK generator.</p>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui-bundle.js" crossorigin></script>
  <script>
    if (window.SwaggerUIBundle) {
      window.SwaggerUIBundle({
        url: '/api/v1/docs/openapi.json',
        dom_id: '#swagger',
        // Alphabetical, so a reader looking for a route can find it. The default is insertion
        // order, which is the order routers happen to be mounted in — meaningless to a reader.
        operationsSorter: 'alpha',
        tagsSorter: 'alpha',
        docExpansion: 'none',
        defaultModelsExpandDepth: 2,
        // Cookies. Try-it-out only works for a browser that already holds a session, which is
        // the honest behaviour: there is no bearer token to paste.
        withCredentials: true,
        persistAuthorization: true,
      });
    } else {
      document.getElementById('swagger').style.display = 'none';
      document.getElementById('offline').style.display = 'block';
    }
  </script>
</body>
</html>`;
