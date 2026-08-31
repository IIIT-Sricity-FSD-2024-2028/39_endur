# Self-hosted faces

Two files belong here, and they are **not vendored yet**:

| File | Face | Source |
|---|---|---|
| `caprasimo-400.woff2` | Caprasimo 400 — the only display weight | Google Fonts |
| `figtree-variable.woff2` | Figtree variable, 400–700 | Google Fonts |

`design-system/tokens.css` already declares both with `font-display: swap`, so until the
files land, both stacks fall back to `system-ui` and nothing breaks — it just does not look
like Endur.

**Deadline: 24 Aug** (`architecture/21` §4), not demo day. There is deliberately no
`@import` of `fonts.googleapis.com` anywhere in the frontend: a venue network that blocks or
slows it would drop the whole product to system-ui mid-presentation, and a font that works in
dev but not on the projector is the worst of both worlds.

To vendor them, download the woff2 that Google's CSS points at and drop it here under the
names above. Nothing else changes.
