import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/** Módulos que dão acesso privilegiado. O renderer nunca pode importá-los. */
const PROIBIDOS_NO_RENDERER = [
  { name: 'electron', message: 'O renderer não acessa o Electron. Use window.api via lib/api.ts.' },
  { name: 'better-sqlite3', message: 'O renderer não acessa o banco. Use window.api.' },
  { name: '@pecuaria/database', message: 'O renderer não acessa o banco. Use window.api.' },
  { name: 'fs', message: 'O renderer não acessa o sistema de arquivos.' },
  { name: 'path', message: 'O renderer não acessa APIs do Node.' },
  { name: 'child_process', message: 'O renderer não acessa APIs do Node.' },
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/out/**',
      '**/dist/**',
      '**/release/**',
      '**/coverage/**',
      '**/test-results/**',
      '**/playwright-report/**',
      'referencias/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-imports': [
        'error',
        {
          paths: PROIBIDOS_NO_RENDERER,
          patterns: [{ group: ['node:*'], message: 'O renderer não acessa APIs do Node.' }],
        },
      ],
    },
  },
  {
    files: ['packages/domain/**/*.ts', 'packages/nutrition-engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'electron', message: 'Domínio puro: sem Electron.' },
            { name: 'react', message: 'Domínio puro: sem React.' },
            { name: 'better-sqlite3', message: 'Domínio puro: sem SQLite.' },
            { name: '@pecuaria/database', message: 'Domínio puro: sem acesso ao banco.' },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/database/**/*.ts', 'packages/shared-types/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'electron', message: 'Pacotes compartilhados não dependem do Electron.' },
            { name: 'react', message: 'Pacotes compartilhados não dependem do React.' },
          ],
        },
      ],
    },
  },
  {
    // O processo main grava log em arquivo e também espelha no console em desenvolvimento.
    files: ['apps/desktop/src/main/logger.ts'],
    rules: { 'no-console': 'off' },
  },
);
