import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-400-italic.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/chakra-petch/latin-600.css';
import '@fontsource/chakra-petch/latin-700.css';
import { App } from './App';
import { FiletErreur } from './ecrans/FiletErreur';

createRoot(document.getElementById('racine')!).render(
  <StrictMode>
    <FiletErreur>
      <App />
    </FiletErreur>
  </StrictMode>,
);

// La version en ligne garde son enveloppe sur l'appareil (public/sw.js) : elle s'ouvre même sans réseau.
// Pas pendant le développement, ni sans https.
if (import.meta.env.PROD && location.protocol === 'https:' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e: unknown) => console.warn('Service worker non enregistré :', e));
  });
}
