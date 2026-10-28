import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { POLITICA_CSP, POLITICA_CSP_DESENVOLVIMENTO } from './src/main/seguranca';

// Alguns ambientes (ex.: processos filhos do VS Code) definem ELECTRON_RUN_AS_NODE=1,
// o que faz o Electron rodar como Node puro e impede a janela de abrir em `npm run dev`.
delete process.env['ELECTRON_RUN_AS_NODE'];

/**
 * Pacotes do monorepo são TypeScript-fonte e precisam ser embutidos no bundle,
 * nunca externalizados. Só better-sqlite3 (nativo) fica em node_modules.
 */
const PACOTES_INTERNOS = ['@pecuaria/database', '@pecuaria/shared-types'];

/**
 * Injeta a Content Security Policy no index.html: a política estrita no build e
 * uma política própria para o servidor de desenvolvimento do Vite.
 */
function injetarCsp(): Plugin {
  let politica = POLITICA_CSP;
  return {
    name: 'pecuaria:csp',
    configResolved(config) {
      politica = config.command === 'serve' ? POLITICA_CSP_DESENVOLVIMENTO : POLITICA_CSP;
    },
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${politica}" />`,
      );
    },
  };
}

export default defineConfig({
  main: {
    build: {
      externalizeDeps: { exclude: PACOTES_INTERNOS },
    },
  },
  preload: {
    build: {
      externalizeDeps: { exclude: PACOTES_INTERNOS },
    },
  },
  renderer: {
    resolve: {
      alias: { '@renderer': resolve(__dirname, 'src/renderer/src') },
    },
    plugins: [react(), tailwindcss(), injetarCsp()],
  },
});
