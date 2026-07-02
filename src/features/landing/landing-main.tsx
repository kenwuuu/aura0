/**
 * landing-main.tsx — entry point for the marketing landing page (index.html, the site root).
 *
 * Separate from the game app's main.ts: no Yjs, no networking, no game bootstrap.
 * Just mounts the static, responsive landing page and sets the derived accent glow.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './landing.css';
import { setAccent } from './accentTheme';
import { initConsent } from './consent';
import { LandingPage } from './LandingPage';

// Rederive --glow / --glow-strong from the canonical accent (themeable knob).
setAccent('#9B5CFF', 1);

// Cookie consent gate → Google Consent Mode (gtag stays denied until accepted).
initConsent();

const root = document.getElementById('landing-root');
if (!root) throw new Error('#landing-root not found in index.html');
createRoot(root).render(
  <StrictMode>
    <LandingPage />
  </StrictMode>,
);
