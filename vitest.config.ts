import { defineConfig } from 'vitest/config';
import RegistroDeFalhas from './vitest-registro-falhas';

export default defineConfig({
  test: {
    reporters: ['default', new RegistroDeFalhas()],
    projects: [
      'packages/domain/vitest.config.ts',
      'packages/nutrition-engine/vitest.config.ts',
      'packages/shared-types/vitest.config.ts',
      'packages/database/vitest.config.ts',
      'apps/desktop/vitest.main.config.ts',
      'apps/desktop/vitest.renderer.config.ts',
    ],
  },
});
