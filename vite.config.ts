/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Le service worker (public/sw.js) reçoit, à chaque construction, la liste des fichiers à garder sur l'appareil
 * et un numéro de version tiré de leurs noms : une nouvelle version de l'appli remplace l'ancienne copie.
 */
function serviceWorker(): Plugin {
  let dossier = 'dist';
  return {
    name: 'pilotage-service-worker',
    apply: 'build',
    configResolved(config) {
      dossier = config.build.outDir;
    },
    async writeBundle(_options, bundle) {
      const chemin = join(dossier, 'sw.js');
      // Les polices .woff ne servent qu'aux très vieux navigateurs, qui n'ont pas de service worker.
      const construits = Object.keys(bundle)
        .filter((f) => f.startsWith('assets/') && !f.endsWith('.woff'))
        .sort();
      const fichiers = [...construits, 'icone.svg', 'manifest.webmanifest'];
      const version = createHash('sha256').update(construits.join('\n')).digest('hex').slice(0, 12);
      const modele = await readFile(chemin, 'utf8');
      const rempli = modele
        .replace("'__VERSION__'", JSON.stringify(version))
        .replace('[]; /* __FICHIERS__ */', `${JSON.stringify(fichiers)};`);
      if (rempli.includes('__VERSION__') || rempli.includes('__FICHIERS__')) {
        throw new Error('public/sw.js : impossible de remplir la version et la liste des fichiers.');
      }
      await writeFile(chemin, rempli);
    },
  };
}

export default defineConfig({
  // Chemins relatifs : l'appli marche quelle que soit l'adresse où elle est publiée.
  base: './',
  plugins: [react(), serviceWorker()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
