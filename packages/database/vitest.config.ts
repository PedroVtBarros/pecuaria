import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'database',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Testes de arquivo SQLite em disco: sem paralelismo entre arquivos para
    // evitar disputa de antivírus/indexador do Windows por arquivos temporários.
    fileParallelism: false,
  },
});
