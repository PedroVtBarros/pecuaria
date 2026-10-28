import { defineConfig } from '@playwright/test';

/**
 * Testes ponta a ponta do aplicativo Electron construído (out/).
 * Cada teste usa uma pasta de dados temporária, nunca os dados reais.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  outputDir: './test-results',
  use: { trace: 'retain-on-failure' },
});
