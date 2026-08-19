// SPA entry. One mount, one router, no full page loads after this point (DEC-013).
//
// The import order of the three stylesheets IS the cascade and is not negotiable (21 §2):
// tokens define the custom properties, the vendored layer builds components from them,
// and endur.css overrides on top.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './design-system/tokens.css';
import './design-system/organic.css';
import './design-system/endur.css';
import { App } from './App.js';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
