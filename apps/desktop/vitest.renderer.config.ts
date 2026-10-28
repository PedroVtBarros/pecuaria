import { resolve } from 'node:path';
import { defineProject } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineProject({
  plugins: [react()],
  resolve: {
    alias: { '@renderer': resolve(__dirname, 'src/renderer/src') },
  },
  test: {
    name: 'desktop-renderer',
    environment: 'jsdom',
    include: ['src/renderer/src/**/*.test.tsx'],
  },
});
