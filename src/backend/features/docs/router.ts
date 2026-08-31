// The API documentation surface: the OpenAPI document, and a page that renders it.
// Unauthenticated on purpose - it describes the SHAPE of the API and contains no customer data,
// and every fact in it is already derivable from the client bundle.
// It is not mounted in production, decided at the mount in app.ts, so there the URL simply does not exist.
import { Router, type Express } from 'express';
import { buildOpenApiDocument } from '../../openapi/spec.js';

// A factory that takes the app, because this router is mounted BY createApp(): there is no finished
// app to walk at construction time, and importing createApp here would make the two files import
// each other. The document is built lazily on the first request and then cached.
// One router per process, however often this is called - a fresh Router each time would leak an entry
// into the mount registry and inflate every later walk.
let singleton: Router | undefined;

export function docsRouter(app: Express): Router {
  if (singleton) return singleton;
  const router: Router = Router();
  singleton = router;
  let cached: Record<string, unknown> | undefined;
  const document = (): Record<string, unknown> => (cached ??= buildOpenApiDocument(app));

  // The document itself. THIS is the deliverable: any OpenAPI tool reads this same URL.
  router.get('/openapi.json', (_req, res) => {
    res.json(document());
  });

  router.get('/', (_req, res) => {
    res.type('html').send(PAGE);
  });

  return router;
}

// Swagger UI, loaded from a pinned CDN rather than vendored, because adding the package would rewrite
// the lockfile in a way that breaks the other developer's machine.
// The cost is honest: this PAGE needs the internet, the document above never does. If the CDN is
// unreachable the page says so and points at the JSON, which is the actual contract and is served locally.
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
